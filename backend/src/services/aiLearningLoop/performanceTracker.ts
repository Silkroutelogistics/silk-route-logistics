import { prisma } from "../../config/database";

/**
 * Performance Tracker — Monitors AI model accuracy over time.
 *
 * Compares predictions vs actuals to measure drift and trigger retraining.
 * Tracks: rate prediction accuracy, carrier score accuracy,
 * demand forecast accuracy, and recommendation hit rates.
 */

interface AccuracyReport {
  service: string;
  metric: string;
  accuracy: number;
  sampleSize: number;
  trend: "IMPROVING" | "STABLE" | "DEGRADING";
  lastMeasured: Date;
}

// ─── Measure Rate Prediction Accuracy ────────────────────────────────────────

export async function measureRateAccuracy(): Promise<AccuracyReport> {
  // Compare predicted rates from RateIntelligence with actual rates on loads
  // delivered in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const recentLoads = await prisma.load.findMany({
    where: {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      deliveryDate: { gte: thirtyDaysAgo },
      customerRate: { not: null },
      originState: { not: null },
      destState: { not: null },
    },
    select: {
      originState: true,
      destState: true,
      equipmentType: true,
      customerRate: true,
    },
  });

  if (recentLoads.length === 0) {
    return {
      service: "rate_intelligence",
      metric: "MAPE",
      accuracy: 0,
      sampleSize: 0,
      trend: "STABLE",
      lastMeasured: new Date(),
    };
  }

  let totalError = 0;
  let comparisons = 0;

  for (const load of recentLoads) {
    const laneKey = `${load.originState}:${load.destState}`;
    const equipment = load.equipmentType || "DRY_VAN";

    const intel = await prisma.rateIntelligence.findUnique({
      where: { laneKey_equipmentType: { laneKey, equipmentType: equipment } },
    });

    if (intel?.predictedRate && load.customerRate) {
      const error = Math.abs(intel.predictedRate - load.customerRate) / load.customerRate;
      totalError += error;
      comparisons++;
    }
  }

  const mape = comparisons > 0 ? (totalError / comparisons) * 100 : 0;
  const accuracy = Math.max(0, 100 - mape);

  // Record metric
  await recordMetric("rate_prediction_accuracy", accuracy, "ai_performance", "daily");

  return {
    service: "rate_intelligence",
    metric: "MAPE",
    accuracy: Math.round(accuracy * 100) / 100,
    sampleSize: comparisons,
    trend: "STABLE",
    lastMeasured: new Date(),
  };
}

// ─── Measure Recommendation Hit Rate ─────────────────────────────────────────

export async function measureRecommendationAccuracy(): Promise<AccuracyReport> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const recs = await prisma.recommendationLog.findMany({
    where: {
      recommendedAt: { gte: thirtyDaysAgo },
      outcome: { not: "PENDING" },
    },
  });

  const total = recs.length;
  const hits = recs.filter((r) => r.outcome === "ACCEPTED" || r.outcome === "BOOKED").length;
  const accuracy = total > 0 ? (hits / total) * 100 : 0;

  await recordMetric("recommendation_hit_rate", accuracy, "ai_performance", "daily");

  return {
    service: "smart_recommendation",
    metric: "HIT_RATE",
    accuracy: Math.round(accuracy * 100) / 100,
    sampleSize: total,
    trend: "STABLE",
    lastMeasured: new Date(),
  };
}

// ─── Measure Demand Forecast Accuracy ────────────────────────────────────────

export async function measureDemandAccuracy(): Promise<AccuracyReport> {
  const forecasts = await prisma.demandForecast.findMany({
    where: {
      actualVolume: { not: null },
      forecastDate: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
  });

  if (forecasts.length === 0) {
    return {
      service: "demand_forecast",
      metric: "MAPE",
      accuracy: 0,
      sampleSize: 0,
      trend: "STABLE",
      lastMeasured: new Date(),
    };
  }

  let totalError = 0;
  for (const f of forecasts) {
    if (f.actualVolume && f.actualVolume > 0) {
      totalError += Math.abs(f.predictedVolume - f.actualVolume) / f.actualVolume;
    }
  }

  const mape = (totalError / forecasts.length) * 100;
  const accuracy = Math.max(0, 100 - mape);

  await recordMetric("demand_forecast_accuracy", accuracy, "ai_performance", "daily");

  return {
    service: "demand_forecast",
    metric: "MAPE",
    accuracy: Math.round(accuracy * 100) / 100,
    sampleSize: forecasts.length,
    trend: "STABLE",
    lastMeasured: new Date(),
  };
}

// ─── Full Performance Report ─────────────────────────────────────────────────

export async function getPerformanceReport(): Promise<{
  reports: AccuracyReport[];
  overallHealth: "GOOD" | "FAIR" | "POOR";
  needsRetraining: string[];
}> {
  const reports = await Promise.all([
    measureRateAccuracy(),
    measureRecommendationAccuracy(),
    measureDemandAccuracy(),
  ]);

  const avgAccuracy =
    reports.filter((r) => r.sampleSize > 0).reduce((s, r) => s + r.accuracy, 0) /
    Math.max(1, reports.filter((r) => r.sampleSize > 0).length);

  const overallHealth: "GOOD" | "FAIR" | "POOR" =
    avgAccuracy >= 75 ? "GOOD" : avgAccuracy >= 50 ? "FAIR" : "POOR";

  const needsRetraining = reports
    .filter((r) => r.accuracy < 60 && r.sampleSize >= 5)
    .map((r) => r.service);

  return { reports, overallHealth, needsRetraining };
}

// ─── Record System Metric ────────────────────────────────────────────────────

async function recordMetric(
  metricName: string,
  value: number,
  category: string,
  period: string
): Promise<void> {
  // Get previous value for delta tracking
  const previous = await prisma.systemMetric.findFirst({
    where: { metricName, category },
    orderBy: { recordedAt: "desc" },
  });

  const changePercent =
    previous && previous.metricValue > 0
      ? ((value - previous.metricValue) / previous.metricValue) * 100
      : null;

  await prisma.systemMetric.create({
    data: {
      metricName,
      metricValue: value,
      previousValue: previous?.metricValue ?? null,
      changePercent: changePercent ? Math.round(changePercent * 100) / 100 : null,
      category,
      period,
    },
  });
}
