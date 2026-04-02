/**
 * TIN Match Service
 * Handles W-9 TIN (Tax Identification Number) matching/verification.
 *
 * Layers:
 * 1. Enhanced format validation (EIN campus-code prefixes, reject invalid patterns)
 * 2. IRS e-Services TIN Matching stub (ready for real API when enrolled)
 * 3. SEC EDGAR cross-reference for publicly traded parent companies
 */

import { prisma } from "../config/database";
import { TinMatchStatus } from "@prisma/client";
import { creditCheck } from "./secEdgarService";

// ── Types ──

export interface TinMatchResult {
  matched: boolean;
  status: "MATCHED" | "MISMATCHED" | "IRS_ERROR" | "FORMAT_VALID";
}

interface TinCheckApiResponse {
  valid: boolean;
  match: boolean;
}

export interface BatchVerifyStats {
  total: number;
  matched: number;
  mismatched: number;
  errors: number;
}

export interface EnhancedTinResult {
  status: "VALID_FORMAT" | "INVALID_FORMAT" | "IRS_MATCHED" | "IRS_MISMATCHED" | "SUSPICIOUS";
  einValid: boolean;
  prefixValid: boolean;
  formatIssues: string[];
  irsVerified: boolean;
  secCrossRef: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

// ── Valid EIN Prefixes (IRS Campus Codes) ──

const VALID_EIN_PREFIXES = new Set([
  // 01-06
  "01", "02", "03", "04", "05", "06",
  // 10-16
  "10", "11", "12", "13", "14", "15", "16",
  // 20-27
  "20", "21", "22", "23", "24", "25", "26", "27",
  // 30-38
  "30", "31", "32", "33", "34", "35", "36", "37", "38",
  // 40-48
  "40", "41", "42", "43", "44", "45", "46", "47", "48",
  // 50-58
  "50", "51", "52", "53", "54", "55", "56", "57", "58",
  // 60-68
  "60", "61", "62", "63", "64", "65", "66", "67", "68",
  // 71-77
  "71", "72", "73", "74", "75", "76", "77",
  // 80-88
  "80", "81", "82", "83", "84", "85", "86", "87", "88",
  // 90-95
  "90", "91", "92", "93", "94", "95",
  // 98-99
  "98", "99",
]);

// ── TIN Format Helpers ──

/**
 * Strips dashes and whitespace from a TIN, returning digits only.
 */
function normalizeTin(tin: string): string {
  return tin.replace(/[\s-]/g, "");
}

/**
 * Checks whether a string looks like an SSN (XXX-XX-XXXX pattern).
 * Carriers should always provide an EIN, not an SSN.
 */
function looksLikeSsn(tin: string): boolean {
  // SSN format: area number cannot be 000, 666, or 900-999
  const digits = normalizeTin(tin);
  if (digits.length !== 9) return false;
  const area = parseInt(digits.substring(0, 3), 10);
  // EIN prefixes are 2-digit (01-99). SSNs have 3-digit area numbers.
  // If the first two digits are NOT a valid EIN prefix, it's likely an SSN.
  // Also, SSN area numbers 001-665, 667-899 are valid SSN ranges.
  // We detect SSN by checking the formatted input pattern (XXX-XX-XXXX)
  return /^\d{3}-\d{2}-\d{4}$/.test(tin.trim());
}

/**
 * Validates that a TIN is 9 digits and follows a valid EIN prefix pattern.
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

/**
 * Checks if the EIN prefix (first two digits) is a valid IRS campus code.
 */
function isValidEinPrefix(tin: string): boolean {
  const digits = normalizeTin(tin);
  if (digits.length !== 9) return false;
  const prefix = digits.substring(0, 2);
  return VALID_EIN_PREFIXES.has(prefix);
}

/**
 * Detects known-invalid or suspicious TIN patterns.
 */
function detectSuspiciousPatterns(tin: string): string[] {
  const digits = normalizeTin(tin);
  const issues: string[] = [];

  // All zeros
  if (/^0{9}$/.test(digits)) {
    issues.push("TIN is all zeros");
  }

  // All same digit (e.g. 111111111)
  if (/^(\d)\1{8}$/.test(digits)) {
    issues.push("TIN is all the same digit");
  }

  // Sequential ascending (123456789)
  if (digits === "123456789") {
    issues.push("TIN is sequential (123456789)");
  }

  // Sequential descending (987654321)
  if (digits === "987654321") {
    issues.push("TIN is sequential descending (987654321)");
  }

  // Repeating pairs (121212121)
  if (/^(\d\d)\1{3}\d$/.test(digits)) {
    issues.push("TIN has repeating digit pattern");
  }

  // IRS test EINs (00-0000000)
  if (digits.startsWith("00")) {
    issues.push("EIN prefix 00 is not assigned by IRS");
  }

  return issues;
}

// ── Enhanced Format Validation ──

/**
 * Performs enhanced format validation with EIN prefix checks,
 * suspicious pattern detection, and SSN rejection.
 */
export function enhancedFormatValidation(tin: string, _legalName: string): EnhancedTinResult {
  const digits = normalizeTin(tin);
  const formatIssues: string[] = [];

  // Check if it looks like an SSN
  if (looksLikeSsn(tin)) {
    formatIssues.push("Input appears to be an SSN (XXX-XX-XXXX) — carriers must provide an EIN");
    return {
      status: "INVALID_FORMAT",
      einValid: false,
      prefixValid: false,
      formatIssues,
      irsVerified: false,
      secCrossRef: false,
      confidence: "LOW",
    };
  }

  // Basic format check
  if (!isValidTinFormat(tin)) {
    if (digits.length !== 9) {
      formatIssues.push(`TIN must be exactly 9 digits (got ${digits.length})`);
    }
    if (!/^\d+$/.test(digits) && digits.length > 0) {
      formatIssues.push("TIN contains non-numeric characters");
    }
    // Check the suspicious patterns even on invalid TINs
    formatIssues.push(...detectSuspiciousPatterns(tin));

    return {
      status: "INVALID_FORMAT",
      einValid: false,
      prefixValid: false,
      formatIssues,
      irsVerified: false,
      secCrossRef: false,
      confidence: "LOW",
    };
  }

  // Suspicious pattern detection
  const suspiciousIssues = detectSuspiciousPatterns(tin);
  if (suspiciousIssues.length > 0) {
    return {
      status: "SUSPICIOUS",
      einValid: false,
      prefixValid: false,
      formatIssues: suspiciousIssues,
      irsVerified: false,
      secCrossRef: false,
      confidence: "LOW",
    };
  }

  // EIN prefix validation
  const prefixValid = isValidEinPrefix(tin);
  if (!prefixValid) {
    const prefix = digits.substring(0, 2);
    formatIssues.push(`EIN prefix "${prefix}" is not a valid IRS campus code`);
    return {
      status: "INVALID_FORMAT",
      einValid: false,
      prefixValid: false,
      formatIssues,
      irsVerified: false,
      secCrossRef: false,
      confidence: "LOW",
    };
  }

  // Valid format + valid prefix
  return {
    status: "VALID_FORMAT",
    einValid: true,
    prefixValid: true,
    formatIssues: [],
    irsVerified: false,
    secCrossRef: false,
    confidence: "MEDIUM",
  };
}

// ── IRS e-Services TIN Matching (Stub) ──

/**
 * Verifies a TIN with the IRS e-Services TIN Matching program.
 * When IRS_TIN_MATCH_API_KEY is configured, this will call the real API.
 * Otherwise, falls back to enhanced format validation with optional SEC cross-reference.
 */
export async function verifyTinWithIRS(tin: string, legalName: string): Promise<EnhancedTinResult> {
  const apiKey = process.env.IRS_TIN_MATCH_API_KEY;

  if (apiKey) {
    // ─── Real IRS e-Services TIN Matching (when enrolled) ───
    // The IRS TIN Matching program allows authorized payers to verify
    // TIN/name combinations before filing information returns.
    // Enrollment: https://www.irs.gov/e-file-providers/tin-matching-program
    //
    // Request format:
    //   POST https://tin-matching.irs.gov/api/v1/match
    //   Headers: Authorization: Bearer <api_key>
    //   Body: { tin: "XXXXXXXXX", name: "Legal Name" }
    //
    // Response codes:
    //   0 = TIN/name match
    //   1 = TIN not issued
    //   2 = TIN issued but name mismatch
    //   3 = TIN/name match on supplemental list
    //   4-9 = various error conditions
    try {
      const response = await fetch("https://tin-matching.irs.gov/api/v1/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          tin: normalizeTin(tin),
          name: legalName,
        }),
      });

      if (!response.ok) {
        console.error(`[TIN Match] IRS API error: ${response.status} ${response.statusText}`);
        // Fall through to enhanced validation
        const result = enhancedFormatValidation(tin, legalName);
        result.formatIssues.push("IRS API returned an error — used format validation only");
        return result;
      }

      const data = await response.json() as { code: number; message: string };

      if (data.code === 0 || data.code === 3) {
        return {
          status: "IRS_MATCHED",
          einValid: true,
          prefixValid: true,
          formatIssues: [],
          irsVerified: true,
          secCrossRef: false,
          confidence: "HIGH",
        };
      }

      return {
        status: "IRS_MISMATCHED",
        einValid: true,
        prefixValid: isValidEinPrefix(tin),
        formatIssues: [`IRS response code ${data.code}: ${data.message}`],
        irsVerified: false,
        secCrossRef: false,
        confidence: "LOW",
      };
    } catch (err) {
      console.error("[TIN Match] IRS API call failed:", err);
      const result = enhancedFormatValidation(tin, legalName);
      result.formatIssues.push("IRS API call failed — used format validation only");
      return result;
    }
  }

  // ─── No IRS API key: enhanced format validation + SEC cross-reference ───
  const result = enhancedFormatValidation(tin, legalName);

  // Attempt SEC EDGAR cross-reference for additional confidence
  if (result.status === "VALID_FORMAT" && legalName) {
    try {
      const secResult = await crossReferenceWithSec(legalName);
      if (secResult.found) {
        result.secCrossRef = true;
        result.confidence = "HIGH";
      }
    } catch (err) {
      // SEC cross-reference is optional — don't fail the whole check
      console.warn("[TIN Match] SEC cross-reference failed:", err);
    }
  }

  return result;
}

// ── SEC EDGAR Cross-Reference ──

interface SecCrossRefResult {
  found: boolean;
  companyName?: string;
  stateOfIncorporation?: string;
}

/**
 * Cross-references a carrier's parent company against SEC EDGAR filings.
 * If the company is publicly traded, this adds confidence to the TIN validation
 * by confirming the entity is registered with the SEC.
 */
async function crossReferenceWithSec(companyName: string): Promise<SecCrossRefResult> {
  try {
    const secData = await creditCheck(companyName);

    if (!secData.found) {
      return { found: false };
    }

    return {
      found: true,
      companyName: secData.companyName,
      stateOfIncorporation: secData.stateOfIncorporation || undefined,
    };
  } catch (err) {
    console.warn("[TIN Match] SEC EDGAR lookup failed:", err);
    return { found: false };
  }
}

// ── Legacy API (backward-compatible) ──

/**
 * Matches a TIN against IRS records.
 * If IRS_TIN_MATCH_API_KEY is set, calls the tin-check.com API.
 * Otherwise, falls back to format validation only.
 *
 * @deprecated Use verifyTinWithIRS() for enhanced validation.
 */
export async function matchTinWithIrs(
  tin: string,
  companyName: string
): Promise<TinMatchResult> {
  const apiKey = process.env.IRS_TIN_MATCH_API_KEY;

  if (apiKey) {
    return callTinCheckApi(tin, companyName, apiKey);
  }

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

    return { matched: false, status: "MISMATCHED" };
  } catch (err) {
    console.error("[TIN Match] tin-check.com API call failed:", err);
    return { matched: false, status: "IRS_ERROR" };
  }
}

/**
 * Fallback when no API key is configured.
 */
function formatValidationFallback(tin: string): TinMatchResult {
  if (isValidTinFormat(tin)) {
    return { matched: false, status: "FORMAT_VALID" };
  }
  return { matched: false, status: "MISMATCHED" };
}

// ── Carrier TIN Verification (Enhanced) ──

/**
 * Verifies the TIN for a specific carrier using enhanced validation.
 * Reads CarrierIdentityVerification, checks for w9TinFull and w9CompanyName,
 * runs enhanced validation (format + prefix + suspicious patterns + SEC cross-ref),
 * and updates the verification record.
 */
export async function verifyTin(carrierId: string): Promise<EnhancedTinResult> {
  try {
    const verification = await prisma.carrierIdentityVerification.findUnique({
      where: { carrierId },
    });

    if (!verification) {
      console.error(
        `[TIN Match] No identity verification record found for carrier ${carrierId}`
      );
      return {
        status: "INVALID_FORMAT",
        einValid: false,
        prefixValid: false,
        formatIssues: ["No identity verification record found"],
        irsVerified: false,
        secCrossRef: false,
        confidence: "LOW",
      };
    }

    if (!verification.w9TinFull) {
      console.error(
        `[TIN Match] No W-9 TIN on file for carrier ${carrierId}`
      );
      return {
        status: "INVALID_FORMAT",
        einValid: false,
        prefixValid: false,
        formatIssues: ["No W-9 TIN on file"],
        irsVerified: false,
        secCrossRef: false,
        confidence: "LOW",
      };
    }

    if (!verification.w9CompanyName) {
      console.error(
        `[TIN Match] No W-9 company name on file for carrier ${carrierId}`
      );
      return {
        status: "INVALID_FORMAT",
        einValid: false,
        prefixValid: false,
        formatIssues: ["No W-9 company name on file"],
        irsVerified: false,
        secCrossRef: false,
        confidence: "LOW",
      };
    }

    const result = await verifyTinWithIRS(
      verification.w9TinFull,
      verification.w9CompanyName
    );

    // Map enhanced result status to legacy w9TinMatchStatus for DB storage
    let dbStatus: TinMatchStatus;
    let dbVerified = false;
    switch (result.status) {
      case "IRS_MATCHED":
        dbStatus = "MATCHED";
        dbVerified = true;
        break;
      case "IRS_MISMATCHED":
        dbStatus = "MISMATCHED";
        break;
      case "VALID_FORMAT":
        dbStatus = "FORMAT_VALID";
        break;
      case "SUSPICIOUS":
        dbStatus = "SUSPICIOUS";
        break;
      case "INVALID_FORMAT":
      default:
        dbStatus = "MISMATCHED";
        break;
    }

    // Update the verification record with results
    await prisma.carrierIdentityVerification.update({
      where: { carrierId },
      data: {
        w9TinMatchStatus: dbStatus,
        w9TinMatchVerifiedAt: new Date(),
        w9TinVerified: dbVerified,
      },
    });

    console.log(
      `[TIN Match] Carrier ${carrierId}: ${result.status} (confidence: ${result.confidence})${
        !process.env.IRS_TIN_MATCH_API_KEY ? " — no IRS API" : ""
      }${result.secCrossRef ? " — SEC cross-ref confirmed" : ""}`
    );

    return result;
  } catch (err) {
    console.error(`[TIN Match] Error verifying TIN for carrier ${carrierId}:`, err);

    // Attempt to mark as error in the database
    try {
      await prisma.carrierIdentityVerification.update({
        where: { carrierId },
        data: {
          w9TinMatchStatus: "IRS_ERROR",
          w9TinMatchVerifiedAt: new Date(),
        },
      });
    } catch {
      console.error(`[TIN Match] Could not update error status for carrier ${carrierId}`);
    }

    return {
      status: "INVALID_FORMAT",
      einValid: false,
      prefixValid: false,
      formatIssues: ["Internal error during TIN verification"],
      irsVerified: false,
      secCrossRef: false,
      confidence: "LOW",
    };
  }
}

// ── Batch Verification ──

/**
 * Verifies all carriers with w9TinMatchStatus = UNVERIFIED.
 * Processes sequentially to respect API rate limits.
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
      case "IRS_MATCHED":
      case "VALID_FORMAT":
        stats.matched++;
        break;
      case "IRS_MISMATCHED":
      case "INVALID_FORMAT":
      case "SUSPICIOUS":
        stats.mismatched++;
        break;
      default:
        stats.errors++;
        break;
    }
  }

  console.log(
    `[TIN Match] Batch complete: ${stats.matched} valid, ${stats.mismatched} invalid/suspicious, ${stats.errors} errors`
  );

  return stats;
}
