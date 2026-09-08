import { CarrierTier } from "@prisma/client";
import { prisma } from "../config/database";

// ───────────────────────────────────────────────────────────────────
// Tier advancement: SINGLE AUTHORITATIVE PATH is the milestone gate in
// caravanService.checkMilestoneAdvancement. The legacy score-based
// promotion functions calculateTier() + recalculateAllTiers() are
// retired in this commit — a carrier cannot bypass the locked
// loads-and-days gate via service-score alone.
//
// What remains here:
//   - checkGuestPromotion: 3 loads + score >= 70 → SILVER entry. Still
//     the canonical Guest→Silver transition.
//   - calculateOverallScore: composite-score math, used for scorecard
//     persistence + display (no longer drives tier mutation).
//   - getBonusPercentage: tier → bonus % lookup for PnL/UI display.
// ───────────────────────────────────────────────────────────────────

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

/**
 * EVERY factor is nullable, and null means "nothing measured this".
 *
 * gpsCompliancePct has been nullable since v3.8.bax. Phase 1 of the
 * mandatory-ELD arc widens the same rule to the other six, because the recalc
 * now writes a scorecard row for a carrier with no loads at all and every
 * load-derived factor is genuinely unmeasured for that carrier. Passing 0 for
 * an unmeasured factor would be a false measurement, which is the defect bax
 * fixed for tracking pointing in the other direction; passing a neutral 100
 * would be a claim nobody captured.
 *
 * The body already skipped nulls and renormalised. Only the type was narrow.
 */
export function calculateOverallScore(metrics: {
  onTimePickupPct: number | null;
  onTimeDeliveryPct: number | null;
  communicationScore: number | null;
  claimRatio: number | null;
  documentSubmissionTimeliness: number | null;
  acceptanceRate: number | null;
  gpsCompliancePct: number | null;
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
  const terms: Array<[number | null, number]> = [
    [metrics.onTimePickupPct, weights.onTimePickupPct],
    [metrics.onTimeDeliveryPct, weights.onTimeDeliveryPct],
    [metrics.communicationScore, weights.communicationScore],
    // Inverted, and the null case is explicit: `100 - null` is 100 in
    // JavaScript, which would credit an unmeasured carrier with a perfect
    // claim record. Absent must stay absent.
    [metrics.claimRatio === null ? null : 100 - metrics.claimRatio, weights.claimRatio],
    [metrics.documentSubmissionTimeliness, weights.documentSubmissionTimeliness],
    [metrics.acceptanceRate, weights.acceptanceRate],
    [metrics.gpsCompliancePct, weights.gpsCompliancePct],
  ];

  let weighted = 0;
  let weightSum = 0;
  for (const [value, weight] of terms) {
    if (value === null) continue;
    weighted += value * weight;
    weightSum += weight;
  }
  // With every factor present weightSum is the published 1.0 and this is the
  // same arithmetic as before; with one absent it scales the rest up to 1.0.
  const score = weightSum > 0 ? weighted / weightSum : 0;

  return Math.round(score * 100) / 100;
}

// recalculateAllTiers (score-based) retired in this commit. Use
// checkMilestoneAdvancement per carrier from caravanService for the
// canonical loads-and-days gate.
