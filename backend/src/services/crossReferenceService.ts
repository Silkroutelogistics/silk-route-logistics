/**
 * Cross-Reference Identity Validation Service (Compass Check #31)
 *
 * Cross-references the carrier's application data against multiple
 * authoritative sources (FMCSA, Secretary of State, OpenCorporates)
 * to catch identity fraud, stolen credentials, and shell companies.
 */

import { prisma } from "../config/database";
import { verifyCarrierWithFMCSA } from "./fmcsaService";

// ── Types ──────────────────────────────────────────────────

export interface CrossRefResult {
  score: number; // 0-100 (100 = perfect match across all sources)
  issues: string[];
  checks: {
    fmcsaNameMatch: { match: boolean; carrierName: string; fmcsaName: string; similarity: number } | null;
    stateMatch: { match: boolean; carrierState: string; fmcsaState: string; incorporationState?: string } | null;
    entityNameMatch: { match: boolean; carrierName: string; entityName: string; similarity: number } | null;
    addressConsistency: { match: boolean; carrierCity: string; fmcsaCity: string } | null;
    phoneConsistency: { match: boolean; carrierPhone: string; fmcsaPhone: string } | null;
  };
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

// ── Suffix removal list for fuzzy matching ─────────────────

const COMPANY_SUFFIXES = [
  "llc", "inc", "corp", "ltd", "co", "company",
  "transport", "trucking", "logistics", "freight",
  "express", "services",
];

// ── Levenshtein distance ───────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ── String similarity helper ───────────────────────────────

export function stringSimilarity(a: string, b: string): number {
  // Normalize: lowercase, trim, remove company suffixes
  let normA = a.toLowerCase().trim();
  let normB = b.toLowerCase().trim();

  for (const suffix of COMPANY_SUFFIXES) {
    const re = new RegExp(`\\b${suffix}\\b\\.?`, "gi");
    normA = normA.replace(re, "");
    normB = normB.replace(re, "");
  }

  // Remove extra whitespace and punctuation
  normA = normA.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  normB = normB.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  // Edge cases
  if (normA.length === 0 && normB.length === 0) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;

  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - distance / maxLen;
}

// ── Phone normalization ────────────────────────────────────

function normalizePhone(phone: string): string {
  // Strip everything except digits, take last 10
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

// ── Adjacent state map (simplified US regions) ─────────────

const STATE_REGIONS: Record<string, string> = {
  // Northeast
  ME: "NE", NH: "NE", VT: "NE", MA: "NE", RI: "NE", CT: "NE",
  NY: "NE", NJ: "NE", PA: "NE",
  // Southeast
  DE: "SE", MD: "SE", VA: "SE", WV: "SE", NC: "SE", SC: "SE",
  GA: "SE", FL: "SE", AL: "SE", MS: "SE", TN: "SE", KY: "SE",
  // Midwest
  OH: "MW", IN: "MW", IL: "MW", MI: "MW", WI: "MW", MN: "MW",
  IA: "MW", MO: "MW", ND: "MW", SD: "MW", NE: "MW", KS: "MW",
  // South Central
  TX: "SC", OK: "SC", AR: "SC", LA: "SC",
  // Mountain
  MT: "MT", WY: "MT", CO: "MT", NM: "MT", ID: "MT", UT: "MT",
  AZ: "MT", NV: "MT",
  // Pacific
  WA: "PC", OR: "PC", CA: "PC", HI: "PC", AK: "PC",
  // DC
  DC: "SE",
};

function sameRegion(stateA: string, stateB: string): boolean {
  const regionA = STATE_REGIONS[stateA.toUpperCase()];
  const regionB = STATE_REGIONS[stateB.toUpperCase()];
  if (!regionA || !regionB) return false;
  return regionA === regionB;
}

// ── Main orchestrator ──────────────────────────────────────

export async function crossReferenceCarrier(carrierId: string): Promise<CrossRefResult> {
  let score = 100;
  const issues: string[] = [];
  const checks: CrossRefResult["checks"] = {
    fmcsaNameMatch: null,
    stateMatch: null,
    entityNameMatch: null,
    addressConsistency: null,
    phoneConsistency: null,
  };

  // Load carrier from DB
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { identityVerification: true },
  });

  if (!carrier) {
    return {
      score: 0,
      issues: ["Carrier not found in database"],
      checks,
      riskLevel: "CRITICAL",
    };
  }

  // Fetch FMCSA data if DOT number available
  let fmcsa: Awaited<ReturnType<typeof verifyCarrierWithFMCSA>> | null = null;
  if (carrier.dotNumber) {
    try {
      fmcsa = await verifyCarrierWithFMCSA(carrier.dotNumber);
    } catch (e) {
      console.error("[CrossRef] FMCSA lookup error:", e);
    }
  }

  // ── a. FMCSA Legal Name vs Application Name ──
  if (carrier.companyName && fmcsa?.legalName) {
    const similarity = stringSimilarity(carrier.companyName, fmcsa.legalName);
    const match = similarity > 0.85;
    checks.fmcsaNameMatch = {
      match,
      carrierName: carrier.companyName,
      fmcsaName: fmcsa.legalName,
      similarity: Math.round(similarity * 100) / 100,
    };

    if (similarity < 0.6) {
      score -= 30;
      issues.push(`FMCSA name mismatch: "${carrier.companyName}" vs "${fmcsa.legalName}" (similarity: ${(similarity * 100).toFixed(0)}%)`);
    } else if (similarity <= 0.85) {
      score -= 10;
      issues.push(`FMCSA name partial match: "${carrier.companyName}" vs "${fmcsa.legalName}" (similarity: ${(similarity * 100).toFixed(0)}%)`);
    }
  }

  // ── b. State Cross-Check ──
  const carrierState = carrier.state?.toUpperCase() || "";
  const fmcsaState = fmcsa?.phyState?.toUpperCase() || "";
  const incorporationState = carrier.identityVerification?.sosState?.toUpperCase() || undefined;

  if (carrierState && fmcsaState) {
    const statesMatch = carrierState === fmcsaState;
    checks.stateMatch = {
      match: statesMatch,
      carrierState,
      fmcsaState,
      incorporationState,
    };

    if (!statesMatch) {
      if (sameRegion(carrierState, fmcsaState)) {
        // Adjacent region — minor flag
        score -= 10;
        issues.push(`State mismatch (adjacent): carrier ${carrierState} vs FMCSA ${fmcsaState}`);
      } else {
        // Different region — major flag
        score -= 25;
        issues.push(`State mismatch (different region): carrier ${carrierState} vs FMCSA ${fmcsaState}`);
      }
    }

    // Also check incorporation state if available
    if (incorporationState && incorporationState !== carrierState && incorporationState !== fmcsaState) {
      if (!sameRegion(incorporationState, carrierState)) {
        issues.push(`Incorporation state ${incorporationState} in different region from carrier state ${carrierState}`);
      }
    }
  }

  // ── c. Entity Name vs Carrier Name ──
  const idv = carrier.identityVerification;
  if (idv?.sosEntityName && carrier.companyName) {
    const similarity = stringSimilarity(carrier.companyName, idv.sosEntityName);
    const match = similarity > 0.85;
    checks.entityNameMatch = {
      match,
      carrierName: carrier.companyName,
      entityName: idv.sosEntityName,
      similarity: Math.round(similarity * 100) / 100,
    };

    if (similarity < 0.6) {
      score -= 15;
      issues.push(`Entity name mismatch: "${carrier.companyName}" vs SOS "${idv.sosEntityName}" (similarity: ${(similarity * 100).toFixed(0)}%)`);
    } else if (similarity <= 0.85) {
      score -= 5;
      issues.push(`Entity name partial match: "${carrier.companyName}" vs SOS "${idv.sosEntityName}" (similarity: ${(similarity * 100).toFixed(0)}%)`);
    }
  }

  // ── d. Address Consistency ──
  const carrierCity = carrier.city?.toLowerCase().trim() || "";
  const fmcsaCity = fmcsa?.phyCity?.toLowerCase().trim() || "";

  if (carrierCity && fmcsaCity) {
    const cityMatch = carrierCity === fmcsaCity;
    checks.addressConsistency = {
      match: cityMatch,
      carrierCity: carrier.city || "",
      fmcsaCity: fmcsa?.phyCity || "",
    };

    if (!cityMatch) {
      // Check if at least same state
      if (carrierState && fmcsaState && carrierState === fmcsaState) {
        // Same state, different city — minor
        score -= 5;
        issues.push(`City mismatch (same state): "${carrier.city}" vs FMCSA "${fmcsa?.phyCity}"`);
      } else {
        score -= 10;
        issues.push(`City mismatch: "${carrier.city}" vs FMCSA "${fmcsa?.phyCity}"`);
      }
    }
  }

  // ── e. Phone Consistency ──
  const carrierPhone = carrier.contactPhone ? normalizePhone(carrier.contactPhone) : "";
  const fmcsaPhone = fmcsa?.phone ? normalizePhone(fmcsa.phone) : "";

  if (carrierPhone && fmcsaPhone) {
    const phoneMatch = carrierPhone === fmcsaPhone;
    checks.phoneConsistency = {
      match: phoneMatch,
      carrierPhone: carrier.contactPhone || "",
      fmcsaPhone: fmcsa?.phone || "",
    };

    if (!phoneMatch) {
      score -= 5;
      issues.push("Phone number does not match FMCSA records");
    }
  }

  // ── Clamp & determine risk level ──
  score = Math.max(0, Math.min(100, score));

  let riskLevel: CrossRefResult["riskLevel"];
  if (score >= 80) riskLevel = "LOW";
  else if (score >= 60) riskLevel = "MEDIUM";
  else if (score >= 40) riskLevel = "HIGH";
  else riskLevel = "CRITICAL";

  return { score, issues, checks, riskLevel };
}
