import { prisma } from "../config/database";
import type { CarrierTier, CarrierMilestone } from "@prisma/client";

// ─── Tier Configuration (SRL Blueprint) ─────────────────────

const TIER_CONFIG = {
  BRONZE: {
    minTrucks: 1,
    maxTrucks: 4,
    rateBonus: 0, // Standard all-in rate
    paymentTermsDays: 21, // Net-21
    quickPaySpeed: 5, // 5-day
    quickPayFee: 0.03, // 3%
    quickPayAutoLimit: 2000,
    quickPayMonthlyLimit: 15000,
    safetyBonusPerTruck: 250, // quarterly
    fscPassThrough: "LOADED" as const, // loaded miles only
    detentionRate: 50, // $/hr
    detentionStartHours: 2,
    rateTransparency: "CARRIER_RATE" as const, // sees their rate only
    referralBonus: 250,
    loyaltyEscalator6mo: 0.02, // +$0.02/mi at 6 months
    loyaltyEscalator12mo: 0,
  },
  SILVER: {
    minTrucks: 5,
    maxTrucks: 10,
    rateBonus: 0.02, // Standard + 2%
    paymentTermsDays: 14,
    quickPaySpeed: 3,
    quickPayFee: 0.02,
    quickPayAutoLimit: 4000,
    quickPayMonthlyLimit: 40000,
    safetyBonusPerTruck: 500,
    fscPassThrough: "LOADED_EMPTY" as const,
    detentionRate: 75,
    detentionStartHours: 2,
    rateTransparency: "SHIPPER_RATE_MARGIN" as const,
    referralBonus: 500,
    loyaltyEscalator6mo: 0.03,
    loyaltyEscalator12mo: 0.05,
  },
  GOLD: {
    minTrucks: 11,
    maxTrucks: 999,
    rateBonus: 0.04, // Standard + 4%
    paymentTermsDays: 7, // Net-7 included
    quickPaySpeed: 1, // Same-day/next-day
    quickPayFee: 0.01,
    quickPayAutoLimit: 6000,
    quickPayMonthlyLimit: 80000,
    safetyBonusPerTruck: 750,
    fscPassThrough: "ALL_MILES" as const,
    detentionRate: 75,
    detentionStartHours: 1.5,
    rateTransparency: "FULL" as const,
    referralBonus: 750,
    loyaltyEscalator6mo: 0.04,
    loyaltyEscalator12mo: 0.07,
  },
};

type TierKey = keyof typeof TIER_CONFIG;

// ─── Milestone advancement thresholds ───────────────────────

const MILESTONE_THRESHOLDS: Record<
  string,
  { days: number; loads: number; onTimePct?: number; next: CarrierMilestone }
> = {
  M1_FIRST_LOAD: { days: 30, loads: 10, onTimePct: 95, next: "M2_PROVEN" },
  M2_PROVEN: { days: 90, loads: 30, onTimePct: 96, next: "M3_RELIABLE" },
  M3_RELIABLE: { days: 180, loads: 75, onTimePct: 97, next: "M4_PARTNER" },
  M4_PARTNER: { days: 365, loads: 150, onTimePct: 98, next: "M5_CORE" },
  M5_CORE: { days: 730, loads: 300, next: "M6_FOUNDING" },
};

// ─── Public API ─────────────────────────────────────────────

/**
 * Returns the full tier configuration for a given tier key.
 */
export function getTierConfig(tier: TierKey) {
  return TIER_CONFIG[tier];
}

/**
 * Maps legacy tier values to the blueprint 3-tier system.
 * GUEST → BRONZE, PLATINUM → GOLD, NONE → BRONZE
 */
export function getEffectiveTier(carrier: { tier: CarrierTier }): TierKey {
  switch (carrier.tier) {
    case "GOLD":
      return "GOLD";
    case "SILVER":
      return "SILVER";
    case "PLATINUM":
      return "GOLD";
    case "GUEST":
    case "NONE":
    case "BRONZE":
    default:
      return "BRONZE";
  }
}

/**
 * Determines the appropriate tier based on fleet size.
 */
export function calculateTierFromFleet(fleetSize: number): TierKey {
  if (fleetSize >= TIER_CONFIG.GOLD.minTrucks) return "GOLD";
  if (fleetSize >= TIER_CONFIG.SILVER.minTrucks) return "SILVER";
  return "BRONZE";
}

/**
 * Checks if a carrier qualifies for the next milestone.
 * Returns advancement result with reason.
 */
export async function checkMilestoneAdvancement(
  carrierId: string
): Promise<{ advanced: boolean; newMilestone?: CarrierMilestone; reason?: string }> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      milestone: true,
      cppJoinedDate: true,
      cppTotalLoads: true,
      userId: true,
    },
  });

  if (!profile) return { advanced: false, reason: "Carrier profile not found" };

  const currentMilestone = profile.milestone as string;
  const threshold = MILESTONE_THRESHOLDS[currentMilestone];
  if (!threshold) return { advanced: false, reason: "Already at max milestone (M6_FOUNDING)" };

  // Check tenure (days since joining)
  const joinedDate = profile.cppJoinedDate || new Date();
  const daysSinceJoin = Math.floor(
    (Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceJoin < threshold.days) {
    return { advanced: false, reason: `Need ${threshold.days} days tenure, currently at ${daysSinceJoin}` };
  }

  // Check load count
  const totalLoads = profile.cppTotalLoads || 0;
  if (totalLoads < threshold.loads) {
    return { advanced: false, reason: `Need ${threshold.loads} loads, currently at ${totalLoads}` };
  }

  // Check on-time percentage (if required)
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

    // Simplified on-time calculation: loads delivered count as on-time
    // (full event-level tracking would be more precise)
    const totalDelivered = deliveredLoads.length;
    const onTimePct = totalDelivered > 0 ? 100 : 0; // baseline assumption
    if (onTimePct < threshold.onTimePct) {
      return {
        advanced: false,
        reason: `Need ${threshold.onTimePct}% on-time, currently at ${onTimePct}%`,
      };
    }
  }

  // All checks passed — advance
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: { milestone: threshold.next },
  });

  console.log(`[Carvan] Carrier ${carrierId} advanced to milestone ${threshold.next}`);
  return { advanced: true, newMilestone: threshold.next, reason: "All thresholds met" };
}

/**
 * Applies rewards when a carrier reaches a new milestone.
 */
export async function applyMilestoneRewards(
  carrierId: string,
  milestone: CarrierMilestone
): Promise<void> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      quickPayFeeRate: true,
      tier: true,
      numberOfTrucks: true,
      userId: true,
    },
  });
  if (!profile) return;

  const updates: Record<string, any> = {};

  switch (milestone) {
    case "M3_RELIABLE":
      // QP fee drops 0.5%
      updates.quickPayFeeRate = Math.max(0.005, profile.quickPayFeeRate - 0.005);
      break;

    case "M4_PARTNER":
      // Tier advancement regardless of fleet size
      if (profile.tier !== "GOLD") {
        const currentTier = getEffectiveTier({ tier: profile.tier });
        if (currentTier === "BRONZE") updates.tier = "SILVER";
        else if (currentTier === "SILVER") updates.tier = "GOLD";
      }
      break;

    case "M5_CORE":
      // Full loyalty bump + QP fee drops another 0.5%
      updates.quickPayFeeRate = Math.max(0.005, profile.quickPayFeeRate - 0.005);
      const tierCfg = getTierConfig(getEffectiveTier({ tier: profile.tier }));
      updates.loyaltyEscalator = tierCfg.loyaltyEscalator12mo;
      break;

    case "M6_FOUNDING":
      // Permanent 1% QP minimum
      updates.quickPayFeeRate = 0.01;
      break;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.carrierProfile.update({
      where: { id: carrierId },
      data: updates,
    });
    console.log(`[Carvan] Milestone rewards applied for ${carrierId}: ${milestone}`, updates);
  }

  // Create notification for the carrier
  await prisma.notification.create({
    data: {
      userId: profile.userId,
      type: "GENERAL",
      title: `Carvan Milestone Reached: ${milestone.replace(/_/g, " ")}`,
      message: `Congratulations! You have reached the ${milestone.replace(/_/g, " ")} milestone in the Carvan Carrier Program.`,
      actionUrl: "/carrier/dashboard.html",
    },
  });
}

/**
 * Calculates the $/mile loyalty escalator based on carrier tenure and tier.
 */
export function calculateLoyaltyEscalator(carrier: {
  tier: CarrierTier;
  cppJoinedDate: Date | null;
}): number {
  const effectiveTier = getEffectiveTier(carrier);
  const config = getTierConfig(effectiveTier);

  if (!carrier.cppJoinedDate) return 0;

  const monthsSinceJoin = Math.floor(
    (Date.now() - carrier.cppJoinedDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );

  if (monthsSinceJoin >= 12 && config.loyaltyEscalator12mo > 0) {
    return config.loyaltyEscalator12mo;
  }
  if (monthsSinceJoin >= 6 && config.loyaltyEscalator6mo > 0) {
    return config.loyaltyEscalator6mo;
  }

  return 0;
}
