/**
 * ELD Validation Service
 * Validates that a carrier's ELD (Electronic Logging Device) provider
 * is on the FMCSA registered device list.
 *
 * FMCSA does not provide a clean API for registered ELD providers,
 * so we maintain a hardcoded set of major registered providers.
 * This list should be periodically reviewed against the FMCSA
 * registered ELD list: https://eld.fmcsa.dot.gov/List
 */

import { prisma } from "../config/database";

// FMCSA-registered ELD providers (normalized to uppercase)
// Source: https://eld.fmcsa.dot.gov/List — last reviewed Feb 2026
const FMCSA_REGISTERED_ELD_PROVIDERS = new Set<string>([
  "SAMSARA",
  "MOTIVE",                // formerly KeepTruckin
  "KEEPTRUCKIN",           // legacy name for Motive
  "OMNITRACS",
  "GEOTAB",
  "PLATFORM SCIENCE",
  "ISAAC",
  "VERIZON CONNECT",
  "TELETRAC NAVMAN",
  "LINXUP",
  "GARMIN",
  "SAMSUNG",
  "RAND MCNALLY",
  "ZONAR",
  "BIGROAD",
  "TRUCKER PATH",
  "ELD MANDATE",
  "STONERIDGE",
  "PEDIGREE",
  "JJ KELLER",
  "J.J. KELLER",           // alternate formatting
  "WEBFLEET",
  "AZUGA",
  "GORILLA SAFETY",
  "GPS TRACKIT",
  "MAVEN MACHINES",
  "CORETEX",
  "SWITCHBOARD",
  "KONEXIAL",
  "ONEVIEW",
  "MATRACK",
  "FLEETUP",
]);

export type EldValidationResult = {
  carrierId: string;
  eldProvider: string | null;
  status: "VERIFIED" | "NOT_ON_FMCSA_LIST" | "UNVERIFIED" | "EXEMPT";
  eldDeviceVerified: boolean;
};

/**
 * Validates a single carrier's ELD provider against the FMCSA registered list.
 * Updates the CarrierProfile with the verification result.
 */
export async function validateEldProvider(carrierId: string): Promise<EldValidationResult> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      eldProvider: true,
      numberOfTrucks: true,
    },
  });

  if (!carrier) {
    throw new Error(`CarrierProfile not found: ${carrierId}`);
  }

  // Check ELD exemption first
  if (isEldExempt(carrier.numberOfTrucks)) {
    await prisma.carrierProfile.update({
      where: { id: carrierId },
      data: {
        eldDeviceVerified: false,
        eldOnFmcsaList: "EXEMPT",
        eldVerifiedAt: new Date(),
      },
    });

    return {
      carrierId,
      eldProvider: carrier.eldProvider,
      status: "EXEMPT",
      eldDeviceVerified: false,
    };
  }

  // No ELD provider specified
  if (!carrier.eldProvider || carrier.eldProvider.trim() === "") {
    await prisma.carrierProfile.update({
      where: { id: carrierId },
      data: {
        eldDeviceVerified: false,
        eldOnFmcsaList: "UNVERIFIED",
        eldVerifiedAt: new Date(),
      },
    });

    return {
      carrierId,
      eldProvider: carrier.eldProvider,
      status: "UNVERIFIED",
      eldDeviceVerified: false,
    };
  }

  const normalized = carrier.eldProvider.trim().toUpperCase();
  const isOnList = FMCSA_REGISTERED_ELD_PROVIDERS.has(normalized);

  if (isOnList) {
    await prisma.carrierProfile.update({
      where: { id: carrierId },
      data: {
        eldDeviceVerified: true,
        eldOnFmcsaList: "VERIFIED",
        eldVerifiedAt: new Date(),
      },
    });

    return {
      carrierId,
      eldProvider: carrier.eldProvider,
      status: "VERIFIED",
      eldDeviceVerified: true,
    };
  }

  // Provider not on FMCSA list — flag for manual review
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      eldDeviceVerified: false,
      eldOnFmcsaList: "NOT_ON_FMCSA_LIST",
      eldVerifiedAt: new Date(),
    },
  });

  return {
    carrierId,
    eldProvider: carrier.eldProvider,
    status: "NOT_ON_FMCSA_LIST",
    eldDeviceVerified: false,
  };
}

/**
 * Determines if a carrier is exempt from ELD requirements.
 * Carriers with 0 or fewer trucks (or null) shouldn't need an ELD.
 */
export function isEldExempt(numberOfTrucks: number | null): boolean {
  if (numberOfTrucks === null || numberOfTrucks === undefined) {
    return false;
  }
  return numberOfTrucks <= 0;
}

/**
 * Batch validates all APPROVED carriers' ELD providers.
 * Returns a summary of verification results.
 */
export async function validateAllCarrierElds(): Promise<{
  total: number;
  verified: number;
  unverified: number;
  notOnFmcsaList: number;
  exempt: number;
  errors: string[];
}> {
  const carriers = await prisma.carrierProfile.findMany({
    where: { status: "APPROVED" },
    select: { id: true },
  });

  const results = {
    total: carriers.length,
    verified: 0,
    unverified: 0,
    notOnFmcsaList: 0,
    exempt: 0,
    errors: [] as string[],
  };

  for (const carrier of carriers) {
    try {
      const result = await validateEldProvider(carrier.id);

      switch (result.status) {
        case "VERIFIED":
          results.verified++;
          break;
        case "UNVERIFIED":
          results.unverified++;
          break;
        case "NOT_ON_FMCSA_LIST":
          results.notOnFmcsaList++;
          break;
        case "EXEMPT":
          results.exempt++;
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.errors.push(`Carrier ${carrier.id}: ${message}`);
    }
  }

  return results;
}
