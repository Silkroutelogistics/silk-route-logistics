import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createLoadSchema, updateLoadStatusSchema, loadQuerySchema } from "../validators/load";
import { autoGenerateInvoice } from "../services/invoiceService";
import { calculateDrivingDistance } from "../services/distanceService";
import { sendShipperPickupEmail, sendShipperDeliveryEmail } from "../services/shipperNotificationService";

function generateRefNumber(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `SRL-${date}-${rand}`;
}

export async function createLoad(req: AuthRequest, res: Response) {
  const data = createLoadSchema.parse(req.body);
  const load = await prisma.load.create({
    data: {
      ...data,
      referenceNumber: generateRefNumber(),
      status: data.status || "POSTED",
      posterId: req.user!.id,
    } as any,
  });
  res.status(201).json(load);
}

export async function getLoads(req: AuthRequest, res: Response) {
  const query = loadQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) {
    where.status = query.status;
  } else if (query.activeOnly) {
    where.status = { notIn: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED"] };
  }
  if (query.originState) where.originState = query.originState;
  if (query.destState) where.destState = query.destState;
  if (query.equipmentType) where.equipmentType = query.equipmentType;
  if (query.minRate || query.maxRate) {
    where.rate = {};
    if (query.minRate) (where.rate as Record<string, number>).gte = query.minRate;
    if (query.maxRate) (where.rate as Record<string, number>).lte = query.maxRate;
  }
  if (query.search) {
    where.OR = [
      { referenceNumber: { contains: query.search, mode: "insensitive" } },
      { commodity: { contains: query.search, mode: "insensitive" } },
      { originCity: { contains: query.search, mode: "insensitive" } },
      { destCity: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      include: {
        poster: { select: { id: true, company: true, firstName: true, lastName: true } },
        carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.load.count({ where }),
  ]);

  res.json({ loads, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getLoadById(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({
    where: { id: req.params.id },
    include: {
      poster: { select: { id: true, company: true, firstName: true, lastName: true, phone: true } },
      carrier: { select: { id: true, company: true, firstName: true, lastName: true, phone: true } },
      tenders: {
        include: { carrier: { include: { user: { select: { company: true, firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      documents: true,
      messages: { include: { sender: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  res.json(load);
}

export async function updateLoadStatus(req: AuthRequest, res: Response) {
  const { status } = updateLoadStatusSchema.parse(req.body);

  // Authorization: check user can update this load
  const existing = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Load not found" }); return; }

  const isPoster = existing.posterId === req.user!.id;
  const isAssignedCarrier = existing.carrierId === req.user!.id;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isPoster && !isAssignedCarrier && !isEmployee) {
    res.status(403).json({ error: "Not authorized to update this load" });
    return;
  }

  const load = await prisma.load.update({
    where: { id: req.params.id },
    data: { status, ...(status === "BOOKED" ? { carrierId: req.user!.id } : {}) },
  });

  // Sync linked shipment status
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    const shipmentUpdate: Record<string, unknown> = { status };
    if (status === "PICKED_UP") shipmentUpdate.actualPickup = new Date();
    if (status === "DELIVERED") shipmentUpdate.actualDelivery = new Date();
    await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentUpdate });
  }

  // Auto-generate invoice and notify when delivered
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
    sendShipperDeliveryEmail(load.id).catch((e) => console.error("[ShipperNotify] delivery email error:", e.message));

    if (load.posterId) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD_UPDATE",
          title: "Load Delivered",
          message: `Load ${load.referenceNumber} has been delivered successfully. Invoice auto-generated.`,
          actionUrl: "/dashboard/loads",
        },
      });
    }
  }

  // Shipper pickup notification on LOADED
  if (status === "LOADED") {
    sendShipperPickupEmail(load.id).catch((e) => console.error("[ShipperNotify] pickup email error:", e.message));
  }

  res.json(load);
}

export async function carrierUpdateStatus(req: AuthRequest, res: Response) {
  const { status } = updateLoadStatusSchema.parse(req.body);
  const allowedStatuses = ["AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"];
  if (!allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Carriers can only update to: AT_PICKUP, LOADED, PICKED_UP, IN_TRANSIT, AT_DELIVERY, DELIVERED" });
    return;
  }

  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized — this load is not assigned to you" });
    return;
  }

  const updated = await prisma.load.update({
    where: { id: req.params.id },
    data: { status },
  });

  // Sync linked shipment
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    // Map load statuses to shipment statuses
    const loadToShipmentStatus: Record<string, string> = {
      AT_PICKUP: "PICKED_UP", LOADED: "PICKED_UP", PICKED_UP: "PICKED_UP",
      IN_TRANSIT: "IN_TRANSIT", AT_DELIVERY: "DELIVERED", DELIVERED: "DELIVERED",
    };
    const mappedStatus = loadToShipmentStatus[status] || status;
    const shipmentUpdate: Record<string, unknown> = { status: mappedStatus };
    if (["AT_PICKUP", "LOADED", "PICKED_UP"].includes(status)) shipmentUpdate.actualPickup = new Date();
    if (status === "IN_TRANSIT") shipmentUpdate.lastLocationAt = new Date();
    if (["AT_DELIVERY", "DELIVERED"].includes(status)) shipmentUpdate.actualDelivery = new Date();
    await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentUpdate });
  }

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: `Load ${status.replace("_", " ")}`,
        message: `Carrier updated load ${load.referenceNumber} to ${status}.`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }

  // If delivered, trigger auto-invoice + shipper email
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
    sendShipperDeliveryEmail(load.id).catch((e) => console.error("[ShipperNotify] delivery email error:", e.message));
  }

  // Shipper pickup notification on LOADED
  if (status === "LOADED") {
    sendShipperPickupEmail(load.id).catch((e) => console.error("[ShipperNotify] pickup email error:", e.message));
  }

  res.json(updated);
}

export async function updateLoad(req: AuthRequest, res: Response) {
  const existing = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Load not found" }); return; }

  const isPoster = existing.posterId === req.user!.id;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isPoster && !isEmployee) {
    res.status(403).json({ error: "Not authorized to update this load" });
    return;
  }

  // Prevent editing loads that are completed/cancelled
  if (["COMPLETED", "CANCELLED", "TONU"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot edit a load with status ${existing.status}` });
    return;
  }

  const {
    originCity, originState, originZip, originAddress, originCompany,
    destCity, destState, destZip, destAddress, destCompany,
    weight, pieces, pallets, equipmentType, commodity, freightClass,
    rate, customerRate, carrierRate, distance,
    pickupDate, deliveryDate, pickupTimeStart, pickupTimeEnd,
    deliveryTimeStart, deliveryTimeEnd,
    hazmat, hazmatClass, hazmatUnNumber,
    temperatureControlled, tempMin, tempMax,
    specialInstructions, notes, contactName, contactPhone,
    customerId, carrierId,
  } = req.body;

  const data: Record<string, unknown> = {};
  if (originCity !== undefined) data.originCity = originCity;
  if (originState !== undefined) data.originState = originState;
  if (originZip !== undefined) data.originZip = originZip;
  if (originAddress !== undefined) data.originAddress = originAddress;
  if (originCompany !== undefined) data.originCompany = originCompany;
  if (destCity !== undefined) data.destCity = destCity;
  if (destState !== undefined) data.destState = destState;
  if (destZip !== undefined) data.destZip = destZip;
  if (destAddress !== undefined) data.destAddress = destAddress;
  if (destCompany !== undefined) data.destCompany = destCompany;
  if (weight !== undefined) data.weight = weight;
  if (pieces !== undefined) data.pieces = pieces;
  if (pallets !== undefined) data.pallets = pallets;
  if (equipmentType !== undefined) data.equipmentType = equipmentType;
  if (commodity !== undefined) data.commodity = commodity;
  if (freightClass !== undefined) data.freightClass = freightClass;
  if (rate !== undefined) data.rate = rate;
  if (customerRate !== undefined) data.customerRate = customerRate;
  if (carrierRate !== undefined) data.carrierRate = carrierRate;
  if (distance !== undefined) data.distance = distance;
  if (pickupDate !== undefined) data.pickupDate = new Date(pickupDate);
  if (deliveryDate !== undefined) data.deliveryDate = new Date(deliveryDate);
  if (pickupTimeStart !== undefined) data.pickupTimeStart = pickupTimeStart;
  if (pickupTimeEnd !== undefined) data.pickupTimeEnd = pickupTimeEnd;
  if (deliveryTimeStart !== undefined) data.deliveryTimeStart = deliveryTimeStart;
  if (deliveryTimeEnd !== undefined) data.deliveryTimeEnd = deliveryTimeEnd;
  if (hazmat !== undefined) data.hazmat = hazmat;
  if (hazmatClass !== undefined) data.hazmatClass = hazmatClass;
  if (hazmatUnNumber !== undefined) data.hazmatUnNumber = hazmatUnNumber;
  if (temperatureControlled !== undefined) data.temperatureControlled = temperatureControlled;
  if (tempMin !== undefined) data.tempMin = tempMin;
  if (tempMax !== undefined) data.tempMax = tempMax;
  if (specialInstructions !== undefined) data.specialInstructions = specialInstructions;
  if (notes !== undefined) data.notes = notes;
  if (contactName !== undefined) data.contactName = contactName;
  if (contactPhone !== undefined) data.contactPhone = contactPhone;
  if (customerId !== undefined) data.customerId = customerId;
  if (carrierId !== undefined) data.carrierId = carrierId;

  // Recalculate margin fields if rates changed
  const finalCustRate = (customerRate ?? existing.customerRate ?? rate ?? existing.rate) as number;
  const finalCarrRate = (carrierRate ?? existing.carrierRate) as number | null;
  const finalDist = (distance ?? existing.distance) as number | null;
  if (finalCarrRate) {
    data.grossMargin = finalCustRate - finalCarrRate;
    data.marginPercent = Math.round(((finalCustRate - finalCarrRate) / finalCustRate) * 10000) / 100;
  }
  if (finalDist && finalDist > 0) {
    data.revenuePerMile = Math.round((finalCustRate / finalDist) * 100) / 100;
    if (finalCarrRate) data.costPerMile = Math.round((finalCarrRate / finalDist) * 100) / 100;
  }

  const load = await prisma.load.update({ where: { id: req.params.id }, data });
  res.json(load);
}

export async function deleteLoad(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.posterId !== req.user!.id && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await prisma.load.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

const distanceQuerySchema = z.object({
  originCity: z.string().min(1),
  originState: z.string().length(2),
  originZip: z.string().min(3).max(10),
  destCity: z.string().min(1),
  destState: z.string().length(2),
  destZip: z.string().min(3).max(10),
});

export async function getDistance(req: AuthRequest, res: Response) {
  const query = distanceQuerySchema.parse(req.query);
  const origin = `${query.originCity}, ${query.originState} ${query.originZip}`;
  const destination = `${query.destCity}, ${query.destState} ${query.destZip}`;

  const result = await calculateDrivingDistance(origin, destination);

  if (result.error && !result.distanceMiles) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ distanceMiles: result.distanceMiles, durationMinutes: result.durationMinutes });
}
