import { prisma } from "../config/database";

/**
 * Rate Intelligence Engine — Self-Learning Rate Prediction
 *
 * Learns from every completed load to build lane-level rate models.
 * Predicts optimal rates, detects market trends, identifies seasonal patterns.
 * Runs daily learning cycle + on-demand for real-time quotes.
 *
 * COMPETITIVE EDGE: No manual rate sheets. System auto-adjusts to market.
 */

interface RatePrediction {
  laneKey: string;
  equipmentType: string;
  predictedRate: number;
  confidence: number;
  trend: string;
  trendPct: number;
  range: { min: number; max: number };
  seasonalFactor: number;
  dayOfWeekFactor: number;
  recommendation: string;
}

// ─── Predict Rate for a Lane ──────────────────────────────────────
export async function predictRate(
  originState: string,
  destState: string,
  equipmentType: string = "DRY_VAN",
  miles?: number
): Promise<RatePrediction | null> {
  const laneKey = `${originState}:${destState}`;

  const intel = await prisma.rateIntelligence.findUnique({
    where: { laneKey_equipmentType: { laneKey, equipmentType } },
  });

  if (!intel || intel.sampleSize < 3) {
    // Fallback: use state-level averages or RPM estimate
    if (miles && miles > 0) {
      const baseRpm = equipmentType === "REEFER" ? 3.2 : equipmentType === "FLATBED" ? 3.5 : 2.8;
      const estimated = miles * baseRpm;
      return {
        laneKey,
        equipmentType,
        predictedRate: Math.round(estimated),
        confidence: 0.2,
        trend: "UNKNOWN",
        trendPct: 0,
        range: { min: Math.round(estimated * 0.85), max: Math.round(estimated * 1.15) },
        seasonalFactor: 1.0,
        dayOfWeekFactor: 1.0,
        recommendation: "Low confidence — insufficient historical data for this lane",
      };
    }
    return null;
  }

  // Apply seasonal and day-of-week adjustments
  const month = new Date().toLocaleString("en", { month: "short" }).toLowerCase();
  const dayOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

  let seasonalFactor = intel.seasonalFactor || 1.0;
  let dowFactor = 1.0;
  if (intel.dayOfWeekFactor && typeof intel.dayOfWeekFactor === "object") {
    dowFactor = (intel.dayOfWeekFactor as any)[dayOfWeek] || 1.0;
  }

  const adjustedRate = (intel.predictedRate || intel.avgRate) * seasonalFactor * dowFactor;

  // Confidence: based on sample size and recency
  const hoursSinceTraining = (Date.now() - new Date(intel.lastTrainedAt).getTime()) / 3_600_000;
  const recencyPenalty = Math.max(0, 1 - hoursSinceTraining / (24 * 30)); // Decays over 30 days
  const sizeFactor = Math.min(1, intel.sampleSize / 50); // Max confidence at 50+ samples
  const confidence = Math.round(sizeFactor * recencyPenalty * 100) / 100;

  let recommendation = "Market rate — competitive pricing";
  if (intel.trend === "RISING") recommendation = "Rates rising — book now for best pricing";
  else if (intel.trend === "FALLING") recommendation = "Rates declining — negotiate aggressively";
  else if (intel.trend === "VOLATILE") recommendation = "Volatile market — use guaranteed rate lock";

  return {
    laneKey,
    equipmentType,
    predictedRate: Math.round(adjustedRate),
    confidence,
    trend: intel.trend,
    trendPct: intel.trendPct,
    range: { min: Math.round(intel.minRate), max: Math.round(intel.maxRate) },
    seasonalFactor,
    dayOfWeekFactor: dowFactor,
    recommendation,
  };
}

// ─── Daily Learning Cycle ─────────────────────────────────────────
export async function runRateLearningCycle(): Promise<{
  lanesProcessed: number;
  dataPoints: number;
  improvements: any[];
}> {
  const startTime = Date.now();
  console.log("[RateIntelligence] Starting daily learning cycle...");

  // Get all completed loads with rates from last 180 days
  const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000);
  const loads = await prisma.load.findMany({
    where: {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      customerRate: { not: null },
      carrierRate: { not: null },
      deliveryDate: { gte: sixMonthsAgo },
    },
    select: {
      id: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      equipmentType: true,
      customerRate: true,
      carrierRate: true,
      distance: true,
      deliveryDate: true,
      createdAt: true,
    },
  });

  if (loads.length === 0) {
    console.log("[RateIntelligence] No completed loads to learn from");
    return { lanesProcessed: 0, dataPoints: 0, improvements: [] };
  }

  // Group loads by lane + equipment
  const laneMap = new Map<string, typeof loads>();
  for (const load of loads) {
    if (!load.originState || !load.destState) continue;
    const equipment = load.equipmentType || "DRY_VAN";
    const key = `${load.originState}:${load.destState}|${equipment}`;
    if (!laneMap.has(key)) laneMap.set(key, []);
    laneMap.get(key)!.push(load);
  }

  const improvements: any[] = [];
  let lanesProcessed = 0;

  for (const [key, laneLoads] of laneMap) {
    const [laneKey, equipmentType] = key.split("|");
    const rates = laneLoads.map((l) => l.customerRate!).sort((a, b) => a - b);

    // Statistical calculations
    const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
    const min = rates[0];
    const max = rates[rates.length - 1];
    const median = rates.length % 2 === 0
      ? (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2
      : rates[Math.floor(rates.length / 2)];
    const variance = rates.reduce((s, r) => s + (r - avg) ** 2, 0) / rates.length;
    const stdDev = Math.sqrt(variance);

    // Trend detection: compare last 30 days vs previous 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
    const recentRates = laneLoads
      .filter((l) => l.deliveryDate && l.deliveryDate >= thirtyDaysAgo)
      .map((l) => l.customerRate!);
    const olderRates = laneLoads
      .filter((l) => l.deliveryDate && l.deliveryDate >= sixtyDaysAgo && l.deliveryDate < thirtyDaysAgo)
      .map((l) => l.customerRate!);

    let trend = "STABLE";
    let trendPct = 0;
    if (recentRates.length >= 2 && olderRates.length >= 2) {
      const recentAvg = recentRates.reduce((s, r) => s + r, 0) / recentRates.length;
      const olderAvg = olderRates.reduce((s, r) => s + r, 0) / olderRates.length;
      trendPct = ((recentAvg - olderAvg) / olderAvg) * 100;
      if (trendPct > 5) trend = "RISING";
      else if (trendPct < -5) trend = "FALLING";
      else if (stdDev / avg > 0.2) trend = "VOLATILE";
    }

    // Seasonal factors (monthly multipliers)
    const monthlyRates: Record<string, number[]> = {};
    for (const load of laneLoads) {
      if (!load.deliveryDate) continue;
      const m = load.deliveryDate.toLocaleString("en", { month: "short" }).toLowerCase();
      if (!monthlyRates[m]) monthlyRates[m] = [];
      monthlyRates[m].push(load.customerRate!);
    }
    const monthlyAvgs: Record<string, number> = {};
    for (const [m, r] of Object.entries(monthlyRates)) {
      monthlyAvgs[m] = r.reduce((s, v) => s + v, 0) / r.length;
    }
    const currentMonth = new Date().toLocaleString("en", { month: "short" }).toLowerCase();
    const seasonalFactor = monthlyAvgs[currentMonth] ? monthlyAvgs[currentMonth] / avg : 1.0;

    // Day of week factors
    const dowRates: Record<string, number[]> = {};
    for (const load of laneLoads) {
      const d = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][load.createdAt.getDay()];
      if (!dowRates[d]) dowRates[d] = [];
      dowRates[d].push(load.customerRate!);
    }
    const dowFactors: Record<string, number> = {};
    for (const [d, r] of Object.entries(dowRates)) {
      dowFactors[d] = Math.round(((r.reduce((s, v) => s + v, 0) / r.length) / avg) * 100) / 100;
    }

    // Predicted rate: weighted average (recent loads weighted higher)
    const weightedSum = laneLoads.reduce((sum, load, i) => {
      const recency = (i + 1) / laneLoads.length; // More recent = higher weight
      return sum + load.customerRate! * recency;
    }, 0);
    const weightTotal = laneLoads.reduce((sum, _, i) => sum + (i + 1) / laneLoads.length, 0);
    const predictedRate = weightedSum / weightTotal;

    // Upsert intelligence record
    const existing = await prisma.rateIntelligence.findUnique({
      where: { laneKey_equipmentType: { laneKey, equipmentType } },
    });

    await prisma.rateIntelligence.upsert({
      where: { laneKey_equipmentType: { laneKey, equipmentType } },
      create: {
        laneKey,
        equipmentType,
        avgRate: avg,
        minRate: min,
        maxRate: max,
        medianRate: median,
        stdDev,
        sampleSize: rates.length,
        trend,
        trendPct: Math.round(trendPct * 100) / 100,
        predictedRate: Math.round(predictedRate),
        confidence: Math.min(1, rates.length / 50),
        seasonalFactor: Math.round(seasonalFactor * 100) / 100,
        dayOfWeekFactor: dowFactors,
        lastTrainedAt: new Date(),
      },
      update: {
        avgRate: avg,
        minRate: min,
        maxRate: max,
        medianRate: median,
        stdDev,
        sampleSize: rates.length,
        trend,
        trendPct: Math.round(trendPct * 100) / 100,
        predictedRate: Math.round(predictedRate),
        confidence: Math.min(1, rates.length / 50),
        seasonalFactor: Math.round(seasonalFactor * 100) / 100,
        dayOfWeekFactor: dowFactors,
        lastTrainedAt: new Date(),
      },
    });

    if (existing) {
      const delta = Math.round(predictedRate) - Math.round(existing.predictedRate || existing.avgRate);
      if (Math.abs(delta) > 50) {
        improvements.push({
          lane: laneKey,
          equipment: equipmentType,
          previousRate: existing.predictedRate || existing.avgRate,
          newRate: Math.round(predictedRate),
          delta,
          trend,
        });
      }
    }

    lanesProcessed++;
  }

  // Log learning cycle
  await prisma.aILearningCycle.create({
    data: {
      serviceName: "rate_intelligence",
      cycleType: "DAILY",
      dataPointsProcessed: loads.length,
      modelsUpdated: lanesProcessed,
      accuracy: null,
      durationMs: Date.now() - startTime,
      improvements: improvements.length > 0 ? improvements : undefined,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  console.log(`[RateIntelligence] Cycle complete: ${lanesProcessed} lanes, ${loads.length} data points, ${improvements.length} significant changes`);
  return { lanesProcessed, dataPoints: loads.length, improvements };
}

// ─── Get Market Dashboard Data ────────────────────────────────────
export async function getMarketDashboard() {
  const [topLanes, risingLanes, fallingLanes, recentCycle] = await Promise.all([
    prisma.rateIntelligence.findMany({
      orderBy: { sampleSize: "desc" },
      take: 20,
    }),
    prisma.rateIntelligence.findMany({
      where: { trend: "RISING" },
      orderBy: { trendPct: "desc" },
      take: 10,
    }),
    prisma.rateIntelligence.findMany({
      where: { trend: "FALLING" },
      orderBy: { trendPct: "asc" },
      take: 10,
    }),
    prisma.aILearningCycle.findFirst({
      where: { serviceName: "rate_intelligence" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return {
    topLanes,
    risingLanes,
    fallingLanes,
    lastLearningCycle: recentCycle,
    totalLanesTracked: await prisma.rateIntelligence.count(),
  };
}
