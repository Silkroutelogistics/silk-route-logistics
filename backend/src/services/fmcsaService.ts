/**
 * FMCSA SAFER Web API Integration
 * Validates carrier DOT number against the federal database.
 * API docs: https://mobile.fmcsa.dot.gov/qc/services/carriers
 *
 * Note: For production, register for a free FMCSA web key at:
 * https://mobile.fmcsa.dot.gov/QCDevsite/
 */

import { env } from "../config/env";

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
    insuranceOnFile: carrier.bipdInsuranceOnFile === "Y" || carrier.bipdInsuranceOnFile === "1" || carrier.bipdInsuranceOnFile === 1,
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

export async function verifyCarrierWithFMCSA(dotNumber: string): Promise<FMCSACarrierResult> {
  const webKey = env.FMCSA_WEB_KEY;
  const debugErrors: string[] = [];

  // Try keyed endpoint first (more reliable)
  if (webKey) {
    try {
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${webKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { headers: FMCSA_HEADERS, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json() as Record<string, any>;
        const result = parseCarrierResponse(data, dotNumber);
        if (result.legalName) return result;
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
    const timeout = setTimeout(() => controller.abort(), 10000);
    const publicRes = await fetch(publicUrl, { headers: FMCSA_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (publicRes.ok) {
      const data = await publicRes.json() as Record<string, any>;
      const result = parseCarrierResponse(data, dotNumber);
      if (result.legalName) return result;
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
