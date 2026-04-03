import { prisma } from "../config/database";

// ─── Types ──────────────────────────────────────────────────────────

export interface TopCarrierOnLane {
  name: string;
  loads: number;
  onTimeRate: number;
}

export interface LaneAnalytics {
  lane: string; // "TX→FL"
  originState: string;
  destState: string;
  loadCount: number;
  totalRevenue: number;
  avgRate: number;
  avgRatePerMile: number;
  avgMargin: number;
  marginPercent: number;
  avgTransitDays: number;
  topCarriers: TopCarrierOnLane[];
  trend: "GROWING" | "STABLE" | "DECLINING";
  volumeChange: number; // % vs prior period
}

export interface LaneDetailResult {
  lane: string;
  originState: string;
  destState: string;
  summary: LaneAnalytics;
  rateHistory: { week: string; avgCustomerRate: number; avgCarrierRate: number; avgMargin: number; loadCount: number }[];
  topCarriers: { name: string; carrierId: string; loads: number; avgRate: number; onTimeRate: number; avgTransitDays: number }[];
  topShippers: { name: string; customerId: string; loads: number; totalRevenue: number; avgMargin: number }[];
  seasonalPatterns: { month: number; monthName: string; avgVolume: number; avgRate: number }[];
  marginAnalysis: { avgMarginPercent: number; minMargin: number; maxMargin: number; medianMargin: number; marginTrend: "IMPROVING" | "STABLE" | "DECLINING" };
}

export interface HeatmapCell {
  originState: string;
  destState: string;
  loadCount: number;
  totalRevenue: number;
  avgRate: number;
}

export interface MarginAnalysisResult {
  overall: { totalRevenue: number; totalCost: number; totalMargin: number; avgMarginPercent: number; loadCount: number };
  byEquipmentType: { equipmentType: string; loadCount: number; totalRevenue: number; totalMargin: number; avgMarginPercent: number }[];
  byCustomer: { customerId: string; customerName: string; loadCount: number; totalRevenue: number; totalMargin: number; avgMarginPercent: number }[];
  byLane: { lane: string; originState: string; destState: string; loadCount: number; totalRevenue: number; totalMargin: number; avgMarginPercent: number }[];
  trend: { week: string; totalRevenue: number; totalMargin: number; avgMarginPercent: number; loadCount: number }[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function getPeriodDates(period: string): { start: Date; end: Date; priorStart: Date; priorEnd: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start: Date;
  let priorStart: Date;
  let priorEnd: Date;

  switch (period) {
    case "7d":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      priorEnd = new Date(start.getTime() - 1);
      priorStart = new Date(priorEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      priorEnd = new Date(start.getTime() - 1);
      priorStart = new Date(priorEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      priorEnd = new Date(start.getTime() - 1);
      priorStart = new Date(priorEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "1y":
      start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      priorEnd = new Date(start.getTime() - 1);
      priorStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
      break;
    default: // default 30d
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      priorEnd = new Date(start.getTime() - 1);
      priorStart = new Date(priorEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start, end, priorStart, priorEnd };
}

function determineTrend(currentCount: number, priorCount: number): { trend: "GROWING" | "STABLE" | "DECLINING"; volumeChange: number } {
  if (priorCount === 0) {
    return { trend: currentCount > 0 ? "GROWING" : "STABLE", volumeChange: currentCount > 0 ? 100 : 0 };
  }
  const change = ((currentCount - priorCount) / priorCount) * 100;
  const trend: "GROWING" | "STABLE" | "DECLINING" = change > 10 ? "GROWING" : change < -10 ? "DECLINING" : "STABLE";
  return { trend, volumeChange: Math.round(change * 10) / 10 };
}

const COMPLETED_STATUSES: string[] = ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"];

function getWeekLabel(d: Date): string {
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  return `${start.getFullYear()}-W${String(Math.ceil(((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Main Functions ─────────────────────────────────────────────────

/**
 * Returns top lanes by volume, revenue, and margin for a given period.
 */
export async function getTopLanes(limit: number = 20, period: string = "30d"): Promise<LaneAnalytics[]> {
  const { start, end, priorStart, priorEnd } = getPeriodDates(period);

  // Current period loads
  const loads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: start, lte: end },
      deletedAt: null,
    },
    select: {
      originState: true,
      destState: true,
      customerRate: true,
      carrierRate: true,
      grossMargin: true,
      marginPercent: true,
      revenuePerMile: true,
      distance: true,
      pickupDate: true,
      actualDeliveryDatetime: true,
      deliveryDate: true,
      actualPickupDatetime: true,
      carrierId: true,
      carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
    },
  });

  // Prior period loads for trend comparison
  const priorLoads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: priorStart, lte: priorEnd },
      deletedAt: null,
    },
    select: { originState: true, destState: true },
  });

  // Group current loads by lane
  const laneMap = new Map<string, typeof loads>();
  for (const load of loads) {
    const key = `${load.originState}→${load.destState}`;
    if (!laneMap.has(key)) laneMap.set(key, []);
    laneMap.get(key)!.push(load);
  }

  // Group prior loads by lane
  const priorLaneMap = new Map<string, number>();
  for (const load of priorLoads) {
    const key = `${load.originState}→${load.destState}`;
    priorLaneMap.set(key, (priorLaneMap.get(key) || 0) + 1);
  }

  // Build analytics for each lane
  const results: LaneAnalytics[] = [];

  for (const [lane, laneLoads] of laneMap.entries()) {
    const [originState, destState] = lane.split("→");
    const loadCount = laneLoads.length;

    const totalRevenue = laneLoads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
    const totalMargin = laneLoads.reduce((s, l) => s + (l.grossMargin ?? 0), 0);
    const avgRate = loadCount > 0 ? totalRevenue / loadCount : 0;

    const rpmLoads = laneLoads.filter((l) => l.revenuePerMile != null);
    const avgRatePerMile = rpmLoads.length > 0 ? rpmLoads.reduce((s, l) => s + l.revenuePerMile!, 0) / rpmLoads.length : 0;

    const marginLoads = laneLoads.filter((l) => l.marginPercent != null);
    const avgMargin = loadCount > 0 ? totalMargin / loadCount : 0;
    const marginPercent = marginLoads.length > 0 ? marginLoads.reduce((s, l) => s + l.marginPercent!, 0) / marginLoads.length : 0;

    // Avg transit days
    let totalTransitDays = 0;
    let transitCount = 0;
    for (const l of laneLoads) {
      const pickup = l.actualPickupDatetime || l.pickupDate;
      const delivery = l.actualDeliveryDatetime || l.deliveryDate;
      if (pickup && delivery) {
        totalTransitDays += (delivery.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24);
        transitCount++;
      }
    }
    const avgTransitDays = transitCount > 0 ? Math.round((totalTransitDays / transitCount) * 10) / 10 : 0;

    // Top carriers on lane
    const carrierMap = new Map<string, { name: string; loads: number; onTime: number; total: number }>();
    for (const l of laneLoads) {
      if (!l.carrierId) continue;
      const name = l.carrier?.company || `${l.carrier?.firstName || ""} ${l.carrier?.lastName || ""}`.trim() || "Unknown";
      if (!carrierMap.has(l.carrierId)) carrierMap.set(l.carrierId, { name, loads: 0, onTime: 0, total: 0 });
      const c = carrierMap.get(l.carrierId)!;
      c.loads++;
      c.total++;
      // Consider on-time if delivered before or on delivery date
      if (l.actualDeliveryDatetime && l.deliveryDate && l.actualDeliveryDatetime <= l.deliveryDate) {
        c.onTime++;
      }
    }
    const topCarriers: TopCarrierOnLane[] = Array.from(carrierMap.values())
      .sort((a, b) => b.loads - a.loads)
      .slice(0, 5)
      .map((c) => ({ name: c.name, loads: c.loads, onTimeRate: c.total > 0 ? Math.round((c.onTime / c.total) * 100) : 0 }));

    // Trend
    const priorCount = priorLaneMap.get(lane) || 0;
    const { trend, volumeChange } = determineTrend(loadCount, priorCount);

    results.push({
      lane,
      originState,
      destState,
      loadCount,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgRate: Math.round(avgRate * 100) / 100,
      avgRatePerMile: Math.round(avgRatePerMile * 100) / 100,
      avgMargin: Math.round(avgMargin * 100) / 100,
      marginPercent: Math.round(marginPercent * 100) / 100,
      avgTransitDays,
      topCarriers,
      trend,
      volumeChange,
    });
  }

  // Sort by load count descending, take top N
  results.sort((a, b) => b.loadCount - a.loadCount);
  return results.slice(0, limit);
}

/**
 * Deep dive on a specific lane with rate history, carrier/shipper analysis, and seasonal patterns.
 */
export async function getLaneDetail(originState: string, destState: string, period: string = "1y"): Promise<LaneDetailResult> {
  const { start, end, priorStart, priorEnd } = getPeriodDates(period);
  const lane = `${originState}→${destState}`;

  const loads = await prisma.load.findMany({
    where: {
      originState,
      destState,
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: start, lte: end },
      deletedAt: null,
    },
    select: {
      id: true,
      customerRate: true,
      carrierRate: true,
      grossMargin: true,
      marginPercent: true,
      revenuePerMile: true,
      distance: true,
      pickupDate: true,
      deliveryDate: true,
      actualPickupDatetime: true,
      actualDeliveryDatetime: true,
      equipmentType: true,
      carrierId: true,
      carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
      customerId: true,
      customer: { select: { id: true, name: true } },
    },
  });

  const priorLoads = await prisma.load.findMany({
    where: {
      originState,
      destState,
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: priorStart, lte: priorEnd },
      deletedAt: null,
    },
    select: { id: true },
  });

  // ── Summary ─────────────────────────────────────────────────
  const loadCount = loads.length;
  const totalRevenue = loads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
  const totalMargin = loads.reduce((s, l) => s + (l.grossMargin ?? 0), 0);
  const avgRate = loadCount > 0 ? totalRevenue / loadCount : 0;
  const rpmLoads = loads.filter((l) => l.revenuePerMile != null);
  const avgRatePerMile = rpmLoads.length > 0 ? rpmLoads.reduce((s, l) => s + l.revenuePerMile!, 0) / rpmLoads.length : 0;
  const marginLoads = loads.filter((l) => l.marginPercent != null);
  const marginPercent = marginLoads.length > 0 ? marginLoads.reduce((s, l) => s + l.marginPercent!, 0) / marginLoads.length : 0;
  const avgMargin = loadCount > 0 ? totalMargin / loadCount : 0;

  let totalTransitDays = 0;
  let transitCount = 0;
  for (const l of loads) {
    const pickup = l.actualPickupDatetime || l.pickupDate;
    const delivery = l.actualDeliveryDatetime || l.deliveryDate;
    if (pickup && delivery) {
      totalTransitDays += (delivery.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24);
      transitCount++;
    }
  }
  const avgTransitDays = transitCount > 0 ? Math.round((totalTransitDays / transitCount) * 10) / 10 : 0;

  const { trend, volumeChange } = determineTrend(loadCount, priorLoads.length);

  // ── Rate History (weekly) ───────────────────────────────────
  const weekMap = new Map<string, { custRates: number[]; carrRates: number[]; margins: number[]; count: number }>();
  for (const l of loads) {
    const week = getWeekLabel(l.deliveryDate);
    if (!weekMap.has(week)) weekMap.set(week, { custRates: [], carrRates: [], margins: [], count: 0 });
    const w = weekMap.get(week)!;
    if (l.customerRate != null) w.custRates.push(l.customerRate);
    if (l.carrierRate != null) w.carrRates.push(l.carrierRate);
    if (l.grossMargin != null) w.margins.push(l.grossMargin);
    w.count++;
  }
  const rateHistory = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({
      week,
      avgCustomerRate: w.custRates.length > 0 ? Math.round((w.custRates.reduce((s, v) => s + v, 0) / w.custRates.length) * 100) / 100 : 0,
      avgCarrierRate: w.carrRates.length > 0 ? Math.round((w.carrRates.reduce((s, v) => s + v, 0) / w.carrRates.length) * 100) / 100 : 0,
      avgMargin: w.margins.length > 0 ? Math.round((w.margins.reduce((s, v) => s + v, 0) / w.margins.length) * 100) / 100 : 0,
      loadCount: w.count,
    }));

  // ── Top Carriers ────────────────────────────────────────────
  const carrierAgg = new Map<string, { name: string; loads: number; totalRate: number; onTime: number; totalTransit: number; transitCount: number }>();
  for (const l of loads) {
    if (!l.carrierId) continue;
    const name = l.carrier?.company || `${l.carrier?.firstName || ""} ${l.carrier?.lastName || ""}`.trim() || "Unknown";
    if (!carrierAgg.has(l.carrierId)) carrierAgg.set(l.carrierId, { name, loads: 0, totalRate: 0, onTime: 0, totalTransit: 0, transitCount: 0 });
    const c = carrierAgg.get(l.carrierId)!;
    c.loads++;
    c.totalRate += l.carrierRate ?? 0;
    if (l.actualDeliveryDatetime && l.deliveryDate && l.actualDeliveryDatetime <= l.deliveryDate) c.onTime++;
    const pickup = l.actualPickupDatetime || l.pickupDate;
    const delivery = l.actualDeliveryDatetime || l.deliveryDate;
    if (pickup && delivery) {
      c.totalTransit += (delivery.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24);
      c.transitCount++;
    }
  }
  const topCarriers = Array.from(carrierAgg.entries())
    .sort(([, a], [, b]) => b.loads - a.loads)
    .slice(0, 10)
    .map(([carrierId, c]) => ({
      name: c.name,
      carrierId,
      loads: c.loads,
      avgRate: c.loads > 0 ? Math.round((c.totalRate / c.loads) * 100) / 100 : 0,
      onTimeRate: c.loads > 0 ? Math.round((c.onTime / c.loads) * 100) : 0,
      avgTransitDays: c.transitCount > 0 ? Math.round((c.totalTransit / c.transitCount) * 10) / 10 : 0,
    }));

  // ── Top Shippers ────────────────────────────────────────────
  const shipperAgg = new Map<string, { name: string; loads: number; totalRevenue: number; totalMargin: number }>();
  for (const l of loads) {
    if (!l.customerId) continue;
    const name = l.customer?.name || "Unknown";
    if (!shipperAgg.has(l.customerId)) shipperAgg.set(l.customerId, { name, loads: 0, totalRevenue: 0, totalMargin: 0 });
    const s = shipperAgg.get(l.customerId)!;
    s.loads++;
    s.totalRevenue += l.customerRate ?? 0;
    s.totalMargin += l.grossMargin ?? 0;
  }
  const topShippers = Array.from(shipperAgg.entries())
    .sort(([, a], [, b]) => b.loads - a.loads)
    .slice(0, 10)
    .map(([customerId, s]) => ({
      name: s.name,
      customerId,
      loads: s.loads,
      totalRevenue: Math.round(s.totalRevenue * 100) / 100,
      avgMargin: s.loads > 0 ? Math.round((s.totalMargin / s.loads) * 100) / 100 : 0,
    }));

  // ── Seasonal Patterns ───────────────────────────────────────
  const monthAgg = new Map<number, { volumes: number[]; rates: number[] }>();
  // Use all-time data for seasonal patterns — query separately
  const allTimeLoads = await prisma.load.findMany({
    where: {
      originState,
      destState,
      status: { in: COMPLETED_STATUSES as any[] },
      deletedAt: null,
    },
    select: { deliveryDate: true, customerRate: true },
  });

  // Group by month of year across all years
  const monthYearCounts = new Map<string, number>(); // "2025-3" => count — to track unique years
  for (const l of allTimeLoads) {
    const m = l.deliveryDate.getMonth();
    const yearKey = `${l.deliveryDate.getFullYear()}-${m}`;
    monthYearCounts.set(yearKey, (monthYearCounts.get(yearKey) || 0) + 1);
    if (!monthAgg.has(m)) monthAgg.set(m, { volumes: [], rates: [] });
    monthAgg.get(m)!.rates.push(l.customerRate ?? 0);
  }
  // Count distinct years per month
  const yearsPerMonth = new Map<number, Set<number>>();
  for (const key of monthYearCounts.keys()) {
    const [yr, mo] = key.split("-").map(Number);
    if (!yearsPerMonth.has(mo)) yearsPerMonth.set(mo, new Set());
    yearsPerMonth.get(mo)!.add(yr);
  }
  const seasonalPatterns = Array.from({ length: 12 }, (_, i) => {
    const agg = monthAgg.get(i);
    const yearCount = yearsPerMonth.get(i)?.size || 1;
    const totalLoadsInMonth = agg ? agg.rates.length : 0;
    return {
      month: i + 1,
      monthName: MONTH_NAMES[i],
      avgVolume: Math.round(totalLoadsInMonth / yearCount),
      avgRate: agg && agg.rates.length > 0 ? Math.round((agg.rates.reduce((s, v) => s + v, 0) / agg.rates.length) * 100) / 100 : 0,
    };
  });

  // ── Margin Analysis ─────────────────────────────────────────
  const margins = marginLoads.map((l) => l.marginPercent!).sort((a, b) => a - b);
  const medianMargin = margins.length > 0 ? margins[Math.floor(margins.length / 2)] : 0;

  // Trend based on first half vs second half of rate history
  const halfIdx = Math.floor(rateHistory.length / 2);
  const firstHalfMargin = rateHistory.slice(0, halfIdx).reduce((s, w) => s + w.avgMargin, 0) / (halfIdx || 1);
  const secondHalfMargin = rateHistory.slice(halfIdx).reduce((s, w) => s + w.avgMargin, 0) / (rateHistory.length - halfIdx || 1);
  const marginDiff = secondHalfMargin - firstHalfMargin;
  const marginTrend: "IMPROVING" | "STABLE" | "DECLINING" = marginDiff > 50 ? "IMPROVING" : marginDiff < -50 ? "DECLINING" : "STABLE";

  // Build carrier summary for top carriers list in summary
  const summaryCarriers: TopCarrierOnLane[] = topCarriers.slice(0, 5).map((c) => ({
    name: c.name,
    loads: c.loads,
    onTimeRate: c.onTimeRate,
  }));

  const summary: LaneAnalytics = {
    lane,
    originState,
    destState,
    loadCount,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgRate: Math.round(avgRate * 100) / 100,
    avgRatePerMile: Math.round(avgRatePerMile * 100) / 100,
    avgMargin: Math.round(avgMargin * 100) / 100,
    marginPercent: Math.round(marginPercent * 100) / 100,
    avgTransitDays,
    topCarriers: summaryCarriers,
    trend,
    volumeChange,
  };

  return {
    lane,
    originState,
    destState,
    summary,
    rateHistory,
    topCarriers,
    topShippers,
    seasonalPatterns,
    marginAnalysis: {
      avgMarginPercent: Math.round(marginPercent * 100) / 100,
      minMargin: margins.length > 0 ? Math.round(margins[0] * 100) / 100 : 0,
      maxMargin: margins.length > 0 ? Math.round(margins[margins.length - 1] * 100) / 100 : 0,
      medianMargin: Math.round(medianMargin * 100) / 100,
      marginTrend,
    },
  };
}

/**
 * Returns all state-to-state combinations with volume counts for heatmap visualization.
 */
export async function getLaneHeatmap(): Promise<HeatmapCell[]> {
  // Last 90 days for heatmap
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const loads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: start },
      deletedAt: null,
    },
    select: { originState: true, destState: true, customerRate: true },
  });

  const cellMap = new Map<string, { originState: string; destState: string; count: number; totalRevenue: number }>();
  for (const l of loads) {
    const key = `${l.originState}|${l.destState}`;
    if (!cellMap.has(key)) cellMap.set(key, { originState: l.originState, destState: l.destState, count: 0, totalRevenue: 0 });
    const cell = cellMap.get(key)!;
    cell.count++;
    cell.totalRevenue += l.customerRate ?? 0;
  }

  return Array.from(cellMap.values())
    .map((c) => ({
      originState: c.originState,
      destState: c.destState,
      loadCount: c.count,
      totalRevenue: Math.round(c.totalRevenue * 100) / 100,
      avgRate: c.count > 0 ? Math.round((c.totalRevenue / c.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.loadCount - a.loadCount);
}

/**
 * Overall margin breakdown by equipment type, customer, lane, and trend over time.
 */
export async function getMarginAnalysis(period: string = "30d"): Promise<MarginAnalysisResult> {
  const { start, end } = getPeriodDates(period);

  const loads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: start, lte: end },
      deletedAt: null,
    },
    select: {
      customerRate: true,
      carrierRate: true,
      grossMargin: true,
      marginPercent: true,
      equipmentType: true,
      originState: true,
      destState: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      deliveryDate: true,
    },
  });

  // ── Overall ──────────────────────────────────────────────
  const totalRevenue = loads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
  const totalCost = loads.reduce((s, l) => s + (l.carrierRate ?? 0), 0);
  const totalMargin = loads.reduce((s, l) => s + (l.grossMargin ?? 0), 0);
  const marginLoads = loads.filter((l) => l.marginPercent != null);
  const avgMarginPercent = marginLoads.length > 0 ? marginLoads.reduce((s, l) => s + l.marginPercent!, 0) / marginLoads.length : 0;

  // ── By Equipment Type ────────────────────────────────────
  const eqMap = new Map<string, { count: number; revenue: number; margin: number; marginPcts: number[] }>();
  for (const l of loads) {
    const et = l.equipmentType || "OTHER";
    if (!eqMap.has(et)) eqMap.set(et, { count: 0, revenue: 0, margin: 0, marginPcts: [] });
    const e = eqMap.get(et)!;
    e.count++;
    e.revenue += l.customerRate ?? 0;
    e.margin += l.grossMargin ?? 0;
    if (l.marginPercent != null) e.marginPcts.push(l.marginPercent);
  }
  const byEquipmentType = Array.from(eqMap.entries())
    .map(([equipmentType, e]) => ({
      equipmentType,
      loadCount: e.count,
      totalRevenue: Math.round(e.revenue * 100) / 100,
      totalMargin: Math.round(e.margin * 100) / 100,
      avgMarginPercent: e.marginPcts.length > 0 ? Math.round((e.marginPcts.reduce((s, v) => s + v, 0) / e.marginPcts.length) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.loadCount - a.loadCount);

  // ── By Customer ──────────────────────────────────────────
  const custMap = new Map<string, { name: string; count: number; revenue: number; margin: number; marginPcts: number[] }>();
  for (const l of loads) {
    if (!l.customerId) continue;
    const name = l.customer?.name || "Unknown";
    if (!custMap.has(l.customerId)) custMap.set(l.customerId, { name, count: 0, revenue: 0, margin: 0, marginPcts: [] });
    const c = custMap.get(l.customerId)!;
    c.count++;
    c.revenue += l.customerRate ?? 0;
    c.margin += l.grossMargin ?? 0;
    if (l.marginPercent != null) c.marginPcts.push(l.marginPercent);
  }
  const byCustomer = Array.from(custMap.entries())
    .map(([customerId, c]) => ({
      customerId,
      customerName: c.name,
      loadCount: c.count,
      totalRevenue: Math.round(c.revenue * 100) / 100,
      totalMargin: Math.round(c.margin * 100) / 100,
      avgMarginPercent: c.marginPcts.length > 0 ? Math.round((c.marginPcts.reduce((s, v) => s + v, 0) / c.marginPcts.length) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 20);

  // ── By Lane ──────────────────────────────────────────────
  const laneMap = new Map<string, { originState: string; destState: string; count: number; revenue: number; margin: number; marginPcts: number[] }>();
  for (const l of loads) {
    const key = `${l.originState}→${l.destState}`;
    if (!laneMap.has(key)) laneMap.set(key, { originState: l.originState, destState: l.destState, count: 0, revenue: 0, margin: 0, marginPcts: [] });
    const la = laneMap.get(key)!;
    la.count++;
    la.revenue += l.customerRate ?? 0;
    la.margin += l.grossMargin ?? 0;
    if (l.marginPercent != null) la.marginPcts.push(l.marginPercent);
  }
  const byLane = Array.from(laneMap.entries())
    .map(([lane, la]) => ({
      lane,
      originState: la.originState,
      destState: la.destState,
      loadCount: la.count,
      totalRevenue: Math.round(la.revenue * 100) / 100,
      totalMargin: Math.round(la.margin * 100) / 100,
      avgMarginPercent: la.marginPcts.length > 0 ? Math.round((la.marginPcts.reduce((s, v) => s + v, 0) / la.marginPcts.length) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.loadCount - a.loadCount)
    .slice(0, 20);

  // ── Trend Over Time (weekly) ─────────────────────────────
  const weekTrend = new Map<string, { revenue: number; margin: number; marginPcts: number[]; count: number }>();
  for (const l of loads) {
    const week = getWeekLabel(l.deliveryDate);
    if (!weekTrend.has(week)) weekTrend.set(week, { revenue: 0, margin: 0, marginPcts: [], count: 0 });
    const w = weekTrend.get(week)!;
    w.revenue += l.customerRate ?? 0;
    w.margin += l.grossMargin ?? 0;
    if (l.marginPercent != null) w.marginPcts.push(l.marginPercent);
    w.count++;
  }
  const trendData = Array.from(weekTrend.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({
      week,
      totalRevenue: Math.round(w.revenue * 100) / 100,
      totalMargin: Math.round(w.margin * 100) / 100,
      avgMarginPercent: w.marginPcts.length > 0 ? Math.round((w.marginPcts.reduce((s, v) => s + v, 0) / w.marginPcts.length) * 100) / 100 : 0,
      loadCount: w.count,
    }));

  return {
    overall: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalMargin: Math.round(totalMargin * 100) / 100,
      avgMarginPercent: Math.round(avgMarginPercent * 100) / 100,
      loadCount: loads.length,
    },
    byEquipmentType,
    byCustomer,
    byLane,
    trend: trendData,
  };
}
