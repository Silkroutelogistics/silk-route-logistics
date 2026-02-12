import { prisma } from "../config/database";

interface MatchCandidate {
  carrierId: string;
  userId: string;
  company: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  tier: string;
  source: string;
  equipmentTypes: string[];
  operatingRegions: string[];
  matchScore: number;
  laneScore: number;
  rateScore: number;
  srcppScore: number;
  availabilityScore: number;
  sourceScore: number;
  breakdown: Record<string, any>;
}

/**
 * C.1 — Smart Carrier Matching
 * Score = lane_score(0-30) + rate_score(0-25) + srcpp_score(0-25) + availability_score(0-20) + source_score(0-5)
 */
export async function matchCarriersForLoad(loadId: string): Promise<{
  load: any;
  matches: MatchCandidate[];
  totalCandidates: number;
  filtered: number;
}> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: { customer: true },
  });
  if (!load) throw new Error("Load not found");

  // Get all approved carriers with valid data
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      status: { in: ["APPROVED", "NEW"] },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, email: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  });

  const totalCandidates = carriers.length;

  // FILTER OUT: equipment mismatch, expired insurance, inactive
  const now = new Date();
  const eligible = carriers.filter((c) => {
    // Equipment match required
    if (!c.equipmentTypes.includes(load.equipmentType)) return false;
    // Expired insurance
    if (c.insuranceExpiry && new Date(c.insuranceExpiry) < now) return false;
    // Must have user
    if (!c.user) return false;
    return true;
  });

  // Get lane history for scoring
  const laneHistory = await prisma.load.groupBy({
    by: ["carrierId"],
    where: {
      status: { in: ["DELIVERED", "COMPLETED"] },
      carrierId: { not: null },
      originState: load.originState,
      destState: load.destState,
    },
    _count: { id: true },
  });
  const exactLaneMap = new Map(laneHistory.map((h) => [h.carrierId, h._count.id]));

  const originStateHistory = await prisma.load.groupBy({
    by: ["carrierId"],
    where: {
      status: { in: ["DELIVERED", "COMPLETED"] },
      carrierId: { not: null },
      originState: load.originState,
    },
    _count: { id: true },
  });
  const originMap = new Map(originStateHistory.map((h) => [h.carrierId, h._count.id]));

  const destStateHistory = await prisma.load.groupBy({
    by: ["carrierId"],
    where: {
      status: { in: ["DELIVERED", "COMPLETED"] },
      carrierId: { not: null },
      destState: load.destState,
    },
    _count: { id: true },
  });
  const destMap = new Map(destStateHistory.map((h) => [h.carrierId, h._count.id]));

  // Get avg carrier rate for this lane
  const avgRateData = await prisma.load.aggregate({
    where: {
      status: { in: ["DELIVERED", "COMPLETED"] },
      originState: load.originState,
      destState: load.destState,
      carrierRate: { gt: 0 },
    },
    _avg: { carrierRate: true },
  });
  const avgLaneRate = avgRateData._avg.carrierRate || (load.carrierRate || load.rate);

  // Get active loads per carrier for availability
  const pickupDate = new Date(load.pickupDate);
  const dayBefore = new Date(pickupDate.getTime() - 24 * 60 * 60 * 1000);
  const dayAfter = new Date(pickupDate.getTime() + 24 * 60 * 60 * 1000);

  const activeLoadCounts = await prisma.load.groupBy({
    by: ["carrierId"],
    where: {
      status: { in: ["BOOKED", "CONFIRMED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] },
      carrierId: { not: null },
      pickupDate: { gte: dayBefore, lte: dayAfter },
    },
    _count: { id: true },
  });
  const activeMap = new Map(activeLoadCounts.map((h) => [h.carrierId, h._count.id]));

  // Delivering-near-origin carriers (loads delivering near pickup date in origin state)
  const deliveringNearOrigin = await prisma.load.findMany({
    where: {
      status: { in: ["IN_TRANSIT", "AT_DELIVERY"] },
      destState: load.originState,
      deliveryDate: { gte: dayBefore, lte: pickupDate },
      carrierId: { not: null },
    },
    select: { carrierId: true },
  });
  const deliveringNearSet = new Set(deliveringNearOrigin.map((l) => l.carrierId));

  // Score each eligible carrier
  const scored: MatchCandidate[] = eligible.map((c) => {
    const breakdown: Record<string, any> = {};

    // --- Lane Score (0-30) ---
    let laneScore = 5; // base: no history
    const exactLanes = exactLaneMap.get(c.userId) || 0;
    const originLanes = originMap.get(c.userId) || 0;
    const destLanes = destMap.get(c.userId) || 0;

    // Check preferred lanes from carrier profile
    let hasPreferredLane = false;
    if (c.preferredLanes) {
      const lanes = c.preferredLanes as any[];
      if (Array.isArray(lanes)) {
        hasPreferredLane = lanes.some((lane: any) =>
          (lane.originState === load.originState && lane.destState === load.destState) ||
          (lane.origin === load.originState && lane.dest === load.destState)
        );
      }
    }

    if (exactLanes > 0) {
      laneScore = 30; // exact lane match
      breakdown.laneDetail = `Exact lane: ${exactLanes} completed loads`;
    } else if (hasPreferredLane) {
      laneScore = 25;
      breakdown.laneDetail = "Preferred lane match";
    } else if (originLanes > 0) {
      laneScore = 20;
      breakdown.laneDetail = `Origin state match: ${originLanes} loads`;
    } else if (destLanes > 0) {
      laneScore = 15;
      breakdown.laneDetail = `Dest state match: ${destLanes} loads`;
    } else {
      breakdown.laneDetail = "No lane history";
    }
    breakdown.lane = laneScore;

    // --- Rate Score (0-25) ---
    let rateScore = 5; // outside range
    const carrierAvgRate = c.scorecards[0]?.overallScore; // We'll use lane avg rate instead
    const loadRate = load.carrierRate || load.rate;
    if (avgLaneRate && loadRate) {
      const diff = Math.abs(loadRate - avgLaneRate) / avgLaneRate * 100;
      if (diff <= 5) rateScore = 25;
      else if (diff <= 10) rateScore = 20;
      else if (diff <= 15) rateScore = 15;
      breakdown.rateDetail = `Lane avg: $${avgLaneRate.toFixed(0)}, diff: ${diff.toFixed(1)}%`;
    }
    breakdown.rate = rateScore;

    // --- SRCPP Score (0-25) ---
    let srcppScore = 0;
    const tierScores: Record<string, number> = {
      PLATINUM: 25, GOLD: 20, SILVER: 15, BRONZE: 10, GUEST: 0, NONE: 0,
    };
    srcppScore = tierScores[c.tier] || 0;
    breakdown.srcpp = srcppScore;
    breakdown.srcppDetail = `Tier: ${c.tier}`;

    // --- Availability Score (0-20) ---
    let availabilityScore = 0;
    const activeCount = activeMap.get(c.userId) || 0;
    const isDeliveringNear = deliveringNearSet.has(c.userId);

    if (activeCount === 0) {
      availabilityScore = 20; // No active loads on pickup date
      breakdown.availabilityDetail = "No conflicting loads";
    } else if (isDeliveringNear) {
      availabilityScore = 15; // Delivering near origin day before
      breakdown.availabilityDetail = "Delivering near origin";
    } else {
      availabilityScore = 0; // Overlapping
      breakdown.availabilityDetail = `${activeCount} active load(s) on pickup date`;
    }
    breakdown.availability = availabilityScore;

    // --- Source Score (0-5) ---
    const sourceScore = (c.source === "caravan" || !c.source) ? 5 : 0;
    breakdown.source = sourceScore;
    breakdown.sourceDetail = c.source === "dat" ? "DAT import (+0)" : "Caravan member (+5)";

    const matchScore = laneScore + rateScore + srcppScore + availabilityScore + sourceScore;

    return {
      carrierId: c.id,
      userId: c.userId,
      company: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
      contactName: `${c.user.firstName} ${c.user.lastName}`,
      phone: c.user.phone,
      email: c.user.email,
      mcNumber: c.mcNumber,
      dotNumber: c.dotNumber,
      tier: c.tier,
      source: c.source || "caravan",
      equipmentTypes: c.equipmentTypes,
      operatingRegions: c.operatingRegions,
      matchScore,
      laneScore,
      rateScore,
      srcppScore,
      availabilityScore,
      sourceScore,
      breakdown,
    };
  });

  // Sort by match score descending, take top 10
  const top10 = scored
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  // Store match results for self-learning
  if (top10.length > 0) {
    await prisma.matchResult.createMany({
      data: top10.map((m, i) => ({
        loadId,
        carrierId: m.carrierId,
        userId: m.userId,
        matchScore: m.matchScore,
        laneScore: m.laneScore,
        rateScore: m.rateScore,
        srcppScore: m.srcppScore,
        availabilityScore: m.availabilityScore,
        breakdown: m.breakdown as any,
        rank: i + 1,
      })),
    });
  }

  return {
    load: {
      id: load.id,
      referenceNumber: load.referenceNumber,
      originCity: load.originCity,
      originState: load.originState,
      destCity: load.destCity,
      destState: load.destState,
      equipmentType: load.equipmentType,
      pickupDate: load.pickupDate,
      rate: load.rate,
      carrierRate: load.carrierRate,
    },
    matches: top10,
    totalCandidates,
    filtered: totalCandidates - eligible.length,
  };
}

/**
 * Track which carrier was assigned from match results (self-learning)
 */
export async function trackMatchAssignment(loadId: string, userId: string) {
  await prisma.matchResult.updateMany({
    where: { loadId, userId },
    data: { wasAssigned: true },
  });
}

/**
 * Track match completion (self-learning)
 */
export async function trackMatchCompletion(loadId: string) {
  const load = await prisma.load.findUnique({ where: { id: loadId }, select: { carrierId: true } });
  if (!load?.carrierId) return;
  await prisma.matchResult.updateMany({
    where: { loadId, userId: load.carrierId, wasAssigned: true },
    data: { wasCompleted: true },
  });
}
