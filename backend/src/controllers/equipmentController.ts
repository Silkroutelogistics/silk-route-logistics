import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createEquipmentSchema, updateEquipmentSchema, equipmentQuerySchema } from "../validators/equipment";

export async function createEquipment(req: AuthRequest, res: Response) {
  const data = createEquipmentSchema.parse(req.body);
  const equipment = await prisma.equipment.create({ data: data as any, include: { assignedDriver: true } });
  res.status(201).json(equipment);
}

export async function getEquipment(req: AuthRequest, res: Response) {
  const query = equipmentQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.search) {
    where.OR = [
      { unitNumber: { contains: query.search, mode: "insensitive" } },
      { make: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [equipment, total] = await Promise.all([
    prisma.equipment.findMany({
      where,
      include: { assignedDriver: true },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { unitNumber: "asc" },
    }),
    prisma.equipment.count({ where }),
  ]);

  res.json({ equipment, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getEquipmentById(req: AuthRequest, res: Response) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: req.params.id },
    include: { assignedDriver: true, shipments: { take: 5, orderBy: { createdAt: "desc" } } },
  });
  if (!equipment) { res.status(404).json({ error: "Equipment not found" }); return; }
  res.json(equipment);
}

export async function updateEquipment(req: AuthRequest, res: Response) {
  const data = updateEquipmentSchema.parse(req.body);
  const equipment = await prisma.equipment.update({
    where: { id: req.params.id },
    data,
    include: { assignedDriver: true },
  });
  res.json(equipment);
}

export async function deleteEquipment(req: AuthRequest, res: Response) {
  await prisma.equipment.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
