import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createCarrierPaySchema, updateCarrierPaySchema, batchCarrierPaySchema, carrierPayQuerySchema } from "../validators/carrierPay";

export async function createCarrierPay(req: AuthRequest, res: Response) {
  const data = createCarrierPaySchema.parse(req.body);

  let quickPayDiscount: number | null = null;
  let netAmount = data.amount;
  let paymentMethod = data.paymentMethod || null;

  if (data.isQuickPay) {
    quickPayDiscount = data.amount * (data.quickPayDiscountPct / 100);
    netAmount = data.amount - quickPayDiscount;
    paymentMethod = "QUICKPAY";
  }

  const carrierPay = await prisma.carrierPay.create({
    data: {
      carrierId: data.carrierId,
      loadId: data.loadId,
      amount: data.amount,
      quickPayDiscount,
      netAmount,
      paymentMethod: paymentMethod as any,
      scheduledDate: data.scheduledDate,
      notes: data.notes,
    },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
    },
  });

  res.status(201).json(carrierPay);
}

export async function getCarrierPays(req: AuthRequest, res: Response) {
  const query = carrierPayQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (query.carrierId) where.carrierId = query.carrierId;
  if (query.status && query.status !== "ALL") where.status = query.status;

  const [carrierPays, total] = await Promise.all([
    prisma.carrierPay.findMany({
      where,
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.carrierPay.count({ where }),
  ]);

  res.json({ carrierPays, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getCarrierPayById(req: AuthRequest, res: Response) {
  const carrierPay = await prisma.carrierPay.findUnique({
    where: { id: req.params.id },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, rate: true, pickupDate: true, deliveryDate: true } },
      settlement: true,
    },
  });

  if (!carrierPay) {
    res.status(404).json({ error: "Carrier pay not found" });
    return;
  }

  res.json(carrierPay);
}

export async function updateCarrierPay(req: AuthRequest, res: Response) {
  const data = updateCarrierPaySchema.parse(req.body);
  const existing = await prisma.carrierPay.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Carrier pay not found" }); return; }

  const updateData: Record<string, unknown> = { ...data };
  if (data.status === "PAID") {
    updateData.paidAt = new Date();
  }

  const updated = await prisma.carrierPay.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
    },
  });

  res.json(updated);
}

export async function batchUpdateCarrierPays(req: AuthRequest, res: Response) {
  const { ids, action } = batchCarrierPaySchema.parse(req.body);

  const statusMap: Record<string, string> = {
    SCHEDULE: "SCHEDULED",
    PROCESS: "PROCESSING",
    PAY: "PAID",
    VOID: "VOID",
  };

  const newStatus = statusMap[action];
  const data: Record<string, unknown> = { status: newStatus };
  if (newStatus === "PAID") data.paidAt = new Date();

  const result = await prisma.$transaction(
    ids.map((id) => prisma.carrierPay.update({ where: { id }, data }))
  );

  res.json({ updated: result.length });
}

export async function getCarrierPaySummary(req: AuthRequest, res: Response) {
  const [totalOwed, totalPaid, totalScheduled, quickPaySavings] = await Promise.all([
    prisma.carrierPay.aggregate({
      where: { status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] } },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { status: "PAID" },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { status: "SCHEDULED" },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { quickPayDiscount: { not: null } },
      _sum: { quickPayDiscount: true },
      _count: true,
    }),
  ]);

  res.json({
    totalOwed: { amount: totalOwed._sum.netAmount || 0, count: totalOwed._count },
    totalPaid: { amount: totalPaid._sum.netAmount || 0, count: totalPaid._count },
    totalScheduled: { amount: totalScheduled._sum.netAmount || 0, count: totalScheduled._count },
    quickPaySavings: { amount: quickPaySavings._sum.quickPayDiscount || 0, count: quickPaySavings._count },
  });
}
