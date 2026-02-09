import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createDriverSchema, updateDriverSchema, updateDriverHOSSchema, assignEquipmentSchema, driverQuerySchema } from "../validators/driver";

export async function createDriver(req: AuthRequest, res: Response) {
  const data = createDriverSchema.parse(req.body);
  const driver = await prisma.driver.create({ data: data as any, include: { assignedEquipment: true } });
  res.status(201).json(driver);
}

export async function getDrivers(req: AuthRequest, res: Response) {
  const query = driverQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [drivers, total] = await Promise.all([
    prisma.driver.findMany({
      where,
      include: { assignedEquipment: true },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.driver.count({ where }),
  ]);

  res.json({ drivers, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getDriverById(req: AuthRequest, res: Response) {
  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    include: {
      assignedEquipment: true,
      shipments: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, take: 5 },
    },
  });
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  res.json(driver);
}

export async function getDriverStats(req: AuthRequest, res: Response) {
  const [total, onRoute, available, offDuty, avgSafety] = await Promise.all([
    prisma.driver.count(),
    prisma.driver.count({ where: { status: "ON_ROUTE" } }),
    prisma.driver.count({ where: { status: "AVAILABLE" } }),
    prisma.driver.count({ where: { status: { in: ["OFF_DUTY", "SLEEPER"] } } }),
    prisma.driver.aggregate({ _avg: { safetyScore: true } }),
  ]);

  res.json({
    totalDrivers: total,
    onRoute,
    available,
    offDuty,
    avgSafetyScore: Math.round(avgSafety._avg.safetyScore || 0),
  });
}

export async function updateDriver(req: AuthRequest, res: Response) {
  const data = updateDriverSchema.parse(req.body);
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data,
    include: { assignedEquipment: true },
  });
  res.json(driver);
}

export async function updateDriverHOS(req: AuthRequest, res: Response) {
  const data = updateDriverHOSSchema.parse(req.body);
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data,
  });
  res.json(driver);
}

export async function assignEquipment(req: AuthRequest, res: Response) {
  const { assignedEquipmentId } = assignEquipmentSchema.parse(req.body);

  // Clear previous equipment assignment if any
  const current = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (current?.assignedEquipmentId) {
    await prisma.driver.update({
      where: { id: req.params.id },
      data: { assignedEquipmentId: null },
    });
  }

  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { assignedEquipmentId },
    include: { assignedEquipment: true },
  });
  res.json(driver);
}

export async function deleteDriver(req: AuthRequest, res: Response) {
  await prisma.driver.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
