import { prisma } from "../config/database";
import { log } from "../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VinDecodeResult {
  make: string | null;
  model: string | null;
  year: number | null;
  bodyClass: string | null;
  gvwr: string | null;
  plantCountry: string | null;
  modelYear: string | null;
  valid: boolean;
  errorCode: string | null;
}

interface NHTSAVariable {
  Variable: string;
  Value: string | null;
}

interface NHTSAResponse {
  Results: NHTSAVariable[];
}

// ─── NHTSA VIN Decoder ──────────────────────────────────────────────────────

const NHTSA_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin";
const HTTP_TIMEOUT_MS = 10_000;

/**
 * Calls the free NHTSA VIN Decoder API and extracts key vehicle fields.
 */
export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const url = `${NHTSA_BASE_URL}/${encodeURIComponent(vin)}?format=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`NHTSA API returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as { Results: NHTSAVariable[] };
    const results = data.Results || [];

    const getValue = (variable: string): string | null => {
      const entry = results.find((r) => r.Variable === variable);
      return entry?.Value?.trim() || null;
    };

    const errorCode = getValue("Error Code");
    const yearStr = getValue("Model Year");
    const year = yearStr ? parseInt(yearStr, 10) : null;

    return {
      make: getValue("Make"),
      model: getValue("Model"),
      year: year && !isNaN(year) ? year : null,
      bodyClass: getValue("Body Class"),
      gvwr: getValue("Gross Vehicle Weight Rating From"),
      plantCountry: getValue("Plant Country"),
      modelYear: yearStr,
      valid: errorCode === "0",
      errorCode,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`NHTSA API request timed out after ${HTTP_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Single Truck VIN Verification ──────────────────────────────────────────

/**
 * Reads a Truck record, decodes its VIN via NHTSA, compares decoded make/model/year
 * against stored values, and updates vinVerificationStatus + decoded fields.
 *
 * Status logic:
 *  - No VIN on truck          → UNVERIFIED
 *  - NHTSA returns no results → NOT_FOUND
 *  - Make + year match        → VERIFIED
 *  - Data doesn't match       → MISMATCH (decoded data still stored)
 */
export async function verifyTruckVin(truckId: string) {
  const truck = await prisma.truck.findUnique({ where: { id: truckId } });

  if (!truck) {
    throw new Error(`Truck not found: ${truckId}`);
  }

  // No VIN on record — mark UNVERIFIED
  if (!truck.vin) {
    return prisma.truck.update({
      where: { id: truckId },
      data: { vinVerificationStatus: "UNVERIFIED" },
    });
  }

  let decoded: VinDecodeResult;
  try {
    decoded = await decodeVin(truck.vin);
  } catch (error: any) {
    log.error({ err: error }, `VIN decode failed for truck ${truckId}:`);
    return prisma.truck.update({
      where: { id: truckId },
      data: { vinVerificationStatus: "NOT_FOUND" },
    });
  }

  // NHTSA returned no valid data
  if (!decoded.valid || (!decoded.make && !decoded.model && !decoded.year)) {
    return prisma.truck.update({
      where: { id: truckId },
      data: {
        vinVerificationStatus: "NOT_FOUND",
        vinDecodedMake: decoded.make,
        vinDecodedModel: decoded.model,
        vinDecodedYear: decoded.year,
        vinModelYear: decoded.modelYear,
        vinPlantCountry: decoded.plantCountry,
        vinBodyClass: decoded.bodyClass,
        vinGvwr: decoded.gvwr,
        vinVerifiedAt: new Date(),
      },
    });
  }

  // Compare decoded make + year against stored truck data
  const makeMatches =
    !truck.make ||
    !decoded.make ||
    truck.make.toUpperCase() === decoded.make.toUpperCase();

  const yearMatches =
    !truck.year || !decoded.year || truck.year === decoded.year;

  const isMatch = makeMatches && yearMatches;

  return prisma.truck.update({
    where: { id: truckId },
    data: {
      vinVerificationStatus: isMatch ? "VERIFIED" : "MISMATCH",
      vinDecodedMake: decoded.make,
      vinDecodedModel: decoded.model,
      vinDecodedYear: decoded.year,
      vinModelYear: decoded.modelYear,
      vinPlantCountry: decoded.plantCountry,
      vinBodyClass: decoded.bodyClass,
      vinGvwr: decoded.gvwr,
      vinVerifiedAt: new Date(),
    },
  });
}

// ─── Bulk Carrier VIN Verification ──────────────────────────────────────────

/**
 * Verifies VINs for all trucks, optionally filtered to trucks associated with
 * a specific carrier (via loads). Returns summary stats.
 */
export async function verifyAllCarrierVins(carrierId?: string) {
  // Build truck query — if carrierId given, find trucks linked through loads
  let truckIds: string[] | undefined;

  if (carrierId) {
    const loads = await prisma.load.findMany({
      where: { carrierId },
      select: { truckId: true },
      distinct: ["truckId"],
    });
    truckIds = loads
      .map((l) => l.truckId)
      .filter((id): id is string => id !== null);
  }

  const trucks = await prisma.truck.findMany({
    where: truckIds ? { id: { in: truckIds } } : undefined,
    select: { id: true, vin: true },
  });

  const stats = {
    total: trucks.length,
    verified: 0,
    mismatch: 0,
    notFound: 0,
    unverified: 0,
    errors: 0,
  };

  for (const truck of trucks) {
    try {
      const updated = await verifyTruckVin(truck.id);
      switch (updated.vinVerificationStatus) {
        case "VERIFIED":
          stats.verified++;
          break;
        case "MISMATCH":
          stats.mismatch++;
          break;
        case "NOT_FOUND":
          stats.notFound++;
          break;
        case "UNVERIFIED":
          stats.unverified++;
          break;
      }
    } catch (error: any) {
      log.error({ err: error }, `Error verifying truck ${truck.id}:`);
      stats.errors++;
    }
  }

  return stats;
}
