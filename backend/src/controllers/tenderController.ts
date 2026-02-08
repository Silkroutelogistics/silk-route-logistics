import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createTenderSchema, counterTenderSchema } from "../validators/tender";

export async function createTender(req: AuthRequest, res: Response) {
  const { carrierId, offeredRate, expiresAt } = createTenderSchema.parse(req.body);
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const carrier = await prisma.carrierProfile.findUnique({ where: { id: carrierId } });
  if (!carrier) { res.status(404).json({ error: "Carrier not found" }); return; }

  const tender = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId, offeredRate, expiresAt },
  });

  await prisma.notification.create({
    data: {
      userId: carrier.userId,
      type: "TENDER",
      title: "New Load Tender",
      message: `You have a new load tender: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState} at $${offeredRate}`,
      actionUrl: `/dashboard/loads`,
    },
  });

  res.status(201).json(tender);
}

export async function acceptTender(req: AuthRequest, res: Response) {
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  const [updated] = await Promise.all([
    prisma.loadTender.update({
      where: { id: tender.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
    prisma.load.update({
      where: { id: tender.loadId },
      data: { status: "BOOKED", carrierId: tender.carrier.userId },
    }),
    // Decline other tenders for same load
    prisma.loadTender.updateMany({
      where: { loadId: tender.loadId, id: { not: tender.id }, status: "OFFERED" },
      data: { status: "DECLINED" },
    }),
  ]);

  res.json(updated);
}

export async function counterTender(req: AuthRequest, res: Response) {
  const { counterRate } = counterTenderSchema.parse(req.body);
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  const updated = await prisma.loadTender.update({
    where: { id: tender.id },
    data: { status: "COUNTERED", counterRate, respondedAt: new Date() },
  });

  res.json(updated);
}

export async function declineTender(req: AuthRequest, res: Response) {
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  const updated = await prisma.loadTender.update({
    where: { id: tender.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  res.json(updated);
}

export async function getCarrierTenders(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) { res.status(404).json({ error: "Carrier profile not found" }); return; }

  const tenders = await prisma.loadTender.findMany({
    where: { carrierId: profile.id },
    include: {
      load: {
        include: { poster: { select: { id: true, company: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(tenders);
}
