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

export async function updateTruck(req: AuthRequest, res: Response) {
  const existing = await prisma.truck.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Truck not found" });
    return;
  }

  const data = updateTruckSchema.parse(req.body);
  const truck = await prisma.truck.update({
    where: { id: req.params.id },
    data: data as any,
  });
  res.json(truck);
}

export async function deleteTruck(req: AuthRequest, res: Response) {
  const truck = await prisma.truck.findUnique({ where: { id: req.params.id } });
  if (!truck) {
    res.status(404).json({ error: "Truck not found" });
    return;
  }

  await prisma.truck.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function assignDriverToTruck(req: AuthRequest, res: Response) {
  const { driverId } = req.body;

  const truck = await prisma.truck.findUnique({ where: { id: req.params.id } });
  if (!truck) {
    res.status(404).json({ error: "Truck not found" });
    return;
  }

  // If driverId is null, unassign the current driver
  if (!driverId) {
    const updates: Promise<unknown>[] = [
      prisma.truck.update({
        where: { id: req.params.id },
        data: { assignedDriverId: null },
      }),
    ];
    if (truck.assignedDriverId) {
      updates.push(
        prisma.driver.update({
          where: { id: truck.assignedDriverId },
          data: { assignedTruckId: null },
        })
      );
    }
    await Promise.all(updates);
    const updated = await prisma.truck.findUnique({
      where: { id: req.params.id },
      include: { assignedDriver: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json(updated);
    return;
  }

  // Verify driver exists
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  // If driver already assigned to another truck, unassign first
  if (driver.assignedTruckId && driver.assignedTruckId !== req.params.id) {
    await prisma.truck.update({
      where: { id: driver.assignedTruckId },
      data: { assignedDriverId: null },
    });
  }

  // If truck already has a different driver, unassign that driver
  if (truck.assignedDriverId && truck.assignedDriverId !== driverId) {
    await prisma.driver.update({
      where: { id: truck.assignedDriverId },
      data: { assignedTruckId: null },
    });
  }

  // Assign both sides of the relationship
  await Promise.all([
    prisma.truck.update({
      where: { id: req.params.id },
      data: { assignedDriverId: driverId },
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: { assignedTruckId: req.params.id },
    }),
  ]);

  const updated = await prisma.truck.findUnique({
    where: { id: req.params.id },
    include: { assignedDriver: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json(updated);
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

export async function updateTrailer(req: AuthRequest, res: Response) {
  const existing = await prisma.trailer.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Trailer not found" });
    return;
  }

  const data = updateTrailerSchema.parse(req.body);
  const trailer = await prisma.trailer.update({
    where: { id: req.params.id },
    data: data as any,
  });
  res.json(trailer);
}

export async function deleteTrailer(req: AuthRequest, res: Response) {
  const trailer = await prisma.trailer.findUnique({ where: { id: req.params.id } });
  if (!trailer) {
    res.status(404).json({ error: "Trailer not found" });
    return;
  }

  await prisma.trailer.delete({ where: { id: req.params.id } });
  res.status(204).send();
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
