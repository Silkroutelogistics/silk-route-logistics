import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createSettlementSchema, settlementQuerySchema } from "../validators/settlement";

export async function createSettlement(req: AuthRequest, res: Response) {
  const data = createSettlementSchema.parse(req.body);

  // Generate settlement number
  const lastSettlement = await prisma.settlement.findFirst({
    orderBy: { createdAt: "desc" },
    select: { settlementNumber: true },
  });
  const lastNum = lastSettlement ? parseInt(lastSettlement.settlementNumber.replace("STL-", ""), 10) : 1000;
  const settlementNumber = `STL-${lastNum + 1}`;

  // Find all carrier pays for this carrier in the period that aren't already settled
  const carrierPays = await prisma.carrierPay.findMany({
    where: {
      carrierId: data.carrierId,
      settlementId: null,
      status: { in: ["PENDING", "SCHEDULED", "PROCESSING", "PAID"] },
      createdAt: { gte: data.periodStart, lte: data.periodEnd },
    },
  });

  const grossPay = carrierPays.reduce((sum, cp) => sum + cp.amount, 0);
  const quickPayDeductions = carrierPays.reduce((sum, cp) => sum + (cp.quickPayDiscount || 0), 0);

  // Also check for factoring fees from invoices for this carrier in the period
  const factoringFees = await prisma.invoice.aggregate({
    where: {
      userId: data.carrierId,
      createdAt: { gte: data.periodStart, lte: data.periodEnd },
      factoringFee: { not: null },
    },
    _sum: { factoringFee: true },
  });

  const totalDeductions = quickPayDeductions + (factoringFees._sum.factoringFee || 0);
  const netSettlement = grossPay - totalDeductions;

  const settlement = await prisma.$transaction(async (tx) => {
    const stl = await tx.settlement.create({
      data: {
        settlementNumber,
        carrierId: data.carrierId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        period: data.period,
        grossPay,
        deductions: totalDeductions,
        netSettlement,
        notes: data.notes,
      },
    });

    // Link carrier pays to this settlement
    if (carrierPays.length > 0) {
      await tx.carrierPay.updateMany({
        where: { id: { in: carrierPays.map((cp) => cp.id) } },
        data: { settlementId: stl.id },
      });
    }

    return tx.settlement.findUnique({
      where: { id: stl.id },
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        carrierPays: {
          include: { load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } } },
        },
      },
    });
  });

  res.status(201).json(settlement);
}

export async function getSettlements(req: AuthRequest, res: Response) {
  const query = settlementQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (query.carrierId) where.carrierId = query.carrierId;
  if (query.status && query.status !== "ALL") where.status = query.status;

  const [settlements, total] = await Promise.all([
    prisma.settlement.findMany({
      where,
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        _count: { select: { carrierPays: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.settlement.count({ where }),
  ]);

  res.json({ settlements, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getSettlementById(req: AuthRequest, res: Response) {
  const settlement = await prisma.settlement.findUnique({
    where: { id: req.params.id },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
      carrierPays: {
        include: {
          load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, pickupDate: true, deliveryDate: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!settlement) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }

  res.json(settlement);
}

export async function finalizeSettlement(req: AuthRequest, res: Response) {
  const settlement = await prisma.settlement.findUnique({ where: { id: req.params.id } });
  if (!settlement) { res.status(404).json({ error: "Settlement not found" }); return; }
  if (settlement.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT settlements can be finalized" }); return; }

  const updated = await prisma.settlement.update({
    where: { id: req.params.id },
    data: { status: "FINALIZED" },
    include: { carrier: { select: { id: true, firstName: true, lastName: true, company: true } } },
  });

  res.json(updated);
}

export async function markSettlementPaid(req: AuthRequest, res: Response) {
  const settlement = await prisma.settlement.findUnique({ where: { id: req.params.id } });
  if (!settlement) { res.status(404).json({ error: "Settlement not found" }); return; }
  if (settlement.status !== "FINALIZED") { res.status(400).json({ error: "Only FINALIZED settlements can be marked paid" }); return; }

  const updated = await prisma.$transaction(async (tx) => {
    // Mark settlement paid
    const stl = await tx.settlement.update({
      where: { id: req.params.id },
      data: { status: "PAID", paidAt: new Date() },
      include: { carrier: { select: { id: true, firstName: true, lastName: true, company: true } } },
    });

    // Also mark all linked carrier pays as paid
    await tx.carrierPay.updateMany({
      where: { settlementId: req.params.id, status: { not: "PAID" } },
      data: { status: "PAID", paidAt: new Date() },
    });

    return stl;
  });

  res.json(updated);
}
