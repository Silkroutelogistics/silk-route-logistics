import { prisma } from "../config/database";

/**
 * Lane Optimization Engine — Self-Learning Lane & Deadhead Optimizer
 *
 * Analyzes load history to:
 * - Identify high-demand / underserved lanes
 * - Suggest backhaul opportunities (reduce empty miles)
 * - Optimize booking timing (best days/times)
 * - Predict lane demand shifts
 * - Calculate true lane profitability (including deadhead cost)
 *
 * COMPETITIVE EDGE: Reduce carrier deadhead → lower rates → win more loads.
 */

interface BackhaulSuggestion {
  outboundLane: string;
  returnLane: string;
  returnScore: number;
  avgDeadheadSaved: number;
  frequency: string;
}

// ─── Get Lane Analysis ────────────────────────────────────────────
export async function getLaneAnalysis(originState: string, destState: string) {
  const laneKey = `${originState}:${destState}`;
  const reverseLaneKey = `${destState}:${originState}`;

  const [lane, reverseLane] = await Promise.all([
    prisma.laneIntelligence.findUnique({ where: { laneKey } }),
    prisma.laneIntelligence.findUnique({ where: { laneKey: reverseLaneKey } }),
  ]);

  return {
    outbound: lane,
    backhaul: reverseLane,
    backhaulAvailable: !!reverseLane && reverseLane.totalLoads >= 3,
    backhaulScore: reverseLane ? Math.min(100, (reverseLane.totalLoads / (lane?.totalLoads || 1)) * 100) : 0,
    recommendation: !reverseLane
      ? "No backhaul history — potential for deadhead"
      : reverseLane.totalLoads >= 5
        ? "Strong backhaul lane — offer round-trip pricing"
        : "Developing backhaul — monitor volume",
  };
}

// ─── Get Backhaul Suggestions ─────────────────────────────────────
export async function getBackhaulSuggestions(destState: string): Promise<BackhaulSuggestion[]> {
  const outboundLanes = await prisma.laneIntelligence.findMany({
    where: { originState: destState, totalLoads: { gte: 3 } },
    orderBy: { totalLoads: "desc" },
    take: 5,
  });

  return outboundLanes.map((lane) => ({
    outboundLane: `${destState} → ${lane.destState}`,
    returnLane: lane.laneKey,
    returnScore: lane.backhaulScore,
    avgDeadheadSaved: lane.deadheadAvgMiles,
    frequency: lane.demand,
  }));
}

// ─── Weekly Learning Cycle ────────────────────────────────────────
export async function runLaneLearningCycle(): Promise<{
  lanesProcessed: number;
  backhaulsIdentified: number;
  dataPoints: number;
}> {
  const startTime = Date.now();
  console.log("[LaneOptimizer] Starting learning cycle...");

  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const loads = await prisma.load.findMany({
    where: {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      originState: { not: "" },
      destState: { not: "" },
      deliveryDate: { gte: yearAgo },
    },
    select: {
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      distance: true,
      customerRate: true,
      carrierRate: true,
      deliveryDate: true,
      pickupDate: true,
      createdAt: true,
    },
  });

  // Group by lane
  const laneMap = new Map<string, typeof loads>();
  for (const load of loads) {
    const key = `${load.originState}:${load.destState}`;
    if (!laneMap.has(key)) laneMap.set(key, []);
    laneMap.get(key)!.push(load);
  }

  let lanesProcessed = 0;
  let backhaulsIdentified = 0;

  for (const [laneKey, laneLoads] of laneMap) {
    const [originState, destState] = laneKey.split(":");

    // Calculate metrics
    const avgMiles = laneLoads.reduce((s, l) => s + (l.distance || 0), 0) / laneLoads.length;
    const rates = laneLoads.filter((l) => l.customerRate).map((l) => l.customerRate!);
    const avgRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
    const avgRpm = avgMiles > 0 ? avgRate / avgMiles : 0;

    // Transit time
    const transitDays: number[] = [];
    for (const load of laneLoads) {
      if (load.pickupDate && load.deliveryDate) {
        const days = (load.deliveryDate.getTime() - load.pickupDate.getTime()) / 86_400_000;
        if (days > 0 && days < 30) transitDays.push(days);
      }
    }
    const avgTransitDays = transitDays.length > 0 ? transitDays.reduce((s, d) => s + d, 0) / transitDays.length : 0;

    // Demand assessment
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
    const recentCount = laneLoads.filter((l) => l.createdAt >= thirtyDaysAgo).length;
    const olderCount = laneLoads.filter((l) => l.createdAt >= sixtyDaysAgo && l.createdAt < thirtyDaysAgo).length;

    let demand = "MODERATE";
    if (recentCount >= 10) demand = "HIGH";
    else if (recentCount <= 2) demand = "LOW";

    let demandTrend = "STABLE";
    if (olderCount > 0) {
      const change = (recentCount - olderCount) / olderCount;
      if (change > 0.2) demandTrend = "RISING";
      else if (change < -0.2) demandTrend = "FALLING";
    }

    // Best days to book
    const dayBuckets: Record<number, number> = {};
    for (const load of laneLoads) {
      const day = load.createdAt.getDay();
      dayBuckets[day] = (dayBuckets[day] || 0) + 1;
    }
    const bestDays = Object.entries(dayBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => parseInt(d));

    // Lead time
    const leadTimes: number[] = [];
    for (const load of laneLoads) {
      if (load.pickupDate) {
        const leadDays = (load.pickupDate.getTime() - load.createdAt.getTime()) / 86_400_000;
        if (leadDays >= 0 && leadDays < 30) leadTimes.push(leadDays);
      }
    }
    const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length : 3;

    // Backhaul analysis
    const reverseLaneKey = `${destState}:${originState}`;
    const reverseLoads = laneMap.get(reverseLaneKey);
    const backhaulScore = reverseLoads ? Math.min(100, Math.round((reverseLoads.length / laneLoads.length) * 100)) : 0;
    if (backhaulScore >= 30) backhaulsIdentified++;

    // Seasonality
    const monthlyLoads: Record<string, number> = {};
    for (const load of laneLoads) {
      const m = load.createdAt.toLocaleString("en", { month: "short" }).toLowerCase();
      monthlyLoads[m] = (monthlyLoads[m] || 0) + 1;
    }
    const avgMonthly = Object.values(monthlyLoads).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(monthlyLoads).length);
    const seasonality: Record<string, number> = {};
    for (const [m, count] of Object.entries(monthlyLoads)) {
      seasonality[m] = Math.round((count / avgMonthly) * 100) / 100;
    }

    // Upsert lane intelligence
    await prisma.laneIntelligence.upsert({
      where: { laneKey },
      create: {
        originState,
        originCity: laneLoads[0].originCity || undefined,
        destState,
        destCity: laneLoads[0].destCity || undefined,
        laneKey,
        totalLoads: laneLoads.length,
        avgTransitDays: Math.round(avgTransitDays * 10) / 10,
        avgMiles: Math.round(avgMiles),
        avgRate: Math.round(avgRate),
        avgRpm: Math.round(avgRpm * 100) / 100,
        demand,
        demandTrend,
        bestDaysToBook: bestDays,
        avgLeadTimeDays: Math.round(avgLeadTime * 10) / 10,
        backhaulLaneKey: reverseLoads ? reverseLaneKey : null,
        backhaulScore,
        deadheadAvgMiles: backhaulScore < 30 ? Math.round(avgMiles * 0.3) : 0,
        seasonality: seasonality,
        lastTrainedAt: new Date(),
      },
      update: {
        totalLoads: laneLoads.length,
        avgTransitDays: Math.round(avgTransitDays * 10) / 10,
        avgMiles: Math.round(avgMiles),
        avgRate: Math.round(avgRate),
        avgRpm: Math.round(avgRpm * 100) / 100,
        demand,
        demandTrend,
        bestDaysToBook: bestDays,
        avgLeadTimeDays: Math.round(avgLeadTime * 10) / 10,
        backhaulLaneKey: reverseLoads ? reverseLaneKey : null,
        backhaulScore,
        deadheadAvgMiles: backhaulScore < 30 ? Math.round(avgMiles * 0.3) : 0,
        seasonality: seasonality,
        lastTrainedAt: new Date(),
      },
    });

    lanesProcessed++;
  }

  await prisma.aILearningCycle.create({
    data: {
      serviceName: "lane_optimizer",
      cycleType: "WEEKLY",
      dataPointsProcessed: loads.length,
      modelsUpdated: lanesProcessed,
      durationMs: Date.now() - startTime,
      improvements: [{ backhaulsIdentified, totalLanes: lanesProcessed }],
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  console.log(`[LaneOptimizer] Cycle complete: ${lanesProcessed} lanes, ${backhaulsIdentified} backhaul opportunities`);
  return { lanesProcessed, backhaulsIdentified, dataPoints: loads.length };
}

// ─── Dashboard ────────────────────────────────────────────────────
export async function getLaneDashboard() {
  const [highDemand, risingLanes, backhaulOps, totalLanes] = await Promise.all([
    prisma.laneIntelligence.findMany({
      where: { demand: "HIGH" },
      orderBy: { totalLoads: "desc" },
      take: 15,
    }),
    prisma.laneIntelligence.findMany({
      where: { demandTrend: "RISING" },
      orderBy: { totalLoads: "desc" },
      take: 10,
    }),
    prisma.laneIntelligence.findMany({
      where: { backhaulScore: { gte: 50 } },
      orderBy: { backhaulScore: "desc" },
      take: 10,
    }),
    prisma.laneIntelligence.count(),
  ]);

  return { highDemand, risingLanes, backhaulOpportunities: backhaulOps, totalLanes };
}
