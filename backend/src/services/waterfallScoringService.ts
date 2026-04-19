/**
 * Waterfall Dispatch — carrier eligibility + composite match scoring
 *
 * Implements the spec §2.1 eligibility rules and §2.2 scoring formula:
 *   Lane history (30%) + SRCPP tier (25%) + Rate competitiveness (20%)
 *                      + On-time performance (15%) + Equipment match (10%)
 *
 * Single source of truth for carrier scoring (Rule 5 cleanup in v3.4.u).
 * The legacy ~95pt scoring that lived in carrierMatch.ts has been
 * retired. All consumers now flow through this service via
 * /api/waterfalls/load/:loadId/carrier-matches. The old GET
 * /api/carrier-match/:loadId endpoint was removed and its non-scoring
 * provisioning routes (import-from-dat, emergency-approve,
 * promote-to-bronze) moved to /api/carriers/.
 */

import { prisma } from "../config/database";
import type { Prisma } from "@prisma/client";

const INSURANCE_SAFETY_DAYS = 30;
const ELIGIBLE_TIERS = ["SILVER", "GOLD", "PLATINUM"] as const;
type EligibleTier = (typeof ELIGIBLE_TIERS)[number];

export interface ScoringWeights {
  laneHistory: number;
  tier: number;
  rate: number;
  onTime: number;
  equipment: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  laneHistory: 30,
  tier: 25,
  rate: 20,
  onTime: 15,
  equipment: 10,
};

export interface ScoredCarrier {
  carrierId: string;          // CarrierProfile.id
  userId: string;             // CarrierProfile.userId (needed for Load.carrierId FK)
  companyName: string | null;
  tier: EligibleTier;
  matchScore: number;         // 0–100 composite
  breakdown: {
    laneHistory: number;      // 0–100 factor score (pre-weight)
    tier: number;
    rate: number;
    onTime: number;
    equipment: number;
    laneRunCount: number;
    onTimePct: number;
    estimatedRate: number | null;
  };
  equipmentMatch: "exact" | "compatible" | "none";
  ineligibleReason?: string;
}

interface EligibilityInput {
  equipmentType: string;
  originState: string;
  destState: string;
  pickupDate: Date;
  deliveryDate: Date;
}

export interface LoadContext extends EligibilityInput {
  loadId: string;
  distance: number | null;
  customerRate: number | null;
  carrierRate: number | null; // target carrier cost
}

/**
 * Load context helper — pull the Load fields scoring needs in one query.
 */
export async function loadLoadContext(loadId: string): Promise<LoadContext | null> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      equipmentType: true,
      originState: true,
      destState: true,
      pickupDate: true,
      deliveryDate: true,
      distance: true,
      customerRate: true,
      carrierRate: true,
      rate: true,
    },
  });
  if (!load) return null;
  return {
    loadId: load.id,
    equipmentType: load.equipmentType,
    originState: load.originState,
    destState: load.destState,
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    distance: load.distance ?? null,
    customerRate: load.customerRate ?? load.rate ?? null,
    carrierRate: load.carrierRate ?? null,
  };
}

// ────────── Eligibility ──────────

/**
 * Fetch all carriers that pass the hard eligibility filter for a given
 * load. Carriers that fail are excluded outright — they cannot be
 * auto-tendered via the waterfall (they can still see open loadboard
 * posts if they would otherwise have visibility).
 */
export async function getEligibleCarriers(ctx: LoadContext) {
  const insuranceCutoff = new Date(Date.now() + INSURANCE_SAFETY_DAYS * 24 * 60 * 60 * 1000);

  // Base filter: approved, Bronze+, insurance not expiring in 30d, no auto-suspend.
  const candidates = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      cppTier: { in: ELIGIBLE_TIERS as unknown as EligibleTier[] },
      autoSuspendedAt: null,
      OR: [
        { insuranceExpiry: null },
        { insuranceExpiry: { gte: insuranceCutoff } },
      ],
    },
    select: {
      id: true,
      userId: true,
      companyName: true,
      cppTier: true,
      equipmentTypes: true,
      operatingRegions: true,
      autoLiabilityExpiry: true,
      cargoInsuranceExpiry: true,
      lastVettingRisk: true,
      chameleonRiskLevel: true,
    },
  });

  const equipmentKey = normalizeEquipment(ctx.equipmentType);
  const regionSet = [ctx.originState, ctx.destState].map((s) => (s || "").toUpperCase());

  return candidates.filter((c) => {
    // Equipment — carrier must have the type OR a compatible one. Filter
    // out carriers that declare no equipment at all; "compatible" still
    // passes eligibility (the scorer assigns the partial credit).
    if (c.equipmentTypes && c.equipmentTypes.length > 0) {
      const hasAny = c.equipmentTypes.some((e) => !!classifyEquipmentMatch(equipmentKey, e));
      if (!hasAny) return false;
    }

    // Region coverage — must match origin OR destination state if the
    // carrier publishes regions. Blank region list = nationwide.
    if (c.operatingRegions && c.operatingRegions.length > 0) {
      const covered = c.operatingRegions.some((r) => {
        const upper = (r || "").toUpperCase();
        return regionSet.some((s) => s && upper.includes(s));
      });
      if (!covered) return false;
    }

    // Compliance flags — hard exclude
    if (c.lastVettingRisk === "CRITICAL" || c.lastVettingRisk === "HIGH") return false;
    if (c.chameleonRiskLevel && ["HIGH", "CRITICAL"].includes(c.chameleonRiskLevel)) return false;

    // Extended insurance expiry — if detailed fields exist, enforce them too
    if (c.autoLiabilityExpiry && c.autoLiabilityExpiry < insuranceCutoff) return false;
    if (c.cargoInsuranceExpiry && c.cargoInsuranceExpiry < insuranceCutoff) return false;

    return true;
  });
}

/**
 * Hard-exclude carriers currently assigned to an overlapping SRL load
 * (the "not double-booked" rule). Pickups within 24 hours of each other
 * count as conflicting.
 */
async function filterDoubleBooked<T extends { userId: string }>(
  candidates: T[],
  ctx: LoadContext
): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  const windowStart = new Date(ctx.pickupDate.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(ctx.deliveryDate.getTime() + 24 * 60 * 60 * 1000);
  const conflicts = await prisma.load.findMany({
    where: {
      carrierId: { in: candidates.map((c) => c.userId) },
      status: { in: ["BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] },
      deletedAt: null,
      pickupDate: { lte: windowEnd },
      deliveryDate: { gte: windowStart },
    },
    select: { carrierId: true },
  });
  const busy = new Set(conflicts.map((l) => l.carrierId).filter(Boolean) as string[]);
  return candidates.filter((c) => !busy.has(c.userId));
}

// ────────── Scoring ──────────

function normalizeEquipment(type: string): string {
  return (type || "").toUpperCase().replace(/[\s_-]/g, "");
}

function classifyEquipmentMatch(
  loadKey: string,
  carrierType: string
): "exact" | "compatible" | null {
  const carrierKey = normalizeEquipment(carrierType);
  if (!loadKey || !carrierKey) return null;
  if (carrierKey === loadKey) return "exact";
  // Flatbed / Step Deck family, Van / Reefer compatibility heuristics
  const family: Record<string, string[]> = {
    VAN: ["DRYVAN", "VAN", "REEFER", "REEFERVAN"],
    DRYVAN: ["VAN", "DRYVAN"],
    REEFER: ["REEFER", "REEFERVAN"],
    FLATBED: ["FLATBED", "STEPDECK", "CONESTOGA"],
    STEPDECK: ["STEPDECK", "FLATBED"],
  };
  for (const group of Object.values(family)) {
    if (group.includes(loadKey) && group.includes(carrierKey)) return "compatible";
  }
  return null;
}

/**
 * Count how many loads this carrier has run on the exact origin→dest
 * state lane in the last 12 months. State-level granularity keeps the
 * query cheap and lines up with how carriers think about lanes.
 */
async function laneRunCount(carrierUserId: string, ctx: LoadContext): Promise<number> {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  return prisma.load.count({
    where: {
      carrierId: carrierUserId,
      originState: ctx.originState,
      destState: ctx.destState,
      status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
      createdAt: { gte: cutoff },
      deletedAt: null,
    },
  });
}

/**
 * Latest scorecard on-time % for delivery (falls back to 0 when no
 * scorecard exists yet — new carriers start at the bottom of this factor).
 */
async function latestOnTimePct(carrierId: string): Promise<number> {
  const card = await prisma.carrierScorecard.findFirst({
    where: { carrierId },
    orderBy: { calculatedAt: "desc" },
    select: { onTimeDeliveryPct: true },
  });
  return card?.onTimeDeliveryPct ?? 0;
}

function laneHistoryFactor(runCount: number): number {
  if (runCount >= 3) return 100;
  if (runCount === 2) return 60;
  if (runCount === 1) return 40;
  return 0;
}

function tierFactor(tier: EligibleTier): number {
  switch (tier) {
    case "PLATINUM": return 100;
    case "GOLD":     return 75;
    case "SILVER":   return 50;
  }
}

function rateFactor(estimatedRate: number | null, targetRate: number | null): number {
  if (estimatedRate === null || targetRate === null || targetRate <= 0) return 50; // neutral when unknown
  if (estimatedRate <= targetRate) return 100;
  const overshoot = (estimatedRate - targetRate) / targetRate;
  if (overshoot <= 0.1) return 50;
  return 0;
}

function onTimeFactor(pct: number): number {
  if (pct >= 95) return 100;
  if (pct >= 90) return 75;
  if (pct >= 85) return 50;
  return 25;
}

function equipmentFactor(match: "exact" | "compatible" | "none"): number {
  return match === "exact" ? 100 : match === "compatible" ? 50 : 0;
}

/**
 * Estimate a carrier's rate for this lane from their recent history.
 * Falls back to the load's target carrier cost when no history exists.
 */
async function estimateCarrierRate(carrierUserId: string, ctx: LoadContext): Promise<number | null> {
  const recent = await prisma.load.findMany({
    where: {
      carrierId: carrierUserId,
      originState: ctx.originState,
      destState: ctx.destState,
      carrierRate: { not: null },
      status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { carrierRate: true },
  });
  if (recent.length === 0) return ctx.carrierRate;
  const sum = recent.reduce((s, l) => s + (l.carrierRate ?? 0), 0);
  return sum / recent.length;
}

/**
 * Primary entry point — returns carriers sorted by descending composite
 * match score, ready to be persisted as waterfall_positions.
 */
export async function scoreCarriersForLoad(
  ctx: LoadContext,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): Promise<ScoredCarrier[]> {
  const eligibleRaw = await getEligibleCarriers(ctx);
  const eligible = await filterDoubleBooked(eligibleRaw, ctx);
  if (eligible.length === 0) return [];

  const loadKey = normalizeEquipment(ctx.equipmentType);

  const scored: ScoredCarrier[] = [];
  for (const c of eligible) {
    const equipmentMatch: "exact" | "compatible" | "none" =
      (c.equipmentTypes || [])
        .map((e) => classifyEquipmentMatch(loadKey, e))
        .reduce<"exact" | "compatible" | "none">(
          (best, m) => (m === "exact" ? "exact" : m === "compatible" && best !== "exact" ? "compatible" : best),
          "none"
        );

    const [runCount, onTimePct, estimatedRate] = await Promise.all([
      laneRunCount(c.userId, ctx),
      latestOnTimePct(c.id),
      estimateCarrierRate(c.userId, ctx),
    ]);

    const laneF = laneHistoryFactor(runCount);
    const tierF = tierFactor(c.cppTier as EligibleTier);
    const rateF = rateFactor(estimatedRate, ctx.carrierRate);
    const otF   = onTimeFactor(onTimePct);
    const eqF   = equipmentFactor(equipmentMatch);

    const weighted =
      (laneF  * weights.laneHistory / 100) +
      (tierF  * weights.tier        / 100) +
      (rateF  * weights.rate        / 100) +
      (otF    * weights.onTime      / 100) +
      (eqF    * weights.equipment   / 100);

    scored.push({
      carrierId: c.id,
      userId: c.userId,
      companyName: c.companyName,
      tier: c.cppTier as EligibleTier,
      matchScore: Math.round(weighted * 100) / 100,
      breakdown: {
        laneHistory: laneF,
        tier: tierF,
        rate: rateF,
        onTime: otF,
        equipment: eqF,
        laneRunCount: runCount,
        onTimePct,
        estimatedRate,
      },
      equipmentMatch,
    });
  }

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored;
}

/**
 * Build a lightweight summary for UIs that need to show rank + factors
 * without re-running scoring. Returns a safe JSON structure suitable for
 * Prisma.InputJsonValue when persisting snapshot metadata.
 */
export function scoredCarrierToJson(sc: ScoredCarrier): Prisma.InputJsonValue {
  return {
    carrierId: sc.carrierId,
    userId: sc.userId,
    companyName: sc.companyName,
    tier: sc.tier,
    matchScore: sc.matchScore,
    equipmentMatch: sc.equipmentMatch,
    breakdown: sc.breakdown,
  };
}
