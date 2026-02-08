import { CarrierTier } from "@prisma/client";
import { prisma } from "../config/database";

export function calculateTier(overallScore: number): CarrierTier {
  if (overallScore >= 98) return "PLATINUM";
  if (overallScore >= 95) return "GOLD";
  if (overallScore >= 90) return "SILVER";
  return "BRONZE";
}

export function getBonusPercentage(tier: CarrierTier): number {
  switch (tier) {
    case "PLATINUM": return 3;
    case "GOLD": return 1.5;
    case "SILVER": return 0;
    case "BRONZE": return 0;
  }
}

export function calculateOverallScore(metrics: {
  onTimePickupPct: number;
  onTimeDeliveryPct: number;
  communicationScore: number;
  claimRatio: number;
  documentSubmissionTimeliness: number;
  acceptanceRate: number;
  gpsCompliancePct: number;
}): number {
  const weights = {
    onTimePickupPct: 0.2,
    onTimeDeliveryPct: 0.2,
    communicationScore: 0.1,
    claimRatio: 0.15,
    documentSubmissionTimeliness: 0.1,
    acceptanceRate: 0.1,
    gpsCompliancePct: 0.15,
  };

  // claimRatio is inverted: lower is better, so we use (100 - claimRatio)
  const score =
    metrics.onTimePickupPct * weights.onTimePickupPct +
    metrics.onTimeDeliveryPct * weights.onTimeDeliveryPct +
    metrics.communicationScore * weights.communicationScore +
    (100 - metrics.claimRatio) * weights.claimRatio +
    metrics.documentSubmissionTimeliness * weights.documentSubmissionTimeliness +
    metrics.acceptanceRate * weights.acceptanceRate +
    metrics.gpsCompliancePct * weights.gpsCompliancePct;

  return Math.round(score * 100) / 100;
}

export async function recalculateAllTiers() {
  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    include: {
      scorecards: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
      },
    },
  });

  for (const carrier of carriers) {
    const latestScore = carrier.scorecards[0];
    if (!latestScore) continue;

    const newTier = calculateTier(latestScore.overallScore);
    if (newTier !== carrier.tier) {
      await prisma.carrierProfile.update({
        where: { id: carrier.id },
        data: { tier: newTier },
      });
    }
  }

  return { updated: carriers.length };
}
