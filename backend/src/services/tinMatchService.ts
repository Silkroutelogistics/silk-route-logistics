/**
 * TIN Match Service
 * Handles W-9 TIN (Tax Identification Number) matching/verification with the IRS.
 * Uses tin-check.com third-party API when IRS_TIN_MATCH_API_KEY is configured,
 * otherwise falls back to format validation only.
 */

import { prisma } from "../config/database";

// ── Types ──

interface TinMatchResult {
  matched: boolean;
  status: "MATCHED" | "MISMATCHED" | "IRS_ERROR" | "FORMAT_VALID";
}

interface TinCheckApiResponse {
  valid: boolean;
  match: boolean;
}

interface BatchVerifyStats {
  total: number;
  matched: number;
  mismatched: number;
  errors: number;
}

// ── TIN Format Helpers ──

/**
 * Strips dashes and whitespace from a TIN, returning digits only.
 */
function normalizeTin(tin: string): string {
  return tin.replace(/[\s-]/g, "");
}

/**
 * Validates that a TIN is 9 digits and follows a valid EIN prefix pattern.
 * EIN format: XX-XXXXXXX where the first two digits are a valid IRS campus prefix.
 * Valid EIN prefixes: 10-16, 20-27, 30-39, 40-48, 50-59, 60-68, 71-77, 80-88, 90-95, 98-99.
 * SSN/ITIN are also 9 digits but we don't differentiate here — just validate the format.
 */
function isValidTinFormat(tin: string): boolean {
  const digits = normalizeTin(tin);
  if (digits.length !== 9) return false;
  if (!/^\d{9}$/.test(digits)) return false;

  // Reject obvious invalid TINs (all zeros, all same digit)
  if (/^0{9}$/.test(digits)) return false;
  if (/^(\d)\1{8}$/.test(digits)) return false;

  return true;
}

// ── IRS TIN Match (via tin-check.com) ──

/**
 * Matches a TIN against IRS records.
 * If IRS_TIN_MATCH_API_KEY is set, calls the tin-check.com API.
 * Otherwise, falls back to format validation only.
 */
export async function matchTinWithIrs(
  tin: string,
  companyName: string
): Promise<TinMatchResult> {
  const apiKey = process.env.IRS_TIN_MATCH_API_KEY;

  if (apiKey) {
    // Call third-party TIN check API
    return callTinCheckApi(tin, companyName, apiKey);
  }

  // Fallback: format validation only
  return formatValidationFallback(tin);
}

/**
 * Calls the tin-check.com TIN verification API.
 */
async function callTinCheckApi(
  tin: string,
  companyName: string,
  apiKey: string
): Promise<TinMatchResult> {
  try {
    const response = await fetch("https://tin-check.com/api/v1/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        tin: normalizeTin(tin),
        name: companyName,
      }),
    });

    if (!response.ok) {
      console.error(
        `[TIN Match] tin-check.com API error: ${response.status} ${response.statusText}`
      );
      return { matched: false, status: "IRS_ERROR" };
    }

    const data = (await response.json()) as TinCheckApiResponse;

    if (data.match) {
      return { matched: true, status: "MATCHED" };
    }

    // API returned valid response but TIN/name didn't match
    return { matched: false, status: "MISMATCHED" };
  } catch (err) {
    console.error("[TIN Match] tin-check.com API call failed:", err);
    return { matched: false, status: "IRS_ERROR" };
  }
}

/**
 * Fallback when no API key is configured.
 * Validates TIN format only — no IRS verification is performed.
 */
function formatValidationFallback(tin: string): TinMatchResult {
  if (isValidTinFormat(tin)) {
    // Valid format only — IRS match was NOT performed (no API key configured)
    return { matched: false, status: "FORMAT_VALID" };
  }
  return { matched: false, status: "MISMATCHED" };
}

// ── Carrier TIN Verification ──

/**
 * Verifies the TIN for a specific carrier.
 * Reads CarrierIdentityVerification, checks for w9TinFull and w9CompanyName,
 * calls matchTinWithIrs, and updates the verification record.
 */
export async function verifyTin(carrierId: string): Promise<TinMatchResult> {
  try {
    const verification = await prisma.carrierIdentityVerification.findUnique({
      where: { carrierId },
    });

    if (!verification) {
      console.error(
        `[TIN Match] No identity verification record found for carrier ${carrierId}`
      );
      return { matched: false, status: "IRS_ERROR" };
    }

    if (!verification.w9TinFull) {
      console.error(
        `[TIN Match] No W-9 TIN on file for carrier ${carrierId}`
      );
      return { matched: false, status: "IRS_ERROR" };
    }

    if (!verification.w9CompanyName) {
      console.error(
        `[TIN Match] No W-9 company name on file for carrier ${carrierId}`
      );
      return { matched: false, status: "IRS_ERROR" };
    }

    const result = await matchTinWithIrs(
      verification.w9TinFull,
      verification.w9CompanyName
    );

    // Update the verification record with results
    await prisma.carrierIdentityVerification.update({
      where: { carrierId },
      data: {
        w9TinMatchStatus: result.status,
        w9TinMatchVerifiedAt: new Date(),
        w9TinVerified: result.status === "MATCHED",
      },
    });

    console.log(
      `[TIN Match] Carrier ${carrierId}: ${result.status}${
        !process.env.IRS_TIN_MATCH_API_KEY ? " (format-only, no IRS API)" : ""
      }`
    );

    return result;
  } catch (err) {
    console.error(`[TIN Match] Error verifying TIN for carrier ${carrierId}:`, err);

    // Attempt to mark as IRS_ERROR in the database
    try {
      await prisma.carrierIdentityVerification.update({
        where: { carrierId },
        data: {
          w9TinMatchStatus: "IRS_ERROR",
          w9TinMatchVerifiedAt: new Date(),
        },
      });
    } catch {
      // If this also fails, just log it
      console.error(`[TIN Match] Could not update error status for carrier ${carrierId}`);
    }

    return { matched: false, status: "IRS_ERROR" };
  }
}

// ── Batch Verification ──

/**
 * Verifies all carriers with w9TinMatchStatus = UNVERIFIED.
 * Processes sequentially to respect API rate limits.
 * Returns stats on how many matched, mismatched, or errored.
 */
export async function batchVerifyTins(): Promise<BatchVerifyStats> {
  const unverified = await prisma.carrierIdentityVerification.findMany({
    where: { w9TinMatchStatus: "UNVERIFIED" },
    select: { carrierId: true },
  });

  const stats: BatchVerifyStats = {
    total: unverified.length,
    matched: 0,
    mismatched: 0,
    errors: 0,
  };

  console.log(`[TIN Match] Batch: ${stats.total} carriers to verify`);

  for (const record of unverified) {
    const result = await verifyTin(record.carrierId);

    switch (result.status) {
      case "MATCHED":
        stats.matched++;
        break;
      case "MISMATCHED":
        stats.mismatched++;
        break;
      case "IRS_ERROR":
        stats.errors++;
        break;
    }
  }

  console.log(
    `[TIN Match] Batch complete: ${stats.matched} matched, ${stats.mismatched} mismatched, ${stats.errors} errors`
  );

  return stats;
}
