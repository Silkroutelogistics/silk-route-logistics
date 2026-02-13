import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

/**
 * Carrier Preference Service — Manages and auto-learns carrier preferences.
 *
 * Stores explicit preferences (lanes, regions, load types, pay terms)
 * and auto-learns implicit preferences from carrier behavior patterns.
 *
 * COMPETITIVE EDGE: Intelligent preference matching improves carrier satisfaction.
 */

const toJson = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

interface PreferencesInput {
  carrierId: string;
  preferredLanes?: Array<{ origin: string; dest: string }>;
  preferredRegions?: string[];
  avoidRegions?: string[];
  preferredLoadTypes?: string[];
  minRatePerMile?: number;
  maxDeadheadMiles?: number;
  preferredPayTerms?: string;
  homeBaseLat?: number;
  homeBaseLng?: number;
  typicalRadiusMiles?: number;
  notifyMethod?: string;
  notifyFrequency?: string;
}

// ─── Get Preferences ─────────────────────────────────────────────────────────

export async function getCarrierPreferences(carrierId: string) {
  const prefs = await prisma.carrierPreferences.findUnique({
    where: { carrierId },
  });

  if (!prefs) {
    return {
      carrierId,
      preferredLanes: [],
      preferredRegions: [],
      avoidRegions: [],
      preferredLoadTypes: [],
      minRatePerMile: null,
      maxDeadheadMiles: 150,
      preferredPayTerms: null,
      homeBaseLat: null,
      homeBaseLng: null,
      typicalRadiusMiles: 500,
      notifyMethod: "EMAIL",
      notifyFrequency: "IMMEDIATE",
      autoLearned: {},
      isNew: true,
    };
  }

  return {
    ...prefs,
    preferredLanes: prefs.preferredLanes as unknown[],
    preferredRegions: prefs.preferredRegions as unknown[],
    avoidRegions: prefs.avoidRegions as unknown[],
    preferredLoadTypes: prefs.preferredLoadTypes as unknown[],
    autoLearned: prefs.autoLearned as Record<string, unknown>,
    isNew: false,
  };
}

// ─── Update Preferences ──────────────────────────────────────────────────────

export async function updateCarrierPreferences(input: PreferencesInput) {
  return prisma.carrierPreferences.upsert({
    where: { carrierId: input.carrierId },
    create: {
      carrierId: input.carrierId,
      preferredLanes: toJson(input.preferredLanes ?? []),
      preferredRegions: toJson(input.preferredRegions ?? []),
      avoidRegions: toJson(input.avoidRegions ?? []),
      preferredLoadTypes: toJson(input.preferredLoadTypes ?? []),
      minRatePerMile: input.minRatePerMile ?? null,
      maxDeadheadMiles: input.maxDeadheadMiles ?? 150,
      preferredPayTerms: input.preferredPayTerms ?? null,
      homeBaseLat: input.homeBaseLat ?? null,
      homeBaseLng: input.homeBaseLng ?? null,
      typicalRadiusMiles: input.typicalRadiusMiles ?? 500,
      notifyMethod: input.notifyMethod ?? "EMAIL",
      notifyFrequency: input.notifyFrequency ?? "IMMEDIATE",
      lastUpdatedBy: "CARRIER",
    },
    update: {
      ...(input.preferredLanes ? { preferredLanes: toJson(input.preferredLanes) } : {}),
      ...(input.preferredRegions ? { preferredRegions: toJson(input.preferredRegions) } : {}),
      ...(input.avoidRegions ? { avoidRegions: toJson(input.avoidRegions) } : {}),
      ...(input.preferredLoadTypes ? { preferredLoadTypes: toJson(input.preferredLoadTypes) } : {}),
      ...(input.minRatePerMile !== undefined ? { minRatePerMile: input.minRatePerMile } : {}),
      ...(input.maxDeadheadMiles !== undefined ? { maxDeadheadMiles: input.maxDeadheadMiles } : {}),
      ...(input.preferredPayTerms ? { preferredPayTerms: input.preferredPayTerms } : {}),
      ...(input.homeBaseLat !== undefined ? { homeBaseLat: input.homeBaseLat } : {}),
      ...(input.homeBaseLng !== undefined ? { homeBaseLng: input.homeBaseLng } : {}),
      ...(input.typicalRadiusMiles !== undefined ? { typicalRadiusMiles: input.typicalRadiusMiles } : {}),
      ...(input.notifyMethod ? { notifyMethod: input.notifyMethod } : {}),
      ...(input.notifyFrequency ? { notifyFrequency: input.notifyFrequency } : {}),
      lastUpdatedBy: "CARRIER",
    },
  });
}

// ─── Auto-Learn Preferences from Behavior ────────────────────────────────────

export async function autoLearnPreferences(carrierId: string): Promise<{
  updated: boolean;
  learned: Record<string, unknown>;
}> {
  // Get carrier's completed loads
  const loads = await prisma.load.findMany({
    where: {
      carrierId,
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
    },
    select: {
      originState: true,
      destState: true,
      equipmentType: true,
      carrierRate: true,
      distance: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (loads.length < 3) return { updated: false, learned: {} };

  // Analyze lane patterns
  const laneCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const equipCounts = new Map<string, number>();
  const rpms: number[] = [];

  for (const load of loads) {
    if (load.originState && load.destState) {
      const key = `${load.originState}:${load.destState}`;
      laneCounts.set(key, (laneCounts.get(key) ?? 0) + 1);
      regionCounts.set(load.originState, (regionCounts.get(load.originState) ?? 0) + 1);
      regionCounts.set(load.destState, (regionCounts.get(load.destState) ?? 0) + 1);
    }
    if (load.equipmentType) {
      equipCounts.set(load.equipmentType, (equipCounts.get(load.equipmentType) ?? 0) + 1);
    }
    if (load.carrierRate && load.distance && load.distance > 0) {
      rpms.push(load.carrierRate / load.distance);
    }
  }

  // Top lanes
  const topLanes = [...laneCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lane]) => {
      const [origin, dest] = lane.split(":");
      return { origin, dest };
    });

  // Top regions
  const topRegions = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([region]) => region);

  // Top equipment
  const topEquip = [...equipCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([equip]) => equip);

  // Average RPM
  const avgRpm = rpms.length > 0 ? rpms.reduce((s, r) => s + r, 0) / rpms.length : null;

  const autoLearned = {
    topLanes,
    topRegions,
    topEquipment: topEquip,
    avgRatePerMile: avgRpm ? Math.round(avgRpm * 100) / 100 : null,
    totalLoadsAnalyzed: loads.length,
    learnedAt: new Date().toISOString(),
  };

  // Update the auto-learned field
  await prisma.carrierPreferences.upsert({
    where: { carrierId },
    create: {
      carrierId,
      autoLearned: toJson(autoLearned),
      lastUpdatedBy: "SYSTEM",
    },
    update: {
      autoLearned: toJson(autoLearned),
      lastUpdatedBy: "SYSTEM",
    },
  });

  return { updated: true, learned: autoLearned };
}

// ─── Check if Load Matches Carrier Preferences ──────────────────────────────

export async function doesLoadMatchPreferences(
  carrierId: string,
  load: { originState: string; destState: string; equipmentType: string; ratePerMile?: number }
): Promise<{ matches: boolean; score: number; reasons: string[] }> {
  const prefs = await getCarrierPreferences(carrierId);
  const reasons: string[] = [];
  let score = 50; // Base score

  // Check avoid regions
  const avoidRegions = prefs.avoidRegions as string[];
  if (avoidRegions?.includes(load.originState) || avoidRegions?.includes(load.destState)) {
    return { matches: false, score: 0, reasons: ["Load is in an avoided region"] };
  }

  // Check preferred regions
  const preferredRegions = prefs.preferredRegions as string[];
  if (preferredRegions?.length > 0) {
    if (preferredRegions.includes(load.originState) || preferredRegions.includes(load.destState)) {
      score += 20;
      reasons.push("Matches preferred region");
    }
  }

  // Check preferred lanes
  const preferredLanes = prefs.preferredLanes as Array<{ origin: string; dest: string }>;
  if (Array.isArray(preferredLanes) && preferredLanes.length > 0) {
    const matchesLane = preferredLanes.some(
      (l) => l.origin === load.originState && l.dest === load.destState
    );
    if (matchesLane) {
      score += 25;
      reasons.push("Matches preferred lane");
    }
  }

  // Check rate
  if (prefs.minRatePerMile && load.ratePerMile) {
    if (load.ratePerMile >= prefs.minRatePerMile) {
      score += 10;
      reasons.push("Meets minimum rate");
    } else {
      score -= 15;
      reasons.push("Below minimum rate");
    }
  }

  return { matches: score >= 40, score: Math.min(100, Math.max(0, score)), reasons };
}
