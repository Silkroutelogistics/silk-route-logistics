import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────
export interface DateRange {
  start: Date;
  end: Date;
}

export interface AnalyticsFilters {
  userId?: string;
  userRole?: string;
  carrierId?: string;
  shipperId?: string;
  equipmentType?: string;
}

// ─── Helpers ──────────────────────────────────────────
function prevPeriod(range: DateRange): DateRange {
  const diff = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - diff), end: new Date(range.start.getTime()) };
}

function groupByKey(groupBy: string): string {
  if (groupBy === "week") return "YYYY-IW";
  if (groupBy === "month") return "YYYY-MM";
  return "YYYY-MM-DD";
}

// ─── Revenue Metrics ──────────────────────────────────
export async function getRevenueMetrics(range: DateRange, groupBy: string = "day", filters: AnalyticsFilters = {}) {
  const where: any = {
    pickupDate: { gte: range.start, lte: range.end },
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  if (filters.carrierId) where.carrierId = filters.carrierId;
  if (filters.userId && filters.userRole === "BROKER") where.posterId = filters.userId;

  const loads = await prisma.load.findMany({
    where,
    select: {
      id: true, pickupDate: true, rate: true, customerRate: true, carrierRate: true,
      totalCarrierPay: true, grossMargin: true, marginPercent: true, equipmentType: true,
    },
    orderBy: { pickupDate: "asc" },
  });

  // Current period totals
  let totalRevenue = 0, totalCost = 0, loadCount = 0;
  loads.forEach((l) => {
    const rev = l.customerRate || l.rate || 0;
    const cost = l.carrierRate || l.totalCarrierPay || 0;
    totalRevenue += rev;
    totalCost += cost;
    loadCount++;
  });
  const grossMargin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
  const revenuePerLoad = loadCount > 0 ? totalRevenue / loadCount : 0;

  // Previous period for comparison
  const prev = prevPeriod(range);
  const prevWhere = { ...where, pickupDate: { gte: prev.start, lte: prev.end } };
  const prevLoads = await prisma.load.findMany({ where: prevWhere, select: { rate: true, customerRate: true, carrierRate: true, totalCarrierPay: true } });
  let prevRevenue = 0, prevCost = 0;
  prevLoads.forEach((l) => {
    prevRevenue += l.customerRate || l.rate || 0;
    prevCost += l.carrierRate || l.totalCarrierPay || 0;
  });
  const prevMargin = prevRevenue - prevCost;

  // Time series
  const seriesMap: Record<string, { date: string; revenue: number; cost: number; margin: number; loads: number }> = {};
  loads.forEach((l) => {
    const d = l.pickupDate;
    let key: string;
    if (groupBy === "month") key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    else if (groupBy === "week") {
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    } else {
      key = d.toISOString().split("T")[0];
    }
    if (!seriesMap[key]) seriesMap[key] = { date: key, revenue: 0, cost: 0, margin: 0, loads: 0 };
    const rev = l.customerRate || l.rate || 0;
    const cost = l.carrierRate || l.totalCarrierPay || 0;
    seriesMap[key].revenue += rev;
    seriesMap[key].cost += cost;
    seriesMap[key].margin += rev - cost;
    seriesMap[key].loads++;
  });
  const series = Object.values(seriesMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totals: { totalRevenue, totalCost, grossMargin, marginPct, revenuePerLoad, loadCount },
    previousPeriod: { totalRevenue: prevRevenue, totalCost: prevCost, grossMargin: prevMargin },
    series,
  };
}

// ─── Load Metrics ─────────────────────────────────────
export async function getLoadMetrics(range: DateRange, filters: AnalyticsFilters = {}) {
  const where: any = {
    createdAt: { gte: range.start, lte: range.end },
  };
  if (filters.carrierId) where.carrierId = filters.carrierId;
  if (filters.userId && filters.userRole === "BROKER") where.posterId = filters.userId;

  const loads = await prisma.load.findMany({
    where,
    select: { id: true, status: true, equipmentType: true, createdAt: true, pickupDate: true, deliveryDate: true, actualDeliveryDatetime: true, actualPickupDatetime: true },
  });

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  const equipmentCounts: Record<string, number> = {};
  let totalDays = 0, completedCount = 0;

  loads.forEach((l) => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
    equipmentCounts[l.equipmentType] = (equipmentCounts[l.equipmentType] || 0) + 1;
    if (l.actualDeliveryDatetime && l.actualPickupDatetime) {
      totalDays += (l.actualDeliveryDatetime.getTime() - l.actualPickupDatetime.getTime()) / (1000 * 60 * 60 * 24);
      completedCount++;
    }
  });

  const daySpan = Math.max(1, (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
  const avgLoadsPerDay = loads.length / daySpan;
  const avgDaysToComplete = completedCount > 0 ? totalDays / completedCount : 0;
  const activeStatuses = ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"];
  const activeLoads = loads.filter((l) => activeStatuses.includes(l.status)).length;

  // Daily volume by equipment
  const dailyMap: Record<string, Record<string, number>> = {};
  loads.forEach((l) => {
    const key = l.createdAt.toISOString().split("T")[0];
    if (!dailyMap[key]) dailyMap[key] = {};
    dailyMap[key][l.equipmentType] = (dailyMap[key][l.equipmentType] || 0) + 1;
  });
  const dailySeries = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, eqs]) => ({ date, ...eqs }));

  return {
    totals: { totalLoads: loads.length, activeLoads, avgLoadsPerDay: Math.round(avgLoadsPerDay * 10) / 10, avgDaysToComplete: Math.round(avgDaysToComplete * 10) / 10 },
    statusBreakdown: statusCounts,
    equipmentBreakdown: equipmentCounts,
    dailySeries,
  };
}

// ─── On-Time Performance ──────────────────────────────
export async function getOnTimeMetrics(range: DateRange, filters: AnalyticsFilters = {}) {
  const where: any = {
    deliveryDate: { gte: range.start, lte: range.end },
    status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
  };
  if (filters.carrierId) where.carrierId = filters.carrierId;
  if (filters.userId && filters.userRole === "BROKER") where.posterId = filters.userId;

  const loads = await prisma.load.findMany({
    where,
    select: {
      id: true, deliveryDate: true, actualDeliveryDatetime: true,
      originCity: true, originState: true, destCity: true, destState: true,
      carrierId: true, carrier: { select: { firstName: true, lastName: true, company: true, carrierProfile: { select: { mcNumber: true } } } },
    },
  });

  let onTime = 0, late = 0, totalDelayHours = 0;
  const carrierStats: Record<string, { name: string; mc: string; total: number; onTime: number; late: number }> = {};
  const laneStats: Record<string, { origin: string; dest: string; total: number; onTime: number; late: number; totalDelay: number }> = {};

  loads.forEach((l) => {
    const isOnTime = !l.actualDeliveryDatetime || l.actualDeliveryDatetime <= l.deliveryDate;
    if (isOnTime) onTime++;
    else {
      late++;
      if (l.actualDeliveryDatetime) totalDelayHours += (l.actualDeliveryDatetime.getTime() - l.deliveryDate.getTime()) / (1000 * 60 * 60);
    }

    // Carrier stats
    if (l.carrierId) {
      if (!carrierStats[l.carrierId]) {
        const name = l.carrier ? (l.carrier.company || `${l.carrier.firstName} ${l.carrier.lastName}`) : "Unknown";
        const mc = l.carrier?.carrierProfile?.mcNumber || "";
        carrierStats[l.carrierId] = { name, mc, total: 0, onTime: 0, late: 0 };
      }
      carrierStats[l.carrierId].total++;
      if (isOnTime) carrierStats[l.carrierId].onTime++;
      else carrierStats[l.carrierId].late++;
    }

    // Lane stats
    const laneKey = `${l.originState}-${l.destState}`;
    if (!laneStats[laneKey]) laneStats[laneKey] = { origin: l.originState, dest: l.destState, total: 0, onTime: 0, late: 0, totalDelay: 0 };
    laneStats[laneKey].total++;
    if (isOnTime) laneStats[laneKey].onTime++;
    else {
      laneStats[laneKey].late++;
      if (l.actualDeliveryDatetime) laneStats[laneKey].totalDelay += (l.actualDeliveryDatetime.getTime() - l.deliveryDate.getTime()) / (1000 * 60 * 60);
    }
  });

  const total = onTime + late;
  const onTimePct = total > 0 ? (onTime / total) * 100 : 100;
  const avgDelayHours = late > 0 ? totalDelayHours / late : 0;

  // Bottom carriers by on-time
  const bottomCarriers = Object.values(carrierStats)
    .filter((c) => c.total >= 2)
    .map((c) => ({ ...c, onTimePct: (c.onTime / c.total) * 100 }))
    .sort((a, b) => a.onTimePct - b.onTimePct)
    .slice(0, 10);

  const bottomLanes = Object.values(laneStats)
    .filter((l) => l.total >= 2)
    .map((l) => ({ ...l, onTimePct: (l.onTime / l.total) * 100, avgDelayHours: l.late > 0 ? l.totalDelay / l.late : 0 }))
    .sort((a, b) => a.onTimePct - b.onTimePct)
    .slice(0, 10);

  // Trend: group by date
  const trendMap: Record<string, { date: string; total: number; onTime: number }> = {};
  loads.forEach((l) => {
    const key = l.deliveryDate.toISOString().split("T")[0];
    if (!trendMap[key]) trendMap[key] = { date: key, total: 0, onTime: 0 };
    trendMap[key].total++;
    const isOT = !l.actualDeliveryDatetime || l.actualDeliveryDatetime <= l.deliveryDate;
    if (isOT) trendMap[key].onTime++;
  });
  const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  return { onTimePct, total, onTime, late, avgDelayHours, bottomCarriers, bottomLanes, trend };
}

// ─── Lane Profitability ───────────────────────────────
export async function getLaneProfitability(range: DateRange, filters: AnalyticsFilters = {}, sort: string = "margin", limit: number = 50) {
  const where: any = {
    pickupDate: { gte: range.start, lte: range.end },
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  if (filters.carrierId) where.carrierId = filters.carrierId;
  if (filters.userId && filters.userRole === "BROKER") where.posterId = filters.userId;
  if (filters.equipmentType) where.equipmentType = filters.equipmentType;

  const loads = await prisma.load.findMany({
    where,
    select: { originState: true, destState: true, rate: true, customerRate: true, carrierRate: true, totalCarrierPay: true, distance: true },
  });

  const lanes: Record<string, { originState: string; destState: string; loads: number; revenue: number; cost: number; totalMiles: number }> = {};
  loads.forEach((l) => {
    const key = `${l.originState}-${l.destState}`;
    if (!lanes[key]) lanes[key] = { originState: l.originState, destState: l.destState, loads: 0, revenue: 0, cost: 0, totalMiles: 0 };
    lanes[key].loads++;
    lanes[key].revenue += l.customerRate || l.rate || 0;
    lanes[key].cost += l.carrierRate || l.totalCarrierPay || 0;
    lanes[key].totalMiles += l.distance || 0;
  });

  const laneList = Object.values(lanes).map((l) => ({
    ...l,
    margin: l.revenue - l.cost,
    marginPct: l.revenue > 0 ? ((l.revenue - l.cost) / l.revenue) * 100 : 0,
    avgRatePerMile: l.totalMiles > 0 ? l.revenue / l.totalMiles : 0,
  }));

  if (sort === "volume") laneList.sort((a, b) => b.loads - a.loads);
  else if (sort === "revenue") laneList.sort((a, b) => b.revenue - a.revenue);
  else laneList.sort((a, b) => b.margin - a.margin);

  return { lanes: laneList.slice(0, limit), total: laneList.length };
}

// ─── Carrier Scorecards ──────────────────────────────
export async function getCarrierScorecard(range: DateRange, filters: AnalyticsFilters = {}, sort: string = "score", limit: number = 50) {
  const where: any = {
    pickupDate: { gte: range.start, lte: range.end },
    carrierId: { not: null },
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  if (filters.carrierId) where.carrierId = filters.carrierId;

  const loads = await prisma.load.findMany({
    where,
    select: {
      id: true, carrierId: true, deliveryDate: true, actualDeliveryDatetime: true,
      carrier: { select: { id: true, firstName: true, lastName: true, company: true, carrierProfile: { select: { mcNumber: true, tier: true, cppTier: true, cppTotalLoads: true } } } },
    },
  });

  const claimData = await prisma.claim.groupBy({
    by: ["loadId"],
    where: { createdAt: { gte: range.start, lte: range.end } },
    _count: true,
  });
  const claimLoadIds = new Set(claimData.map((c) => c.loadId));

  const carriers: Record<string, { id: string; name: string; mc: string; tier: string; loads: number; onTime: number; claims: number; lastLoadDate: Date | null }> = {};
  loads.forEach((l) => {
    if (!l.carrierId || !l.carrier) return;
    if (!carriers[l.carrierId]) {
      carriers[l.carrierId] = {
        id: l.carrierId,
        name: l.carrier.company || `${l.carrier.firstName} ${l.carrier.lastName}`,
        mc: l.carrier.carrierProfile?.mcNumber || "",
        tier: l.carrier.carrierProfile?.cppTier || l.carrier.carrierProfile?.tier || "NONE",
        loads: 0, onTime: 0, claims: 0, lastLoadDate: null,
      };
    }
    carriers[l.carrierId].loads++;
    const isOT = !l.actualDeliveryDatetime || l.actualDeliveryDatetime <= l.deliveryDate;
    if (isOT) carriers[l.carrierId].onTime++;
    if (claimLoadIds.has(l.id)) carriers[l.carrierId].claims++;
    const loadDate = l.deliveryDate;
    if (!carriers[l.carrierId].lastLoadDate || loadDate > carriers[l.carrierId].lastLoadDate!) {
      carriers[l.carrierId].lastLoadDate = loadDate;
    }
  });

  const carrierList = Object.values(carriers).map((c) => ({
    ...c,
    onTimePct: c.loads > 0 ? (c.onTime / c.loads) * 100 : 100,
    score: c.loads > 0 ? Math.round(((c.onTime / c.loads) * 80 + Math.max(0, 20 - c.claims * 5))) : 0,
  }));

  if (sort === "loads") carrierList.sort((a, b) => b.loads - a.loads);
  else if (sort === "on_time") carrierList.sort((a, b) => b.onTimePct - a.onTimePct);
  else carrierList.sort((a, b) => b.score - a.score);

  return { carriers: carrierList.slice(0, limit), total: carrierList.length };
}

// ─── Shipper Scorecards ──────────────────────────────
export async function getShipperScorecard(range: DateRange, filters: AnalyticsFilters = {}, sort: string = "revenue", limit: number = 50) {
  const where: any = {
    pickupDate: { gte: range.start, lte: range.end },
    customerId: { not: null },
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  if (filters.userId && filters.userRole === "BROKER") where.posterId = filters.userId;

  const loads = await prisma.load.findMany({
    where,
    select: {
      customerId: true, rate: true, customerRate: true, carrierRate: true, totalCarrierPay: true, distance: true,
      customer: { select: { id: true, name: true, industry: true, status: true } },
    },
  });

  // Get invoice payment data
  const invoices = await prisma.invoice.findMany({
    where: { createdAt: { gte: range.start, lte: range.end }, status: { not: "VOID" } },
    select: { userId: true, amount: true, status: true, createdAt: true, paidAt: true },
  });

  const shippers: Record<string, { id: string; name: string; industry: string; status: string; loads: number; revenue: number; cost: number; totalMiles: number; payDays: number; paidCount: number; outstandingAR: number }> = {};
  loads.forEach((l) => {
    if (!l.customerId || !l.customer) return;
    if (!shippers[l.customerId]) {
      shippers[l.customerId] = {
        id: l.customerId, name: l.customer.name, industry: l.customer.industry || "",
        status: l.customer.status || "Active",
        loads: 0, revenue: 0, cost: 0, totalMiles: 0, payDays: 0, paidCount: 0, outstandingAR: 0,
      };
    }
    shippers[l.customerId].loads++;
    shippers[l.customerId].revenue += l.customerRate || l.rate || 0;
    shippers[l.customerId].cost += l.carrierRate || l.totalCarrierPay || 0;
    shippers[l.customerId].totalMiles += l.distance || 0;
  });

  // Add invoice/payment data
  invoices.forEach((inv) => {
    // try to map by userId, but invoices reference the user who created them
    const unpaid = ["DRAFT", "SUBMITTED", "SENT", "UNDER_REVIEW", "APPROVED", "OVERDUE"].includes(inv.status);
    // Note: we aggregate outstanding AR at the system level since invoices don't directly link to customer
  });

  const shipperList = Object.values(shippers).map((s) => ({
    ...s,
    margin: s.revenue - s.cost,
    marginPct: s.revenue > 0 ? ((s.revenue - s.cost) / s.revenue) * 100 : 0,
    avgRatePerMile: s.totalMiles > 0 ? s.revenue / s.totalMiles : 0,
    avgDaysToPay: s.paidCount > 0 ? Math.round(s.payDays / s.paidCount) : 0,
  }));

  if (sort === "volume") shipperList.sort((a, b) => b.loads - a.loads);
  else if (sort === "margin") shipperList.sort((a, b) => b.marginPct - a.marginPct);
  else shipperList.sort((a, b) => b.revenue - a.revenue);

  return { shippers: shipperList.slice(0, limit), total: shipperList.length };
}

// ─── Cash Flow (Accounting) ──────────────────────────
export async function getCashFlowMetrics(range: DateRange) {
  const fund = await prisma.factoringFund.findMany({
    where: { createdAt: { gte: range.start, lte: range.end } },
    orderBy: { createdAt: "asc" },
    select: { transactionType: true, amount: true, runningBalance: true, createdAt: true },
  });

  const latest = await prisma.factoringFund.findFirst({ orderBy: { createdAt: "desc" }, select: { runningBalance: true } });
  const currentBalance = latest?.runningBalance || 0;

  let totalInflow = 0, totalOutflow = 0, qpFeeRevenue = 0;
  const dailyMap: Record<string, { date: string; inflow: number; outflow: number; balance: number }> = {};

  fund.forEach((f) => {
    if (f.amount > 0) totalInflow += f.amount;
    else totalOutflow += Math.abs(f.amount);
    if (f.transactionType === "QP_FEE_EARNED") qpFeeRevenue += f.amount;

    const key = f.createdAt.toISOString().split("T")[0];
    if (!dailyMap[key]) dailyMap[key] = { date: key, inflow: 0, outflow: 0, balance: f.runningBalance };
    if (f.amount > 0) dailyMap[key].inflow += f.amount;
    else dailyMap[key].outflow += Math.abs(f.amount);
    dailyMap[key].balance = f.runningBalance;
  });

  const days = Math.max(1, (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
  const series = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    currentBalance,
    avgDailyInflow: totalInflow / days,
    avgDailyOutflow: totalOutflow / days,
    projectedBalance30d: currentBalance + ((totalInflow - totalOutflow) / days) * 30,
    qpFeeRevenue,
    series,
  };
}

// ─── AR Aging (Accounting) ───────────────────────────
export async function getARAgingMetrics() {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["SENT", "SUBMITTED", "OVERDUE", "PARTIAL", "UNDER_REVIEW", "APPROVED"] } },
    select: { id: true, invoiceNumber: true, amount: true, totalAmount: true, paidAmount: true, dueDate: true, createdAt: true, status: true, user: { select: { company: true, firstName: true, lastName: true } } },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  let current = 0, over30 = 0, over60 = 0, over90 = 0;
  const buckets = { current: [] as any[], over30: [] as any[], over60: [] as any[], over90: [] as any[] };

  invoices.forEach((inv) => {
    const outstanding = (inv.totalAmount || inv.amount) - (inv.paidAmount || 0);
    if (outstanding <= 0) return;
    const daysPast = inv.dueDate ? Math.max(0, (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const entry = { ...inv, outstanding, daysPastDue: Math.round(daysPast), company: inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}` };

    if (daysPast >= 90) { over90 += outstanding; buckets.over90.push(entry); }
    else if (daysPast >= 60) { over60 += outstanding; buckets.over60.push(entry); }
    else if (daysPast >= 30) { over30 += outstanding; buckets.over30.push(entry); }
    else { current += outstanding; buckets.current.push(entry); }
  });

  const totalAR = current + over30 + over60 + over90;

  // DSO calculation
  const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recentInvoices = await prisma.invoice.findMany({
    where: { createdAt: { gte: last90Days }, status: { not: "VOID" } },
    select: { amount: true, createdAt: true, paidAt: true },
  });
  let totalSales = 0, totalPaidDays = 0, paidCount = 0;
  recentInvoices.forEach((inv) => {
    totalSales += inv.amount;
    if (inv.paidAt) {
      totalPaidDays += (inv.paidAt.getTime() - inv.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      paidCount++;
    }
  });
  const dso = paidCount > 0 ? Math.round(totalPaidDays / paidCount) : 0;
  const onTimeCollectionPct = recentInvoices.length > 0 ? (paidCount / recentInvoices.length) * 100 : 0;

  return {
    aging: { current, over30, over60, over90, totalAR },
    dso,
    onTimeCollectionPct,
    invoices: [...buckets.over90, ...buckets.over60, ...buckets.over30, ...buckets.current].slice(0, 100),
  };
}

// ─── AP Metrics (Accounting) ─────────────────────────
export async function getAPMetrics(range: DateRange) {
  const pending = await prisma.carrierPay.findMany({
    where: { status: { in: ["PENDING", "PREPARED", "SUBMITTED", "APPROVED", "PROCESSING", "SCHEDULED"] } },
    select: { id: true, amount: true, netAmount: true, paymentTier: true, dueDate: true, status: true, quickPayFeeAmount: true, carrier: { select: { company: true, firstName: true, lastName: true } }, load: { select: { referenceNumber: true } } },
    orderBy: { dueDate: "asc" },
  });

  const processed = await prisma.carrierPay.findMany({
    where: { paidAt: { gte: range.start, lte: range.end } },
    select: { netAmount: true, quickPayFeeAmount: true },
  });

  // Tier breakdown
  const tierCounts: Record<string, { count: number; amount: number }> = {};
  let totalPending = 0;
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueThisWeek: any[] = [];

  pending.forEach((p) => {
    const tier = p.paymentTier || "STANDARD";
    if (!tierCounts[tier]) tierCounts[tier] = { count: 0, amount: 0 };
    tierCounts[tier].count++;
    tierCounts[tier].amount += p.netAmount;
    totalPending += p.netAmount;

    if (p.dueDate && p.dueDate <= weekEnd) {
      dueThisWeek.push({ ...p, carrierName: p.carrier?.company || `${p.carrier?.firstName} ${p.carrier?.lastName}`, loadRef: p.load?.referenceNumber });
    }
  });

  let processedTotal = 0, qpFeeTotal = 0;
  processed.forEach((p) => {
    processedTotal += p.netAmount;
    qpFeeTotal += p.quickPayFeeAmount || 0;
  });

  return { totalPending, processedThisMonth: processedTotal, qpFeeRevenue: qpFeeTotal, tierBreakdown: tierCounts, dueThisWeek: dueThisWeek.slice(0, 20) };
}

// ─── Shipper Credit Health (Accounting) ──────────────
export async function getShipperCreditHealth() {
  const credits = await prisma.shipperCredit.findMany({
    include: { customer: { select: { id: true, name: true, industry: true, status: true } } },
    orderBy: { currentUtilized: "desc" },
  });

  return credits.map((c) => ({
    id: c.customerId,
    name: c.customer.name,
    industry: c.customer.industry || "",
    creditLimit: c.creditLimit,
    utilized: c.currentUtilized,
    utilizationPct: c.creditLimit > 0 ? (c.currentUtilized / c.creditLimit) * 100 : 0,
    creditGrade: c.creditGrade,
    paymentTerms: c.paymentTerms,
    avgDaysToPay: c.avgDaysToPay,
    onTimePayments: c.onTimePayments,
    latePayments: c.latePayments,
    autoBlocked: c.autoBlocked,
    status: c.autoBlocked ? "BLOCKED" : (c.creditLimit > 0 && c.currentUtilized / c.creditLimit > 0.9) ? "WATCH" : "GOOD",
  }));
}

// ─── Carrier Earnings (Carrier Console) ──────────────
export async function getCarrierEarnings(range: DateRange, carrierId: string) {
  const payments = await prisma.carrierPay.findMany({
    where: { carrierId, createdAt: { gte: range.start, lte: range.end } },
    select: { amount: true, netAmount: true, quickPayFeeAmount: true, paidAt: true, createdAt: true, status: true, load: { select: { originState: true, destState: true, distance: true } } },
    orderBy: { createdAt: "asc" },
  });

  const loads = await prisma.load.findMany({
    where: { carrierId, status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] }, deliveryDate: { gte: range.start, lte: range.end } },
    select: { id: true },
  });

  let totalEarned = 0, qpFees = 0, netEarnings = 0, totalMiles = 0;
  const laneEarnings: Record<string, { lane: string; revenue: number; loads: number }> = {};
  const series: { date: string; amount: number }[] = [];

  payments.forEach((p) => {
    totalEarned += p.amount;
    qpFees += p.quickPayFeeAmount || 0;
    netEarnings += p.netAmount;
    totalMiles += p.load?.distance || 0;

    const key = (p.paidAt || p.createdAt).toISOString().split("T")[0];
    series.push({ date: key, amount: p.netAmount });

    if (p.load) {
      const lane = `${p.load.originState} → ${p.load.destState}`;
      if (!laneEarnings[lane]) laneEarnings[lane] = { lane, revenue: 0, loads: 0 };
      laneEarnings[lane].revenue += p.netAmount;
      laneEarnings[lane].loads++;
    }
  });

  const topLanes = Object.values(laneEarnings).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return {
    totalEarned, qpFees, netEarnings,
    loadsCompleted: loads.length,
    avgRatePerMile: totalMiles > 0 ? totalEarned / totalMiles : 0,
    topLanes,
    series,
  };
}

// ─── Export Data ──────────────────────────────────────
export async function exportData(reportType: string, range: DateRange, filters: AnalyticsFilters = {}) {
  switch (reportType) {
    case "revenue": return getRevenueMetrics(range, "day", filters);
    case "loads": return getLoadMetrics(range, filters);
    case "on-time": return getOnTimeMetrics(range, filters);
    case "lanes": return getLaneProfitability(range, filters);
    case "carriers": return getCarrierScorecard(range, filters);
    case "shippers": return getShipperScorecard(range, filters);
    default: return getRevenueMetrics(range, "day", filters);
  }
}
