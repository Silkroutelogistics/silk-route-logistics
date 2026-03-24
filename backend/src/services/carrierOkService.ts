/**
 * CarrierOk API Integration Service
 * Provides 300+ fields per carrier via REST API for enhanced carrier intelligence.
 * Docs: https://docs.carrier-ok.com
 */

const BASE_URL = "https://api.carrier-ok.com/v1";
const TIMEOUT_MS = 10_000;

// ─── In-Memory Cache (1-hour TTL) ────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000;
const cache = new Map<string, { data: any; ts: number }>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data as T;
}

function cacheSet(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now - v.ts > CACHE_TTL) cache.delete(k); }
  }
}

// ─── Types ────────────────────────────────────────────────────────
export interface CarrierOkProfile {
  dotNumber: string;
  mcNumber: string | null;
  legalName: string;
  dbaName: string | null;
  operatingStatus: string;
  authorityStatus: string;
  insuranceCoverage: Record<string, any>;
  safetyRecord: Record<string, any>;
  equipment: Record<string, any>;
  contactInfo: Record<string, any>;
  inspections: Record<string, any>;
  crashes: Record<string, any>;
  [key: string]: any; // 300+ fields
}

export interface CarrierOkScore {
  dotNumber: string;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  numericScore: number;
  riskFactors: string[];
  strengths: string[];
  lastUpdated: string;
}

export interface CarrierOkSearchResult {
  dotNumber: string;
  legalName: string;
  mcNumber: string | null;
  operatingStatus: string;
  city: string | null;
  state: string | null;
}

// ─── HTTP Helper ──────────────────────────────────────────────────
async function carrierOkFetch<T>(path: string, cacheKey: string): Promise<T | null> {
  const cached = cacheGet<T>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.CARRIER_OK_API_KEY;
  if (!apiKey) {
    console.warn("[CarrierOk] CARRIER_OK_API_KEY not configured — skipping request");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "User-Agent": "SilkRouteLogistics/1.0",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 404) {
      console.warn(`[CarrierOk] Not found: ${path}`);
      return null;
    }

    if (response.status === 429) {
      console.warn("[CarrierOk] Rate limited — backing off");
      return null;
    }

    if (!response.ok) {
      console.error(`[CarrierOk] HTTP ${response.status} for ${path}`);
      return null;
    }

    const data = (await response.json()) as T;
    cacheSet(cacheKey, data);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      console.error(`[CarrierOk] Timeout (${TIMEOUT_MS}ms) for ${path}`);
    } else {
      console.error(`[CarrierOk] Request error for ${path}:`, msg);
    }
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────

/** Lookup carrier by DOT number — returns full 300+ field profile */
export async function lookupCarrier(dotNumber: string): Promise<CarrierOkProfile | null> {
  return carrierOkFetch<CarrierOkProfile>(
    `/carriers/dot/${encodeURIComponent(dotNumber)}`,
    `cok:dot:${dotNumber}`
  );
}

/** Lookup carrier by MC number */
export async function lookupByMC(mcNumber: string): Promise<CarrierOkProfile | null> {
  const mc = mcNumber.replace(/^MC-?/i, "").trim();
  return carrierOkFetch<CarrierOkProfile>(
    `/carriers/mc/${encodeURIComponent(mc)}`,
    `cok:mc:${mc}`
  );
}

/** Search carriers by name, DOT, MC, or other query */
export async function searchCarriers(query: string): Promise<CarrierOkSearchResult[]> {
  const results = await carrierOkFetch<CarrierOkSearchResult[]>(
    `/carriers/search?q=${encodeURIComponent(query)}&limit=20`,
    `cok:search:${query}`
  );
  return results || [];
}

/** Get carrier safety score (A-F grade) with risk factors */
export async function getCarrierScore(dotNumber: string): Promise<CarrierOkScore | null> {
  return carrierOkFetch<CarrierOkScore>(
    `/carriers/dot/${encodeURIComponent(dotNumber)}/score`,
    `cok:score:${dotNumber}`
  );
}
