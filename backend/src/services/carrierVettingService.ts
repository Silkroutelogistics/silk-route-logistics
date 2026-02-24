/**
 * Carrier Vetting Service
 * One-click composite risk scoring for carriers.
 * Runs 8 checks against FMCSA data and internal records,
 * producing a 0-100 score with risk level and recommendation.
 */

import { prisma } from "../config/database";
import { verifyCarrierWithFMCSA } from "./fmcsaService";

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

export interface CarrierVettingReport {
  dotNumber: string;
  mcNumber: string | null;
  legalName: string | null;
  score: number;
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
  flags: string[];
  vettedAt: string;
}

// ── Scoring Logic ────────────────────────────────────────

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
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

  // 1. Authority check
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

  // 2. Out of Service
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

  // 3. Insurance on file (FMCSA)
  if (!fmcsa.insuranceOnFile) {
    checks.push({
      name: "FMCSA Insurance on File",
      result: "FAIL",
      detail: "BIPD insurance not on file with FMCSA",
      deduction: 30,
    });
    score -= 30;
    flags.push("No insurance on file with FMCSA");
  } else {
    checks.push({
      name: "FMCSA Insurance on File",
      result: "PASS",
      detail: "Insurance on file",
      deduction: 0,
    });
  }

  // 4. Safety Rating
  const rating = fmcsa.safetyRating?.toUpperCase();
  if (rating === "UNSATISFACTORY") {
    checks.push({
      name: "Safety Rating",
      result: "FAIL",
      detail: "UNSATISFACTORY",
      deduction: 25,
    });
    score -= 25;
    flags.push("Unsatisfactory safety rating");
  } else if (rating === "CONDITIONAL") {
    checks.push({
      name: "Safety Rating",
      result: "WARNING",
      detail: "CONDITIONAL",
      deduction: 15,
    });
    score -= 15;
    flags.push("Conditional safety rating");
  } else if (!rating || rating === "NONE" || rating === "NOT RATED") {
    checks.push({
      name: "Safety Rating",
      result: "WARNING",
      detail: "No safety rating on file",
      deduction: 5,
    });
    score -= 5;
  } else {
    checks.push({
      name: "Safety Rating",
      result: "PASS",
      detail: fmcsa.safetyRating || "SATISFACTORY",
      deduction: 0,
    });
  }

  // 5. Double-broker risk (entity type includes BROKER)
  const entityType = fmcsa.entityType?.toUpperCase() || "";
  if (entityType.includes("BROKER")) {
    checks.push({
      name: "Double-Broker Risk",
      result: "FAIL",
      detail: `Entity type: ${fmcsa.entityType}`,
      deduction: 15,
    });
    score -= 15;
    flags.push("Entity type includes BROKER — double-broker risk");
  } else {
    checks.push({
      name: "Double-Broker Risk",
      result: "PASS",
      detail: fmcsa.entityType || "CARRIER",
      deduction: 0,
    });
  }

  // 6. Fleet size
  const powerUnits = fmcsa.totalPowerUnits || 0;
  if (powerUnits > 0 && powerUnits < 3) {
    checks.push({
      name: "Fleet Size",
      result: "WARNING",
      detail: `${powerUnits} power unit(s)`,
      deduction: 5,
    });
    score -= 5;
  } else {
    checks.push({
      name: "Fleet Size",
      result: "PASS",
      detail: powerUnits > 0 ? `${powerUnits} power unit(s)` : "Not reported",
      deduction: 0,
    });
  }

  // 7. New/tiny carrier (1 truck + no safety rating)
  const noRating = !rating || rating === "NONE" || rating === "NOT RATED";
  if (powerUnits === 1 && noRating) {
    checks.push({
      name: "New Carrier Risk",
      result: "FAIL",
      detail: "Single truck with no safety rating",
      deduction: 10,
    });
    score -= 10;
    flags.push("New/tiny carrier — 1 truck, no safety rating");
  } else {
    checks.push({
      name: "New Carrier Risk",
      result: "PASS",
      detail: "Established carrier",
      deduction: 0,
    });
  }

  // 8. Insurance amounts in DB (if carrier exists)
  let insuranceCheck: VettingCheck = {
    name: "Insurance Minimums (Internal)",
    result: "PASS",
    detail: "No internal record to check",
    deduction: 0,
  };

  // Try to find existing carrier in DB by DOT or MC
  const existingCarrier = await prisma.carrierProfile.findFirst({
    where: {
      OR: [
        { dotNumber },
        ...(mcNumber ? [{ mcNumber }] : []),
      ],
    },
  });

  if (existingCarrier) {
    let insuranceDeduction = 0;
    const details: string[] = [];

    if (existingCarrier.autoLiabilityAmount && existingCarrier.autoLiabilityAmount < 1000000) {
      insuranceDeduction += 10;
      details.push(`Auto liability $${existingCarrier.autoLiabilityAmount.toLocaleString()} < $1M minimum`);
    }
    if (existingCarrier.cargoInsuranceAmount && existingCarrier.cargoInsuranceAmount < 100000) {
      insuranceDeduction += 10;
      details.push(`Cargo insurance $${existingCarrier.cargoInsuranceAmount.toLocaleString()} < $100K minimum`);
    }

    if (insuranceDeduction > 0) {
      insuranceCheck = {
        name: "Insurance Minimums (Internal)",
        result: "FAIL",
        detail: details.join("; "),
        deduction: insuranceDeduction,
      };
      score -= insuranceDeduction;
      flags.push(...details);
    } else if (existingCarrier.autoLiabilityAmount || existingCarrier.cargoInsuranceAmount) {
      insuranceCheck = {
        name: "Insurance Minimums (Internal)",
        result: "PASS",
        detail: [
          existingCarrier.autoLiabilityAmount ? `Auto: $${existingCarrier.autoLiabilityAmount.toLocaleString()}` : null,
          existingCarrier.cargoInsuranceAmount ? `Cargo: $${existingCarrier.cargoInsuranceAmount.toLocaleString()}` : null,
        ].filter(Boolean).join(", "),
        deduction: 0,
      };
    }
  }
  checks.push(insuranceCheck);

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  const riskLevel = getRiskLevel(score);
  const recommendation = getRecommendation(riskLevel);

  return {
    dotNumber,
    mcNumber: fmcsa.mcNumber || mcNumber || null,
    legalName: fmcsa.legalName,
    score,
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
    flags,
    vettedAt: new Date().toISOString(),
  };
}

// ── Vet & Store ──────────────────────────────────────────

export async function vetAndStoreReport(
  dotNumber: string,
  carrierId?: string,
  mcNumber?: string
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

  // Store as ComplianceScan
  if (resolvedCarrierId) {
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
      },
    });
  }

  return report;
}
