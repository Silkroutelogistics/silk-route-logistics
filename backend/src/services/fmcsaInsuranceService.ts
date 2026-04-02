/**
 * FMCSA Licensing & Insurance API Service
 *
 * Queries the FMCSA public API for carrier insurance filing details
 * including BIPD, Cargo, and Bond/Trust coverage.
 */

// --------------- Types ---------------

export interface InsuranceCoverage {
  required: string;
  onFile: string;
  coverageAmount: number;
  policyNumber?: string;
  insuranceCompany?: string;
  effectiveDate?: string;
  cancelDate?: string;
}

export interface InsuranceDetails {
  dotNumber: string;
  bipdInsurance: InsuranceCoverage | null;
  cargoInsurance: InsuranceCoverage | null;
  bondInsurance: { required: string; onFile: string; coverageAmount: number } | null;
  totalFilings: number;
  status: "ADEQUATE" | "INADEQUATE" | "NOT_REQUIRED" | "UNKNOWN";
}

export interface ComplianceResult {
  compliant: boolean;
  issues: string[];
}

// --------------- Cache ---------------

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
  data: InsuranceDetails;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(dotNumber: string): InsuranceDetails | null {
  const entry = cache.get(dotNumber);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(dotNumber);
    return null;
  }
  return entry.data;
}

function setCache(dotNumber: string, data: InsuranceDetails): void {
  cache.set(dotNumber, { data, cachedAt: Date.now() });
}

// --------------- Helpers ---------------

const BIPD_MINIMUM = 750_000;
const CARGO_MINIMUM = 100_000;

function parseFilingType(
  filings: any[],
  type: string
): InsuranceCoverage | null {
  const matching = filings.filter(
    (f: any) =>
      f.type?.toUpperCase().includes(type) ||
      f.insuranceType?.toUpperCase().includes(type) ||
      f.typeOfInsurance?.toUpperCase().includes(type)
  );
  if (matching.length === 0) return null;

  // Pick the most recent active filing
  const filing =
    matching.find(
      (f: any) =>
        !f.cancelDate && !f.cancellationDate && !f.dateCancelled
    ) || matching[0];

  return {
    required: filing.required ?? filing.isRequired ?? "UNKNOWN",
    onFile: filing.onFile ?? filing.isOnFile ?? (filing.cancelDate ? "NO" : "YES"),
    coverageAmount: Number(filing.coverageAmount ?? filing.insuranceAmount ?? filing.amount ?? 0),
    policyNumber: filing.policyNumber ?? filing.polNum ?? undefined,
    insuranceCompany: filing.insuranceCompany ?? filing.companyName ?? filing.insurer ?? undefined,
    effectiveDate: filing.effectiveDate ?? filing.dateEffective ?? undefined,
    cancelDate: filing.cancelDate ?? filing.cancellationDate ?? filing.dateCancelled ?? undefined,
  };
}

function parseBondFiling(filings: any[]): { required: string; onFile: string; coverageAmount: number } | null {
  const matching = filings.filter(
    (f: any) =>
      f.type?.toUpperCase().includes("BOND") ||
      f.type?.toUpperCase().includes("TRUST") ||
      f.insuranceType?.toUpperCase().includes("BOND") ||
      f.insuranceType?.toUpperCase().includes("TRUST") ||
      f.typeOfInsurance?.toUpperCase().includes("BOND") ||
      f.typeOfInsurance?.toUpperCase().includes("TRUST")
  );
  if (matching.length === 0) return null;

  const filing = matching.find(
    (f: any) => !f.cancelDate && !f.cancellationDate && !f.dateCancelled
  ) || matching[0];

  return {
    required: filing.required ?? filing.isRequired ?? "UNKNOWN",
    onFile: filing.onFile ?? filing.isOnFile ?? (filing.cancelDate ? "NO" : "YES"),
    coverageAmount: Number(filing.coverageAmount ?? filing.insuranceAmount ?? filing.amount ?? 0),
  };
}

function determineStatus(details: Omit<InsuranceDetails, "status">): InsuranceDetails["status"] {
  // If no filings at all, unknown
  if (details.totalFilings === 0) return "UNKNOWN";

  // If BIPD is not required (e.g. private carrier), it's NOT_REQUIRED
  if (
    details.bipdInsurance?.required?.toUpperCase() === "NO" ||
    details.bipdInsurance?.required?.toUpperCase() === "FALSE" ||
    details.bipdInsurance?.required?.toUpperCase() === "NOT REQUIRED"
  ) {
    return "NOT_REQUIRED";
  }

  // BIPD must be on file with adequate coverage
  if (
    details.bipdInsurance &&
    details.bipdInsurance.onFile?.toUpperCase() === "YES" &&
    details.bipdInsurance.coverageAmount >= BIPD_MINIMUM
  ) {
    return "ADEQUATE";
  }

  return "INADEQUATE";
}

// --------------- Main Functions ---------------

/**
 * Fetch insurance filing details from FMCSA for a given DOT number.
 */
export async function getInsuranceDetails(dotNumber: string): Promise<InsuranceDetails> {
  // Check cache first
  const cached = getCached(dotNumber);
  if (cached) return cached;

  const webKey = process.env.FMCSA_WEB_KEY;
  if (!webKey) {
    throw new Error("FMCSA_WEB_KEY is not configured");
  }

  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}/insurance?webKey=${webKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let responseData: any;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`FMCSA API returned ${res.status}: ${res.statusText}`);
    }

    responseData = await res.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("FMCSA insurance API request timed out (10s)");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // The FMCSA API wraps results in a content array
  const filings: any[] =
    responseData?.content ??
    responseData?.insuranceFilings ??
    responseData?.filings ??
    (Array.isArray(responseData) ? responseData : []);

  const bipdInsurance = parseFilingType(filings, "BIPD");
  const cargoInsurance = parseFilingType(filings, "CARGO");
  const bondInsurance = parseBondFiling(filings);

  const partial = {
    dotNumber,
    bipdInsurance,
    cargoInsurance,
    bondInsurance,
    totalFilings: filings.length,
  };

  const details: InsuranceDetails = {
    ...partial,
    status: determineStatus(partial),
  };

  setCache(dotNumber, details);
  return details;
}

/**
 * Quick compliance check for a carrier's insurance status.
 */
export async function checkInsuranceCompliance(dotNumber: string): Promise<ComplianceResult> {
  const issues: string[] = [];

  let details: InsuranceDetails;
  try {
    details = await getInsuranceDetails(dotNumber);
  } catch (err: any) {
    return {
      compliant: false,
      issues: [`Unable to verify insurance: ${err.message}`],
    };
  }

  // Check BIPD
  if (!details.bipdInsurance) {
    issues.push("No BIPD (Bodily Injury & Property Damage) insurance on file");
  } else {
    if (details.bipdInsurance.onFile?.toUpperCase() !== "YES") {
      issues.push("BIPD insurance is not currently on file");
    }
    if (details.bipdInsurance.coverageAmount < BIPD_MINIMUM) {
      issues.push(
        `BIPD coverage ($${details.bipdInsurance.coverageAmount.toLocaleString()}) is below the $${BIPD_MINIMUM.toLocaleString()} minimum`
      );
    }
    if (details.bipdInsurance.cancelDate) {
      issues.push(`BIPD insurance has a cancellation date: ${details.bipdInsurance.cancelDate}`);
    }
  }

  // Check Cargo (only if required / on file)
  if (details.cargoInsurance) {
    const required =
      details.cargoInsurance.required?.toUpperCase() !== "NO" &&
      details.cargoInsurance.required?.toUpperCase() !== "FALSE" &&
      details.cargoInsurance.required?.toUpperCase() !== "NOT REQUIRED";

    if (required) {
      if (details.cargoInsurance.onFile?.toUpperCase() !== "YES") {
        issues.push("Cargo insurance is required but not currently on file");
      }
      if (details.cargoInsurance.coverageAmount < CARGO_MINIMUM) {
        issues.push(
          `Cargo coverage ($${details.cargoInsurance.coverageAmount.toLocaleString()}) is below the $${CARGO_MINIMUM.toLocaleString()} minimum`
        );
      }
      if (details.cargoInsurance.cancelDate) {
        issues.push(`Cargo insurance has a cancellation date: ${details.cargoInsurance.cancelDate}`);
      }
    }
  }

  return {
    compliant: issues.length === 0,
    issues,
  };
}
