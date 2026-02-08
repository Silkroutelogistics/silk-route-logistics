import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createLoadSchema, updateLoadStatusSchema, loadQuerySchema } from "../validators/load";

export async function createLoad(req: AuthRequest, res: Response) {
  const data = createLoadSchema.parse(req.body);
  const load = await prisma.load.create({
    data: { ...data, posterId: req.user!.id },
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

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      include: { poster: { select: { id: true, company: true, firstName: true, lastName: true } } },
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
  const load = await prisma.load.update({
    where: { id: req.params.id },
    data: { status, ...(status === "BOOKED" ? { carrierId: req.user!.id } : {}) },
  });
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
