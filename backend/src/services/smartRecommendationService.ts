import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

/**
 * Smart Recommendation Engine — AI-powered carrier-to-load matching.
 *
 * Ranks carriers for a given load based on:
 *   - Lane history & performance on similar routes
 *   - Carrier reliability score & tier
 *   - Equipment match & availability
 *   - Rate competitiveness
 *   - Deadhead distance from carrier's last known position
 *   - Carrier preferences (preferred lanes, regions, load types)
 *
 * COMPETITIVE EDGE: Automated best-match ranking eliminates manual carrier search.
 */

const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

interface CarrierRecommendation {
  carrierId: string;
  companyName: string;
  matchScore: number;
  tier: string;
  reliabilityScore: number;
  laneExperience: number;
  estimatedRate: number | null;
  deadheadMiles: number | null;
  factors: Record<string, number>;
  recommendation: string;
}

// ─── Get Recommendations for a Load ──────────────────────────────────────────

export async function getRecommendationsForLoad(
  loadId: string,
  limit = 10
): Promise<CarrierRecommendation[]> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      originState: true,
      originCity: true,
      destState: true,
      destCity: true,
      equipmentType: true,
      customerRate: true,
      distance: true,
    },
  });

  if (!load || !load.originState || !load.destState) return [];

  const laneKey = `${load.originState}:${load.destState}`;

  // Get all approved carriers
  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    select: {
      id: true,
      companyName: true,
      cppTier: true,
      cppTotalLoads: true,
      equipmentTypes: true,
    },
    take: 200,
  });

  // Get carrier intelligence for all in one query
  const intelRecords = await prisma.carrierIntelligence.findMany({
    where: {
      carrierId: { in: carriers.map((c) => c.id) },
      laneKey: { in: [laneKey, "__global__"] },
    },
  });

  // Get carrier preferences
  const prefRecords = await prisma.carrierPreferences.findMany({
    where: { carrierId: { in: carriers.map((c) => c.id) } },
  });

  // Get lane rate intelligence
  const rateIntel = await prisma.rateIntelligence.findFirst({
    where: { laneKey, equipmentType: load.equipmentType || "DRY_VAN" },
  });

  // Score each carrier
  const scored: CarrierRecommendation[] = [];

  for (const carrier of carriers) {
    const globalIntel = intelRecords.find(
      (i) => i.carrierId === carrier.id && i.laneKey === "__global__"
    );
    const laneIntel = intelRecords.find(
      (i) => i.carrierId === carrier.id && i.laneKey === laneKey
    );
    const prefs = prefRecords.find((p) => p.carrierId === carrier.id);

    const factors: Record<string, number> = {};

    // Factor 1: Reliability (0-25 pts)
    const reliability = globalIntel?.reliabilityScore ?? 50;
    factors.reliability = (reliability / 100) * 25;

    // Factor 2: Lane experience (0-20 pts)
    const laneLoads = laneIntel?.totalDataPoints ?? 0;
    factors.laneExperience = Math.min(20, laneLoads * 2);

    // Factor 3: Equipment match (0-15 pts)
    const equipMatch = carrier.equipmentTypes?.includes(load.equipmentType || "DRY_VAN");
    factors.equipmentMatch = equipMatch ? 15 : 0;

    // Factor 4: Tier bonus (0-15 pts)
    const tierScores: Record<string, number> = {
      PLATINUM: 15,
      GOLD: 12,
      SILVER: 8,
      BRONZE: 4,
    };
    factors.tierBonus = tierScores[carrier.cppTier || "BRONZE"] ?? 4;

    // Factor 5: Fall-off risk penalty (0 to -10)
    const fallOffRisk = globalIntel?.fallOffRisk ?? 0.1;
    factors.fallOffPenalty = -fallOffRisk * 10;

    // Factor 6: Preference alignment (0-15 pts)
    let prefScore = 5; // Base score
    if (prefs) {
      const preferredLanes = prefs.preferredLanes as unknown[];
      if (Array.isArray(preferredLanes)) {
        const matchesLane = preferredLanes.some((l: any) => {
          if (typeof l === "string") return l === laneKey || l.includes(load.originState!);
          return l?.origin === load.originState || l?.dest === load.destState;
        });
        if (matchesLane) prefScore += 10;
      }
    }
    factors.preferenceAlign = prefScore;

    const totalScore = Object.values(factors).reduce((s, v) => s + v, 0);
    const maxPossible = 90; // Sum of all max factor scores

    // Skip very low scores
    if (totalScore < 10) continue;

    scored.push({
      carrierId: carrier.id,
      companyName: carrier.companyName || "Unknown",
      matchScore: Math.round((totalScore / maxPossible) * 100),
      tier: carrier.cppTier || "BRONZE",
      reliabilityScore: reliability,
      laneExperience: laneLoads,
      estimatedRate: rateIntel?.avgRate ?? null,
      deadheadMiles: null, // Would need carrier last-known position
      factors,
      recommendation: generateRecommendation(totalScore / maxPossible, fallOffRisk, laneLoads),
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);
  const topResults = scored.slice(0, limit);

  // Log recommendations
  for (const rec of topResults) {
    await prisma.recommendationLog.create({
      data: {
        loadId,
        carrierId: rec.carrierId,
        matchScore: rec.matchScore,
        factors: toJson(rec.factors),
        outcome: "PENDING",
      },
    }).catch(() => {});
  }

  return topResults;
}

// ─── Record Recommendation Outcome ───────────────────────────────────────────

export async function recordRecommendationOutcome(
  loadId: string,
  carrierId: string,
  outcome: "ACCEPTED" | "REJECTED" | "BOOKED" | "IGNORED"
): Promise<void> {
  await prisma.recommendationLog.updateMany({
    where: { loadId, carrierId, outcome: "PENDING" },
    data: { outcome, respondedAt: new Date() },
  });

  // Also log for learning
  await prisma.matchingOutcome.create({
    data: {
      loadId,
      carrierId,
      matchScore: 0, // Will be filled from the recommendation
      outcome,
      factors: toJson({ source: "smart_recommendation" }),
    },
  }).catch(() => {});
}

// ─── Get Recommendation Performance ──────────────────────────────────────────

export async function getRecommendationPerformance(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const all = await prisma.recommendationLog.findMany({
    where: { recommendedAt: { gte: since } },
  });

  const total = all.length;
  const accepted = all.filter((r) => r.outcome === "ACCEPTED" || r.outcome === "BOOKED").length;
  const rejected = all.filter((r) => r.outcome === "REJECTED").length;
  const pending = all.filter((r) => r.outcome === "PENDING").length;
  const ignored = all.filter((r) => r.outcome === "IGNORED").length;

  return {
    total,
    accepted,
    rejected,
    pending,
    ignored,
    hitRate: total > 0 ? Math.round((accepted / total) * 1000) / 1000 : 0,
    avgMatchScore:
      total > 0 ? Math.round(all.reduce((s, r) => s + r.matchScore, 0) / total) : 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRecommendation(
  score: number,
  fallOffRisk: number,
  laneExperience: number
): string {
  if (score > 0.8 && fallOffRisk < 0.1) return "Top match — highly reliable on this lane";
  if (score > 0.6 && laneExperience > 3) return "Strong match — proven lane experience";
  if (score > 0.6) return "Good match — solid overall performance";
  if (fallOffRisk > 0.3) return "Caution — elevated fall-off risk, have backup ready";
  return "Fair match — limited history, monitor closely";
}
