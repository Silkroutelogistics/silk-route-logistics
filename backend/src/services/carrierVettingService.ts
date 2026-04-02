/**
 * Compass by SRL — Vetting Engine — 31-Check Composite Risk Scoring
 * Covers FMCSA, identity, fraud, OFAC/SDN, biometrics, ELD, TIN match,
 * UCR, overbooking, fraud reports, agreements, historical performance,
 * fleet VIN verification (NHTSA), probationary period, document expiry,
 * SAM.gov federal exclusion screening, and cross-reference identity validation.
 */

import { prisma } from "../config/database";
import { verifyCarrierWithFMCSA } from "./fmcsaService";
import { screenCarrier } from "./ofacScreeningService";
import { validateEldProvider } from "./eldValidationService";
import { checkOverbooking } from "./overbookingService";
import { updateCarrierCsaScores } from "./csaBasicService";
import { verifyAllCarrierVins } from "./vinVerificationService";
import { checkExclusions } from "./samGovService";
import { verifyTinWithIRS } from "./tinMatchService";
import type { EnhancedTinResult } from "./tinMatchService";
import { crossReferenceCarrier } from "./crossReferenceService";

// ── Types ────────────────────────────────────────────────

export type CheckResult = "PASS" | "FAIL" | "WARNING";

export interface VettingCheck {
  name: string;
  result: CheckResult;
  detail: string;
  deduction: number;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Recommendation = "APPROVE" | "REVIEW" | "REJECT";
export type VettingGrade = "A" | "B" | "C" | "D" | "F";

export interface CarrierVettingReport {
  dotNumber: string;
  mcNumber: string | null;
  legalName: string | null;
  score: number;
  grade: VettingGrade;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  checks: VettingCheck[];
  fmcsaData: {
    operatingStatus: string | null;
    entityType: string | null;
    safetyRating: string | null;
    insuranceOnFile: boolean;
    outOfServiceDate: string | null;
    totalDrivers: number | null;
    totalPowerUnits: number | null;
  };
  identityData: {
    identityScore: number | null;
    identityStatus: string | null;
    emailProvider: string | null;
    phoneType: string | null;
    sosStatus: string | null;
    chameleonRiskLevel: string | null;
  } | null;
  flags: string[];
  previousScore: number | null;
  scoreDelta: number | null;
  trendDirection: string | null;
  vettedAt: string;
}

// ── Scoring Logic ────────────────────────────────────────

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
}

function getGrade(score: number): VettingGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function getRecommendation(riskLevel: RiskLevel): Recommendation {
  if (riskLevel === "LOW") return "APPROVE";
  if (riskLevel === "CRITICAL") return "REJECT";
  return "REVIEW";
}

// ── Core Vetting Function ────────────────────────────────

export async function vetCarrier(
  dotNumber: string,
  mcNumber?: string
): Promise<CarrierVettingReport> {
  const fmcsa = await verifyCarrierWithFMCSA(dotNumber);

  const checks: VettingCheck[] = [];
  const flags: string[] = [];
  let score = 100;

  // ── Look up existing carrier in DB ──
  const existingCarrier = await prisma.carrierProfile.findFirst({
    where: {
      OR: [
        { dotNumber },
        ...(mcNumber ? [{ mcNumber }] : []),
      ],
    },
    include: {
      identityVerification: true,
      fingerprint: true,
      vettingReports: { orderBy: { createdAt: "desc" as const }, take: 10 },
      scorecards: { orderBy: { calculatedAt: "desc" as const }, take: 1 },
    },
  });

  // ── 1. FMCSA Operating Authority (INSTANT FAIL) ──
  if (!fmcsa.verified || fmcsa.operatingStatus !== "AUTHORIZED") {
    checks.push({
      name: "FMCSA Operating Authority",
      result: "FAIL",
      detail: `Status: ${fmcsa.operatingStatus || "NOT FOUND"}`,
      deduction: 100,
    });
    score -= 100;
    flags.push("Authority not authorized — instant fail");
  } else {
    checks.push({
      name: "FMCSA Operating Authority",
      result: "PASS",
      detail: "AUTHORIZED",
      deduction: 0,
    });
  }

  // ── 2. Out of Service Status (INSTANT FAIL) ──
  if (fmcsa.outOfServiceDate) {
    checks.push({
      name: "Out of Service Status",
      result: "FAIL",
      detail: `OOS date: ${fmcsa.outOfServiceDate}`,
      deduction: 100,
    });
    score -= 100;
    flags.push("Carrier has Out-of-Service date — instant fail");
  } else {
    checks.push({
      name: "Out of Service Status",
      result: "PASS",
      detail: "No OOS date on record",
      deduction: 0,
    });
  }

  // ── 3. FMCSA Insurance on File ──
  if (!fmcsa.insuranceOnFile) {
    checks.push({ name: "FMCSA Insurance on File", result: "FAIL", detail: "BIPD insurance not on file with FMCSA", deduction: 30 });
    score -= 30;
    flags.push("No insurance on file with FMCSA");
  } else {
    checks.push({ name: "FMCSA Insurance on File", result: "PASS", detail: "Insurance on file", deduction: 0 });
  }

  // ── 4. Safety Rating ──
  const rating = fmcsa.safetyRating?.toUpperCase();
  if (rating === "UNSATISFACTORY") {
    checks.push({ name: "Safety Rating", result: "FAIL", detail: "UNSATISFACTORY", deduction: 25 });
    score -= 25;
    flags.push("Unsatisfactory safety rating");
  } else if (rating === "CONDITIONAL") {
    checks.push({ name: "Safety Rating", result: "WARNING", detail: "CONDITIONAL", deduction: 15 });
    score -= 15;
    flags.push("Conditional safety rating");
  } else if (!rating || rating === "NONE" || rating === "NOT RATED") {
    checks.push({ name: "Safety Rating", result: "WARNING", detail: "No safety rating on file", deduction: 5 });
    score -= 5;
  } else {
    checks.push({ name: "Safety Rating", result: "PASS", detail: fmcsa.safetyRating || "SATISFACTORY", deduction: 0 });
  }

  // ── 5. Double-Broker Risk ──
  const entityType = fmcsa.entityType?.toUpperCase() || "";
  if (entityType.includes("BROKER")) {
    checks.push({ name: "Double-Broker Risk", result: "FAIL", detail: `Entity type: ${fmcsa.entityType}`, deduction: 15 });
    score -= 15;
    flags.push("Entity type includes BROKER — double-broker risk");
  } else {
    checks.push({ name: "Double-Broker Risk", result: "PASS", detail: fmcsa.entityType || "CARRIER", deduction: 0 });
  }

  // ── 6. Fleet Size ──
  const powerUnits = fmcsa.totalPowerUnits || 0;
  if (powerUnits > 0 && powerUnits < 3) {
    checks.push({ name: "Fleet Size", result: "WARNING", detail: `${powerUnits} power unit(s)`, deduction: 5 });
    score -= 5;
  } else {
    checks.push({ name: "Fleet Size", result: "PASS", detail: powerUnits > 0 ? `${powerUnits} power unit(s)` : "Not reported", deduction: 0 });
  }

  // ── 7. New Carrier Risk ──
  const noRating = !rating || rating === "NONE" || rating === "NOT RATED";
  if (powerUnits === 1 && noRating) {
    checks.push({ name: "New Carrier Risk", result: "FAIL", detail: "Single truck with no safety rating", deduction: 10 });
    score -= 10;
    flags.push("New/tiny carrier — 1 truck, no safety rating");
  } else {
    checks.push({ name: "New Carrier Risk", result: "PASS", detail: "Established carrier", deduction: 0 });
  }

  // ── 8. Insurance Minimums (Internal) ──
  let insuranceDeduction = 0;
  const insuranceDetails: string[] = [];
  if (existingCarrier) {
    if (existingCarrier.autoLiabilityAmount && existingCarrier.autoLiabilityAmount < 1000000) {
      insuranceDeduction += 10;
      insuranceDetails.push(`Auto liability $${existingCarrier.autoLiabilityAmount.toLocaleString()} < $1M minimum`);
    }
    if (existingCarrier.cargoInsuranceAmount && existingCarrier.cargoInsuranceAmount < 100000) {
      insuranceDeduction += 10;
      insuranceDetails.push(`Cargo insurance $${existingCarrier.cargoInsuranceAmount.toLocaleString()} < $100K minimum`);
    }
  }
  if (insuranceDeduction > 0) {
    checks.push({ name: "Insurance Minimums (Internal)", result: "FAIL", detail: insuranceDetails.join("; "), deduction: insuranceDeduction });
    score -= insuranceDeduction;
    flags.push(...insuranceDetails);
  } else {
    const detail = existingCarrier?.autoLiabilityAmount || existingCarrier?.cargoInsuranceAmount
      ? [
          existingCarrier.autoLiabilityAmount ? `Auto: $${existingCarrier.autoLiabilityAmount.toLocaleString()}` : null,
          existingCarrier.cargoInsuranceAmount ? `Cargo: $${existingCarrier.cargoInsuranceAmount.toLocaleString()}` : null,
        ].filter(Boolean).join(", ")
      : "No internal record to check";
    checks.push({ name: "Insurance Minimums (Internal)", result: "PASS", detail, deduction: 0 });
  }

  // ══════════════════════════════════════════════════════════
  // NEW CHECKS (9-18)
  // ══════════════════════════════════════════════════════════

  // ── 9. Authority Age ──
  if (existingCarrier?.authorityGrantedDate) {
    const ageDays = Math.floor((Date.now() - new Date(existingCarrier.authorityGrantedDate).getTime()) / 86_400_000);
    if (ageDays < 90) {
      checks.push({ name: "Authority Age", result: "WARNING", detail: `${ageDays} days (< 90 days)`, deduction: 10 });
      score -= 10;
      flags.push(`New authority: only ${ageDays} days old`);
    } else if (ageDays < 180) {
      checks.push({ name: "Authority Age", result: "WARNING", detail: `${ageDays} days (< 180 days)`, deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Authority Age", result: "PASS", detail: `${ageDays} days`, deduction: 0 });
    }
  } else {
    checks.push({ name: "Authority Age", result: "WARNING", detail: "Authority grant date unknown", deduction: 5 });
    score -= 5;
  }

  // ── 10. CSA BASIC Scores (LIVE fetch if available) ──
  // Try to fetch fresh CSA scores if carrier exists
  let csaBasics = existingCarrier?.fmcsaBasicScores as Record<string, number> | null;
  if (existingCarrier && (!csaBasics || Object.keys(csaBasics).length === 0)) {
    try {
      const csaResult = await updateCarrierCsaScores(existingCarrier.id);
      if (csaResult) {
        const { fetchedAt, ...numericScores } = csaResult;
        csaBasics = numericScores as Record<string, number>;
      }
    } catch (e) {
      console.error("[Compass Vet] Live CSA score fetch error:", e);
    }
  }
  if (csaBasics && typeof csaBasics === "object") {
    const maxPctl = Math.max(...Object.values(csaBasics).filter((v) => typeof v === "number"));
    if (maxPctl > 90) {
      checks.push({ name: "CSA BASIC Scores", result: "FAIL", detail: `Highest percentile: ${maxPctl}th (> 90th)`, deduction: 15 });
      score -= 15;
      flags.push(`CSA BASIC score exceeds 90th percentile`);
    } else if (maxPctl > 75) {
      checks.push({ name: "CSA BASIC Scores", result: "WARNING", detail: `Highest percentile: ${maxPctl}th (> 75th)`, deduction: 8 });
      score -= 8;
    } else {
      checks.push({ name: "CSA BASIC Scores", result: "PASS", detail: `Highest percentile: ${maxPctl}th`, deduction: 0 });
    }
  } else {
    checks.push({ name: "CSA BASIC Scores", result: "PASS", detail: "No CSA data on file", deduction: 0 });
  }

  // ── 11. Identity Verification ──
  const idv = existingCarrier?.identityVerification;
  if (idv) {
    if (idv.identityStatus === "VERIFIED") {
      checks.push({ name: "Identity Verification", result: "PASS", detail: `Score: ${idv.identityScore}/100`, deduction: 0 });
    } else if (idv.identityStatus === "PARTIAL") {
      checks.push({ name: "Identity Verification", result: "WARNING", detail: `Partial verification (${idv.identityScore}/100)`, deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Identity Verification", result: "FAIL", detail: `Status: ${idv.identityStatus}`, deduction: 15 });
      score -= 15;
      flags.push("Identity not verified");
    }
  } else {
    checks.push({ name: "Identity Verification", result: "WARNING", detail: "Not yet checked", deduction: 15 });
    score -= 15;
    flags.push("Identity verification pending");
  }

  // ── 12. Email Domain ──
  if (idv) {
    if (idv.emailIsDisposable) {
      checks.push({ name: "Email Domain", result: "FAIL", detail: "Disposable email domain", deduction: 10 });
      score -= 10;
      flags.push("Disposable email domain detected");
    } else if (idv.emailProvider === "FREE") {
      checks.push({ name: "Email Domain", result: "WARNING", detail: "Free email provider", deduction: 5 });
      score -= 5;
    } else if (idv.emailProvider === "BUSINESS" && idv.emailDomainValid) {
      const ageInfo = idv.emailDomainAge ? ` (${idv.emailDomainAge} days old)` : "";
      if (idv.emailDomainAge !== null && idv.emailDomainAge < 90) {
        checks.push({ name: "Email Domain", result: "WARNING", detail: `Business email, new domain${ageInfo}`, deduction: 5 });
        score -= 5;
      } else {
        checks.push({ name: "Email Domain", result: "PASS", detail: `Business email${ageInfo}`, deduction: 0 });
      }
    } else {
      checks.push({ name: "Email Domain", result: "WARNING", detail: "Could not validate email domain", deduction: 5 });
      score -= 5;
    }
  } else {
    checks.push({ name: "Email Domain", result: "WARNING", detail: "Not yet checked", deduction: 5 });
    score -= 5;
  }

  // ── 13. VoIP Phone Detection ──
  if (idv) {
    if (idv.phoneIsVoip) {
      checks.push({ name: "VoIP Phone Detection", result: "FAIL", detail: `VoIP detected (${idv.phoneCarrier || "unknown carrier"})`, deduction: 10 });
      score -= 10;
      flags.push("VoIP phone number detected");
    } else {
      checks.push({ name: "VoIP Phone Detection", result: "PASS", detail: `${idv.phoneType || "Mobile"} phone`, deduction: 0 });
    }
  } else {
    checks.push({ name: "VoIP Phone Detection", result: "WARNING", detail: "Not yet checked", deduction: 5 });
    score -= 5;
  }

  // ── 14. Chameleon Risk ──
  if (existingCarrier) {
    const chameleonLevel = existingCarrier.chameleonRiskLevel;
    if (chameleonLevel === "HIGH") {
      checks.push({ name: "Chameleon Risk", result: "FAIL", detail: "Multiple identity matches with other carriers", deduction: 20 });
      score -= 20;
      flags.push("HIGH chameleon risk — multiple fingerprint matches");
    } else if (chameleonLevel === "MEDIUM") {
      checks.push({ name: "Chameleon Risk", result: "WARNING", detail: "Some identity overlap with other carriers", deduction: 10 });
      score -= 10;
      flags.push("MEDIUM chameleon risk");
    } else if (chameleonLevel === "LOW") {
      checks.push({ name: "Chameleon Risk", result: "WARNING", detail: "Minor identity overlap detected", deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Chameleon Risk", result: "PASS", detail: "No identity overlaps found", deduction: 0 });
    }
  } else {
    checks.push({ name: "Chameleon Risk", result: "PASS", detail: "New carrier — no history to check", deduction: 0 });
  }

  // ── 15. Business Entity (SOS) ──
  if (idv) {
    if (idv.sosStatus === "DISSOLVED") {
      checks.push({ name: "Business Entity (SOS)", result: "FAIL", detail: `Entity dissolved in ${idv.sosState || "unknown state"}`, deduction: 15 });
      score -= 15;
      flags.push("Business entity dissolved per Secretary of State");
    } else if (idv.sosStatus === "NOT_FOUND") {
      checks.push({ name: "Business Entity (SOS)", result: "WARNING", detail: "Entity not found in SOS records", deduction: 10 });
      score -= 10;
    } else if (idv.sosStatus === "INACTIVE") {
      checks.push({ name: "Business Entity (SOS)", result: "WARNING", detail: `Entity inactive in ${idv.sosState || "unknown state"}`, deduction: 5 });
      score -= 5;
    } else if (idv.sosVerified) {
      checks.push({ name: "Business Entity (SOS)", result: "PASS", detail: `Active entity: ${idv.sosEntityName || "Verified"}`, deduction: 0 });
    } else {
      checks.push({ name: "Business Entity (SOS)", result: "WARNING", detail: "Not verified", deduction: 5 });
      score -= 5;
    }
  } else {
    checks.push({ name: "Business Entity (SOS)", result: "WARNING", detail: "Not yet checked", deduction: 5 });
    score -= 5;
  }

  // ── 16. Document Completeness ──
  if (existingCarrier) {
    let docDeduction = 0;
    const missingDocs: string[] = [];
    if (!existingCarrier.w9Uploaded) { docDeduction += 5; missingDocs.push("W-9"); }
    if (!existingCarrier.insuranceCertUploaded) { docDeduction += 5; missingDocs.push("Insurance Certificate"); }
    if (!existingCarrier.authorityDocUploaded) { docDeduction += 5; missingDocs.push("Authority Document"); }

    if (docDeduction > 0) {
      checks.push({ name: "Document Completeness", result: "WARNING", detail: `Missing: ${missingDocs.join(", ")}`, deduction: docDeduction });
      score -= docDeduction;
    } else {
      checks.push({ name: "Document Completeness", result: "PASS", detail: "All required documents uploaded", deduction: 0 });
    }
  } else {
    checks.push({ name: "Document Completeness", result: "WARNING", detail: "No carrier record found", deduction: 5 });
    score -= 5;
  }

  // ── 17. Insurance Expiry Proximity ──
  if (existingCarrier?.insuranceExpiry) {
    const daysUntilExpiry = Math.floor((new Date(existingCarrier.insuranceExpiry).getTime() - Date.now()) / 86_400_000);
    if (daysUntilExpiry < 0) {
      checks.push({ name: "Insurance Expiry Proximity", result: "FAIL", detail: `Expired ${Math.abs(daysUntilExpiry)} days ago`, deduction: 10 });
      score -= 10;
      flags.push("Insurance expired");
    } else if (daysUntilExpiry < 14) {
      checks.push({ name: "Insurance Expiry Proximity", result: "WARNING", detail: `Expires in ${daysUntilExpiry} days`, deduction: 10 });
      score -= 10;
      flags.push(`Insurance expiring in ${daysUntilExpiry} days`);
    } else if (daysUntilExpiry < 30) {
      checks.push({ name: "Insurance Expiry Proximity", result: "WARNING", detail: `Expires in ${daysUntilExpiry} days`, deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Insurance Expiry Proximity", result: "PASS", detail: `Expires in ${daysUntilExpiry} days`, deduction: 0 });
    }
  } else {
    checks.push({ name: "Insurance Expiry Proximity", result: "WARNING", detail: "No expiry date on file", deduction: 5 });
    score -= 5;
  }

  // ── 18. Historical Performance ──
  if (existingCarrier?.scorecards && existingCarrier.scorecards.length > 0) {
    const latestScore = existingCarrier.scorecards[0].overallScore;
    if (latestScore < 50) {
      checks.push({ name: "Historical Performance", result: "FAIL", detail: `Scorecard: ${latestScore.toFixed(0)}/100`, deduction: 10 });
      score -= 10;
      flags.push(`Poor historical performance: ${latestScore.toFixed(0)}/100`);
    } else if (latestScore < 70) {
      checks.push({ name: "Historical Performance", result: "WARNING", detail: `Scorecard: ${latestScore.toFixed(0)}/100`, deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Historical Performance", result: "PASS", detail: `Scorecard: ${latestScore.toFixed(0)}/100`, deduction: 0 });
    }
  } else {
    checks.push({ name: "Historical Performance", result: "PASS", detail: "No performance history (new carrier)", deduction: 0 });
  }

  // ── 19. OFAC/SDN Screening (LIVE) ──
  // Run OFAC screening live during vetting instead of reading stale DB values
  let ofacStatus: string | null = existingCarrier?.ofacStatus || null;
  if (existingCarrier) {
    try {
      const ofacResult = await screenCarrier(existingCarrier.id);
      ofacStatus = ofacResult.ofacStatus;
    } catch (e) {
      console.error("[Compass Vet] Live OFAC screening error:", e);
      ofacStatus = existingCarrier.ofacStatus || "ERROR";
    }
  }
  if (ofacStatus === "CONFIRMED_MATCH") {
    checks.push({ name: "OFAC/SDN Screening", result: "FAIL", detail: "Confirmed OFAC match — sanctioned entity", deduction: 100 });
    score -= 100;
    flags.push("OFAC/SDN CONFIRMED MATCH — instant fail");
  } else if (ofacStatus === "POTENTIAL_MATCH") {
    checks.push({ name: "OFAC/SDN Screening", result: "FAIL", detail: "Potential OFAC match — review required", deduction: 25 });
    score -= 25;
    flags.push("Potential OFAC/SDN match detected");
  } else if (ofacStatus === "ERROR") {
    checks.push({ name: "OFAC/SDN Screening", result: "WARNING", detail: "OFAC screening failed — manual check required", deduction: 10 });
    score -= 10;
  } else if (ofacStatus === "CLEAR") {
    checks.push({ name: "OFAC/SDN Screening", result: "PASS", detail: "Screened — no matches", deduction: 0 });
  } else {
    checks.push({ name: "OFAC/SDN Screening", result: "WARNING", detail: "Not yet screened", deduction: 10 });
    score -= 10;
    flags.push("OFAC screening pending");
  }

  // ── 20. ELD Device Verification (LIVE) ──
  // Run ELD validation live — checks provider against FMCSA registered list
  let eldStatus: string | null = null;
  let eldProvider: string | null = null;
  if (existingCarrier) {
    try {
      const eldResult = await validateEldProvider(existingCarrier.id);
      eldStatus = eldResult.status;
      eldProvider = eldResult.eldProvider || existingCarrier.eldProvider;
    } catch (e) {
      console.error("[Compass Vet] Live ELD validation error:", e);
      eldStatus = existingCarrier.eldOnFmcsaList;
      eldProvider = existingCarrier.eldProvider;
    }
  }
  if (eldStatus === "VERIFIED") {
    checks.push({ name: "ELD Device Verification", result: "PASS", detail: `Provider: ${eldProvider || "Verified"}`, deduction: 0 });
  } else if (eldStatus === "EXEMPT") {
    checks.push({ name: "ELD Device Verification", result: "PASS", detail: "ELD exempt", deduction: 0 });
  } else if (eldStatus === "NOT_ON_FMCSA_LIST") {
    checks.push({ name: "ELD Device Verification", result: "WARNING", detail: `Provider "${eldProvider}" not on FMCSA list`, deduction: 8 });
    score -= 8;
    flags.push("ELD provider not on FMCSA registered list");
  } else {
    checks.push({ name: "ELD Device Verification", result: "WARNING", detail: "ELD not verified", deduction: 5 });
    score -= 5;
  }

  // ── 21. W-9 TIN Match (Enhanced Validation) ──
  let tinResult: EnhancedTinResult | null = null;
  if (idv && idv.w9TinFull && idv.w9CompanyName) {
    try {
      tinResult = await verifyTinWithIRS(idv.w9TinFull, idv.w9CompanyName);
    } catch (err) {
      console.warn("[Vetting] Enhanced TIN check failed, falling back to stored status:", err);
    }
  }

  if (tinResult) {
    // Use live enhanced TIN validation result
    const secNote = tinResult.secCrossRef ? " (SEC cross-ref confirmed)" : "";
    const confNote = ` [confidence: ${tinResult.confidence}]`;

    if (tinResult.status === "IRS_MATCHED") {
      checks.push({ name: "W-9 TIN Match", result: "PASS", detail: `TIN verified with IRS${secNote}${confNote}`, deduction: 0 });
    } else if (tinResult.status === "VALID_FORMAT") {
      const deduction = tinResult.secCrossRef ? 0 : 3;
      const detail = tinResult.secCrossRef
        ? `Valid EIN format, SEC cross-ref confirmed${confNote}`
        : `Valid EIN format, valid IRS prefix — IRS verification pending${confNote}`;
      checks.push({ name: "W-9 TIN Match", result: tinResult.secCrossRef ? "PASS" : "WARNING", detail, deduction });
      score -= deduction;
    } else if (tinResult.status === "SUSPICIOUS") {
      checks.push({ name: "W-9 TIN Match", result: "FAIL", detail: `Suspicious TIN pattern: ${tinResult.formatIssues.join("; ")}${confNote}`, deduction: 15 });
      score -= 15;
      flags.push("W-9 TIN flagged as suspicious");
    } else if (tinResult.status === "IRS_MISMATCHED") {
      checks.push({ name: "W-9 TIN Match", result: "FAIL", detail: `TIN does not match IRS records: ${tinResult.formatIssues.join("; ")}${confNote}`, deduction: 15 });
      score -= 15;
      flags.push("W-9 TIN mismatch with IRS records");
    } else if (tinResult.status === "INVALID_FORMAT") {
      checks.push({ name: "W-9 TIN Match", result: "FAIL", detail: `Invalid TIN format: ${tinResult.formatIssues.join("; ")}${confNote}`, deduction: 10 });
      score -= 10;
      flags.push("W-9 TIN has invalid format");
    }
  } else if (idv) {
    // Fallback to stored DB status if enhanced check unavailable
    if (idv.w9TinMatchStatus === "MATCHED") {
      checks.push({ name: "W-9 TIN Match", result: "PASS", detail: `TIN verified with IRS ${idv.w9TinMatchVerifiedAt ? new Date(idv.w9TinMatchVerifiedAt).toLocaleDateString() : ""}`, deduction: 0 });
    } else if (idv.w9TinMatchStatus === "FORMAT_VALID") {
      checks.push({ name: "W-9 TIN Match", result: "WARNING", detail: "TIN format valid — IRS verification unavailable", deduction: 3 });
      score -= 3;
    } else if (idv.w9TinMatchStatus === "MISMATCHED") {
      checks.push({ name: "W-9 TIN Match", result: "FAIL", detail: "TIN does not match IRS records", deduction: 15 });
      score -= 15;
      flags.push("W-9 TIN mismatch with IRS records");
    } else if (idv.w9TinMatchStatus === "SUSPICIOUS") {
      checks.push({ name: "W-9 TIN Match", result: "FAIL", detail: "TIN flagged as suspicious", deduction: 15 });
      score -= 15;
      flags.push("W-9 TIN flagged as suspicious");
    } else if (idv.w9TinMatchStatus === "IRS_ERROR") {
      checks.push({ name: "W-9 TIN Match", result: "WARNING", detail: "IRS verification service unavailable", deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "W-9 TIN Match", result: "WARNING", detail: "TIN not yet verified", deduction: 5 });
      score -= 5;
    }
  } else {
    checks.push({ name: "W-9 TIN Match", result: "WARNING", detail: "Not yet checked", deduction: 5 });
    score -= 5;
  }

  // ── 22. Biometric Facial Match ──
  if (idv) {
    if (idv.facialMatchStatus === "MATCHED") {
      checks.push({ name: "Biometric Facial Match", result: "PASS", detail: `Match score: ${idv.facialMatchScore?.toFixed(0)}%`, deduction: 0 });
    } else if (idv.facialMatchStatus === "MISMATCH") {
      checks.push({ name: "Biometric Facial Match", result: "FAIL", detail: `Match score: ${idv.facialMatchScore?.toFixed(0)}% — mismatch`, deduction: 15 });
      score -= 15;
      flags.push("Facial recognition mismatch");
    } else if (idv.facialMatchStatus === "SKIPPED") {
      checks.push({ name: "Biometric Facial Match", result: "WARNING", detail: "Requires manual review (no AWS Rekognition)", deduction: 5 });
      score -= 5;
    } else if (idv.selfieUploaded && idv.photoIdUploaded) {
      checks.push({ name: "Biometric Facial Match", result: "WARNING", detail: "Images uploaded, verification pending", deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Biometric Facial Match", result: "WARNING", detail: "Selfie or photo ID not uploaded", deduction: 8 });
      score -= 8;
    }
  } else {
    checks.push({ name: "Biometric Facial Match", result: "WARNING", detail: "Not yet checked", deduction: 8 });
    score -= 8;
  }

  // ── 23. Fraud Report History ──
  if (existingCarrier) {
    const fraudReports = await prisma.fraudReport.count({
      where: {
        carrierId: existingCarrier.id,
        status: { in: ["CONFIRMED", "PERMANENT"] },
      },
    });
    if (fraudReports > 0) {
      const deduction = Math.min(fraudReports * 10, 30);
      checks.push({ name: "Fraud Report History", result: "FAIL", detail: `${fraudReports} confirmed fraud report(s)`, deduction });
      score -= deduction;
      flags.push(`${fraudReports} confirmed fraud report(s) on file`);
    } else {
      const pendingReports = await prisma.fraudReport.count({
        where: { carrierId: existingCarrier.id, status: { in: ["PENDING", "UNDER_REVIEW"] } },
      });
      if (pendingReports > 0) {
        checks.push({ name: "Fraud Report History", result: "WARNING", detail: `${pendingReports} pending report(s) under review`, deduction: 5 });
        score -= 5;
      } else {
        checks.push({ name: "Fraud Report History", result: "PASS", detail: "No fraud reports on file", deduction: 0 });
      }
    }
  } else {
    checks.push({ name: "Fraud Report History", result: "PASS", detail: "New carrier — no history", deduction: 0 });
  }

  // ── 24. UCR Registration ──
  if (existingCarrier) {
    const ucr = existingCarrier.ucrStatus;
    if (ucr === "VERIFIED") {
      checks.push({ name: "UCR Registration", result: "PASS", detail: `Verified for ${existingCarrier.ucrYear || "current year"}`, deduction: 0 });
    } else if (ucr === "EXPIRED") {
      checks.push({ name: "UCR Registration", result: "WARNING", detail: "UCR registration expired", deduction: 5 });
      score -= 5;
    } else if (ucr === "NOT_REQUIRED") {
      checks.push({ name: "UCR Registration", result: "PASS", detail: "UCR not required", deduction: 0 });
    } else {
      checks.push({ name: "UCR Registration", result: "WARNING", detail: "UCR not verified", deduction: 3 });
      score -= 3;
    }
  } else {
    checks.push({ name: "UCR Registration", result: "WARNING", detail: "Not yet checked", deduction: 3 });
    score -= 3;
  }

  // ── 25. Overbooking Risk (LIVE) ──
  // Run overbooking check live — calculates active loads vs fleet capacity
  if (existingCarrier) {
    let overbooking: string | null = null;
    let activeLoads = 0;
    try {
      const obResult = await checkOverbooking(existingCarrier.id);
      overbooking = obResult.risk;
      activeLoads = obResult.activeLoadCount;
    } catch (e) {
      console.error("[Compass Vet] Live overbooking check error:", e);
      overbooking = existingCarrier.overbookingRisk;
      activeLoads = existingCarrier.activeLoadCount;
    }
    if (overbooking === "CRITICAL") {
      checks.push({ name: "Overbooking Risk", result: "FAIL", detail: `${activeLoads} active loads — potential double-brokering`, deduction: 20 });
      score -= 20;
      flags.push("CRITICAL overbooking — likely double-brokering");
    } else if (overbooking === "HIGH") {
      checks.push({ name: "Overbooking Risk", result: "FAIL", detail: `${activeLoads} active loads vs ${existingCarrier.numberOfTrucks || "unknown"} trucks`, deduction: 10 });
      score -= 10;
      flags.push("HIGH overbooking risk");
    } else if (overbooking === "MEDIUM") {
      checks.push({ name: "Overbooking Risk", result: "WARNING", detail: `${activeLoads} active loads`, deduction: 5 });
      score -= 5;
    } else {
      checks.push({ name: "Overbooking Risk", result: "PASS", detail: `${activeLoads} active loads`, deduction: 0 });
    }
  } else {
    checks.push({ name: "Overbooking Risk", result: "PASS", detail: "New carrier", deduction: 0 });
  }

  // ── 26. Carrier-Broker Agreement ──
  if (existingCarrier) {
    const agreement = await prisma.carrierAgreement.findFirst({
      where: { carrierId: existingCarrier.id, status: "SIGNED" },
      orderBy: { signedAt: "desc" },
    });
    if (agreement) {
      if (agreement.expiresAt && agreement.expiresAt < new Date()) {
        checks.push({ name: "Carrier-Broker Agreement", result: "WARNING", detail: "Agreement expired", deduction: 5 });
        score -= 5;
      } else {
        checks.push({ name: "Carrier-Broker Agreement", result: "PASS", detail: `Signed ${agreement.signedAt?.toLocaleDateString() || ""}`, deduction: 0 });
      }
    } else {
      checks.push({ name: "Carrier-Broker Agreement", result: "WARNING", detail: "No signed agreement on file", deduction: 5 });
      score -= 5;
    }
  } else {
    checks.push({ name: "Carrier-Broker Agreement", result: "WARNING", detail: "No carrier record", deduction: 5 });
    score -= 5;
  }

  // ── 27. Fleet VIN Verification (NHTSA API) ──
  if (existingCarrier) {
    try {
      const vinStats = await verifyAllCarrierVins(existingCarrier.userId);
      const totalChecked = vinStats.verified + vinStats.mismatch + vinStats.notFound;
      if (totalChecked === 0) {
        checks.push({ name: "Fleet VIN Verification", result: "WARNING", detail: "No trucks with VINs on file", deduction: 5 });
        score -= 5;
      } else if (vinStats.mismatch > 0) {
        const deduction = Math.min(vinStats.mismatch * 8, 20);
        checks.push({ name: "Fleet VIN Verification", result: "FAIL", detail: `${vinStats.mismatch} VIN mismatch(es) of ${totalChecked} checked`, deduction });
        score -= deduction;
        flags.push(`${vinStats.mismatch} truck VIN(s) don't match NHTSA records`);
      } else if (vinStats.notFound > 0) {
        checks.push({ name: "Fleet VIN Verification", result: "WARNING", detail: `${vinStats.notFound} VIN(s) not found in NHTSA`, deduction: 3 });
        score -= 3;
      } else {
        checks.push({ name: "Fleet VIN Verification", result: "PASS", detail: `${vinStats.verified} truck(s) verified via NHTSA`, deduction: 0 });
      }
    } catch (e) {
      checks.push({ name: "Fleet VIN Verification", result: "WARNING", detail: "VIN verification unavailable", deduction: 3 });
      score -= 3;
    }
  } else {
    checks.push({ name: "Fleet VIN Verification", result: "WARNING", detail: "No carrier record", deduction: 3 });
    score -= 3;
  }

  // ── 28. Probationary Period (New Carrier Risk Gate) ──
  if (existingCarrier) {
    const completedLoads = existingCarrier.cppTotalLoads || 0;
    const daysSinceApproval = existingCarrier.cppJoinedDate
      ? Math.floor((Date.now() - new Date(existingCarrier.cppJoinedDate).getTime()) / 86_400_000)
      : 0;

    if (completedLoads < 3 && daysSinceApproval < 90) {
      checks.push({
        name: "Probationary Period",
        result: "WARNING",
        detail: `${completedLoads}/3 loads completed, ${daysSinceApproval} days since approval — probationary`,
        deduction: 5,
      });
      score -= 5;
      flags.push(`Probationary carrier: ${completedLoads}/3 loads, ${daysSinceApproval}/90 days`);
    } else {
      checks.push({
        name: "Probationary Period",
        result: "PASS",
        detail: `${completedLoads} loads completed, ${daysSinceApproval} days active`,
        deduction: 0,
      });
    }
  } else {
    checks.push({ name: "Probationary Period", result: "WARNING", detail: "New carrier", deduction: 5 });
    score -= 5;
  }

  // ── 29. Document Expiry Enforcement ──
  if (existingCarrier) {
    const docIssues: string[] = [];
    let docDeduction = 0;
    const now2 = new Date();
    const thirtyDays = new Date(now2.getTime() + 30 * 86_400_000);

    // W-9 expiry (annual)
    if (existingCarrier.w9ExpiryDate) {
      if (new Date(existingCarrier.w9ExpiryDate) < now2) {
        docDeduction += 5; docIssues.push("W-9 expired");
      } else if (new Date(existingCarrier.w9ExpiryDate) < thirtyDays) {
        docDeduction += 3; docIssues.push("W-9 expiring within 30 days");
      }
    }
    // COI expiry
    if (existingCarrier.coiExpiryDate) {
      if (new Date(existingCarrier.coiExpiryDate) < now2) {
        docDeduction += 8; docIssues.push("Certificate of Insurance expired");
      } else if (new Date(existingCarrier.coiExpiryDate) < thirtyDays) {
        docDeduction += 3; docIssues.push("COI expiring within 30 days");
      }
    }
    // Authority letter expiry
    if (existingCarrier.authorityDocExpiryDate) {
      if (new Date(existingCarrier.authorityDocExpiryDate) < now2) {
        docDeduction += 5; docIssues.push("Authority document expired");
      } else if (new Date(existingCarrier.authorityDocExpiryDate) < thirtyDays) {
        docDeduction += 3; docIssues.push("Authority doc expiring within 30 days");
      }
    }

    if (docDeduction > 0) {
      checks.push({ name: "Document Expiry Enforcement", result: docDeduction >= 8 ? "FAIL" : "WARNING", detail: docIssues.join("; "), deduction: docDeduction });
      score -= docDeduction;
      flags.push(...docIssues);
    } else {
      checks.push({ name: "Document Expiry Enforcement", result: "PASS", detail: "All documents current", deduction: 0 });
    }
  } else {
    checks.push({ name: "Document Expiry Enforcement", result: "WARNING", detail: "No carrier record", deduction: 3 });
    score -= 3;
  }

  // ── 30. SAM.gov Federal Exclusion Check ──
  try {
    const companyName = fmcsa.legalName || existingCarrier?.companyName;
    if (companyName) {
      const samResult = await checkExclusions(companyName, dotNumber);
      if (samResult.excluded) {
        checks.push({
          name: "SAM.gov Exclusion",
          result: "FAIL",
          detail: `EXCLUDED — ${samResult.matches.length} active exclusion(s) found`,
          deduction: 25,
        });
        score -= 25;
        flags.push(`SAM.gov: federally excluded entity (${samResult.matches.length} match(es))`);
      } else {
        checks.push({
          name: "SAM.gov Exclusion",
          result: "PASS",
          detail: samResult.totalResults > 0
            ? `${samResult.totalResults} record(s) found, none active`
            : "No exclusion records found",
          deduction: 0,
        });
      }
    } else {
      checks.push({ name: "SAM.gov Exclusion", result: "WARNING", detail: "No company name available for exclusion check", deduction: 3 });
      score -= 3;
    }
  } catch {
    checks.push({ name: "SAM.gov Exclusion", result: "WARNING", detail: "SAM.gov check failed — manual review required", deduction: 5 });
    score -= 5;
  }

  // ── 31. Cross-Reference Identity Validation ──
  if (existingCarrier) {
    try {
      const crossRef = await crossReferenceCarrier(existingCarrier.id);
      if (crossRef.riskLevel === "CRITICAL") {
        checks.push({
          name: "Cross-Reference Identity Validation",
          result: "FAIL",
          detail: `Cross-ref score ${crossRef.score}/100 — ${crossRef.issues.slice(0, 3).join("; ")}`,
          deduction: 25,
        });
        score -= 25;
        flags.push(`Cross-reference CRITICAL: ${crossRef.issues[0] || "multiple identity mismatches"}`);
      } else if (crossRef.riskLevel === "HIGH") {
        checks.push({
          name: "Cross-Reference Identity Validation",
          result: "FAIL",
          detail: `Cross-ref score ${crossRef.score}/100 — ${crossRef.issues.slice(0, 3).join("; ")}`,
          deduction: 15,
        });
        score -= 15;
        flags.push(`Cross-reference HIGH risk: ${crossRef.issues[0] || "identity inconsistencies detected"}`);
      } else if (crossRef.riskLevel === "MEDIUM") {
        checks.push({
          name: "Cross-Reference Identity Validation",
          result: "WARNING",
          detail: `Cross-ref score ${crossRef.score}/100 — ${crossRef.issues.slice(0, 2).join("; ") || "minor discrepancies"}`,
          deduction: 8,
        });
        score -= 8;
      } else {
        checks.push({
          name: "Cross-Reference Identity Validation",
          result: "PASS",
          detail: `Cross-ref score ${crossRef.score}/100 — identity data consistent across sources`,
          deduction: 0,
        });
      }
    } catch (e) {
      console.error("[Compass Vet] Cross-reference check error:", e);
      checks.push({
        name: "Cross-Reference Identity Validation",
        result: "WARNING",
        detail: "Cross-reference check failed — manual review required",
        deduction: 5,
      });
      score -= 5;
    }
  } else {
    checks.push({
      name: "Cross-Reference Identity Validation",
      result: "WARNING",
      detail: "No carrier record — cannot cross-reference",
      deduction: 5,
    });
    score -= 5;
  }

  // ── Clamp Score & Calculate Results ──
  score = Math.max(0, Math.min(100, score));
  const riskLevel = getRiskLevel(score);
  const grade = getGrade(score);
  const recommendation = getRecommendation(riskLevel);

  // ── Trend data ──
  const previousReport = existingCarrier?.vettingReports?.[0];
  const previousScore = previousReport?.score ?? null;
  const scoreDelta = previousScore !== null ? score - previousScore : null;
  let trendDirection: string | null = null;
  if (scoreDelta !== null) {
    if (scoreDelta > 5) trendDirection = "IMPROVING";
    else if (scoreDelta < -5) trendDirection = "DECLINING";
    else trendDirection = "STABLE";
  }

  // ── Identity summary ──
  const identityData = idv ? {
    identityScore: idv.identityScore,
    identityStatus: idv.identityStatus,
    emailProvider: idv.emailProvider,
    phoneType: idv.phoneType,
    sosStatus: idv.sosStatus,
    chameleonRiskLevel: existingCarrier?.chameleonRiskLevel || null,
  } : null;

  return {
    dotNumber,
    mcNumber: fmcsa.mcNumber || mcNumber || null,
    legalName: fmcsa.legalName,
    score,
    grade,
    riskLevel,
    recommendation,
    checks,
    fmcsaData: {
      operatingStatus: fmcsa.operatingStatus,
      entityType: fmcsa.entityType,
      safetyRating: fmcsa.safetyRating,
      insuranceOnFile: fmcsa.insuranceOnFile,
      outOfServiceDate: fmcsa.outOfServiceDate,
      totalDrivers: fmcsa.totalDrivers,
      totalPowerUnits: fmcsa.totalPowerUnits,
    },
    identityData,
    flags,
    previousScore,
    scoreDelta,
    trendDirection,
    vettedAt: new Date().toISOString(),
  };
}

// ── Vet & Store ──────────────────────────────────────────

export async function vetAndStoreReport(
  dotNumber: string,
  carrierId?: string,
  mcNumber?: string,
  triggeredBy: string = "USER"
): Promise<CarrierVettingReport> {
  const report = await vetCarrier(dotNumber, mcNumber);

  // Resolve carrierId if not provided
  let resolvedCarrierId = carrierId;
  if (!resolvedCarrierId) {
    const carrier = await prisma.carrierProfile.findFirst({
      where: {
        OR: [
          { dotNumber },
          ...(mcNumber ? [{ mcNumber }] : []),
        ],
      },
    });
    resolvedCarrierId = carrier?.id;
  }

  if (resolvedCarrierId) {
    // Store as VettingReport (structured)
    await prisma.vettingReport.create({
      data: {
        carrierId: resolvedCarrierId,
        score: report.score,
        grade: report.grade,
        riskLevel: report.riskLevel,
        recommendation: report.recommendation,
        checksJson: JSON.parse(JSON.stringify(report.checks)),
        flagsJson: report.flags,
        fmcsaSnapshot: JSON.parse(JSON.stringify(report.fmcsaData)),
        identityData: report.identityData ? JSON.parse(JSON.stringify(report.identityData)) : null,
        previousScore: report.previousScore,
        scoreDelta: report.scoreDelta,
        trendDirection: report.trendDirection,
        triggeredBy,
        vettingType: "FULL",
      },
    });

    // Also store as ComplianceScan for backward compatibility
    await prisma.complianceScan.create({
      data: {
        carrierId: resolvedCarrierId,
        scanType: "VETTING_REPORT",
        fmcsaData: JSON.parse(JSON.stringify(report)),
        status: report.riskLevel === "CRITICAL" ? "FAILED" : report.riskLevel === "LOW" ? "PASSED" : "WARNING",
      },
    });

    // Update CarrierProfile vetting fields
    await prisma.carrierProfile.update({
      where: { id: resolvedCarrierId },
      data: {
        fmcsaLastChecked: new Date(),
        safetyRating: report.fmcsaData.safetyRating || undefined,
        fmcsaAuthorityStatus: report.fmcsaData.operatingStatus || undefined,
        lastVettingScore: report.score,
        lastVettingRisk: report.riskLevel,
        lastVettedAt: new Date(),
        vettingGrade: report.grade,
      },
    });
  }

  return report;
}
