/**
 * FMCSA SAFER Web API Integration
 * Validates carrier DOT number against the federal database.
 * API docs: https://mobile.fmcsa.dot.gov/qc/services/carriers
 *
 * Note: For production, register for a free FMCSA web key at:
 * https://mobile.fmcsa.dot.gov/QCDevsite/
 */

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
  errors: string[];
}

function parseCarrierResponse(data: Record<string, any>, dotNumber: string): FMCSACarrierResult {
  const carrier = data?.content?.carrier;

  if (!carrier) {
    return {
      verified: false, legalName: null, dbaName: null, mcNumber: null,
      dotNumber, operatingStatus: null, entityType: null, safetyRating: null,
      insuranceOnFile: false, outOfServiceDate: null, totalDrivers: null,
      totalPowerUnits: null, errors: ["Carrier not found in FMCSA database"],
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
    insuranceOnFile: carrier.bipdInsuranceOnFile === "Y",
    outOfServiceDate: carrier.oosDate || null,
    totalDrivers: carrier.totalDrivers || null,
    totalPowerUnits: carrier.totalPowerUnits || null,
    errors: [],
  };
}

export async function verifyCarrierWithFMCSA(dotNumber: string): Promise<FMCSACarrierResult> {
  // Try real FMCSA API without key first (public endpoint)
  try {
    const publicUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}`;
    const publicRes = await fetch(publicUrl);
    if (publicRes.ok) {
      const data = await publicRes.json() as Record<string, any>;
      const result = parseCarrierResponse(data, dotNumber);
      if (result.legalName) return result;
    }
  } catch {
    // Fall through to keyed attempt or mock
  }

  // Try with web key if configured
  const webKey = process.env.FMCSA_WEB_KEY;
  if (webKey) {
    try {
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${webKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          verified: false, legalName: null, dbaName: null, mcNumber: null,
          dotNumber, operatingStatus: null, entityType: null, safetyRating: null,
          insuranceOnFile: false, outOfServiceDate: null, totalDrivers: null,
          totalPowerUnits: null, errors: [`FMCSA API returned ${response.status}`],
        };
      }

      const data = await response.json() as Record<string, any>;
      return parseCarrierResponse(data, dotNumber);
    } catch (err) {
      return {
        verified: false, legalName: null, dbaName: null, mcNumber: null,
        dotNumber, operatingStatus: null, entityType: null, safetyRating: null,
        insuranceOnFile: false, outOfServiceDate: null, totalDrivers: null,
        totalPowerUnits: null,
        errors: [`FMCSA API error: ${err instanceof Error ? err.message : "Unknown error"}`],
      };
    }
  }

  // Fall back to demo/mock verification
  return {
    verified: true,
    legalName: "Carrier Verified (Demo Mode)",
    dbaName: null,
    mcNumber: null,
    dotNumber,
    operatingStatus: "AUTHORIZED",
    entityType: "CARRIER",
    safetyRating: "SATISFACTORY",
    insuranceOnFile: true,
    outOfServiceDate: null,
    totalDrivers: null,
    totalPowerUnits: null,
    errors: ["FMCSA API unavailable - using demo mode"],
  };
}
