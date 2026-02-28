import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

export interface CsaBasicScores {
  unsafeDriving: number | null;
  crashIndicator: number | null;
  hoursOfService: number | null;
  vehicleMaintenance: number | null;
  controlledSubstances: number | null;
  driverFitness: number | null;
  hazardousMaterials: number | null;
  oosRateVehicle: number | null;
  oosRateDriver: number | null;
  totalInspections: number | null;
  totalCrashes: number | null;
  fetchedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;

function emptyScores(): CsaBasicScores {
  return {
    unsafeDriving: null,
    crashIndicator: null,
    hoursOfService: null,
    vehicleMaintenance: null,
    controlledSubstances: null,
    driverFitness: null,
    hazardousMaterials: null,
    oosRateVehicle: null,
    oosRateDriver: null,
    totalInspections: null,
    totalCrashes: null,
    fetchedAt: new Date().toISOString(),
  };
}

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── QCMobile API ────────────────────────────────────────────

interface QcMobileContent {
  carrier?: {
    safetyRating?: string;
    oosRateVehicle?: number;
    oosRateDriver?: number;
    inspectionTotal?: number;
    crashTotal?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function fetchQcMobileData(dotNumber: string): Promise<Partial<CsaBasicScores>> {
  const webKey = process.env.FMCSA_WEB_KEY;
  if (!webKey) {
    console.warn("[CSA] FMCSA_WEB_KEY not set — skipping QCMobile API call");
    return {};
  }

  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${webKey}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.warn(`[CSA] QCMobile API returned ${res.status} for DOT#${dotNumber}`);
      return {};
    }

    const data = (await res.json()) as QcMobileContent;
    const carrier = data?.carrier;
    if (!carrier) return {};

    return {
      oosRateVehicle: safeNum(carrier.oosRateVehicle),
      oosRateDriver: safeNum(carrier.oosRateDriver),
      totalInspections: safeNum(carrier.inspectionTotal),
      totalCrashes: safeNum(carrier.crashTotal),
    };
  } catch (err) {
    console.warn(`[CSA] QCMobile API error for DOT#${dotNumber}:`, (err as Error).message);
    return {};
  }
}

// ─── SMS BASIC Percentiles ───────────────────────────────────

interface SmsBasicEntry {
  BasicsDescription?: string;
  Percentile?: number;
  [key: string]: unknown;
}

interface SmsBasicResponse {
  BASICs?: SmsBasicEntry[];
  [key: string]: unknown;
}

const BASIC_KEY_MAP: Record<string, keyof CsaBasicScores> = {
  "unsafe driving": "unsafeDriving",
  "crash indicator": "crashIndicator",
  "hours-of-service compliance": "hoursOfService",
  "hos compliance": "hoursOfService",
  "vehicle maintenance": "vehicleMaintenance",
  "controlled substances/alcohol": "controlledSubstances",
  "controlled substances": "controlledSubstances",
  "driver fitness": "driverFitness",
  "hazardous materials compliance": "hazardousMaterials",
  "hazardous materials": "hazardousMaterials",
};

async function fetchSmsBasicPercentiles(dotNumber: string): Promise<Partial<CsaBasicScores>> {
  const url = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dotNumber}/BASIC/Results.aspx?format=json`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.warn(`[CSA] SMS BASIC endpoint returned ${res.status} for DOT#${dotNumber}`);
      return {};
    }

    // The endpoint may return HTML instead of JSON — detect and bail
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      console.warn(`[CSA] SMS BASIC endpoint returned non-JSON content-type for DOT#${dotNumber}`);
      return {};
    }

    const data = (await res.json()) as SmsBasicResponse;
    if (!data?.BASICs || !Array.isArray(data.BASICs)) return {};

    const scores: Partial<CsaBasicScores> = {};

    for (const entry of data.BASICs) {
      const desc = (entry.BasicsDescription || "").toLowerCase().trim();
      const key = BASIC_KEY_MAP[desc];
      if (key) {
        (scores as Record<string, number | null>)[key] = safeNum(entry.Percentile);
      }
    }

    return scores;
  } catch (err) {
    console.warn(`[CSA] SMS BASIC endpoint error for DOT#${dotNumber}:`, (err as Error).message);
    return {};
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Fetch all CSA BASIC percentile scores for a carrier by DOT number.
 * Combines QCMobile API data with SMS BASIC percentile data.
 * Never throws — returns null-filled scores on any error.
 */
export async function fetchCsaBasicScores(dotNumber: string): Promise<CsaBasicScores> {
  const scores = emptyScores();

  try {
    // Fetch from both sources in parallel
    const [qcData, smsData] = await Promise.all([
      fetchQcMobileData(dotNumber),
      fetchSmsBasicPercentiles(dotNumber),
    ]);

    // Merge: SMS percentiles take precedence for BASIC scores,
    // QCMobile provides OOS rates, inspections, crashes
    Object.assign(scores, qcData, smsData);
    scores.fetchedAt = new Date().toISOString();
  } catch (err) {
    console.error(`[CSA] Unexpected error fetching scores for DOT#${dotNumber}:`, (err as Error).message);
  }

  return scores;
}

/**
 * Fetch CSA scores for a specific carrier and persist to CarrierProfile.fmcsaBasicScores.
 */
export async function updateCarrierCsaScores(carrierId: string): Promise<CsaBasicScores | null> {
  try {
    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: carrierId },
      select: { dotNumber: true },
    });

    if (!carrier?.dotNumber) {
      console.warn(`[CSA] Carrier ${carrierId} has no DOT number — skipping`);
      return null;
    }

    const scores = await fetchCsaBasicScores(carrier.dotNumber);

    await prisma.carrierProfile.update({
      where: { id: carrierId },
      data: {
        fmcsaBasicScores: scores as any,
        fmcsaLastChecked: new Date(),
      },
    });

    console.log(`[CSA] Updated CSA scores for carrier ${carrierId} (DOT#${carrier.dotNumber})`);
    return scores;
  } catch (err) {
    console.error(`[CSA] Failed to update carrier ${carrierId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Batch-update CSA scores for all APPROVED carriers that have a DOT number.
 * Processes sequentially with a small delay to avoid hammering the FMCSA API.
 */
export async function batchUpdateCsaScores(): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  try {
    const carriers = await prisma.carrierProfile.findMany({
      where: {
        status: "APPROVED",
        dotNumber: { not: null },
      },
      select: { id: true, dotNumber: true },
    });

    console.log(`[CSA] Batch update starting for ${carriers.length} carriers`);

    for (const carrier of carriers) {
      const result = await updateCarrierCsaScores(carrier.id);
      if (result) {
        updated++;
      } else {
        failed++;
      }

      // Rate-limit: 500ms between requests to be respectful to FMCSA servers
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`[CSA] Batch update complete: ${updated} updated, ${failed} failed`);
  } catch (err) {
    console.error(`[CSA] Batch update error:`, (err as Error).message);
  }

  return { updated, failed };
}
