import { prisma } from "../config/database";

/**
 * Deadhead Optimizer — Minimizes empty miles for carriers.
 *
 * When a carrier delivers a load, this service finds available loads
 * near the delivery destination to minimize deadhead (empty driving).
 * Uses lane intelligence and carrier preferences to rank suggestions.
 *
 * COMPETITIVE EDGE: Reduces carrier costs = lower rates for SRL.
 */

interface DeadheadSuggestion {
  loadId: string;
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  pickupDate: Date | null;
  equipmentType: string | null;
  customerRate: number | null;
  estimatedDeadheadMiles: number;
  backToBaseDistance: number | null;
  score: number;
  reason: string;
}

// ─── Find Backhaul Loads ─────────────────────────────────────────────────────

export async function findBackhaulLoads(params: {
  currentState: string;
  currentCity?: string;
  carrierId?: string;
  equipmentType?: string;
  maxDeadheadMiles?: number;
  limit?: number;
}): Promise<DeadheadSuggestion[]> {
  const {
    currentState,
    carrierId,
    equipmentType = "DRY_VAN",
    maxDeadheadMiles = 150,
    limit = 10,
  } = params;

  // Find available loads originating in or near the current state
  const nearbyStates = getAdjacentStates(currentState);
  const allStates = [currentState, ...nearbyStates];

  const availableLoads = await prisma.load.findMany({
    where: {
      status: { in: ["POSTED", "PLANNED", "DRAFT"] },
      originState: { in: allStates },
      carrierId: null,
      ...(equipmentType ? { equipmentType } : {}),
    },
    select: {
      id: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      pickupDate: true,
      equipmentType: true,
      customerRate: true,
      distance: true,
    },
    orderBy: { pickupDate: "asc" },
    take: 50,
  });

  // Get carrier preferences if available
  let carrierPrefs: any = null;
  let homeBase: { lat: number; lng: number } | null = null;
  if (carrierId) {
    carrierPrefs = await prisma.carrierPreferences.findUnique({
      where: { carrierId },
    });
    if (carrierPrefs?.homeBaseLat && carrierPrefs?.homeBaseLng) {
      homeBase = { lat: carrierPrefs.homeBaseLat, lng: carrierPrefs.homeBaseLng };
    }
  }

  // Score each load
  const suggestions: DeadheadSuggestion[] = [];

  for (const load of availableLoads) {
    let score = 50; // Base score
    let reason = "Available in region";

    // Proximity scoring (same state = better)
    const estimatedDeadhead = load.originState === currentState ? 30 : 100;
    if (estimatedDeadhead > maxDeadheadMiles) continue;

    score += Math.max(0, 30 - (estimatedDeadhead / maxDeadheadMiles) * 30);

    // Pickup timing (sooner = better for reducing wait time)
    if (load.pickupDate) {
      const hoursUntilPickup = (new Date(load.pickupDate).getTime() - Date.now()) / 3_600_000;
      if (hoursUntilPickup >= 0 && hoursUntilPickup <= 48) {
        score += 15;
        reason = "Quick turnaround — pickup within 48 hours";
      }
    }

    // Rate per mile bonus
    if (load.customerRate && load.distance && load.distance > 0) {
      const rpm = load.customerRate / load.distance;
      if (rpm > 3.0) score += 10;
      else if (rpm > 2.5) score += 5;
    }

    // Preference match bonus
    if (carrierPrefs && load.destState) {
      const preferredRegions = carrierPrefs.preferredRegions as string[];
      if (Array.isArray(preferredRegions) && preferredRegions.includes(load.destState)) {
        score += 10;
        reason = "Matches preferred region";
      }
    }

    suggestions.push({
      loadId: load.id,
      originCity: load.originCity,
      originState: load.originState,
      destCity: load.destCity,
      destState: load.destState,
      pickupDate: load.pickupDate,
      equipmentType: load.equipmentType,
      customerRate: load.customerRate,
      estimatedDeadheadMiles: estimatedDeadhead,
      backToBaseDistance: null,
      score: Math.min(100, Math.max(0, Math.round(score))),
      reason,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, limit);
}

// ─── Get Deadhead Analytics ──────────────────────────────────────────────────

export async function getDeadheadAnalytics() {
  // Analyze lanes with high deadhead (no backhaul)
  const lanes = await prisma.laneIntelligence.findMany({
    where: { deadheadAvgMiles: { gt: 50 } },
    orderBy: { deadheadAvgMiles: "desc" },
    take: 20,
  });

  // Find best backhaul opportunities
  const backhaulLanes = await prisma.laneIntelligence.findMany({
    where: { backhaulScore: { gt: 0 }, backhaulLaneKey: { not: null } },
    orderBy: { backhaulScore: "desc" },
    take: 20,
  });

  return {
    highDeadheadLanes: lanes.map((l) => ({
      laneKey: l.laneKey,
      avgDeadheadMiles: l.deadheadAvgMiles,
      totalLoads: l.totalLoads,
      backhaulLane: l.backhaulLaneKey,
      backhaulScore: l.backhaulScore,
    })),
    topBackhaulOpportunities: backhaulLanes.map((l) => ({
      outboundLane: l.laneKey,
      backhaulLane: l.backhaulLaneKey,
      backhaulScore: l.backhaulScore,
      avgRate: l.avgRate,
    })),
  };
}

// ─── Adjacent States Map ─────────────────────────────────────────────────────

function getAdjacentStates(state: string): string[] {
  const adjacency: Record<string, string[]> = {
    AL: ["MS", "TN", "GA", "FL"],
    AZ: ["CA", "NV", "UT", "NM"],
    AR: ["MO", "TN", "MS", "LA", "TX", "OK"],
    CA: ["OR", "NV", "AZ"],
    CO: ["WY", "NE", "KS", "OK", "NM", "UT"],
    CT: ["NY", "MA", "RI"],
    DE: ["MD", "PA", "NJ"],
    FL: ["AL", "GA"],
    GA: ["FL", "AL", "TN", "NC", "SC"],
    ID: ["MT", "WY", "UT", "NV", "OR", "WA"],
    IL: ["WI", "IN", "KY", "MO", "IA"],
    IN: ["MI", "OH", "KY", "IL"],
    IA: ["MN", "WI", "IL", "MO", "NE", "SD"],
    KS: ["NE", "MO", "OK", "CO"],
    KY: ["IN", "OH", "WV", "VA", "TN", "MO", "IL"],
    LA: ["TX", "AR", "MS"],
    ME: ["NH"],
    MD: ["PA", "DE", "VA", "WV"],
    MA: ["NH", "RI", "CT", "NY", "VT"],
    MI: ["IN", "OH", "WI"],
    MN: ["WI", "IA", "SD", "ND"],
    MS: ["LA", "AR", "TN", "AL"],
    MO: ["IA", "IL", "KY", "TN", "AR", "OK", "KS", "NE"],
    MT: ["ND", "SD", "WY", "ID"],
    NE: ["SD", "IA", "MO", "KS", "CO", "WY"],
    NV: ["OR", "ID", "UT", "AZ", "CA"],
    NH: ["ME", "VT", "MA"],
    NJ: ["NY", "PA", "DE"],
    NM: ["CO", "OK", "TX", "AZ"],
    NY: ["VT", "MA", "CT", "NJ", "PA"],
    NC: ["VA", "TN", "GA", "SC"],
    ND: ["MN", "SD", "MT"],
    OH: ["MI", "IN", "KY", "WV", "PA"],
    OK: ["KS", "MO", "AR", "TX", "NM", "CO"],
    OR: ["WA", "ID", "NV", "CA"],
    PA: ["NY", "NJ", "DE", "MD", "WV", "OH"],
    RI: ["MA", "CT"],
    SC: ["NC", "GA"],
    SD: ["ND", "MN", "IA", "NE", "WY", "MT"],
    TN: ["KY", "VA", "NC", "GA", "AL", "MS", "AR", "MO"],
    TX: ["NM", "OK", "AR", "LA"],
    UT: ["ID", "WY", "CO", "NM", "AZ", "NV"],
    VT: ["NH", "MA", "NY"],
    VA: ["MD", "WV", "KY", "TN", "NC"],
    WA: ["OR", "ID"],
    WV: ["OH", "PA", "MD", "VA", "KY"],
    WI: ["MN", "IA", "IL", "MI"],
    WY: ["MT", "SD", "NE", "CO", "UT", "ID"],
  };

  return adjacency[state] ?? [];
}
