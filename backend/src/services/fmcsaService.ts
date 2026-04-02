/**
 * FMCSA SAFER Web API Integration
 * Validates carrier DOT number against the federal database.
 * API docs: https://mobile.fmcsa.dot.gov/qc/services/carriers
 *
 * Note: For production, register for a free FMCSA web key at:
 * https://mobile.fmcsa.dot.gov/QCDevsite/
 */

import { env } from "../config/env";

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
      phyZipcode: null, phone: null,
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
      phyState: null, phyZipcode: null, phone: null,
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
      phyState: null, phyZipcode: null, phone: null,
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
    console.error(`[FMCSA] MC lookup error for MC-${mcNum}:`, err instanceof Error ? err.message : err);
  }

  return {
    verified: false, legalName: null, dbaName: null, mcNumber: `MC-${mcNum}`,
    dotNumber: "", operatingStatus: null, entityType: null,
    safetyRating: null, insuranceOnFile: false, outOfServiceDate: null,
    totalDrivers: null, totalPowerUnits: null, phyStreet: null, phyCity: null,
    phyState: null, phyZipcode: null, phone: null,
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
      console.error(`[FMCSA] Keyed request error for DOT ${dotNumber}:`, msg);
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
  console.error(`[FMCSA] All verification attempts failed for DOT ${dotNumber}. Errors: ${debugErrors.join(" | ")}`);
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
    errors: ["FMCSA API unavailable - verification failed (fail-safe)", ...debugErrors],
  };
}
