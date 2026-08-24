/**
 * Waterfall Dispatch — carrier eligibility + composite match scoring
 *
 * Implements the spec §2.1 eligibility rules and §2.2 scoring formula.
 * Weights are RELATIVE and the composite divides by their sum (see
 * DEFAULT_WEIGHTS + totalWeight):
 *   Lane history 30 + tier 25 + rate 20 + on-time 15 + equipment 10
 *                   + routing guide 20  (B4)  = 120
 * The header used to state these as percentages summing to 100. It stopped
 * being true when routingGuide was added, so it now names the weights instead —
 * a comment asserting a total is a comment that goes stale on the next factor.
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
import { regionsCoverLane } from "../lib/operatingRegions";
import { complianceCheckMany } from "./complianceMonitorService";
import { log } from "../lib/logger";
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
  /** The customer's routing guide, where they have ranked carriers on this lane (B4). */
  routingGuide: number;
}

/**
 * Weights no longer sum to 100; the composite divides by their SUM.
 *
 * routingGuide was ADDED rather than carved out of laneHistory, and the
 * distinction is load-bearing. Carving 20 out of lane history would shrink it
 * from 30 to 10, so the gap between a carrier with three prior runs on the lane
 * and one with none would fall from 30 points to 10 — silently re-ordering live
 * dispatch on the day this shipped, for a feature with zero rows behind it.
 *
 * Adding, and normalising by the total, is provably inert today: with no routing
 * guide the factor returns the SAME neutral value for every carrier, so the
 * composite becomes an affine increasing transform of the old one and the
 * ordering is identical. A test asserts precisely that. Once guides carry rows,
 * the factor varies per carrier and starts doing real work.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  laneHistory: 30,
  tier: 25,
  rate: 20,
  onTime: 15,
  equipment: 10,
  // Deliberately second-heaviest. A routing guide is not one more opinion about
  // a carrier — it is the SHIPPER instructing us whom to use on their freight,
  // in order. It should outweigh our own readings of rate and punctuality, and
  // sit just under the lane history that records who actually runs it.
  routingGuide: 20,
};

/** Weights are relative, so the composite divides by whatever they total. */
export function totalWeight(w: ScoringWeights = DEFAULT_WEIGHTS): number {
  return w.laneHistory + w.tier + w.rate + w.onTime + w.equipment + w.routingGuide;
}

/**
 * Rank on the customer's routing guide → 0-100.
 *
 * NEUTRAL_NO_GUIDE is returned both when the lane has no guide and when a guide
 * exists but does not name this carrier. Those are deliberately the same value:
 * a shipper listing three preferred carriers is expressing a preference, not a
 * prohibition, and treating "unlisted" as a penalty would quietly make an
 * incomplete routing guide an exclusion list. Exclusion is what the compliance
 * gate is for.
 */
export const NEUTRAL_NO_GUIDE = 50;

export function routingGuideFactor(rank: number | null | undefined): number {
  if (rank == null) return NEUTRAL_NO_GUIDE;
  if (rank <= 1) return 100;
  if (rank === 2) return 85;
  if (rank === 3) return 70;
  // Named but far down the list still beats unlisted — the shipper did put them
  // on it. Floors above neutral rather than decaying through it.
  return 60;
}

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
    routingGuide: number;     // 0–100; NEUTRAL_NO_GUIDE when the lane has none
    /** Rank on the customer's routing guide, or null if unlisted / no guide. */
    routingGuideRank: number | null;
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
  /**
   * Needed to find the CUSTOMER's routing guide (B4). A routing guide belongs
   * to a shipper, so scoring a load without knowing whose freight it is can
   * only ever find a generic lane guide, never theirs.
   */
  customerId: string | null;
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
      customerId: true,
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
    customerRate: load.customerRate ?? null,
    carrierRate: load.carrierRate ?? null,
    customerId: load.customerId ?? null,
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

  const structurallyEligible = candidates.filter((c) => {
    // Equipment — carrier must have the type OR a compatible one. Filter
    // out carriers that declare no equipment at all; "compatible" still
    // passes eligibility (the scorer assigns the partial credit).
    if (c.equipmentTypes && c.equipmentTypes.length > 0) {
      const hasAny = c.equipmentTypes.some((e) => !!classifyEquipmentMatch(equipmentKey, e));
      if (!hasAny) return false;
    }

    // Region coverage — origin OR destination, per lib/operatingRegions.
    //
    // ARC 17 — this compared the carrier's REGION NAME to the load's two-letter
    // STATE CODE with includes(). "NORTHEAST".includes("NH") is false;
    // "NORTHEAST".includes("OR") is true. Across the ten regions onboarding
    // offers and all fifty states, 41 states could never be matched by any
    // region, and the nine that could matched the wrong carriers. Onboarding
    // REQUIRES a region, so every portal-onboarded carrier was excluded from
    // essentially every waterfall. §13.3 Item 223.
    if (!regionsCoverLane(c.operatingRegions, regionSet)) return false;

    // Compliance exclusions are NOT decided here any more — see the
    // complianceCheckMany pass below. This filter keeps only the cheap
    // structural predicates; anything that is a question of "may this carrier
    // be tendered at all" now comes from the same gate the tender endpoint
    // uses, so an override applies to both paths identically.
    //
    // What deliberately STAYS here: auto-dispatch declines a vetting risk of
    // HIGH (score 40-59), which the gate only warns about. That is not a
    // compliance decision, it is a selection policy — the waterfall picks a
    // carrier with no human looking at the choice, so it is allowed to be
    // fussier than a gate an AE is standing in front of. Dropping it would
    // have silently LOOSENED auto-dispatch, which is the opposite of what
    // migrating to the gate is for. §13.3 Item 234.
    if (c.lastVettingRisk === "HIGH") return false;

    // Extended insurance expiry — if detailed fields exist, enforce them too
    if (c.autoLiabilityExpiry && c.autoLiabilityExpiry < insuranceCutoff) return false;
    if (c.cargoInsuranceExpiry && c.cargoInsuranceExpiry < insuranceCutoff) return false;

    return true;
  });

  // ── the gate, once, for everyone ────────────────────────────────────
  //
  // Compliance exclusions come from complianceCheck — the SAME verdict the
  // tender endpoint uses — so a scoped override released for a tender is
  // released here too. Before this, the waterfall read chameleonRiskLevel and
  // lastVettingRisk straight off the row and consulted no override at all, so
  // an AE could override a carrier, tender them by hand, and still never see
  // them in auto-dispatch.
  //
  // Batched deliberately. Measured on a rehearsal database, a per-candidate
  // call costs 53 ms — 5.3 SECONDS at 100 candidates, on a request an AE is
  // waiting on. complianceCheckMany does three queries regardless of N and
  // then runs the same complianceCheck per carrier with its inputs handed in,
  // so there is one set of rules rather than a fast copy that can drift.
  if (structurallyEligible.length === 0) return structurallyEligible;

  const verdicts = await complianceCheckMany(structurallyEligible.map((c) => c.id));
  const cleared = structurallyEligible.filter((c) => {
    const v = verdicts.get(c.id);
    if (!v) return false;
    if (!v.allowed) {
      // Log the GATE reason. The old filter excluded silently, so a carrier
      // vanishing from every waterfall looked identical to one that simply
      // did not match the lane.
      log.info(
        { carrierId: c.id, reasons: v.blocked_reasons },
        "[Waterfall] candidate excluded by compliance gate",
      );
      return false;
    }
    return true;
  });
  return cleared;
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

/**
 * The composite, as a pure function of the six factors.
 *
 * EXTRACTED so the tests can call THIS rather than re-implementing the formula
 * beside it. A test that reproduces the code cannot test the code: it would
 * have passed just as happily if the engine forgot to divide by totalWeight,
 * or dropped routingGuide from the sum entirely (§13.3 Item 222.5).
 */
export function compositeScore(
  f: {
    laneHistory: number;
    tier: number;
    rate: number;
    onTime: number;
    equipment: number;
    routingGuide: number;
  },
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): number {
  return (
    (f.laneHistory * weights.laneHistory +
      f.tier * weights.tier +
      f.rate * weights.rate +
      f.onTime * weights.onTime +
      f.equipment * weights.equipment +
      f.routingGuide * weights.routingGuide) /
    totalWeight(weights)
  );
}

export function normalizeEquipment(type: string): string {
  return (type || "").toUpperCase().replace(/[\s_-]/g, "");
}

export function classifyEquipmentMatch(
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

export function laneHistoryFactor(runCount: number): number {
  if (runCount >= 3) return 100;
  if (runCount === 2) return 60;
  if (runCount === 1) return 40;
  return 0;
}

export function tierFactor(tier: EligibleTier): number {
  switch (tier) {
    case "PLATINUM": return 100;
    case "GOLD":     return 75;
    case "SILVER":   return 50;
  }
}

export function rateFactor(estimatedRate: number | null, targetRate: number | null): number {
  if (estimatedRate === null || targetRate === null || targetRate <= 0) return 50; // neutral when unknown
  if (estimatedRate <= targetRate) return 100;
  const overshoot = (estimatedRate - targetRate) / targetRate;
  if (overshoot <= 0.1) return 50;
  return 0;
}

export function onTimeFactor(pct: number): number {
  if (pct >= 95) return 100;
  if (pct >= 90) return 75;
  if (pct >= 85) return 50;
  return 25;
}

export function equipmentFactor(match: "exact" | "compatible" | "none"): number {
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

  // B4 — the customer's routing guide for this lane, fetched ONCE per scoring
  // run rather than once per carrier. RoutingGuideEntry.carrierId is a real FK
  // to CarrierProfile.id, so the rank map keys directly off the id we already
  // hold; no join guesswork.
  //
  // Zero rows in production today, by design — this is the read path those rows
  // will land in. Non-fatal on failure: a scoring run that cannot reach the
  // guide should rank carriers without it, not refuse to dispatch.
  const guideRanks = await loadRoutingGuideRanks(ctx);

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
    const rgRank = guideRanks.get(c.id) ?? null;
    const rgF   = routingGuideFactor(rgRank);

    // Divided by the weight TOTAL, not by 100 — weights are relative, and
    // routingGuide was added on top rather than taken from the others.
    const weighted = compositeScore(
      {
        laneHistory: laneF,
        tier: tierF,
        rate: rateF,
        onTime: otF,
        equipment: eqF,
        routingGuide: rgF,
      },
      weights,
    );

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
        routingGuide: rgF,
        routingGuideRank: rgRank,
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

/**
 * Rank map for the customer's routing guide on this load's lane.
 *
 * Keyed by CarrierProfile.id, which is what RoutingGuideEntry.carrierId is a
 * real FK to — so this joins on an id we already hold rather than guessing.
 *
 * Returns an EMPTY map when there is no guide, which is every load today: zero
 * RoutingGuide rows exist in production. That is the intended state, not a
 * failure — this is the read path the rows will land in, and an empty map makes
 * every carrier score NEUTRAL_NO_GUIDE, which is provably order-preserving.
 *
 * Swallows its own errors on purpose. A scoring run that cannot reach the
 * routing guide should rank carriers without it; refusing to dispatch because a
 * preference lookup failed would be a worse outcome than dispatching without
 * the preference.
 */
export async function loadRoutingGuideRanks(ctx: LoadContext): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  if (!ctx.originState || !ctx.destState || !ctx.equipmentType) return ranks;

  // RoutingGuide.customerId is NULLABLE: a guide is either specific to one
  // customer or global. That makes the customer filter two questions, not one,
  // and getting it wrong fails in both directions — a customer filter alone
  // misses the global guides, and NO filter lets one customer's negotiated
  // ranking steer another customer's freight.
  //
  // A customer-specific guide WINS over a global one for the same lane, so ask
  // for it first rather than trying to express the preference in one query.
  const laneWhere = {
    originState: ctx.originState,
    destState: ctx.destState,
    equipmentType: ctx.equipmentType,
    isActive: true,
    deletedAt: null,
    OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }],
  };
  const entrySelect = {
    entries: {
      where: { isActive: true },
      select: { carrierId: true, rank: true },
      orderBy: { rank: "asc" as const },
    },
  };

  try {
    let guide = ctx.customerId
      ? await prisma.routingGuide.findFirst({
          where: { ...laneWhere, customerId: ctx.customerId },
          select: entrySelect,
          orderBy: { updatedAt: "desc" },
        })
      : null;

    // Fall back to a guide that belongs to no customer. A load with no customer
    // may ONLY ever see these.
    if (!guide) {
      guide = await prisma.routingGuide.findFirst({
        where: { ...laneWhere, customerId: null },
        select: entrySelect,
        orderBy: { updatedAt: "desc" },
      });
    }

    for (const e of guide?.entries ?? []) {
      if (e.carrierId && typeof e.rank === "number") ranks.set(e.carrierId, e.rank);
    }
  } catch (err) {
    log.warn({ err, loadId: ctx.loadId }, "[Scoring] routing guide lookup failed — scoring without it");
  }
  return ranks;
}
