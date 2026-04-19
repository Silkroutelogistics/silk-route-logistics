import { CarrierTier } from "@prisma/client";
import { prisma } from "../config/database";

export function calculateTier(overallScore: number): CarrierTier {
  // Caravan Partner Program 3-tier (v3.7.a): Silver is Day-1 entry.
  // Score-based promotion: 90+ → GOLD, 95+ → PLATINUM.
  if (overallScore >= 95) return "PLATINUM";
  if (overallScore >= 90) return "GOLD";
  return "SILVER";
}

export function getBonusPercentage(tier: CarrierTier): number {
  switch (tier) {
    case "PLATINUM": return 3;
    case "GOLD": return 1.5;
    case "SILVER": return 0;
    case "GUEST": return 0;
    case "NONE": return 0;
  }
}

/**
 * Check if a Guest carrier should be promoted to Silver (Caravan Day-1 entry).
 * Requires 3 completed loads with average score >= 70.
 */
export async function checkGuestPromotion(carrierId: string): Promise<boolean> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: {
      user: { select: { id: true, email: true, firstName: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  });

  if (!profile || (profile.tier !== "GUEST" && profile.cppTier !== "GUEST")) return false;

  const completedLoads = await prisma.load.count({
    where: { carrierId: profile.userId, status: { in: ["DELIVERED", "COMPLETED"] } },
  });

  if (completedLoads < 3) return false;

  const latestScore = profile.scorecards[0]?.overallScore || 0;
  if (latestScore < 70) return false;

  // Promote to Silver (entry tier)
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: { tier: "SILVER", cppTier: "SILVER", source: "caravan" },
  });

  await prisma.notification.create({
    data: {
      userId: profile.userId,
      type: "GENERAL",
      title: "Welcome to the Caravan Partner Program!",
      message: "Congratulations! You've completed 3 loads with a qualifying score and earned Silver tier in the Caravan Partner Program.",
      actionUrl: "/carrier/dashboard",
    },
  });

  return true;
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
