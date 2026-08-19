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
import { log } from "../lib/logger";

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
      const report = await vetAndStoreReport(carrier.dotNumber, carrierId, carrier.mcNumber || undefined, "USER", req.user?.id);
      results.fmcsa = { status: "completed", data: { grade: report.grade, score: report.score, riskLevel: report.riskLevel, recommendation: report.recommendation, operatingStatus: report.fmcsaData.operatingStatus, checks: report.checks, flags: report.flags } };
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
    const vins = await verifyAllCarrierVins(carrierId);
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
    const report = await vetAndStoreReport(dotNumber, carrierId, mcNumber, "USER", req.user?.id);
    res.json(report);
  } catch (err) {
    log.error({ err: err }, "[CarrierVetting] Error vetting carrier:");
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
    log.error({ err: err }, "[IdentityCheck] Error:");
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
    log.error({ err: err }, "[ChameleonCheck] Error:");
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
    include: { triggeredByUser: { select: { firstName: true, lastName: true } } },
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
 * GET /api/carriers/:id/compass-history
 * Returns array of past vetting reports with user info for audit trail.
 */
export async function getCompassHistory(req: AuthRequest, res: Response) {
  const reports = await prisma.vettingReport.findMany({
    where: { carrierId: req.params.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      score: true,
      grade: true,
      riskLevel: true,
      recommendation: true,
      triggeredBy: true,
      triggeredByUser: { select: { firstName: true, lastName: true } },
      createdAt: true,
    },
    take: 50,
  });

  res.json({ reports });
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
    log.error({ err: err }, "[OFAC Screen] Error:");
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
    log.error({ err: err }, "[FacialVerify] Error:");
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
    log.error({ err: err }, "[ELD Validate] Error:");
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
    log.error({ err: err }, "[TIN Verify] Error:");
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
/**
 * Terminate a signed carrier agreement.
 *
 * WHY THIS EXISTS. `CarrierAgreement` has carried `terminatedAt`,
 * `terminatedBy` and `terminationReason` since the model was written, and
 * nothing ever wrote them (Pass 2 orphan-field triage, section A1). Only
 * `SIGNED` was ever written or queried, so a signed BCA or Quick Pay agreement
 * was signed forever: a carrier could be offboarded, or an agreement superseded
 * when counsel returns (§16 #1/#2), with no way to record it.
 *
 * It also left a hole under the version-drift work — `assessVersions` judges a
 * carrier on their latest SIGNED row, which assumed a termination path existed.
 *
 * TERMINATION IS NOT DELETION. The row stays, the executed PDF stays, the
 * signature metadata stays. A terminated agreement is evidence of what was
 * agreed and when it ended; destroying it would destroy the record of a contract
 * that governed real loads. This only moves the status and stamps who ended it,
 * when, and why.
 *
 * AUTHZ — ADMIN + CEO, deliberately narrower than the ADMIN/CEO/OPERATIONS on
 * agreement create and sign. Terminating a BCA hard-blocks the carrier from
 * every tender, which puts it in the same consequence class as carrier approval
 * (ADMIN + CEO) rather than Quick Pay admission (§21.1 widened that to
 * OPERATIONS on purpose). Who may terminate, and whether notice is owed before
 * it bites, are policy questions — §16, HALT-SHIP. The default here is the safe
 * one: narrowest role, effective immediately, carrier told why.
 */
export async function terminateAgreement(req: AuthRequest, res: Response) {
  const { id: carrierId, agreementId } = req.params;

  // Reason is required and is read by the carrier, so hold it to the same bar
  // the Quick Pay withdrawal holds (carrierController.withdrawQuickPayEnrollment).
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10) {
    res.status(400).json({
      error: "Give a reason of at least 10 characters. The carrier is told why, so write it for them to read.",
      code: "REASON_REQUIRED",
    });
    return;
  }

  // Resolved by id AND carrierId together, so an agreementId belonging to
  // another carrier is unreachable here — same scoping as signAgreement.
  const agreement = await prisma.carrierAgreement.findFirst({
    where: { id: agreementId, carrierId },
    include: { carrier: { select: { userId: true, companyName: true } } },
  });

  if (!agreement) {
    res.status(404).json({ error: "Agreement not found for this carrier" });
    return;
  }

  if (agreement.status === "TERMINATED") {
    // Idempotent in the honest sense: say it is already done rather than
    // re-stamping a different terminator and reason over the original record.
    res.status(409).json({
      error: "This agreement is already terminated.",
      code: "AGREEMENT_ALREADY_TERMINATED",
      terminatedAt: agreement.terminatedAt,
    });
    return;
  }

  if (agreement.status !== "SIGNED") {
    res.status(409).json({
      error: `Only a signed agreement can be terminated. This one is ${agreement.status}.`,
      code: "AGREEMENT_NOT_SIGNED",
    });
    return;
  }

  const updated = await prisma.carrierAgreement.update({
    where: { id: agreement.id },
    data: {
      status: "TERMINATED",
      terminatedAt: new Date(),
      terminatedBy: req.user!.id,
      terminationReason: reason.slice(0, 2000),
    },
  });

  // The carrier is told, and told what it means for them. Non-blocking: a
  // notification failure must not leave the agreement half-terminated.
  if (agreement.carrier?.userId) {
    await prisma.notification
      .create({
        data: {
          userId: agreement.carrier.userId,
          type: "GENERAL",
          title: "Carrier agreement terminated",
          message:
            `Your ${agreement.templateName === "quick-pay" ? "Quick Pay Agreement" : "Broker-Carrier Agreement"} has been terminated. ` +
            `${reason.slice(0, 400)} ` +
            `You will not be able to accept new loads until a current agreement is signed. Loads already in flight are unaffected. ` +
            `Contact operations@silkroutelogistics.ai if you believe this is an error.`,
          actionUrl: "/carrier/dashboard/activation",
        },
      })
      .catch((err) => log.error({ err }, "[AgreementTermination] carrier notification failed"));
  }

  log.info(
    { carrierId, agreementId: updated.id, templateName: updated.templateName, by: req.user!.id },
    "[AgreementTermination] agreement terminated",
  );

  res.json(updated);
}

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
      // Default to the template the compliance hard-gate actually filters for
      // (complianceMonitorService reads status SIGNED + templateName
      // "broker-carrier"). The old "standard" default meant an agreement created
      // on this AE path could be signed, display as SIGNED on every surface, and
      // still 403 every tender. v3.8.arx fixed the seed and asserted "standard"
      // appeared nowhere else; this call site was the surviving half.
      templateName: templateName || "broker-carrier",
      documentUrl: documentUrl || null,
      status: "SENT",
      sentAt: new Date(),
      // Evergreen unless the caller explicitly sets a date. The BCA terminates by
      // clause, not by calendar, which is why the carrier portal path
      // (carrierAuth POST /sign-bca) writes expiresAt: null. The old 90-day
      // default meant a validly signed BCA silently reported unsigned ninety days
      // later — the gate re-blocks on expiry and nothing notifies anyone.
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdById: req.user!.id,
    },
  });

  res.status(201).json(agreement);
}

/**
 * POST /api/carriers/:id/agreements/:agreementId/sign — record a signature on a
 * carrier's agreement (AE-side; ADMIN/CEO/OPERATIONS per the route mount).
 *
 * :id is the CarrierProfile.id, same as every other carrier-scoped route in this
 * module. The agreement is resolved by id AND carrierId together, so an
 * agreementId belonging to another carrier is unreachable here. Carriers sign
 * their own BCA through the carrier-authed portal path
 * (POST /api/carrier-auth/sign-bca), not this one.
 */
export async function signAgreement(req: AuthRequest, res: Response) {
  const { id: carrierId, agreementId } = req.params;
  const { signedByName, signedByTitle, signatureData } = req.body;

  if (!signedByName || !signatureData) {
    res.status(400).json({ error: "signedByName and signatureData are required" });
    return;
  }

  // Ownership check. Scoped lookup rather than findUnique-then-compare, matching
  // the carrier-documents handler in routes/carriers.ts. 404 (not 403) on a
  // non-owned id, per the convention set by getOwnedDriver in
  // routes/carrierDrivers.ts, so agreement ids stay non-enumerable across
  // carriers.
  const agreement = await prisma.carrierAgreement.findFirst({
    where: { id: agreementId, carrierId },
  });
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
