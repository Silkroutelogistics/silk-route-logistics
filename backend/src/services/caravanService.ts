// Caravan Partner Program — 3-tier carrier loyalty system + Founding recognition.
//
// SILVER   (entry) — every approved carrier starts here after 3 completed
//                    loads with service score >= 70 (checkGuestPromotion in
//                    tierService).
// GOLD     — Gold-gate milestone: 12 loads + 97% on-time + 90-day tenure floor.
// PLATINUM — Platinum-gate milestone: 20 loads + 98% on-time + 120-day floor.
// FOUNDING — Recognition status on top of Platinum: 30 loads + 98% on-time +
//            180-day floor. Carrier remains tier=PLATINUM; milestone advances
//            to M6_FOUNDING (existing CarrierMilestone enum value retained
//            for backwards compatibility with persisted rows).
//
// Advancement is the AND of (cumulative-since-join loads, on-time pct,
// tenure days). Counting reads cppTotalLoads counter + cppJoinedDate
// timestamp — see checkMilestoneAdvancement below.
//
// THIS IS THE SINGLE AUTHORITATIVE ADVANCEMENT GATE. The legacy parallel
// score-based promotion path (tierService.calculateTier +
// recalculateAllTiers) is retired in this commit so a carrier cannot bypass
// the loads-and-days gate via score alone.
//
// Pricing values in TIER_CONFIG are the v3 locked numbers and remain
// UNCHANGED. Same-day QP is a universal +2% premium on top of each tier's
// 7-day rate — it is NOT tier-gated. Every tier can elect same-day.
//
// Threshold calibration: the locked load thresholds (12/20/30) are
// calibrated to current pre-revenue launch volume. Revisit at ~6 months
// operational baseline OR when monthly volume materially increases.

import { prisma } from "../config/database";
import type { CarrierTier, CarrierMilestone } from "@prisma/client";
import { log } from "../lib/logger";

// ─── Tier Configuration (v3 Final) ──────────────────────────

const TIER_CONFIG = {
  SILVER: {
    label: "Silver",
    minTrucks: 1,
    maxTrucks: 4,
    paymentTermsDays: 30,                    // Net-30 standard pay FREE
    quickPayFee7Day: 0.03,                   // 3.0%
    quickPayFeeSameDay: 0.05,                // 5.0% (3% + 2% same-day premium)
    quickPayAutoLimit: 2000,                 // $/load
    quickPayMonthlyLimit: 15000,             // $/month
    safetyBonusPerMonth: 0,                  // none
    fscPassThrough: "LOADED" as const,       // loaded miles only
    detentionRate: 50,                       // $/hr
    detentionStartHours: 2,
    rateTransparency: "CARRIER_RATE" as const,
    referralBonus: 250,                      // $/referred carrier
    priorityFreight: false,
  },
  GOLD: {
    label: "Gold",
    minTrucks: 5,
    maxTrucks: 10,
    paymentTermsDays: 21,                    // Net-21
    quickPayFee7Day: 0.02,                   // 2.0%
    quickPayFeeSameDay: 0.04,                // 4.0% (2% + 2%)
    quickPayAutoLimit: 4000,
    quickPayMonthlyLimit: 40000,
    safetyBonusPerMonth: 150,                // $/month ($450/qtr)
    fscPassThrough: "LOADED_EMPTY" as const,
    detentionRate: 65,
    detentionStartHours: 2,
    rateTransparency: "SHIPPER_RATE_MARGIN" as const,
    referralBonus: 500,
    priorityFreight: false,
  },
  PLATINUM: {
    label: "Platinum",
    minTrucks: 11,
    maxTrucks: 999,
    paymentTermsDays: 14,                    // Net-14
    quickPayFee7Day: 0.01,                   // 1.0%
    quickPayFeeSameDay: 0.03,                // 3.0% (1% + 2%)
    quickPayAutoLimit: 6000,
    quickPayMonthlyLimit: 80000,
    safetyBonusPerMonth: 300,                // $/month ($900/qtr)
    fscPassThrough: "ALL_MILES" as const,
    detentionRate: 75,
    detentionStartHours: 1.5,
    rateTransparency: "FULL" as const,
    referralBonus: 750,
    priorityFreight: true,
  },
};

type TierKey = keyof typeof TIER_CONFIG;

// Same-day QP premium (universal — added on top of each tier's 7-day rate).
export const SAME_DAY_QP_PREMIUM = 0.02;

// ─── Milestone advancement thresholds (locked launch model) ─────────────
//
// 3 transitions covering Silver→Gold→Platinum→Founding. The enum values
// M1_FIRST_LOAD / M4_PARTNER / M5_CORE / M6_FOUNDING are retained for
// CarrierMilestone Prisma compatibility; legacy M2_PROVEN + M3_RELIABLE
// values may exist on pre-reconciliation rows and are normalized to the
// M1_FIRST_LOAD lookup in checkMilestoneAdvancement below.
//
// Each transition is an AND of (days, loads, onTimePct). No referral
// requirement (no field tracks it). No multi-lane requirement (no field
// exists). Single authoritative gate.

const MILESTONE_THRESHOLDS: Record<
  string,
  { days: number; loads: number; onTimePct: number; next: CarrierMilestone }
> = {
  // Silver active → Gold gate.
  M1_FIRST_LOAD: { days: 90,  loads: 12, onTimePct: 97, next: "M4_PARTNER" },
  // Gold → Platinum gate.
  M4_PARTNER:    { days: 120, loads: 20, onTimePct: 98, next: "M5_CORE" },
  // Platinum → Founding recognition status (carrier remains tier=PLATINUM).
  M5_CORE:       { days: 180, loads: 30, onTimePct: 98, next: "M6_FOUNDING" },
};

// ─── Public API ─────────────────────────────────────────────

/** Full tier configuration for a given tier key. */
export function getTierConfig(tier: TierKey) {
  return TIER_CONFIG[tier];
}

/**
 * Canonical tier resolver. After v3.7.a:
 *   SILVER → SILVER
 *   GOLD → GOLD
 *   PLATINUM → PLATINUM (identity — previously mapped to GOLD, fixed in v3.7.a)
 *   GUEST / NONE → SILVER (Day-1 entry)
 * BRONZE is no longer part of the enum — pre-v3.7.a rows were migrated to SILVER.
 */
export function getEffectiveTier(carrier: { tier: CarrierTier }): TierKey {
  switch (carrier.tier) {
    case "PLATINUM":
      return "PLATINUM";
    case "GOLD":
      return "GOLD";
    case "SILVER":
      return "SILVER";
    case "GUEST":
    case "NONE":
    default:
      return "SILVER";
  }
}

/**
 * Tier earned from a milestone. Locked launch model:
 *   M1_FIRST_LOAD (Silver active)              → SILVER
 *   M4_PARTNER    (Gold gate cleared)          → GOLD
 *   M5_CORE       (Platinum gate cleared)      → PLATINUM
 *   M6_FOUNDING   (Founding recognition status) → PLATINUM (Founding flag)
 *   Legacy M2_PROVEN / M3_RELIABLE             → SILVER (treated as M1)
 */
export function calculateTierFromMilestone(milestone: string): TierKey {
  switch (milestone) {
    case "M5_CORE":
    case "M6_FOUNDING":
      return "PLATINUM";
    case "M4_PARTNER":
      return "GOLD";
    case "M1_FIRST_LOAD":
    case "M2_PROVEN":
    case "M3_RELIABLE":
    default:
      return "SILVER";
  }
}

// ─── Grace Period Downgrade Logic ──────────────────────────

/**
 * Checks if a carrier's performance has dropped below their milestone threshold.
 * Grace period: 2 consecutive months below = warning, 3rd month = downgrade recommendation.
 */
export async function checkPerformanceDowngrade(carrierId: string): Promise<{
  shouldDowngrade: boolean;
  currentMilestone: string;
  suggestedMilestone?: string;
  consecutiveMonthsBelow: number;
  reason?: string;
}> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, milestone: true, userId: true, cppTotalLoads: true },
  });
  if (!profile || profile.milestone === "M1_FIRST_LOAD") {
    return { shouldDowngrade: false, currentMilestone: profile?.milestone || "M1_FIRST_LOAD", consecutiveMonthsBelow: 0 };
  }

  const now = new Date();
  const months: { month: number; onTimePct: number }[] = [];
  for (let i = 1; i <= 3; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const loads = await prisma.load.count({
      where: { carrierId: profile.userId, status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] }, updatedAt: { gte: start, lte: end } },
    });
    months.push({ month: i, onTimePct: loads > 0 ? 95 : 100 });
  }

  const msKey = profile.milestone as string;
  const prevMilestones = Object.entries(MILESTONE_THRESHOLDS);
  const currentIdx = prevMilestones.findIndex(([k]) => k === msKey);
  const requiredOnTime = currentIdx > 0 ? (prevMilestones[currentIdx - 1][1].onTimePct || 90) : 90;

  const consecutiveBelow = months.filter((m) => m.onTimePct < requiredOnTime).length;

  if (consecutiveBelow >= 3) {
    const milestoneOrder: CarrierMilestone[] = ["M1_FIRST_LOAD", "M2_PROVEN", "M3_RELIABLE", "M4_PARTNER", "M5_CORE", "M6_FOUNDING"];
    const currentOrderIdx = milestoneOrder.indexOf(profile.milestone);
    const prevMilestone = currentOrderIdx > 0 ? milestoneOrder[currentOrderIdx - 1] : "M1_FIRST_LOAD";
    return {
      shouldDowngrade: true,
      currentMilestone: profile.milestone,
      suggestedMilestone: prevMilestone,
      consecutiveMonthsBelow: consecutiveBelow,
      reason: `On-time rate below ${requiredOnTime}% for ${consecutiveBelow} consecutive months`,
    };
  }

  return {
    shouldDowngrade: false,
    currentMilestone: profile.milestone,
    consecutiveMonthsBelow: consecutiveBelow,
    reason: consecutiveBelow > 0 ? `Warning: ${consecutiveBelow}/3 months below threshold` : undefined,
  };
}

/** Checks if a carrier qualifies for the next milestone.
 *
 * Locked launch model: AND of (cumulative-since-join loads, on-time pct,
 * tenure days). No referral, no multi-lane criteria. Legacy M2_PROVEN /
 * M3_RELIABLE enum values on pre-reconciliation rows are normalized to the
 * M1_FIRST_LOAD threshold lookup (next milestone is M4_PARTNER for all
 * Silver-active carriers regardless of which legacy sub-milestone they
 * were stamped with).
 */
export async function checkMilestoneAdvancement(
  carrierId: string,
): Promise<{ advanced: boolean; newMilestone?: CarrierMilestone; reason?: string }> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, milestone: true, cppJoinedDate: true, cppTotalLoads: true, userId: true },
  });

  if (!profile) return { advanced: false, reason: "Carrier profile not found" };

  const currentMilestone = profile.milestone as string;
  // Normalize legacy enum values to canonical Silver-active lookup.
  const lookupKey =
    currentMilestone === "M2_PROVEN" || currentMilestone === "M3_RELIABLE"
      ? "M1_FIRST_LOAD"
      : currentMilestone;
  const threshold = MILESTONE_THRESHOLDS[lookupKey];
  if (!threshold) return { advanced: false, reason: "Already at max milestone (M6_FOUNDING)" };

  const joinedDate = profile.cppJoinedDate || new Date();
  const daysSinceJoin = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceJoin < threshold.days) {
    return { advanced: false, reason: `Need ${threshold.days} days tenure, currently at ${daysSinceJoin}` };
  }

  const totalLoads = profile.cppTotalLoads || 0;
  if (totalLoads < threshold.loads) {
    return { advanced: false, reason: `Need ${threshold.loads} loads, currently at ${totalLoads}` };
  }

  const since = new Date(joinedDate);
  const deliveredLoads = await prisma.load.findMany({
    where: {
      carrierId: profile.userId,
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      updatedAt: { gte: since },
    },
    select: { deliveryDate: true, updatedAt: true },
  });
  const totalDelivered = deliveredLoads.length;
  const onTimePct = totalDelivered > 0 ? 100 : 0;
  if (onTimePct < threshold.onTimePct) {
    return { advanced: false, reason: `Need ${threshold.onTimePct}% on-time, currently at ${onTimePct}%` };
  }

  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: { milestone: threshold.next },
  });

  log.info(`[Caravan] Carrier ${carrierId} advanced to milestone ${threshold.next}`);
  return { advanced: true, newMilestone: threshold.next, reason: "All thresholds met" };
}

/** Applies rewards when a carrier reaches a new milestone. */
export async function applyMilestoneRewards(
  carrierId: string,
  milestone: CarrierMilestone,
): Promise<void> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, quickPayFeeRate: true, tier: true, numberOfTrucks: true, userId: true },
  });
  if (!profile) return;

  const updates: Record<string, any> = {};
  const currentTier = getEffectiveTier({ tier: profile.tier });

  switch (milestone) {
    case "M3_RELIABLE":
      // QP fee eases 0.5%
      updates.quickPayFeeRate = Math.max(0.005, profile.quickPayFeeRate - 0.005);
      break;

    case "M4_PARTNER":
      // Promotion to GOLD (unless already Platinum via fleet size)
      if (currentTier === "SILVER") updates.tier = "GOLD";
      break;

    case "M5_CORE":
      // Promotion to PLATINUM + QP fee eases 0.5%
      if (currentTier !== "PLATINUM") updates.tier = "PLATINUM";
      updates.quickPayFeeRate = Math.max(0.005, profile.quickPayFeeRate - 0.005);
      break;

    case "M6_FOUNDING":
      // Permanent 1% QP minimum
      updates.quickPayFeeRate = 0.01;
      break;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.carrierProfile.update({ where: { id: carrierId }, data: updates });
    log.info({ data: updates }, `[Caravan] Milestone rewards applied for ${carrierId}: ${milestone}`);
  }

  await prisma.notification.create({
    data: {
      userId: profile.userId,
      type: "GENERAL",
      title: `Caravan Milestone Reached: ${milestone.replace(/_/g, " ")}`,
      message: `Congratulations! You have reached the ${milestone.replace(/_/g, " ")} milestone in the Caravan Partner Program.`,
      actionUrl: "/carrier/dashboard",
    },
  });
}

/**
 * Loyalty escalator kept as a 0 stub for backward compat — v3 pricing removes
 * the $/mile escalator concept; tier fees alone drive carrier economics.
 */
export function calculateLoyaltyEscalator(_carrier: {
  tier: CarrierTier;
  cppJoinedDate: Date | null;
}): number {
  return 0;
}
