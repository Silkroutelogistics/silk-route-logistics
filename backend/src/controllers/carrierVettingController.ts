/**
 * Carrier Vetting Controller
 * Endpoints for vetting, identity verification, chameleon detection,
 * vetting history, and grace periods.
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { vetAndStoreReport } from "../services/carrierVettingService";
import { runIdentityCheck } from "../services/identityVerificationService";
import { checkChameleon, runFullChameleonScan } from "../services/chameleonDetectionService";
import { grantGracePeriod, checkAutoReversal } from "../services/complianceMonitorService";
import { screenCarrier } from "../services/ofacScreeningService";
import { verifyFacialMatch } from "../services/biometricVerificationService";
import { validateEldProvider } from "../services/eldValidationService";
import { verifyTin } from "../services/tinMatchService";
import { updateCarrierCsaScores } from "../services/csaBasicService";
import { checkOverbooking, getOverbookingReport } from "../services/overbookingService";
import { checkLoadCompliance, checkAllActiveLoadCompliance } from "../services/loadComplianceService";
import { verifyTruckVin, verifyAllCarrierVins } from "../services/vinVerificationService";
import { buildFingerprint } from "../services/chameleonDetectionService";
import { prisma } from "../config/database";

/**
 * POST /api/carriers/:id/full-vet
 * Runs all vetting checks in sequence and returns a consolidated report.
 * Replaces the need for frontend to orchestrate 8+ separate API calls.
 */
export async function runFullVetting(req: AuthRequest, res: Response) {
  const carrierId = req.params.id;

  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, dotNumber: true, mcNumber: true, companyName: true },
  });

  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const results: Record<string, { status: string; data?: unknown; error?: string }> = {};

  // 1. FMCSA Vetting (requires DOT number)
  if (carrier.dotNumber) {
    try {
      const report = await vetAndStoreReport(carrier.dotNumber, carrierId, carrier.mcNumber || undefined);
      results.fmcsa = { status: "completed", data: { grade: report.grade, score: report.score, operatingStatus: report.fmcsaData.operatingStatus } };
    } catch (err) {
      results.fmcsa = { status: "error", error: err instanceof Error ? err.message : "FMCSA vetting failed" };
    }
  } else {
    results.fmcsa = { status: "skipped", error: "No DOT number" };
  }

  // 2. Identity Check
  try {
    const identity = await runIdentityCheck(carrierId);
    results.identity = { status: "completed", data: identity };
  } catch (err) {
    results.identity = { status: "error", error: err instanceof Error ? err.message : "Identity check failed" };
  }

  // 3. Chameleon Fingerprint + Cross-reference
  try {
    await buildFingerprint(carrierId);
    const chameleon = await checkChameleon(carrierId);
    results.chameleon = { status: "completed", data: { riskLevel: chameleon.riskLevel, matches: chameleon.totalMatches } };
  } catch (err) {
    results.chameleon = { status: "error", error: err instanceof Error ? err.message : "Chameleon check failed" };
  }

  // 4. OFAC Screening
  try {
    const ofac = await screenCarrier(carrierId);
    results.ofac = { status: "completed", data: ofac };
  } catch (err) {
    results.ofac = { status: "error", error: err instanceof Error ? err.message : "OFAC screening failed" };
  }

  // 5. ELD Validation
  try {
    const eld = await validateEldProvider(carrierId);
    results.eld = { status: "completed", data: eld };
  } catch (err) {
    results.eld = { status: "error", error: err instanceof Error ? err.message : "ELD validation failed" };
  }

  // 6. TIN Verification
  try {
    const tin = await verifyTin(carrierId);
    results.tin = { status: "completed", data: tin };
  } catch (err) {
    results.tin = { status: "error", error: err instanceof Error ? err.message : "TIN verification failed" };
  }

  // 7. CSA BASIC Scores (requires DOT number)
  if (carrier.dotNumber) {
    try {
      const csa = await updateCarrierCsaScores(carrierId);
      results.csa = { status: "completed", data: csa };
    } catch (err) {
      results.csa = { status: "error", error: err instanceof Error ? err.message : "CSA update failed" };
    }
  } else {
    results.csa = { status: "skipped", error: "No DOT number" };
  }

  // 8. VIN Verification (for all trucks)
  try {
    const vins = await verifyAllCarrierVins();
    results.vin = { status: "completed", data: { message: "Batch VIN verification triggered" } };
  } catch (err) {
    results.vin = { status: "error", error: err instanceof Error ? err.message : "VIN verification failed" };
  }

  // Summary
  const completed = Object.values(results).filter((r) => r.status === "completed").length;
  const errors = Object.values(results).filter((r) => r.status === "error").length;
  const skipped = Object.values(results).filter((r) => r.status === "skipped").length;

  res.json({
    carrierId,
    carrierName: carrier.companyName,
    summary: { completed, errors, skipped, total: Object.keys(results).length },
    results,
  });
}

/**
 * POST /api/carriers/vet
 */
export async function vetCarrierEndpoint(req: AuthRequest, res: Response) {
  const { dotNumber, mcNumber, carrierId } = req.body;

  if (!dotNumber) {
    res.status(400).json({ error: "dotNumber is required" });
    return;
  }

  try {
    const report = await vetAndStoreReport(dotNumber, carrierId, mcNumber);
    res.json(report);
  } catch (err) {
    console.error("[CarrierVetting] Error vetting carrier:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Vetting failed" });
  }
}

/**
 * GET /api/carriers/:id/vetting-report
 */
export async function getVettingReport(req: AuthRequest, res: Response) {
  const { id } = req.params;

  const scan = await prisma.complianceScan.findFirst({
    where: { carrierId: id, scanType: "VETTING_REPORT" },
    orderBy: { scannedAt: "desc" },
  });

  if (!scan) {
    res.status(404).json({ error: "No vetting report found for this carrier" });
    return;
  }

  res.json(scan.fmcsaData);
}

/**
 * POST /api/carriers/:id/identity-check
 */
export async function runIdentityCheckEndpoint(req: AuthRequest, res: Response) {
  try {
    const result = await runIdentityCheck(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[IdentityCheck] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Identity check failed" });
  }
}

/**
 * GET /api/carriers/:id/identity
 */
export async function getIdentityStatus(req: AuthRequest, res: Response) {
  const idv = await prisma.carrierIdentityVerification.findUnique({
    where: { carrierId: req.params.id },
  });

  if (!idv) {
    res.status(404).json({ error: "No identity verification found" });
    return;
  }

  res.json(idv);
}

/**
 * POST /api/carriers/:id/chameleon-check
 */
export async function runChameleonCheckEndpoint(req: AuthRequest, res: Response) {
  try {
    const result = await checkChameleon(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[ChameleonCheck] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Chameleon check failed" });
  }
}

/**
 * GET /api/carriers/:id/chameleon-matches
 */
export async function getChameleonMatches(req: AuthRequest, res: Response) {
  const matches = await prisma.chameleonMatch.findMany({
    where: { carrierId: req.params.id },
    include: {
      matchedCarrier: {
        select: { id: true, companyName: true, onboardingStatus: true, dotNumber: true, mcNumber: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(matches);
}

/**
 * PUT /api/carriers/chameleon-matches/:matchId/review
 */
export async function reviewChameleonMatch(req: AuthRequest, res: Response) {
  const { matchId } = req.params;
  const { status, notes } = req.body;

  if (!["REVIEWED", "DISMISSED", "CONFIRMED_FRAUD"].includes(status)) {
    res.status(400).json({ error: "Invalid status. Must be REVIEWED, DISMISSED, or CONFIRMED_FRAUD" });
    return;
  }

  const match = await prisma.chameleonMatch.findUnique({ where: { id: matchId } });
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const updated = await prisma.chameleonMatch.update({
    where: { id: matchId },
    data: {
      status,
      reviewNotes: notes || null,
      reviewedById: req.user!.id,
      reviewedAt: new Date(),
    },
  });

  res.json(updated);
}

/**
 * GET /api/carriers/:id/vetting-history
 */
export async function getVettingHistory(req: AuthRequest, res: Response) {
  const reports = await prisma.vettingReport.findMany({
    where: { carrierId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Calculate trend from scores
  const scores = reports.map((r) => r.score).reverse();
  let trendDirection = "STABLE";
  if (scores.length >= 2) {
    const recent = scores.slice(-3);
    const older = scores.slice(0, Math.max(1, scores.length - 3));
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    if (recentAvg - olderAvg > 5) trendDirection = "IMPROVING";
    else if (olderAvg - recentAvg > 5) trendDirection = "DECLINING";
  }

  res.json({
    reports,
    historicalScores: scores,
    trendDirection,
  });
}

/**
 * POST /api/carriers/:id/grace-period
 */
export async function grantGracePeriodEndpoint(req: AuthRequest, res: Response) {
  const { days } = req.body;

  try {
    const result = await grantGracePeriod(req.params.id, req.user!.id, days || 7);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to grant grace period" });
  }
}

/**
 * POST /api/compliance/check-reversals
 */
export async function triggerAutoReversal(req: AuthRequest, res: Response) {
  try {
    const result = await checkAutoReversal();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Auto-reversal check failed" });
  }
}

/**
 * POST /api/compliance/chameleon-scan
 */
export async function triggerChameleonScan(req: AuthRequest, res: Response) {
  try {
    const result = await runFullChameleonScan();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Chameleon scan failed" });
  }
}

/**
 * POST /api/carriers/:id/ofac-screen — Run OFAC/SDN screening
 */
export async function runOfacScreen(req: AuthRequest, res: Response) {
  try {
    const result = await screenCarrier(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[OFAC Screen] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "OFAC screening failed" });
  }
}

/**
 * POST /api/carriers/:id/facial-verify — Run biometric facial match
 */
export async function runFacialVerify(req: AuthRequest, res: Response) {
  try {
    const result = await verifyFacialMatch(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[FacialVerify] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Facial verification failed" });
  }
}

/**
 * POST /api/carriers/:id/eld-validate — Validate ELD provider
 */
export async function runEldValidation(req: AuthRequest, res: Response) {
  try {
    const result = await validateEldProvider(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[ELD Validate] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "ELD validation failed" });
  }
}

/**
 * POST /api/carriers/:id/tin-verify — Verify W-9 TIN
 */
export async function runTinVerify(req: AuthRequest, res: Response) {
  try {
    const result = await verifyTin(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[TIN Verify] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "TIN verification failed" });
  }
}

/**
 * GET /api/carriers/:id/fraud-reports — Get fraud reports for a carrier
 */
export async function getFraudReports(req: AuthRequest, res: Response) {
  const reports = await prisma.fraudReport.findMany({
    where: { carrierId: req.params.id },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(reports);
}

/**
 * POST /api/carriers/:id/fraud-reports — File a fraud report
 */
export async function fileFraudReport(req: AuthRequest, res: Response) {
  const { category, description, evidence, loadId } = req.body;

  if (!category || !description) {
    res.status(400).json({ error: "category and description are required" });
    return;
  }

  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const report = await prisma.fraudReport.create({
    data: {
      carrierId: req.params.id,
      reportedById: req.user!.id,
      category,
      description,
      evidence: evidence || [],
      loadId: loadId || null,
      permanentAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours from now
    },
  });

  // Notify admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "FRAUD_REPORT" as const,
      title: "Fraud Report Filed",
      message: `${category} report filed against ${carrier.companyName || "Unknown"}`,
      link: `/carriers/${carrier.id}`,
    })),
  }).catch(() => {});

  res.status(201).json(report);
}

/**
 * PATCH /api/carriers/fraud-reports/:reportId/review — Review a fraud report
 */
export async function reviewFraudReport(req: AuthRequest, res: Response) {
  const { reportId } = req.params;
  const { status, notes } = req.body;

  if (!["UNDER_REVIEW", "CONFIRMED", "DISMISSED"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const report = await prisma.fraudReport.findUnique({ where: { id: reportId } });
  if (!report) {
    res.status(404).json({ error: "Fraud report not found" });
    return;
  }

  // Cannot dismiss a permanent report
  if (status === "DISMISSED" && report.permanentAt && report.permanentAt <= new Date()) {
    res.status(400).json({ error: "Cannot dismiss a permanent report" });
    return;
  }

  const updated = await prisma.fraudReport.update({
    where: { id: reportId },
    data: {
      status,
      reviewNotes: notes || null,
      reviewedById: req.user!.id,
      reviewedAt: new Date(),
    },
  });

  res.json(updated);
}

/**
 * POST /api/carriers/fraud-reports/:reportId/respond — Carrier response to fraud report
 */
export async function respondToFraudReport(req: AuthRequest, res: Response) {
  const { reportId } = req.params;
  const { response } = req.body;

  if (!response) {
    res.status(400).json({ error: "response is required" });
    return;
  }

  const report = await prisma.fraudReport.findUnique({ where: { id: reportId } });
  if (!report) {
    res.status(404).json({ error: "Fraud report not found" });
    return;
  }

  const updated = await prisma.fraudReport.update({
    where: { id: reportId },
    data: {
      carrierResponse: response,
      carrierRespondedAt: new Date(),
    },
  });

  res.json(updated);
}

/**
 * GET /api/carriers/:id/agreements — Get carrier agreements
 */
export async function getCarrierAgreements(req: AuthRequest, res: Response) {
  const agreements = await prisma.carrierAgreement.findMany({
    where: { carrierId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(agreements);
}

/**
 * POST /api/carriers/:id/agreements — Create/send a new agreement
 */
export async function createAgreement(req: AuthRequest, res: Response) {
  const { version, templateName, documentUrl, expiresAt } = req.body;

  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const agreement = await prisma.carrierAgreement.create({
    data: {
      carrierId: req.params.id,
      version: version || "1.0",
      templateName: templateName || "standard",
      documentUrl: documentUrl || null,
      status: "SENT",
      sentAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 90 * 86_400_000), // 90 days default
      createdById: req.user!.id,
    },
  });

  res.status(201).json(agreement);
}

/**
 * POST /api/carriers/agreements/:agreementId/sign — Carrier signs an agreement
 */
export async function signAgreement(req: AuthRequest, res: Response) {
  const { agreementId } = req.params;
  const { signedByName, signedByTitle, signatureData } = req.body;

  if (!signedByName || !signatureData) {
    res.status(400).json({ error: "signedByName and signatureData are required" });
    return;
  }

  const agreement = await prisma.carrierAgreement.findUnique({ where: { id: agreementId } });
  if (!agreement) {
    res.status(404).json({ error: "Agreement not found" });
    return;
  }

  if (agreement.status !== "SENT" && agreement.status !== "DRAFT") {
    res.status(400).json({ error: `Cannot sign agreement in ${agreement.status} status` });
    return;
  }

  if (agreement.expiresAt && agreement.expiresAt < new Date()) {
    res.status(400).json({ error: "Agreement has expired" });
    return;
  }

  const updated = await prisma.carrierAgreement.update({
    where: { id: agreementId },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signedByName,
      signedByTitle: signedByTitle || null,
      signatureData,
      signerIp: (req.headers["x-forwarded-for"] as string) || req.ip || "",
      signerUserAgent: req.headers["user-agent"] || "",
    },
  });

  // Notify admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "AGREEMENT_SIGNED" as const,
      title: "Carrier Agreement Signed",
      message: `Agreement signed by ${signedByName} for carrier ${agreement.carrierId}`,
      link: `/carriers/${agreement.carrierId}`,
    })),
  }).catch(() => {});

  res.json(updated);
}

// ═══════════════════════════════════════════════════════════
// Phase B: CSA, Overbooking, Load Compliance, VIN, UCR
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/carriers/:id/csa-update — Fetch and store CSA BASIC scores
 */
export async function runCsaUpdate(req: AuthRequest, res: Response) {
  try {
    const result = await updateCarrierCsaScores(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "CSA update failed" });
  }
}

/**
 * POST /api/carriers/:id/overbooking-check — Check overbooking risk
 */
export async function runOverbookingCheck(req: AuthRequest, res: Response) {
  try {
    const result = await checkOverbooking(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Overbooking check failed" });
  }
}

/**
 * GET /api/carriers/:id/overbooking-report — Detailed overbooking report
 */
export async function getOverbookingReportEndpoint(req: AuthRequest, res: Response) {
  try {
    const result = await getOverbookingReport(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Overbooking report failed" });
  }
}

/**
 * POST /api/carriers/:id/vin-verify — Verify all VINs for a carrier's trucks
 */
export async function runVinVerification(req: AuthRequest, res: Response) {
  try {
    const result = await verifyAllCarrierVins(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "VIN verification failed" });
  }
}

/**
 * POST /api/trucks/:truckId/vin-verify — Verify a single truck VIN
 */
export async function runSingleVinVerify(req: AuthRequest, res: Response) {
  try {
    const result = await verifyTruckVin(req.params.truckId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "VIN verification failed" });
  }
}

/**
 * POST /api/loads/:loadId/compliance-check — Check load-level compliance
 */
export async function runLoadComplianceCheck(req: AuthRequest, res: Response) {
  try {
    const result = await checkLoadCompliance(req.params.loadId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Load compliance check failed" });
  }
}

/**
 * POST /api/compliance/load-compliance-scan — Batch check all active loads
 */
export async function triggerLoadComplianceScan(req: AuthRequest, res: Response) {
  try {
    const result = await checkAllActiveLoadCompliance();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Load compliance scan failed" });
  }
}

/**
 * PATCH /api/carriers/:id/ucr — Update UCR status
 */
export async function updateUcrStatus(req: AuthRequest, res: Response) {
  const { ucrStatus, ucrYear } = req.body;
  if (!["VERIFIED", "UNVERIFIED", "EXPIRED", "NOT_REQUIRED"].includes(ucrStatus)) {
    res.status(400).json({ error: "Invalid UCR status" });
    return;
  }

  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const updated = await prisma.carrierProfile.update({
    where: { id: req.params.id },
    data: {
      ucrStatus,
      ucrYear: ucrYear || new Date().getFullYear(),
      ucrVerifiedAt: ucrStatus === "VERIFIED" ? new Date() : undefined,
    },
  });

  res.json({ ucrStatus: updated.ucrStatus, ucrYear: updated.ucrYear, ucrVerifiedAt: updated.ucrVerifiedAt });
}
