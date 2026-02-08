import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { financeSummaryQuerySchema, carrierSettlementQuerySchema } from "../validators/accounting";

export async function getFinanceSummary(req: AuthRequest, res: Response) {
  const { period } = financeSummaryQuerySchema.parse(req.query);

  const now = new Date();
  let startDate: Date;
  if (period === "ytd") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (period === "quarterly") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    startDate = new Date(now.getFullYear(), q, 1);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  }

  // Revenue from completed/delivered loads
  const loads = await prisma.load.findMany({
    where: { createdAt: { gte: startDate }, status: { in: ["DELIVERED", "COMPLETED"] } },
    select: { rate: true, createdAt: true },
  });

  // Paid invoices (expenses = carrier payments)
  const invoices = await prisma.invoice.findMany({
    where: { createdAt: { gte: startDate } },
    select: { amount: true, status: true, createdAt: true },
  });

  // Shipment revenue
  const shipmentRevenue = await prisma.shipment.aggregate({
    where: { createdAt: { gte: startDate }, status: { in: ["DELIVERED", "COMPLETED"] } },
    _sum: { rate: true },
  });

  // Group by month
  const months: Record<string, { revenue: number; expenses: number }> = {};
  loads.forEach((l) => {
    const key = l.createdAt.toLocaleString("default", { month: "short" });
    if (!months[key]) months[key] = { revenue: 0, expenses: 0 };
    months[key].revenue += l.rate;
  });
  invoices.filter(i => i.status === "PAID").forEach((inv) => {
    const key = inv.createdAt.toLocaleString("default", { month: "short" });
    if (!months[key]) months[key] = { revenue: 0, expenses: 0 };
    months[key].expenses += inv.amount;
  });

  const revenueData = Object.entries(months).map(([month, data]) => ({ month, ...data }));
  const totalRevenue = loads.reduce((s, l) => s + l.rate, 0) + (shipmentRevenue._sum.rate || 0);
  const totalExpenses = invoices.filter(i => i.status === "PAID").reduce((s, i) => s + i.amount, 0);

  res.json({
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    revenueData,
    period,
  });
}

export async function getAccountsReceivable(req: AuthRequest, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED"] } },
    include: {
      load: { select: { originCity: true, originState: true, destCity: true, destState: true } },
      user: { select: { firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const now = new Date();
  const enriched = invoices.map((inv) => {
    const age = Math.floor((now.getTime() - inv.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    let bucket = "0-30 days";
    if (age > 90) bucket = "90+ days";
    else if (age > 60) bucket = "61-90 days";
    else if (age > 30) bucket = "31-60 days";
    return { ...inv, age, bucket };
  });

  res.json({ receivables: enriched });
}

export async function getAccountsPayable(req: AuthRequest, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["APPROVED", "FUNDED"] } },
    include: {
      load: { select: { originCity: true, originState: true, destCity: true, destState: true } },
      user: { select: { firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ payables: invoices });
}

export async function getCarrierSettlements(req: AuthRequest, res: Response) {
  const query = carrierSettlementQuerySchema.parse(req.query);

  const where: Record<string, unknown> = {
    status: { in: ["DELIVERED", "COMPLETED"] },
    carrierId: { not: null },
  };
  if (query.carrierId) where.carrierId = query.carrierId;

  const loads = await prisma.load.findMany({
    where,
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      invoices: { select: { id: true, status: true, amount: true, paidAt: true } },
    },
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    orderBy: { updatedAt: "desc" },
  });

  const settlements = loads.map((l) => {
    const invoice = l.invoices[0];
    return {
      loadId: l.id,
      referenceNumber: l.referenceNumber,
      carrier: l.carrier,
      route: `${l.originCity}, ${l.originState} → ${l.destCity}, ${l.destState}`,
      rate: l.rate,
      invoiceId: invoice?.id,
      invoiceStatus: invoice?.status || "NOT_INVOICED",
      paidAt: invoice?.paidAt,
    };
  });

  res.json({ settlements });
}

export async function markInvoicePaid(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  res.json(invoice);
}
