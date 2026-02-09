import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createSOPSchema, updateSOPSchema, sopQuerySchema } from "../validators/sop";

export async function createSOP(req: AuthRequest, res: Response) {
  const data = createSOPSchema.parse(req.body);
  const sop = await prisma.sOP.create({ data: data as any });
  res.status(201).json(sop);
}

export async function getSOPs(req: AuthRequest, res: Response) {
  const query = sopQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.category) where.category = query.category;
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [sops, total] = await Promise.all([
    prisma.sOP.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.sOP.count({ where }),
  ]);

  res.json({ sops, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getSOPById(req: AuthRequest, res: Response) {
  const sop = await prisma.sOP.findUnique({ where: { id: req.params.id } });
  if (!sop) { res.status(404).json({ error: "SOP not found" }); return; }
  res.json(sop);
}

export async function updateSOP(req: AuthRequest, res: Response) {
  const data = updateSOPSchema.parse(req.body);
  const sop = await prisma.sOP.update({ where: { id: req.params.id }, data });
  res.json(sop);
}

export async function uploadSOPFile(req: AuthRequest, res: Response) {
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  const sop = await prisma.sOP.update({
    where: { id: req.params.id },
    data: { fileUrl: `/uploads/${req.file.filename}` },
  });
  res.json(sop);
}

export async function deleteSOP(req: AuthRequest, res: Response) {
  await prisma.sOP.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
