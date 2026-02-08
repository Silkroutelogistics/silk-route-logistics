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

export async function verifyCarrierWithFMCSA(dotNumber: string): Promise<FMCSACarrierResult> {
  const webKey = process.env.FMCSA_WEB_KEY;

  // If no API key configured, return a demo/mock verification
  if (!webKey) {
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
      errors: ["FMCSA_WEB_KEY not configured - using demo mode"],
    };
  }

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
