import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize } from "../middleware/auth";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// All routes require auth + employee roles
router.use(authenticate as any);
router.use(authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any);

const addressSchema = z.object({
  type: z.enum(["SHIPPER", "CONSIGNEE", "BOTH"]),
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  address: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2),
  zip: z.string().min(5),
  country: z.string().optional(),
  notes: z.string().optional(),
  pickupHours: z.string().optional(),
  deliveryHours: z.string().optional(),
});

// GET /api/address-book — list all, searchable, sorted by usage
router.get("/", async (req: AuthRequest, res: Response) => {
  const { search, type, limit = "100" } = req.query as Record<string, string>;
  const where: any = {};
  if (type) where.type = { in: type === "BOTH" ? ["SHIPPER", "CONSIGNEE", "BOTH"] : [type, "BOTH"] };
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
      { state: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
    ];
  }

  const entries = await prisma.addressBook.findMany({
    where,
    orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    take: Math.min(parseInt(limit) || 100, 500),
  });

  res.json({ entries, total: entries.length });
});

// POST /api/address-book — create new entry
router.post("/", async (req: AuthRequest, res: Response) => {
  const data = addressSchema.parse(req.body);
  const entry = await prisma.addressBook.create({
    data: {
      type: data.type,
      companyName: data.companyName,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail || undefined,
      address: data.address,
      address2: data.address2,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country,
      notes: data.notes,
      pickupHours: data.pickupHours,
      deliveryHours: data.deliveryHours,
      createdBy: req.user!.id,
    },
  });
  res.status(201).json(entry);
});

// POST /api/address-book/bulk — import multiple entries at once
router.post("/bulk", async (req: AuthRequest, res: Response) => {
  const entries = z.array(addressSchema).parse(req.body);
  let created = 0;
  let skipped = 0;

  for (const data of entries) {
    // Skip if exact company+address already exists
    const existing = await prisma.addressBook.findFirst({
      where: {
        companyName: { equals: data.companyName, mode: "insensitive" },
        address: { equals: data.address, mode: "insensitive" },
        city: { equals: data.city, mode: "insensitive" },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.addressBook.create({
      data: {
        type: data.type,
        companyName: data.companyName,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail || undefined,
        address: data.address,
        address2: data.address2,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
        notes: data.notes,
        pickupHours: data.pickupHours,
        deliveryHours: data.deliveryHours,
        createdBy: req.user!.id,
      },
    });
    created++;
  }

  res.json({ created, skipped, total: entries.length });
});

// PATCH /api/address-book/:id — update entry
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const data = addressSchema.partial().parse(req.body);
  const entry = await prisma.addressBook.update({
    where: { id: req.params.id },
    data: { ...data, contactEmail: data.contactEmail || undefined },
  });
  res.json(entry);
});

// PATCH /api/address-book/:id/use — increment usage count (called when address is used in a load)
router.patch("/:id/use", async (req: AuthRequest, res: Response) => {
  const entry = await prisma.addressBook.update({
    where: { id: req.params.id },
    data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  res.json(entry);
});

// DELETE /api/address-book/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  await prisma.addressBook.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
