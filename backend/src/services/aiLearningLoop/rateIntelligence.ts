import { prisma } from "../../config/database";
import { Prisma } from "@prisma/client";

/**
 * Rate Intelligence — Learning-loop layer for lane-level rate intelligence.
 *
 * Records every rate event (quote, accept, reject) and feeds it into
 * LaneRateIntelligence. Provides real-time win-probability scoring and
 * suggested pricing bands.
 */

const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

// ─── Record a Rate Event ─────────────────────────────────────────────────────

export async function recordRateEvent(params: {
  originZip: string;
  destZip: string;
  equipmentType: string;
  ratePerMile: number;
  totalRate: number;
  miles: number;
  outcome: "ACCEPTED" | "REJECTED" | "COUNTERED" | "EXPIRED";
  carrierId?: string;
  loadId?: string;
}): Promise<void> {
  const { originZip, destZip, equipmentType, ratePerMile, totalRate, outcome } = params;

  const existing = await prisma.laneRateIntelligence.findUnique({
    where: { originZip_destZip_equipmentType: { originZip, destZip, equipmentType } },
  });

  const isAccepted = outcome === "ACCEPTED";

  if (!existing) {
    await prisma.laneRateIntelligence.create({
      data: {
        originZip,
        destZip,
        equipmentType,
        avgRatePerMile: ratePerMile,
        minAccepted: isAccepted ? ratePerMile : null,
        maxRejected: !isAccepted ? ratePerMile : null,
        acceptanceRate: isAccepted ? 1.0 : 0.0,
        sampleSize: 1,
        lastQuotedRate: totalRate,
        lastAcceptedRate: isAccepted ? totalRate : null,
        confidence: "LOW",
      },
    });
    return;
  }

  // Running average
  const newSample = existing.sampleSize + 1;
  const newAvg =
    (existing.avgRatePerMile * existing.sampleSize + ratePerMile) / newSample;
  const accepted = Math.round(existing.acceptanceRate * existing.sampleSize) + (isAccepted ? 1 : 0);
  const newAcceptRate = accepted / newSample;

  // Volatility: running std-dev approximation
  const delta = ratePerMile - existing.avgRatePerMile;
  const newVolatility =
    existing.sampleSize > 1
      ? Math.sqrt(
          ((existing.volatility ** 2) * (existing.sampleSize - 1) + delta ** 2) / existing.sampleSize
        )
      : Math.abs(delta);

  // Trend detection
  let trend = existing.trend;
  if (newSample >= 5) {
    const pctChange = ((ratePerMile - existing.avgRatePerMile) / existing.avgRatePerMile) * 100;
    if (pctChange > 3) trend = "RISING";
    else if (pctChange < -3) trend = "FALLING";
    else trend = "STABLE";
  }

  // Confidence
  let confidence = "LOW";
  if (newSample >= 20) confidence = "HIGH";
  else if (newSample >= 8) confidence = "MEDIUM";

  await prisma.laneRateIntelligence.update({
    where: { id: existing.id },
    data: {
      avgRatePerMile: Math.round(newAvg * 100) / 100,
      minAccepted:
        isAccepted && (!existing.minAccepted || ratePerMile < existing.minAccepted)
          ? ratePerMile
          : existing.minAccepted,
      maxRejected:
        !isAccepted && (!existing.maxRejected || ratePerMile > existing.maxRejected)
          ? ratePerMile
          : existing.maxRejected,
      acceptanceRate: Math.round(newAcceptRate * 1000) / 1000,
      sampleSize: newSample,
      volatility: Math.round(newVolatility * 100) / 100,
      trend,
      confidence,
      lastQuotedRate: totalRate,
      lastAcceptedRate: isAccepted ? totalRate : existing.lastAcceptedRate,
    },
  });

  // Log to AILearningLog
  await prisma.aILearningLog.create({
    data: {
      serviceName: "rateIntelligence",
      eventType: "RATE_EVENT_PROCESSED",
      dataJson: toJson({
        originZip,
        destZip,
        equipmentType,
        ratePerMile,
        outcome,
        newAvg,
        newAcceptRate,
        trend,
        confidence,
      }),
      outcome: "SUCCESS",
    },
  });
}

// ─── Get Win-Probability for a Rate ──────────────────────────────────────────

export async function getWinProbability(
  originZip: string,
  destZip: string,
  equipmentType: string,
  proposedRatePerMile: number
): Promise<{
  probability: number;
  suggestedRange: { low: number; mid: number; high: number };
  confidence: string;
  sampleSize: number;
}> {
  const intel = await prisma.laneRateIntelligence.findUnique({
    where: { originZip_destZip_equipmentType: { originZip, destZip, equipmentType } },
  });

  if (!intel || intel.sampleSize < 3) {
    return {
      probability: 0.5,
      suggestedRange: {
        low: proposedRatePerMile * 0.9,
        mid: proposedRatePerMile,
        high: proposedRatePerMile * 1.1,
      },
      confidence: "NONE",
      sampleSize: intel?.sampleSize ?? 0,
    };
  }

  // Simple logistic-style probability: how does proposed rate compare to acceptance band?
  const diff = proposedRatePerMile - intel.avgRatePerMile;
  const normDiff = intel.volatility > 0 ? diff / intel.volatility : 0;
  // Higher rate → higher acceptance (carrier perspective)
  const probability = Math.min(1, Math.max(0, 0.5 + normDiff * 0.2));

  return {
    probability: Math.round(probability * 100) / 100,
    suggestedRange: {
      low: Math.round((intel.avgRatePerMile - intel.volatility) * 100) / 100,
      mid: Math.round(intel.avgRatePerMile * 100) / 100,
      high: Math.round((intel.avgRatePerMile + intel.volatility) * 100) / 100,
    },
    confidence: intel.confidence,
    sampleSize: intel.sampleSize,
  };
}

// ─── Get Lane Rate Summary ───────────────────────────────────────────────────

export async function getLaneRateSummary(originZip: string, destZip: string) {
  const lanes = await prisma.laneRateIntelligence.findMany({
    where: { originZip, destZip },
    orderBy: { sampleSize: "desc" },
  });

  return lanes.map((l) => ({
    equipmentType: l.equipmentType,
    avgRatePerMile: l.avgRatePerMile,
    acceptanceRate: l.acceptanceRate,
    trend: l.trend,
    confidence: l.confidence,
    sampleSize: l.sampleSize,
    lastQuotedRate: l.lastQuotedRate,
    lastAcceptedRate: l.lastAcceptedRate,
  }));
}
