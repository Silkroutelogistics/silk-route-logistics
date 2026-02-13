import { prisma } from "../../config/database";

/**
 * Context Engine — Enriches AI queries with situational context.
 *
 * Before any AI model call (rate prediction, carrier match, recommendation),
 * this engine gathers relevant context: lane history, carrier profile,
 * current market conditions, time-of-day factors, and recent anomalies.
 *
 * The context object is attached to the prompt / feature vector so the AI
 * can make better decisions.
 */

interface LaneContext {
  laneKey: string;
  avgRate: number | null;
  trend: string | null;
  demand: string | null;
  backhaulScore: number | null;
  competitorDensity: string | null;
  seasonalFactor: number | null;
  recentAnomalies: number;
}

interface CarrierContext {
  carrierId: string;
  companyName: string;
  reliabilityScore: number;
  fallOffRisk: number;
  churnRisk: number;
  tier: string;
  performanceTrend: string;
  totalLoadsCompleted: number;
  preferredLanes: string[];
}

interface MarketContext {
  overallDemand: string;
  avgRateChangeThisWeek: number;
  activeAnomalies: number;
  topRisingLanes: string[];
  topFallingLanes: string[];
}

export interface EnrichedContext {
  lane?: LaneContext;
  carrier?: CarrierContext;
  market: MarketContext;
  timestamp: string;
  dayOfWeek: string;
  hourOfDay: number;
}

// ─── Build Lane Context ──────────────────────────────────────────────────────

export async function buildLaneContext(
  originState: string,
  destState: string
): Promise<LaneContext> {
  const laneKey = `${originState}:${destState}`;

  const [laneIntel, rateIntel, anomalyCount] = await Promise.all([
    prisma.laneIntelligence.findUnique({ where: { laneKey } }),
    prisma.rateIntelligence.findFirst({ where: { laneKey } }),
    prisma.anomalyLog.count({
      where: {
        entityId: { contains: originState },
        status: "NEW",
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
    }),
  ]);

  return {
    laneKey,
    avgRate: rateIntel?.avgRate ?? laneIntel?.avgRate ?? null,
    trend: rateIntel?.trend ?? laneIntel?.demandTrend ?? null,
    demand: laneIntel?.demand ?? null,
    backhaulScore: laneIntel?.backhaulScore ?? null,
    competitorDensity: laneIntel?.competitorDensity ?? null,
    seasonalFactor: rateIntel?.seasonalFactor ?? null,
    recentAnomalies: anomalyCount,
  };
}

// ─── Build Carrier Context ───────────────────────────────────────────────────

export async function buildCarrierContext(
  carrierId: string
): Promise<CarrierContext | null> {
  const [carrier, intel] = await Promise.all([
    prisma.carrierProfile.findUnique({
      where: { id: carrierId },
      select: { companyName: true, srcppTier: true, srcppTotalLoads: true },
    }),
    prisma.carrierIntelligence.findFirst({
      where: { carrierId, laneKey: "__global__" },
    }),
  ]);

  if (!carrier) return null;

  const preferredLanesRaw = intel?.preferredLanes;
  let preferredLanes: string[] = [];
  if (Array.isArray(preferredLanesRaw)) {
    preferredLanes = preferredLanesRaw.map((l: any) => l.lane ?? String(l)).slice(0, 5);
  }

  return {
    carrierId,
    companyName: carrier.companyName || "Unknown",
    reliabilityScore: intel?.reliabilityScore ?? 50,
    fallOffRisk: intel?.fallOffRisk ?? 0.1,
    churnRisk: intel?.churnRisk ?? 0.1,
    tier: carrier.srcppTier || "BRONZE",
    performanceTrend: intel?.performanceTrend ?? "STABLE",
    totalLoadsCompleted: carrier.srcppTotalLoads || 0,
    preferredLanes,
  };
}

// ─── Build Market Context ────────────────────────────────────────────────────

export async function buildMarketContext(): Promise<MarketContext> {
  const [risingLanes, fallingLanes, anomalyCount] = await Promise.all([
    prisma.rateIntelligence.findMany({
      where: { trend: "RISING" },
      orderBy: { trendPct: "desc" },
      take: 5,
      select: { laneKey: true },
    }),
    prisma.rateIntelligence.findMany({
      where: { trend: "FALLING" },
      orderBy: { trendPct: "asc" },
      take: 5,
      select: { laneKey: true },
    }),
    prisma.anomalyLog.count({
      where: { status: "NEW", createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    }),
  ]);

  // Average rate change across all tracked lanes
  const allIntel = await prisma.rateIntelligence.aggregate({
    _avg: { trendPct: true },
  });

  const risingCount = await prisma.rateIntelligence.count({ where: { trend: "RISING" } });
  const fallingCount = await prisma.rateIntelligence.count({ where: { trend: "FALLING" } });
  const totalCount = await prisma.rateIntelligence.count();

  let overallDemand = "MODERATE";
  if (totalCount > 0) {
    const risingPct = risingCount / totalCount;
    if (risingPct > 0.4) overallDemand = "HIGH";
    else if (risingPct < 0.15 && fallingCount / totalCount > 0.3) overallDemand = "LOW";
  }

  return {
    overallDemand,
    avgRateChangeThisWeek: Math.round((allIntel._avg.trendPct ?? 0) * 100) / 100,
    activeAnomalies: anomalyCount,
    topRisingLanes: risingLanes.map((l) => l.laneKey),
    topFallingLanes: fallingLanes.map((l) => l.laneKey),
  };
}

// ─── Build Full Enriched Context ─────────────────────────────────────────────

export async function enrichContext(params: {
  originState?: string;
  destState?: string;
  carrierId?: string;
}): Promise<EnrichedContext> {
  const now = new Date();

  const [lane, carrier, market] = await Promise.all([
    params.originState && params.destState
      ? buildLaneContext(params.originState, params.destState)
      : Promise.resolve(undefined),
    params.carrierId
      ? buildCarrierContext(params.carrierId)
      : Promise.resolve(undefined),
    buildMarketContext(),
  ]);

  return {
    lane: lane ?? undefined,
    carrier: carrier ?? undefined,
    market,
    timestamp: now.toISOString(),
    dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()],
    hourOfDay: now.getHours(),
  };
}
