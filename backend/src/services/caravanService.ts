// Caravan Partner Program — 3-tier carrier loyalty system (v3.7.a)
//
// SILVER   (Day-1 entry) — every onboarded carrier starts here
// GOLD     (M4 or 5+ trucks)
// PLATINUM (M5 or 11+ trucks)
//
// Pricing values in TIER_CONFIG are the v3 locked numbers. Same-day QP is a
// universal +2% premium on top of each tier's 7-day rate — it is NOT
// tier-gated. Every tier can elect same-day.

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

// ─── Milestone advancement thresholds (v3 locked) ───────────

const MILESTONE_THRESHOLDS: Record<
  string,
  { days: number; loads: number; onTimePct?: number; referrals?: number; next: CarrierMilestone }
> = {
  M1_FIRST_LOAD: { days: 30,  loads: 10,  onTimePct: 95, next: "M2_PROVEN" },
  M2_PROVEN:     { days: 90,  loads: 30,  onTimePct: 96, next: "M3_RELIABLE" },
  M3_RELIABLE:   { days: 180, loads: 75,  onTimePct: 97, next: "M4_PARTNER" },
  M4_PARTNER:    { days: 360, loads: 150, onTimePct: 98, referrals: 1, next: "M5_CORE" },
  M5_CORE:       { days: 720, loads: 300,                             next: "M6_FOUNDING" },
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
 * Tier earned from a milestone. Performance-first:
 *   M1-M3 → SILVER   (Day-1 entry, working through early milestones)
 *   M4    → GOLD     (180d / 75 loads / 97% OT / 1 referral)
 *   M5-M6 → PLATINUM (360d / 150 loads / 98% OT → permanent 1% QP at M6)
 * Fleet size can accelerate milestone thresholds but does NOT bypass earning.
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

/**
 * Fleet size bonus on milestone thresholds:
 *   5+ trucks : M1→M2 halved  (5 loads, 24 days)
 *   11+ trucks: M1→M2 ~70% off (3 loads, 21 days)
 * Still must earn advancement via onTimePct / referrals.
 */
export function getFleetAdjustedThreshold(milestone: string, fleetSize: number) {
  const base = MILESTONE_THRESHOLDS[milestone];
  if (!base) return base;
  if (fleetSize >= 11) return { ...base, loads: Math.ceil(base.loads * 0.3), days: Math.ceil(base.days * 0.7) };
  if (fleetSize >= 5)  return { ...base, loads: Math.ceil(base.loads * 0.5), days: Math.ceil(base.days * 0.8) };
  return base;
}

/** @deprecated Use calculateTierFromMilestone — fleet size no longer determines tier, only accelerates milestones. */
export function calculateTierFromFleet(fleetSize: number): TierKey {
  if (fleetSize >= TIER_CONFIG.PLATINUM.minTrucks) return "PLATINUM";
  if (fleetSize >= TIER_CONFIG.GOLD.minTrucks)     return "GOLD";
  return "SILVER";
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

/** Checks if a carrier qualifies for the next milestone. */
export async function checkMilestoneAdvancement(
  carrierId: string,
): Promise<{ advanced: boolean; newMilestone?: CarrierMilestone; reason?: string }> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, milestone: true, cppJoinedDate: true, cppTotalLoads: true, referralCount: true, userId: true },
  });

  if (!profile) return { advanced: false, reason: "Carrier profile not found" };

  const currentMilestone = profile.milestone as string;
  const threshold = MILESTONE_THRESHOLDS[currentMilestone];
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

  if (threshold.referrals && (profile.referralCount || 0) < threshold.referrals) {
    return { advanced: false, reason: `Need ${threshold.referrals} referral(s), currently at ${profile.referralCount || 0}` };
  }

  if (threshold.onTimePct) {
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
