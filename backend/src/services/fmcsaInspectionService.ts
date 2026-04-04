/**
 * FMCSA Inspection & Violation Service
 * Fetches inspection summary data from FMCSA carrier response and
 * detailed inspection records from the inspections endpoint.
 */

import { env } from "../config/env";
import { verifyCarrierWithFMCSA } from "./fmcsaService";

// ── Cache (24h for detailed inspections) ──
const INSPECTION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const inspectionCache = new Map<string, { data: DetailedInspection[]; ts: number }>();

function cacheGet(key: string): DetailedInspection[] | null {
  const entry = inspectionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > INSPECTION_CACHE_TTL) {
    inspectionCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: DetailedInspection[]) {
  inspectionCache.set(key, { data, ts: Date.now() });
  if (inspectionCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of inspectionCache) {
      if (now - v.ts > INSPECTION_CACHE_TTL) inspectionCache.delete(k);
    }
  }
}

// ── Types ──

export interface InspectionSummary {
  driverInspections: number;
  driverOOS: number;
  driverOOSRate: number;
  driverOOSNationalAvg: number;
  vehicleInspections: number;
  vehicleOOS: number;
  vehicleOOSRate: number;
  vehicleOOSNationalAvg: number;
  hazmatInspections: number;
  hazmatOOS: number;
  hazmatOOSRate: number;
  crashTotal: number;
  fatalCrashes: number;
  injuryCrashes: number;
  towawayCrashes: number;
  betterThanAverage: { driver: boolean; vehicle: boolean };
}

export interface InspectionViolation {
  code: string;
  description: string;
  oos: boolean;
  severity: number | null;
}

export interface DetailedInspection {
  inspectionDate: string;
  reportNumber: string;
  state: string;
  level: number;
  type: string;
  timeWeight: number | null;
  placarableHmVeh: boolean;
  driverOOS: boolean;
  vehicleOOS: boolean;
  violations: InspectionViolation[];
}

// National OOS averages (FMCSA 2024 published averages)
const NATIONAL_AVG = {
  driverOOS: 5.51,
  vehicleOOS: 20.72,
};

/**
 * Extract inspection summary from the main FMCSA carrier API response.
 * The raw FMCSA carrier response includes driverInsp, vehicleInsp, crashTotal, etc.
 */
export async function getInspectionSummary(dotNumber: string): Promise<InspectionSummary> {
  const webKey = env.FMCSA_WEB_KEY;
  let carrier: Record<string, any> | null = null;

  // Fetch raw FMCSA carrier data (includes inspection stats)
  if (webKey) {
    try {
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${webKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "SilkRouteLogistics/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json() as Record<string, any>;
        carrier = data?.content?.carrier || null;
      }
    } catch (err) {
      console.error(`[FMCSA Inspection] Error fetching carrier data for DOT ${dotNumber}:`, err instanceof Error ? err.message : err);
    }
  }

  if (!carrier) {
    // Fallback: use verifyCarrierWithFMCSA (cached), but it doesn't have inspection fields
    // Return zeros
    return {
      driverInspections: 0, driverOOS: 0, driverOOSRate: 0, driverOOSNationalAvg: NATIONAL_AVG.driverOOS,
      vehicleInspections: 0, vehicleOOS: 0, vehicleOOSRate: 0, vehicleOOSNationalAvg: NATIONAL_AVG.vehicleOOS,
      hazmatInspections: 0, hazmatOOS: 0, hazmatOOSRate: 0,
      crashTotal: 0, fatalCrashes: 0, injuryCrashes: 0, towawayCrashes: 0,
      betterThanAverage: { driver: true, vehicle: true },
    };
  }

  const driverInsp = Number(carrier.driverInsp) || 0;
  const driverOosInsp = Number(carrier.driverOosInsp) || 0;
  const driverOosRate = Number(carrier.driverOosRate) || (driverInsp > 0 ? (driverOosInsp / driverInsp) * 100 : 0);

  const vehicleInsp = Number(carrier.vehicleInsp) || 0;
  const vehicleOosInsp = Number(carrier.vehicleOosInsp) || 0;
  const vehicleOosRate = Number(carrier.vehicleOosRate) || (vehicleInsp > 0 ? (vehicleOosInsp / vehicleInsp) * 100 : 0);

  const hazmatInsp = Number(carrier.hazmatInsp) || 0;
  const hazmatOosInsp = Number(carrier.hazmatOosInsp) || 0;
  const hazmatOosRate = Number(carrier.hazmatOosRate) || (hazmatInsp > 0 ? (hazmatOosInsp / hazmatInsp) * 100 : 0);

  const crashTotal = Number(carrier.crashTotal) || 0;
  const fatalCrash = Number(carrier.fatalCrash) || 0;
  const injCrash = Number(carrier.injCrash) || 0;
  const towawayCrash = Number(carrier.towawayCrash) || 0;

  return {
    driverInspections: driverInsp,
    driverOOS: driverOosInsp,
    driverOOSRate: Math.round(driverOosRate * 100) / 100,
    driverOOSNationalAvg: NATIONAL_AVG.driverOOS,
    vehicleInspections: vehicleInsp,
    vehicleOOS: vehicleOosInsp,
    vehicleOOSRate: Math.round(vehicleOosRate * 100) / 100,
    vehicleOOSNationalAvg: NATIONAL_AVG.vehicleOOS,
    hazmatInspections: hazmatInsp,
    hazmatOOS: hazmatOosInsp,
    hazmatOOSRate: Math.round(hazmatOosRate * 100) / 100,
    crashTotal,
    fatalCrashes: fatalCrash,
    injuryCrashes: injCrash,
    towawayCrashes: towawayCrash,
    betterThanAverage: {
      driver: driverOosRate <= NATIONAL_AVG.driverOOS,
      vehicle: vehicleOosRate <= NATIONAL_AVG.vehicleOOS,
    },
  };
}

/**
 * Fetch detailed inspection records from FMCSA inspections endpoint.
 * Cached for 24 hours.
 */
export async function getDetailedInspections(dotNumber: string): Promise<DetailedInspection[]> {
  // Check cache
  const cached = cacheGet(`insp:${dotNumber}`);
  if (cached) return cached;

  const webKey = env.FMCSA_WEB_KEY;
  if (!webKey) {
    console.warn("[FMCSA Inspection] No FMCSA_WEB_KEY configured — cannot fetch detailed inspections");
    return [];
  }

  try {
    const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}/inspections?webKey=${webKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SilkRouteLogistics/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[FMCSA Inspection] HTTP ${response.status} fetching inspections for DOT ${dotNumber}`);
      return [];
    }

    const data = await response.json() as Record<string, any>;
    const inspections: DetailedInspection[] = [];

    // FMCSA returns { content: { inspections: [...] } } or similar structure
    const rawInspections = Array.isArray(data?.content?.inspections)
      ? data.content.inspections
      : Array.isArray(data?.content)
        ? data.content
        : [];

    for (const raw of rawInspections) {
      const violations: InspectionViolation[] = [];
      const rawViolations = Array.isArray(raw.violations) ? raw.violations : [];
      for (const v of rawViolations) {
        violations.push({
          code: v.code || v.violationCode || "",
          description: v.description || v.violationDescription || "",
          oos: v.oos === "Y" || v.outOfService === "Y" || v.oos === true,
          severity: v.severityWeight ? Number(v.severityWeight) : null,
        });
      }

      inspections.push({
        inspectionDate: raw.inspectionDate || raw.inspection_date || "",
        reportNumber: raw.reportNumber || raw.report_number || "",
        state: raw.inspState || raw.state || "",
        level: Number(raw.inspLevel || raw.level) || 0,
        type: raw.inspType || raw.type || "Unknown",
        timeWeight: raw.timeWeight ? Number(raw.timeWeight) : null,
        placarableHmVeh: raw.placarableHmVeh === "Y" || raw.placarableHmVeh === true,
        driverOOS: raw.driverOos === "Y" || raw.driverOos === true,
        vehicleOOS: raw.vehicleOos === "Y" || raw.vehicleOos === true,
        violations,
      });
    }

    // Sort by date descending
    inspections.sort((a, b) => {
      const da = new Date(a.inspectionDate).getTime() || 0;
      const db = new Date(b.inspectionDate).getTime() || 0;
      return db - da;
    });

    cacheSet(`insp:${dotNumber}`, inspections);
    return inspections;
  } catch (err) {
    console.error(`[FMCSA Inspection] Error fetching inspections for DOT ${dotNumber}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Get full inspection data (summary + detailed records).
 */
export async function getFullInspectionData(dotNumber: string) {
  const [summary, inspections] = await Promise.all([
    getInspectionSummary(dotNumber),
    getDetailedInspections(dotNumber),
  ]);

  return { summary, inspections };
}
