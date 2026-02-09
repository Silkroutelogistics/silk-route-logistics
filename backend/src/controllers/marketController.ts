import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { laneQuerySchema, trendQuerySchema, capacityQuerySchema, REGIONS, getStatesForRegion } from "../validators/market";
import { getLaneBenchmarks, getRegionIntelligence, getIntegrationStatuses, getNationalRateIndex } from "../services/marketDataService";

export async function getLanes(req: AuthRequest, res: Response) {
  const query = laneQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.region) {
    const states = getStatesForRegion(query.region);
    if (states.length) {
      where.OR = [
        { originState: { in: states } },
        { destState: { in: states } },
      ];
    }
  }
  if (query.equipmentType) where.equipmentType = query.equipmentType;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {} as Record<string, Date>;
    if (query.dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(query.dateFrom);
    if (query.dateTo) (where.createdAt as Record<string, Date>).lte = new Date(query.dateTo);
  }

  // Group loads by origin-dest state pair
  const loads = await prisma.load.findMany({ where, select: { originState: true, originCity: true, destState: true, destCity: true, rate: true, distance: true, equipmentType: true, pickupDate: true, deliveryDate: true, createdAt: true } });

  const laneMap = new Map<string, { origin: string; dest: string; rates: number[]; distances: number[]; transitDays: number[]; equipTypes: string[]; recentRates: number[]; olderRates: number[] }>();
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);

  for (const l of loads) {
    const key = `${l.originState}-${l.destState}`;
    if (!laneMap.has(key)) {
      laneMap.set(key, { origin: `${l.originCity}, ${l.originState}`, dest: `${l.destCity}, ${l.destState}`, rates: [], distances: [], transitDays: [], equipTypes: [], recentRates: [], olderRates: [] });
    }
    const lane = laneMap.get(key)!;
    lane.rates.push(l.rate);
    if (l.distance) lane.distances.push(l.distance);
    const transit = (l.deliveryDate.getTime() - l.pickupDate.getTime()) / (1000 * 60 * 60 * 24);
    lane.transitDays.push(transit);
    lane.equipTypes.push(l.equipmentType);
    if (l.createdAt >= fourWeeksAgo) lane.recentRates.push(l.rate);
    else if (l.createdAt >= eightWeeksAgo) lane.olderRates.push(l.rate);
  }

  const lanes = Array.from(laneMap.entries()).map(([, v]) => {
    const avgRate = v.rates.reduce((a, b) => a + b, 0) / v.rates.length;
    const avgDist = v.distances.length ? v.distances.reduce((a, b) => a + b, 0) / v.distances.length : 0;
    const avgTransit = v.transitDays.reduce((a, b) => a + b, 0) / v.transitDays.length;
    const equipCount: Record<string, number> = {};
    v.equipTypes.forEach((e) => { equipCount[e] = (equipCount[e] || 0) + 1; });
    const topEquipment = Object.entries(equipCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    const recentAvg = v.recentRates.length ? v.recentRates.reduce((a, b) => a + b, 0) / v.recentRates.length : avgRate;
    const olderAvg = v.olderRates.length ? v.olderRates.reduce((a, b) => a + b, 0) / v.olderRates.length : avgRate;
    const pctChange = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
    const trend = pctChange > 3 ? "up" : pctChange < -3 ? "down" : "stable";

    return {
      origin: v.origin, dest: v.dest,
      avgRate: Math.round(avgRate), avgRatePerMile: avgDist > 0 ? +(avgRate / avgDist).toFixed(2) : 0,
      loadCount: v.rates.length, avgTransitDays: +avgTransit.toFixed(1),
      topEquipment, trend,
    };
  }).sort((a, b) => b.loadCount - a.loadCount);

  const total = lanes.length;
  const paginated = lanes.slice((query.page - 1) * query.limit, query.page * query.limit);
  res.json({ lanes: paginated, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getRegions(req: AuthRequest, res: Response) {
  const results = [];
  for (const [regionName, states] of Object.entries(REGIONS)) {
    const [loadCount, avgRate, carrierCount] = await Promise.all([
      prisma.load.count({ where: { OR: [{ originState: { in: states } }, { destState: { in: states } }] } }),
      prisma.load.aggregate({ where: { OR: [{ originState: { in: states } }, { destState: { in: states } }] }, _avg: { rate: true, distance: true } }),
      prisma.carrierProfile.count({ where: { operatingRegions: { hasSome: states } } }),
    ]);
    const avgRateVal = avgRate._avg.rate || 0;
    const avgDist = avgRate._avg.distance || 1;
    results.push({
      region: regionName,
      states,
      loadCount,
      avgRate: Math.round(avgRateVal),
      avgRatePerMile: +(avgRateVal / avgDist).toFixed(2),
      availableCarriers: carrierCount,
    });
  }
  res.json(results);
}

export async function getTrends(req: AuthRequest, res: Response) {
  const query = trendQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - query.months);
  where.createdAt = { gte: monthsAgo };

  if (query.originState && query.destState) {
    where.originState = query.originState;
    where.destState = query.destState;
  } else if (query.region) {
    const states = getStatesForRegion(query.region);
    if (states.length) {
      where.OR = [{ originState: { in: states } }, { destState: { in: states } }];
    }
  }

  const loads = await prisma.load.findMany({ where, select: { rate: true, distance: true, createdAt: true }, orderBy: { createdAt: "asc" } });

  const buckets = new Map<string, { rates: number[]; distances: number[] }>();
  for (const l of loads) {
    const d = l.createdAt;
    let key: string;
    if (query.granularity === "weekly") {
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      key = weekStart.toISOString().slice(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!buckets.has(key)) buckets.set(key, { rates: [], distances: [] });
    const b = buckets.get(key)!;
    b.rates.push(l.rate);
    if (l.distance) b.distances.push(l.distance);
  }

  const trends = Array.from(buckets.entries()).map(([period, v]) => {
    const avgRate = v.rates.reduce((a, b) => a + b, 0) / v.rates.length;
    const avgDist = v.distances.length ? v.distances.reduce((a, b) => a + b, 0) / v.distances.length : 0;
    return { period, avgRate: Math.round(avgRate), avgRatePerMile: avgDist > 0 ? +(avgRate / avgDist).toFixed(2) : 0, loadCount: v.rates.length };
  });

  res.json(trends);
}

export async function getCapacity(req: AuthRequest, res: Response) {
  const query = capacityQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.region) {
    const states = getStatesForRegion(query.region);
    if (states.length) where.operatingRegions = { hasSome: states };
  }
  if (query.equipmentType) where.equipmentTypes = { has: query.equipmentType };

  const carriers = await prisma.carrierProfile.findMany({
    where,
    include: { user: { select: { id: true, company: true, firstName: true, lastName: true } } },
    orderBy: { safetyScore: "desc" },
  });

  const result = carriers.map((c) => ({
    carrierId: c.id,
    userId: c.user.id,
    company: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
    tier: c.tier,
    equipmentTypes: c.equipmentTypes,
    operatingRegions: c.operatingRegions,
    safetyScore: c.safetyScore,
    numberOfTrucks: c.numberOfTrucks,
  }));

  res.json({ carriers: result, total: result.length });
}

// ─── Market Intelligence Endpoints ──────────────────────

export async function getBenchmarks(req: AuthRequest, res: Response) {
  const { originState, destState, equipmentType, distance } = req.query;
  const benchmarks = await getLaneBenchmarks(
    (originState as string) || "MI",
    (destState as string) || "OH",
    (equipmentType as string) || "Dry Van",
    parseInt(distance as string) || 500
  );
  res.json(benchmarks);
}

export async function getIntelligence(req: AuthRequest, res: Response) {
  const region = (req.query.region as string) || "GREAT_LAKES";
  const intel = await getRegionIntelligence(region);
  res.json(intel);
}

export async function getIntegrations(req: AuthRequest, res: Response) {
  const statuses = await getIntegrationStatuses();
  res.json(statuses);
}

export async function getRateIndex(req: AuthRequest, res: Response) {
  const index = getNationalRateIndex();
  res.json(index);
}
