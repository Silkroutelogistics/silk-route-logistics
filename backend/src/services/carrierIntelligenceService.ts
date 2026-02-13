import { prisma } from "../config/database";

/**
 * Carrier Intelligence Engine — Self-Learning Carrier Performance Predictor
 *
 * Learns from every completed load to predict carrier behavior:
 * - Reliability score per lane
 * - Fall-off risk prediction
 * - Communication quality tracking
 * - Rate negotiability patterns
 * - Churn risk detection
 *
 * COMPETITIVE EDGE: Predictive carrier management — know who will fail before they do.
 */

interface CarrierPrediction {
  carrierId: string;
  carrierName: string;
  reliabilityScore: number;
  fallOffRisk: number;
  performanceTrend: string;
  predictedNextTier: string | null;
  churnRisk: number;
  bestLanes: string[];
  recommendation: string;
}

// ─── Get Carrier Prediction ──────────────────────────────────────
export async function getCarrierPrediction(carrierId: string): Promise<CarrierPrediction | null> {
  const [intel, carrier] = await Promise.all([
    prisma.carrierIntelligence.findFirst({
      where: { carrierId, laneKey: null }, // Global profile
    }),
    prisma.carrierProfile.findUnique({
      where: { id: carrierId },
      select: { companyName: true, srcppTier: true },
    }),
  ]);

  if (!carrier) return null;

  if (!intel) {
    return {
      carrierId,
      carrierName: carrier.companyName || "Unknown",
      reliabilityScore: 50,
      fallOffRisk: 0.1,
      performanceTrend: "NEW",
      predictedNextTier: null,
      churnRisk: 0.1,
      bestLanes: [],
      recommendation: "New carrier — monitor closely for first 5 loads",
    };
  }

  const laneProfiles = await prisma.carrierIntelligence.findMany({
    where: { carrierId, laneKey: { not: null } },
    orderBy: { reliabilityScore: "desc" },
    take: 5,
  });

  let recommendation = "Reliable carrier — assign with confidence";
  if (intel.fallOffRisk > 0.3) recommendation = "High fall-off risk — have backup ready";
  else if (intel.churnRisk > 0.4) recommendation = "Churn risk — proactive retention needed";
  else if (intel.performanceTrend === "DECLINING") recommendation = "Performance declining — schedule check-in";
  else if (intel.performanceTrend === "IMPROVING") recommendation = "Improving carrier — consider tier upgrade";

  return {
    carrierId,
    carrierName: carrier.companyName || "Unknown",
    reliabilityScore: intel.reliabilityScore,
    fallOffRisk: intel.fallOffRisk,
    performanceTrend: intel.performanceTrend,
    predictedNextTier: intel.predictedNextTier,
    churnRisk: intel.churnRisk,
    bestLanes: laneProfiles.map((l) => l.laneKey!),
    recommendation,
  };
}

// ─── Daily Learning Cycle ─────────────────────────────────────────
export async function runCarrierLearningCycle(): Promise<{
  carriersProcessed: number;
  dataPoints: number;
  alerts: any[];
}> {
  const startTime = Date.now();
  console.log("[CarrierIntelligence] Starting learning cycle...");

  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    select: {
      id: true,
      companyName: true,
      srcppTier: true,
      srcppTotalLoads: true,
      createdAt: true,
    },
  });

  const alerts: any[] = [];
  let totalDataPoints = 0;

  for (const carrier of carriers) {
    // Get all loads for this carrier
    const loads = await prisma.load.findMany({
      where: {
        carrierId: carrier.id,
        status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED", "CANCELLED", "TONU"] },
      },
      select: {
        id: true,
        status: true,
        originState: true,
        destState: true,
        pickupDate: true,
        deliveryDate: true,
        actualPickupDatetime: true,
        actualDeliveryDatetime: true,
        carrierRate: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (loads.length === 0) continue;
    totalDataPoints += loads.length;

    // Calculate reliability metrics
    const completedLoads = loads.filter((l) => ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"].includes(l.status));
    const cancelledLoads = loads.filter((l) => ["CANCELLED", "TONU"].includes(l.status));
    const fallOffRate = loads.length > 0 ? cancelledLoads.length / loads.length : 0;

    // On-time performance
    let onTimeCount = 0;
    for (const load of completedLoads) {
      if (load.deliveryDate && load.actualDeliveryDatetime) {
        if (load.actualDeliveryDatetime <= new Date(load.deliveryDate.getTime() + 2 * 3_600_000)) {
          onTimeCount++;
        }
      } else {
        onTimeCount++; // If no tracking, assume on-time
      }
    }
    const onTimeRate = completedLoads.length > 0 ? onTimeCount / completedLoads.length : 0.5;

    // Performance trend: compare last 30 days vs previous 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
    const recentLoads = completedLoads.filter((l) => l.createdAt >= thirtyDaysAgo);
    const olderLoads = completedLoads.filter((l) => l.createdAt >= sixtyDaysAgo && l.createdAt < thirtyDaysAgo);

    let performanceTrend = "STABLE";
    if (recentLoads.length >= 2 && olderLoads.length >= 2) {
      const recentOnTime = recentLoads.filter((l) =>
        !l.deliveryDate || !l.actualDeliveryDatetime || l.actualDeliveryDatetime <= new Date(l.deliveryDate.getTime() + 2 * 3_600_000)
      ).length / recentLoads.length;
      const olderOnTime = olderLoads.filter((l) =>
        !l.deliveryDate || !l.actualDeliveryDatetime || l.actualDeliveryDatetime <= new Date(l.deliveryDate.getTime() + 2 * 3_600_000)
      ).length / olderLoads.length;
      if (recentOnTime - olderOnTime > 0.05) performanceTrend = "IMPROVING";
      else if (olderOnTime - recentOnTime > 0.05) performanceTrend = "DECLINING";
    }

    // Churn risk: based on recency of last load and frequency
    const lastLoad = loads[0];
    const daysSinceLastLoad = (Date.now() - lastLoad.createdAt.getTime()) / 86_400_000;
    const avgFrequencyDays = loads.length > 1
      ? (loads[0].createdAt.getTime() - loads[loads.length - 1].createdAt.getTime()) / (86_400_000 * (loads.length - 1))
      : 30;
    const expectedNextLoad = avgFrequencyDays * 1.5;
    const churnRisk = Math.min(1, Math.max(0, (daysSinceLastLoad - expectedNextLoad) / (expectedNextLoad * 2)));

    // Fall-off risk prediction
    const recentFallOffs = cancelledLoads.filter((l) => l.createdAt >= thirtyDaysAgo).length;
    const fallOffRisk = Math.min(1, fallOffRate * 2 + recentFallOffs * 0.15);

    // Predicted next tier
    const totalLoads = carrier.srcppTotalLoads || 0;
    let predictedNextTier: string | null = null;
    if (carrier.srcppTier === "BRONZE" && totalLoads >= 15) predictedNextTier = "SILVER";
    else if (carrier.srcppTier === "SILVER" && totalLoads >= 40) predictedNextTier = "GOLD";
    else if (carrier.srcppTier === "GOLD" && totalLoads >= 85) predictedNextTier = "PLATINUM";

    // Overall reliability score (0-100)
    const reliabilityScore = Math.round(
      onTimeRate * 40 +
      (1 - fallOffRisk) * 30 +
      (1 - churnRisk) * 15 +
      Math.min(1, loads.length / 30) * 15
    );

    // Preferred lanes
    const laneCounts = new Map<string, number>();
    for (const load of completedLoads) {
      if (load.originState && load.destState) {
        const key = `${load.originState}:${load.destState}`;
        laneCounts.set(key, (laneCounts.get(key) || 0) + 1);
      }
    }
    const preferredLanes = [...laneCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lane, count]) => ({ lane, score: count, loads: count }));

    // Upsert global carrier intelligence
    await prisma.carrierIntelligence.upsert({
      where: { carrierId_laneKey: { carrierId: carrier.id, laneKey: "__global__" } },
      create: {
        carrierId: carrier.id,
        laneKey: "__global__",
        reliabilityScore,
        onTimeScore: Math.round(onTimeRate * 100),
        communicationScore: 50, // Would need check-call response data
        fallOffRisk: Math.round(fallOffRisk * 100) / 100,
        rateNegotiability: 0.5,
        preferredLanes: preferredLanes,
        performanceTrend,
        predictedNextTier,
        churnRisk: Math.round(churnRisk * 100) / 100,
        totalDataPoints: loads.length,
        lastTrainedAt: new Date(),
      },
      update: {
        reliabilityScore,
        onTimeScore: Math.round(onTimeRate * 100),
        fallOffRisk: Math.round(fallOffRisk * 100) / 100,
        preferredLanes: preferredLanes,
        performanceTrend,
        predictedNextTier,
        churnRisk: Math.round(churnRisk * 100) / 100,
        totalDataPoints: loads.length,
        lastTrainedAt: new Date(),
      },
    });

    // Generate alerts for concerning trends
    if (fallOffRisk > 0.3) {
      alerts.push({ carrierId: carrier.id, name: carrier.companyName, type: "HIGH_FALLOFF_RISK", risk: fallOffRisk });
    }
    if (churnRisk > 0.5) {
      alerts.push({ carrierId: carrier.id, name: carrier.companyName, type: "CHURN_RISK", risk: churnRisk });
    }
    if (performanceTrend === "DECLINING" && reliabilityScore < 60) {
      alerts.push({ carrierId: carrier.id, name: carrier.companyName, type: "PERFORMANCE_DECLINE", score: reliabilityScore });
    }
  }

  // Log learning cycle
  await prisma.aILearningCycle.create({
    data: {
      serviceName: "carrier_intelligence",
      cycleType: "DAILY",
      dataPointsProcessed: totalDataPoints,
      modelsUpdated: carriers.length,
      durationMs: Date.now() - startTime,
      improvements: alerts.length > 0 ? alerts : undefined,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  console.log(`[CarrierIntelligence] Cycle complete: ${carriers.length} carriers, ${totalDataPoints} loads, ${alerts.length} alerts`);
  return { carriersProcessed: carriers.length, dataPoints: totalDataPoints, alerts };
}

// ─── Get Carrier Dashboard ────────────────────────────────────────
export async function getCarrierIntelligenceDashboard() {
  const [atRisk, topPerformers, declining, recentCycle] = await Promise.all([
    prisma.carrierIntelligence.findMany({
      where: { laneKey: "__global__", fallOffRisk: { gte: 0.25 } },
      orderBy: { fallOffRisk: "desc" },
      take: 10,
      include: { carrier: { select: { companyName: true, srcppTier: true } } },
    }),
    prisma.carrierIntelligence.findMany({
      where: { laneKey: "__global__", reliabilityScore: { gte: 85 } },
      orderBy: { reliabilityScore: "desc" },
      take: 10,
      include: { carrier: { select: { companyName: true, srcppTier: true } } },
    }),
    prisma.carrierIntelligence.findMany({
      where: { laneKey: "__global__", performanceTrend: "DECLINING" },
      orderBy: { reliabilityScore: "asc" },
      take: 10,
      include: { carrier: { select: { companyName: true, srcppTier: true } } },
    }),
    prisma.aILearningCycle.findFirst({
      where: { serviceName: "carrier_intelligence" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return { atRisk, topPerformers, declining, lastLearningCycle: recentCycle };
}
