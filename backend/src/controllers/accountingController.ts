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

/** Margin analysis: per-load margin data */
export async function getMarginAnalysis(req: AuthRequest, res: Response) {
  const loads = await prisma.load.findMany({
    where: { status: { in: ["DELIVERED", "COMPLETED"] } },
    select: {
      id: true,
      referenceNumber: true,
      rate: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      deliveryDate: true,
      rateConfirmations: {
        select: { carrierRate: true, totalCharges: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
    },
    orderBy: { deliveryDate: "desc" },
    take: 200,
  });

  const analysis = loads.map((load) => {
    const customerRate = load.rate;
    const rc = load.rateConfirmations[0];
    const carrierCost = rc?.totalCharges || rc?.carrierRate || load.rate;
    const grossMargin = customerRate - carrierCost;
    const marginPercent = customerRate > 0 ? (grossMargin / customerRate) * 100 : 0;

    return {
      loadId: load.id,
      referenceNumber: load.referenceNumber,
      route: `${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`,
      customerRate,
      carrierCost,
      grossMargin,
      marginPercent: Math.round(marginPercent * 100) / 100,
      carrier: load.carrier,
      deliveryDate: load.deliveryDate,
    };
  });

  const totalProfit = analysis.reduce((s, a) => s + a.grossMargin, 0);
  const avgMargin = analysis.length > 0 ? analysis.reduce((s, a) => s + a.marginPercent, 0) / analysis.length : 0;

  res.json({
    loads: analysis,
    aggregates: {
      totalLoads: analysis.length,
      totalRevenue: analysis.reduce((s, a) => s + a.customerRate, 0),
      totalCost: analysis.reduce((s, a) => s + a.carrierCost, 0),
      totalProfit,
      avgMarginPercent: Math.round(avgMargin * 100) / 100,
    },
  });
}

/** Profit & Loss statement */
export async function getProfitAndLoss(req: AuthRequest, res: Response) {
  const { period } = req.query;
  const now = new Date();
  let startDate: Date;

  if (period === "quarterly") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    startDate = new Date(now.getFullYear(), q, 1);
  } else if (period === "ytd") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else {
    // Default: last 6 months
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  }

  // Revenue from loads
  const loads = await prisma.load.findMany({
    where: { status: { in: ["DELIVERED", "COMPLETED"] }, deliveryDate: { gte: startDate } },
    select: { rate: true, deliveryDate: true },
  });

  // Carrier pay
  const carrierPays = await prisma.carrierPay.findMany({
    where: { createdAt: { gte: startDate }, status: { not: "VOID" } },
    select: { netAmount: true, quickPayDiscount: true, createdAt: true },
  });

  // Factoring fees
  const factoringFees = await prisma.invoice.aggregate({
    where: { createdAt: { gte: startDate }, factoringFee: { not: null } },
    _sum: { factoringFee: true },
  });

  const totalRevenue = loads.reduce((s, l) => s + l.rate, 0);
  const totalCarrierPay = carrierPays.reduce((s, cp) => s + cp.netAmount, 0);
  const totalFactoringFees = factoringFees._sum.factoringFee || 0;
  const totalQuickPaySavings = carrierPays.reduce((s, cp) => s + (cp.quickPayDiscount || 0), 0);
  const netProfit = totalRevenue - totalCarrierPay - totalFactoringFees;

  // Monthly breakdown
  const monthlyData: Record<string, { revenue: number; carrierPay: number; factoring: number }> = {};

  loads.forEach((l) => {
    const key = l.deliveryDate.toISOString().slice(0, 7); // YYYY-MM
    if (!monthlyData[key]) monthlyData[key] = { revenue: 0, carrierPay: 0, factoring: 0 };
    monthlyData[key].revenue += l.rate;
  });

  carrierPays.forEach((cp) => {
    const key = cp.createdAt.toISOString().slice(0, 7);
    if (!monthlyData[key]) monthlyData[key] = { revenue: 0, carrierPay: 0, factoring: 0 };
    monthlyData[key].carrierPay += cp.netAmount;
  });

  const monthly = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      revenue: data.revenue,
      carrierPay: data.carrierPay,
      factoring: data.factoring,
      netProfit: data.revenue - data.carrierPay - data.factoring,
    }));

  res.json({
    totalRevenue,
    totalCarrierPay,
    totalFactoringFees,
    totalQuickPaySavings,
    netProfit,
    monthly,
    period: period || "monthly",
  });
}

/** Aging detail drill-down by bucket */
export async function getAgingDetail(req: AuthRequest, res: Response) {
  const bucket = req.params.bucket; // "0-30", "31-60", "61-90", "90+"
  const now = new Date();
  const unpaidStatuses: ("SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "FUNDED")[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED"];

  let dateFilter: { gte?: Date; lt?: Date } = {};
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);

  if (bucket === "0-30") dateFilter = { gte: d30 };
  else if (bucket === "31-60") dateFilter = { gte: d60, lt: d30 };
  else if (bucket === "61-90") dateFilter = { gte: d90, lt: d60 };
  else if (bucket === "90+") dateFilter = { lt: d90 };
  else { res.status(400).json({ error: "Invalid bucket. Use: 0-30, 31-60, 61-90, 90+" }); return; }

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: unpaidStatuses },
      createdAt: dateFilter,
    },
    include: {
      load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
      user: { select: { firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const enriched = invoices.map((inv) => ({
    ...inv,
    age: Math.floor((now.getTime() - inv.createdAt.getTime()) / 86400000),
  }));

  res.json({ bucket, invoices: enriched, total: enriched.reduce((s, i) => s + i.amount, 0), count: enriched.length });
}

/** Payment history — merged timeline */
export async function getPaymentHistory(req: AuthRequest, res: Response) {
  const { page = "1", limit = "50" } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = parseInt(limit as string);

  // Received payments (invoices paid)
  const paidInvoices = await prisma.invoice.findMany({
    where: { status: "PAID", paidAt: { not: null } },
    select: { id: true, invoiceNumber: true, amount: true, paidAt: true, user: { select: { firstName: true, lastName: true, company: true } }, load: { select: { referenceNumber: true } } },
    orderBy: { paidAt: "desc" },
    take: 100,
  });

  // Sent payments (carrier pays paid)
  const paidCarrierPays = await prisma.carrierPay.findMany({
    where: { status: "PAID", paidAt: { not: null } },
    select: { id: true, netAmount: true, paymentMethod: true, paidAt: true, carrier: { select: { firstName: true, lastName: true, company: true } }, load: { select: { referenceNumber: true } } },
    orderBy: { paidAt: "desc" },
    take: 100,
  });

  // Merge into a unified timeline
  const timeline = [
    ...paidInvoices.map((inv) => ({
      id: inv.id,
      type: "received" as const,
      amount: inv.amount,
      date: inv.paidAt!,
      reference: inv.invoiceNumber,
      loadRef: inv.load?.referenceNumber,
      party: inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}`,
      method: null as string | null,
    })),
    ...paidCarrierPays.map((cp) => ({
      id: cp.id,
      type: "sent" as const,
      amount: cp.netAmount,
      date: cp.paidAt!,
      reference: null as string | null,
      loadRef: cp.load?.referenceNumber,
      party: cp.carrier?.company || `${cp.carrier?.firstName} ${cp.carrier?.lastName}`,
      method: cp.paymentMethod,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const paginated = timeline.slice(skip, skip + take);

  res.json({ payments: paginated, total: timeline.length, page: parseInt(page as string) });
}
