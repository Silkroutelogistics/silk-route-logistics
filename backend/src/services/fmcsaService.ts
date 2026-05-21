/**
 * FMCSA SAFER Web API Integration
 * Validates carrier DOT number against the federal database.
 * API docs: https://mobile.fmcsa.dot.gov/qc/services/carriers
 *
 * Note: For production, register for a free FMCSA web key at:
 * https://mobile.fmcsa.dot.gov/QCDevsite/
 */

import { env } from "../config/env";
import { log } from "../lib/logger";
import type { FMCSAAuthorityResult } from "./fmcsaTypes";

// In-memory cache: DOT/MC → result, expires after 1 hour
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { data: FMCSACarrierResult; ts: number }>();

function cacheGet(key: string): FMCSACarrierResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key: string, data: FMCSACarrierResult) {
  cache.set(key, { data, ts: Date.now() });
  // Evict old entries if cache gets too large
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now - v.ts > CACHE_TTL) cache.delete(k); }
  }
}

// Parallel cache for authority-endpoint results — v3.8.ahj (Item 182,
// sprint 1 of 5). Reuses the same 1-hour TTL the rest of the service
// uses for carrier-data lookups. Authority data changes slowly (a GRANT
// timestamp never moves; only revocation/reinstatement entries are
// added), so 1h is conservative — under-cache cost is negligible. The
// epic-design assumption was 24h cache; the existing pattern is 1h, and
// per §3.3 atomic-commit + Pattern 6 sub-rule c (authoritative-source
// verification: real code beats intent docs) we inherit the existing
// TTL rather than introducing a per-key TTL refactor in v3.8.ahj.
const authorityCache = new Map<string, { data: FMCSAAuthorityResult; ts: number }>();

function authorityCacheGet(dotNumber: string): FMCSAAuthorityResult | null {
  const entry = authorityCache.get(dotNumber);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { authorityCache.delete(dotNumber); return null; }
  return entry.data;
}

function authorityCacheSet(dotNumber: string, data: FMCSAAuthorityResult) {
  authorityCache.set(dotNumber, { data, ts: Date.now() });
  if (authorityCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of authorityCache) { if (now - v.ts > CACHE_TTL) authorityCache.delete(k); }
  }
}

interface FMCSACarrierResult {
  verified: boolean;
  legalName: string | null;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string;
  operatingStatus: string | null;
  entityType: string | null;
  safetyRating: string | null;
  insuranceOnFile: boolean;
  outOfServiceDate: string | null;
  totalDrivers: number | null;
  totalPowerUnits: number | null;
  phyStreet: string | null;
  phyCity: string | null;
  phyState: string | null;
  phyZipcode: string | null;
  phone: string | null;
  mcs150Outdated: boolean | null;
  // Inspection summary fields
  driverInsp: number | null;
  driverOosInsp: number | null;
  driverOosRate: number | null;
  vehicleInsp: number | null;
  vehicleOosInsp: number | null;
  vehicleOosRate: number | null;
  hazmatInsp: number | null;
  hazmatOosInsp: number | null;
  hazmatOosRate: number | null;
  crashTotal: number | null;
  fatalCrash: number | null;
  injCrash: number | null;
  towawayCrash: number | null;
  errors: string[];
}

function parseCarrierResponse(data: Record<string, any>, dotNumber: string): FMCSACarrierResult {
  const carrier = data?.content?.carrier;

  if (!carrier) {
    return {
      verified: false, legalName: null, dbaName: null, mcNumber: null,
      dotNumber, operatingStatus: null, entityType: null, safetyRating: null,
      insuranceOnFile: false, outOfServiceDate: null, totalDrivers: null,
      totalPowerUnits: null, phyStreet: null, phyCity: null, phyState: null,
      phyZipcode: null, phone: null, mcs150Outdated: null,
      driverInsp: null, driverOosInsp: null, driverOosRate: null,
      vehicleInsp: null, vehicleOosInsp: null, vehicleOosRate: null,
      hazmatInsp: null, hazmatOosInsp: null, hazmatOosRate: null,
      crashTotal: null, fatalCrash: null, injCrash: null, towawayCrash: null,
      errors: ["Carrier not found in FMCSA database"],
    };
  }

  const mcMatch = carrier.mcNumber ? `MC-${carrier.mcNumber}` : null;

  return {
    verified: carrier.allowedToOperate === "Y",
    legalName: carrier.legalName || null,
    dbaName: carrier.dbaName || null,
    mcNumber: mcMatch,
    dotNumber: carrier.dotNumber?.toString() || dotNumber,
    operatingStatus: carrier.allowedToOperate === "Y" ? "AUTHORIZED" : "NOT AUTHORIZED",
    entityType: carrier.carrierOperation?.carrierOperationDesc || null,
    safetyRating: carrier.safetyRating || null,
    insuranceOnFile: !!(carrier.bipdInsuranceOnFile && carrier.bipdInsuranceOnFile !== "0" && carrier.bipdInsuranceOnFile !== "N"),
    outOfServiceDate: carrier.oosDate || null,
    totalDrivers: carrier.totalDrivers || null,
    totalPowerUnits: carrier.totalPowerUnits || null,
    phyStreet: carrier.phyStreet || null,
    phyCity: carrier.phyCity || null,
    phyState: carrier.phyState || null,
    phyZipcode: carrier.phyZipcode || null,
    phone: carrier.telephone || null,
    mcs150Outdated: carrier.mcs150Outdated === "Y" ? true : carrier.mcs150Outdated === "N" ? false : null,
    // Inspection summary fields from FMCSA response
    driverInsp: carrier.driverInsp != null ? Number(carrier.driverInsp) : null,
    driverOosInsp: carrier.driverOosInsp != null ? Number(carrier.driverOosInsp) : null,
    driverOosRate: carrier.driverOosRate != null ? Number(carrier.driverOosRate) : null,
    vehicleInsp: carrier.vehicleInsp != null ? Number(carrier.vehicleInsp) : null,
    vehicleOosInsp: carrier.vehicleOosInsp != null ? Number(carrier.vehicleOosInsp) : null,
    vehicleOosRate: carrier.vehicleOosRate != null ? Number(carrier.vehicleOosRate) : null,
    hazmatInsp: carrier.hazmatInsp != null ? Number(carrier.hazmatInsp) : null,
    hazmatOosInsp: carrier.hazmatOosInsp != null ? Number(carrier.hazmatOosInsp) : null,
    hazmatOosRate: carrier.hazmatOosRate != null ? Number(carrier.hazmatOosRate) : null,
    crashTotal: carrier.crashTotal != null ? Number(carrier.crashTotal) : null,
    fatalCrash: carrier.fatalCrash != null ? Number(carrier.fatalCrash) : null,
    injCrash: carrier.injCrash != null ? Number(carrier.injCrash) : null,
    towawayCrash: carrier.towawayCrash != null ? Number(carrier.towawayCrash) : null,
    errors: [],
  };
}

const FMCSA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "SilkRouteLogistics/1.0",
};

/** Fetch MC# from FMCSA docket-numbers endpoint (DOT → MC) */
async function fetchMcNumber(dotNumber: string, webKey: string): Promise<string | null> {
  try {
    const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}/docket-numbers?webKey=${webKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: FMCSA_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as Record<string, any>;
      const dockets = Array.isArray(data?.content) ? data.content : [];
      const mc = dockets.find((d: any) => d.prefix === "MC");
      if (mc?.docketNumber) return `MC-${mc.docketNumber}`;
    }
  } catch { /* non-critical — MC# is optional enrichment */ }
  return null;
}

/** Reverse lookup: MC# → full carrier data (MC → DOT → carrier) */
export async function lookupByMcNumber(mcNumber: string): Promise<FMCSACarrierResult> {
  // Check cache first
  const cached = cacheGet(`mc:${mcNumber}`);
  if (cached) return cached;

  const webKey = env.FMCSA_WEB_KEY;
  if (!webKey) {
    return {
      verified: false, legalName: null, dbaName: null, mcNumber: null,
      dotNumber: "", operatingStatus: "VERIFICATION_FAILED", entityType: null,
      safetyRating: null, insuranceOnFile: false, outOfServiceDate: null,
      totalDrivers: null, totalPowerUnits: null, phyStreet: null, phyCity: null,
      phyState: null, phyZipcode: null, phone: null, mcs150Outdated: null,
      driverInsp: null, driverOosInsp: null, driverOosRate: null,
      vehicleInsp: null, vehicleOosInsp: null, vehicleOosRate: null,
      hazmatInsp: null, hazmatOosInsp: null, hazmatOosRate: null,
      crashTotal: null, fatalCrash: null, injCrash: null, towawayCrash: null,
      errors: ["No FMCSA_WEB_KEY configured"],
    };
  }

  // Strip "MC-" prefix if present
  const mcNum = mcNumber.replace(/^MC-?/i, "").trim();
  if (!mcNum || !/^\d+$/.test(mcNum)) {
    return {
      verified: false, legalName: null, dbaName: null, mcNumber: null,
      dotNumber: "", operatingStatus: null, entityType: null,
      safetyRating: null, insuranceOnFile: false, outOfServiceDate: null,
      totalDrivers: null, totalPowerUnits: null, phyStreet: null, phyCity: null,
      phyState: null, phyZipcode: null, phone: null, mcs150Outdated: null,
      driverInsp: null, driverOosInsp: null, driverOosRate: null,
      vehicleInsp: null, vehicleOosInsp: null, vehicleOosRate: null,
      hazmatInsp: null, hazmatOosInsp: null, hazmatOosRate: null,
      crashTotal: null, fatalCrash: null, injCrash: null, towawayCrash: null,
      errors: ["Invalid MC number"],
    };
  }

  try {
    const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${mcNum}?webKey=${webKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { headers: FMCSA_HEADERS, signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as Record<string, any>;
      // Response is an array of carriers — take the first one
      const carriers = Array.isArray(data?.content) ? data.content : [];
      if (carriers.length > 0 && carriers[0].carrier) {
        const carrier = carriers[0].carrier;
        const dotNumber = carrier.dotNumber?.toString() || "";
        const result = parseCarrierResponse({ content: { carrier } }, dotNumber);
        result.mcNumber = `MC-${mcNum}`;
        cacheSet(`mc:${mcNumber}`, result);
        cacheSet(`dot:${dotNumber}`, result);
        return result;
      }
    }
  } catch (err) {
    log.error({ err }, `[FMCSA] MC lookup error for MC-${mcNum}:`);
  }

  return {
    verified: false, legalName: null, dbaName: null, mcNumber: `MC-${mcNum}`,
    dotNumber: "", operatingStatus: null, entityType: null,
    safetyRating: null, insuranceOnFile: false, outOfServiceDate: null,
    totalDrivers: null, totalPowerUnits: null, phyStreet: null, phyCity: null,
    phyState: null, phyZipcode: null, phone: null, mcs150Outdated: null,
    driverInsp: null, driverOosInsp: null, driverOosRate: null,
    vehicleInsp: null, vehicleOosInsp: null, vehicleOosRate: null,
    hazmatInsp: null, hazmatOosInsp: null, hazmatOosRate: null,
    crashTotal: null, fatalCrash: null, injCrash: null, towawayCrash: null,
    errors: ["Carrier not found for this MC number"],
  };
}

export async function verifyCarrierWithFMCSA(dotNumber: string): Promise<FMCSACarrierResult> {
  // Check cache first
  const cached = cacheGet(`dot:${dotNumber}`);
  if (cached) return cached;

  const webKey = env.FMCSA_WEB_KEY;
  const debugErrors: string[] = [];

  // Try keyed endpoint first (more reliable)
  if (webKey) {
    try {
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${webKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, { headers: FMCSA_HEADERS, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json() as Record<string, any>;
        const result = parseCarrierResponse(data, dotNumber);
        if (result.legalName) {
          // Enrich with MC# from docket-numbers if not already set
          if (!result.mcNumber) {
            result.mcNumber = await fetchMcNumber(dotNumber, webKey);
          }
          cacheSet(`dot:${dotNumber}`, result);
          return result;
        }
        debugErrors.push(`Keyed: 200 but no legalName in response`);
      } else {
        debugErrors.push(`Keyed: HTTP ${response.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debugErrors.push(`Keyed: ${msg}`);
      log.error({ err: msg }, `[FMCSA] Keyed request error for DOT ${dotNumber}:`);
    }
  } else {
    debugErrors.push("No FMCSA_WEB_KEY configured");
  }

  // Try public endpoint (works without key for some DOTs)
  try {
    const publicUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const publicRes = await fetch(publicUrl, { headers: FMCSA_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (publicRes.ok) {
      const data = await publicRes.json() as Record<string, any>;
      const result = parseCarrierResponse(data, dotNumber);
      if (result.legalName) { cacheSet(`dot:${dotNumber}`, result); return result; }
      debugErrors.push(`Public: 200 but no legalName`);
    } else {
      debugErrors.push(`Public: HTTP ${publicRes.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugErrors.push(`Public: ${msg}`);
  }

  // Fail safe — do NOT default to verified
  log.error(`[FMCSA] All verification attempts failed for DOT ${dotNumber}. Errors: ${debugErrors.join(" | ")}`);
  return {
    verified: false,
    legalName: null,
    dbaName: null,
    mcNumber: null,
    dotNumber,
    operatingStatus: "VERIFICATION_FAILED",
    entityType: null,
    safetyRating: null,
    insuranceOnFile: false,
    outOfServiceDate: null,
    totalDrivers: null,
    totalPowerUnits: null,
    phyStreet: null,
    phyCity: null,
    phyState: null,
    phyZipcode: null,
    phone: null,
    mcs150Outdated: null,
    driverInsp: null, driverOosInsp: null, driverOosRate: null,
    vehicleInsp: null, vehicleOosInsp: null, vehicleOosRate: null,
    hazmatInsp: null, hazmatOosInsp: null, hazmatOosRate: null,
    crashTotal: null, fatalCrash: null, injCrash: null, towawayCrash: null,
    errors: ["FMCSA API unavailable - verification failed (fail-safe)", ...debugErrors],
  };
}

// =============================================================================
// v3.8.ahj — Authority-age compliance epic, sprint 1 of 5 (Item 182).
// Authority data plumbing. NO schema write, NO gate, NO override UI in this
// sprint. Just: hit the free QCMobile authority endpoint, parse the earliest
// `original_served_date` from the carrier's operating-authority history, and
// derive `authorityAgeMonths` on read.
// =============================================================================

/**
 * Pull a date string out of an authority-history record. FMCSA QCMobile
 * responses are inconsistent on casing — some endpoints return
 * `originalServedDate`, the docs example shows `original_served_date`.
 * Tolerate both. Tolerate the alternate `dispositionServedDate` as a
 * fallback when `originalServedDate` is missing (some pre-2000 entries
 * omit the original-action date but record the disposition date).
 */
function readAuthorityServedDate(item: Record<string, unknown>): string | null {
  return (
    (item.originalServedDate as string | undefined) ||
    (item.original_served_date as string | undefined) ||
    (item.dispositionServedDate as string | undefined) ||
    (item.disposition_served_date as string | undefined) ||
    null
  );
}

/**
 * Read the action field (e.g. "GRANT", "REVOCATION", "REINSTATEMENT") off
 * an authority-history record. Casing-tolerant. We filter for
 * action === "GRANT" so revocation/reinstatement entries don't masquerade
 * as the original grant.
 */
function readAuthorityAction(item: Record<string, unknown>): string {
  return String(
    (item.originalAction as string | undefined) ||
      (item.original_action as string | undefined) ||
      ""
  ).toUpperCase();
}

/**
 * Read the authority-type field off an authority-history record. Casing-
 * tolerant. Returns e.g. "COMMON", "CONTRACT", "BROKER".
 */
function readAuthorityType(item: Record<string, unknown>): string | null {
  return (
    (item.authorityType as string | undefined) ||
      (item.authority_type as string | undefined) ||
      null
  );
}

/**
 * Calendar-month diff from `start` to `end`. Returns whole months elapsed,
 * adjusted for day-of-month — e.g. grant 2024-05-22, today 2026-05-21
 * returns 23 (not yet a full 24 months); grant 2024-05-21, today
 * 2026-05-21 returns 24. This matches the policy mental model: "the
 * carrier's authority is N months old" reads as the integer N a layperson
 * would compute on a calendar.
 */
function calendarMonthsBetween(start: Date, end: Date): number {
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  const dayAdjust = end.getDate() < start.getDate() ? -1 : 0;
  return years * 12 + months + dayAdjust;
}

/**
 * Fetch a carrier's operating-authority history from the free FMCSA
 * QCMobile authority endpoint and return the earliest GRANT date plus
 * a derived calendar-month age.
 *
 * Endpoint: `GET /qc/services/carriers/{dotNumber}/authority?webKey={key}`
 * Auth: existing `FMCSA_WEB_KEY` env var (same one the rest of the
 * service uses — no new credential needed).
 *
 * Returns `{ authorityGrantDate, authorityAgeMonths, ... }`. Never
 * throws — error states populate `errors[]` and leave date/age as null.
 * Result is cached for 1 hour in `authorityCache`.
 *
 * The eventual hard gate (v3.8.ahl) and override UI (v3.8.ahm) consume
 * `authorityAgeMonths` directly. v3.8.ahk persists `authorityGrantDate`
 * on `CarrierProfile` during registration so the gate can derive the
 * age on read without hitting FMCSA on the tender hot path.
 *
 * **Reinstatement-continuity caveat:** when a carrier's authority was
 * granted, revoked, and later reinstated, this function returns the
 * ORIGINAL grant date — meaning a freshly-reinstated carrier reads as
 * authorized for the original tenure. Per Item 182 locked decisions
 * that's a deferred AE-warning concern, not a v3.8.ahj fix.
 */
export async function getCarrierAuthority(dotNumber: string): Promise<FMCSAAuthorityResult> {
  // Check cache first
  const cached = authorityCacheGet(dotNumber);
  if (cached) return cached;

  const webKey = env.FMCSA_WEB_KEY;
  if (!webKey) {
    const fail: FMCSAAuthorityResult = {
      dotNumber,
      authorityGrantDate: null,
      authorityAgeMonths: null,
      authorityType: null,
      rawHistoryCount: 0,
      errors: ["No FMCSA_WEB_KEY configured"],
    };
    return fail;
  }

  try {
    const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}/authority?webKey=${webKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { headers: FMCSA_HEADERS, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const fail: FMCSAAuthorityResult = {
        dotNumber,
        authorityGrantDate: null,
        authorityAgeMonths: null,
        authorityType: null,
        rawHistoryCount: 0,
        errors: [`FMCSA authority endpoint HTTP ${response.status}`],
      };
      return fail;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const contentRaw = (data?.content as unknown[]) || [];
    const history: Record<string, unknown>[] = Array.isArray(contentRaw)
      ? contentRaw.map((entry) => {
          const rec = entry as Record<string, unknown>;
          // FMCSA sometimes nests under `carrierAuthority`, sometimes flat.
          return (rec.carrierAuthority as Record<string, unknown>) || rec;
        })
      : [];

    const rawHistoryCount = history.length;

    // Keep only GRANT entries with a parseable served date.
    type GrantRow = { date: Date; raw: Record<string, unknown> };
    const grants: GrantRow[] = [];
    for (const item of history) {
      if (readAuthorityAction(item) !== "GRANT") continue;
      const dateStr = readAuthorityServedDate(item);
      if (!dateStr) continue;
      const parsed = new Date(dateStr);
      if (Number.isNaN(parsed.getTime())) continue;
      grants.push({ date: parsed, raw: item });
    }

    if (grants.length === 0) {
      const result: FMCSAAuthorityResult = {
        dotNumber,
        authorityGrantDate: null,
        authorityAgeMonths: null,
        authorityType: null,
        rawHistoryCount,
        errors:
          rawHistoryCount === 0
            ? ["No authority history returned for this DOT"]
            : ["Authority history present but no GRANT entry with parseable served date"],
      };
      authorityCacheSet(dotNumber, result);
      return result;
    }

    // Earliest GRANT wins — anchor for authority-age computation.
    grants.sort((a, b) => a.date.getTime() - b.date.getTime());
    const earliest = grants[0];
    const grantDateIso = earliest.date.toISOString().slice(0, 10);
    const ageMonths = calendarMonthsBetween(earliest.date, new Date());

    const result: FMCSAAuthorityResult = {
      dotNumber,
      authorityGrantDate: grantDateIso,
      authorityAgeMonths: ageMonths,
      authorityType: readAuthorityType(earliest.raw),
      rawHistoryCount,
      errors: [],
    };
    authorityCacheSet(dotNumber, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, `[FMCSA] Authority lookup error for DOT ${dotNumber}:`);
    const fail: FMCSAAuthorityResult = {
      dotNumber,
      authorityGrantDate: null,
      authorityAgeMonths: null,
      authorityType: null,
      rawHistoryCount: 0,
      errors: [`FMCSA authority endpoint error: ${msg}`],
    };
    return fail;
  }
}
