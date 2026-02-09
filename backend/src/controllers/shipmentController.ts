import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createShipmentSchema, updateShipmentStatusSchema, updateShipmentLocationSchema, shipmentQuerySchema } from "../validators/shipment";

let shipmentCounter = 0;

export async function nextShipmentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.shipment.findFirst({ orderBy: { createdAt: "desc" }, select: { shipmentNumber: true } });
  if (last?.shipmentNumber) {
    const num = parseInt(last.shipmentNumber.split("-").pop() || "0", 10);
    shipmentCounter = num;
  }
  shipmentCounter++;
  return `SHP-${year}-${String(shipmentCounter).padStart(3, "0")}`;
}

export async function createShipment(req: AuthRequest, res: Response) {
  const data = createShipmentSchema.parse(req.body);
  const shipmentNumber = await nextShipmentNumber();
  const shipment = await prisma.shipment.create({
    data: { ...data, shipmentNumber } as any,
    include: { customer: true, driver: true, equipment: true },
  });
  res.status(201).json(shipment);
}

export async function getShipments(req: AuthRequest, res: Response) {
  const query = shipmentQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.customerId) where.customerId = query.customerId;
  if (query.driverId) where.driverId = query.driverId;
  if (query.search) {
    where.OR = [
      { shipmentNumber: { contains: query.search, mode: "insensitive" } },
      { proNumber: { contains: query.search, mode: "insensitive" } },
      { bolNumber: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: { customer: true, driver: true, equipment: true },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.shipment.count({ where }),
  ]);

  res.json({ shipments, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getShipmentById(req: AuthRequest, res: Response) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: req.params.id },
    include: { customer: true, driver: true, equipment: true },
  });
  if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }
  res.json(shipment);
}

export async function updateShipment(req: AuthRequest, res: Response) {
  const data = createShipmentSchema.partial().parse(req.body);
  const shipment = await prisma.shipment.update({
    where: { id: req.params.id },
    data,
    include: { customer: true, driver: true, equipment: true },
  });
  res.json(shipment);
}

export async function updateShipmentStatus(req: AuthRequest, res: Response) {
  const { status, driverId, equipmentId } = updateShipmentStatusSchema.parse(req.body);
  const updateData: Record<string, unknown> = { status };

  if (status === "DISPATCHED") {
    if (driverId) updateData.driverId = driverId;
    if (equipmentId) updateData.equipmentId = equipmentId;
  }
  if (status === "PICKED_UP") updateData.actualPickup = new Date();
  if (status === "DELIVERED") updateData.actualDelivery = new Date();

  const shipment = await prisma.shipment.update({
    where: { id: req.params.id },
    data: updateData,
    include: { customer: true, driver: true, equipment: true },
  });
  res.json(shipment);
}

export async function updateShipmentLocation(req: AuthRequest, res: Response) {
  const { lastLocation, eta } = updateShipmentLocationSchema.parse(req.body);
  const shipment = await prisma.shipment.update({
    where: { id: req.params.id },
    data: { lastLocation, lastLocationAt: new Date(), ...(eta ? { eta } : {}) },
  });
  res.json(shipment);
}

export async function deleteShipment(req: AuthRequest, res: Response) {
  await prisma.shipment.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
