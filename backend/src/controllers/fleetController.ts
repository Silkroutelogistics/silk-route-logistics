import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import {
  createTruckSchema,
  updateTruckSchema,
  createTrailerSchema,
  updateTrailerSchema,
  truckQuerySchema,
  trailerQuerySchema,
} from "../validators/fleet";

// ─── Trucks ──────────────────────────────────────────────

export async function getTrucks(req: AuthRequest, res: Response) {
  const query = truckQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.search) {
    where.OR = [
      { unitNumber: { contains: query.search, mode: "insensitive" } },
      { vin: { contains: query.search, mode: "insensitive" } },
      { make: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [trucks, total] = await Promise.all([
    prisma.truck.findMany({
      where,
      include: {
        assignedDriver: {
          select: { id: true, firstName: true, lastName: true, status: true },
        },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.truck.count({ where }),
  ]);

  res.json({ trucks, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getTruckById(req: AuthRequest, res: Response) {
  const truck = await prisma.truck.findUnique({
    where: { id: req.params.id },
    include: {
      assignedDriver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          status: true,
          licenseType: true,
          licenseExpiry: true,
        },
      },
    },
  });

  if (!truck) {
    res.status(404).json({ error: "Truck not found" });
    return;
  }
  res.json(truck);
}

export async function createTruck(req: AuthRequest, res: Response) {
  const data = createTruckSchema.parse(req.body);
  const truck = await prisma.truck.create({ data: data as any });
  res.status(201).json(truck);
}

export async function getTruckStats(req: AuthRequest, res: Response) {
  const [byStatus, byType] = await Promise.all([
    prisma.truck.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.truck.groupBy({ by: ["type"], _count: { id: true } }),
  ]);

  res.json({
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    byType: byType.map((t) => ({ type: t.type, count: t._count.id })),
  });
}

// ─── Trailers ────────────────────────────────────────────

export async function getTrailers(req: AuthRequest, res: Response) {
  const query = trailerQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.search) {
    where.OR = [
      { unitNumber: { contains: query.search, mode: "insensitive" } },
      { vin: { contains: query.search, mode: "insensitive" } },
      { make: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [trailers, total] = await Promise.all([
    prisma.trailer.findMany({
      where,
      include: {
        assignedDriver: {
          select: { id: true, firstName: true, lastName: true, status: true },
        },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.trailer.count({ where }),
  ]);

  res.json({ trailers, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getTrailerById(req: AuthRequest, res: Response) {
  const trailer = await prisma.trailer.findUnique({
    where: { id: req.params.id },
    include: {
      assignedDriver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          status: true,
          licenseType: true,
          licenseExpiry: true,
        },
      },
    },
  });

  if (!trailer) {
    res.status(404).json({ error: "Trailer not found" });
    return;
  }
  res.json(trailer);
}

export async function createTrailer(req: AuthRequest, res: Response) {
  const data = createTrailerSchema.parse(req.body);
  const trailer = await prisma.trailer.create({ data: data as any });
  res.status(201).json(trailer);
}

export async function getTrailerStats(req: AuthRequest, res: Response) {
  const [byStatus, byType] = await Promise.all([
    prisma.trailer.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.trailer.groupBy({ by: ["type"], _count: { id: true } }),
  ]);

  res.json({
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    byType: byType.map((t) => ({ type: t.type, count: t._count.id })),
  });
}

// ─── Fleet Overview ──────────────────────────────────────

export async function getFleetOverview(req: AuthRequest, res: Response) {
  const [
    totalTrucks,
    totalTrailers,
    trucksByStatus,
    trailersByType,
    assignedDrivers,
    totalDrivers,
  ] = await Promise.all([
    prisma.truck.count(),
    prisma.trailer.count(),
    prisma.truck.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.trailer.groupBy({ by: ["type"], _count: { id: true } }),
    prisma.driver.count({ where: { assignedTruckId: { not: null } } }),
    prisma.driver.count(),
  ]);

  res.json({
    totalTrucks,
    totalTrailers,
    trucksByStatus: trucksByStatus.map((s) => ({ status: s.status, count: s._count.id })),
    trailersByType: trailersByType.map((t) => ({ type: t.type, count: t._count.id })),
    driversAssigned: assignedDrivers,
    driversUnassigned: totalDrivers - assignedDrivers,
  });
}
