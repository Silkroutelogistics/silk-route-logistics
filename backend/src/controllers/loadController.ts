import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createLoadSchema, updateLoadStatusSchema, loadQuerySchema } from "../validators/load";
import { autoGenerateInvoice } from "../services/invoiceService";

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

  if (query.status) where.status = query.status;
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

  res.json(load);
}

export async function carrierUpdateStatus(req: AuthRequest, res: Response) {
  const { status } = updateLoadStatusSchema.parse(req.body);
  const allowedStatuses = ["PICKED_UP", "IN_TRANSIT", "DELIVERED"];
  if (!allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Carriers can only update to: PICKED_UP, IN_TRANSIT, DELIVERED" });
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
    const shipmentUpdate: Record<string, unknown> = { status };
    if (status === "PICKED_UP") shipmentUpdate.actualPickup = new Date();
    if (status === "IN_TRANSIT") shipmentUpdate.lastLocationAt = new Date();
    if (status === "DELIVERED") shipmentUpdate.actualDelivery = new Date();
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

  // If delivered, trigger auto-invoice
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
  }

  res.json(updated);
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
