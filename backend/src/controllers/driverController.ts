import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createDriverSchema, updateDriverSchema, updateDriverHOSSchema, assignEquipmentSchema, assignTruckSchema, assignTrailerSchema, driverQuerySchema } from "../validators/driver";

const driverInclude = {
  assignedEquipment: true,
  assignedTruck: true,
  assignedTrailer: true,
};

export async function createDriver(req: AuthRequest, res: Response) {
  const data = createDriverSchema.parse(req.body);
  const driver = await prisma.driver.create({ data: data as any, include: driverInclude });
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
      { licenseNumber: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [drivers, total] = await Promise.all([
    prisma.driver.findMany({
      where,
      include: driverInclude,
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
      ...driverInclude,
      shipments: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, take: 5 },
      loads: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, take: 5, orderBy: { createdAt: "desc" } },
    },
  });
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  res.json(driver);
}

export async function getDriverStats(req: AuthRequest, res: Response) {
  const [total, onRoute, available, offDuty, avgSafety, expiringLicenses, expiringMedical] = await Promise.all([
    prisma.driver.count(),
    prisma.driver.count({ where: { status: "ON_ROUTE" } }),
    prisma.driver.count({ where: { status: "AVAILABLE" } }),
    prisma.driver.count({ where: { status: { in: ["OFF_DUTY", "SLEEPER"] } } }),
    prisma.driver.aggregate({ _avg: { safetyScore: true } }),
    prisma.driver.count({ where: { licenseExpiry: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, status: { not: "INACTIVE" } } }),
    prisma.driver.count({ where: { medicalCardExpiry: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, status: { not: "INACTIVE" } } }),
  ]);

  res.json({
    totalDrivers: total,
    onRoute,
    available,
    offDuty,
    avgSafetyScore: Math.round(avgSafety._avg.safetyScore || 0),
    expiringLicenses,
    expiringMedical,
  });
}

export async function updateDriver(req: AuthRequest, res: Response) {
  const data = updateDriverSchema.parse(req.body);
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: data as any,
    include: driverInclude,
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
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { assignedEquipmentId },
    include: driverInclude,
  });
  res.json(driver);
}

export async function assignTruck(req: AuthRequest, res: Response) {
  const { truckId } = assignTruckSchema.parse(req.body);
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { assignedTruckId: truckId },
    include: driverInclude,
  });
  res.json(driver);
}

export async function assignTrailer(req: AuthRequest, res: Response) {
  const { trailerId } = assignTrailerSchema.parse(req.body);
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { assignedTrailerId: trailerId },
    include: driverInclude,
  });
  res.json(driver);
}

export async function deleteDriver(req: AuthRequest, res: Response) {
  await prisma.driver.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
