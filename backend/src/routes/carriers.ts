import { Router, Response } from "express";
import path from "path";
import { uploadFile } from "../services/storageService";
import {
  getAllCarriers, getCarrierDetail, registerCarrier, updateCarrier, verifyCarrier,
  getCarrierScore,
} from "../controllers/carrierController";
import {
  vetCarrierEndpoint, getVettingReport, runFullVetting,
  runIdentityCheckEndpoint, getIdentityStatus,
  runChameleonCheckEndpoint, getChameleonMatches, reviewChameleonMatch,
  getVettingHistory, getCompassHistory, grantGracePeriodEndpoint,
  runOfacScreen, runFacialVerify, runEldValidation, runTinVerify,
  getFraudReports, fileFraudReport, reviewFraudReport, respondToFraudReport,
  getCarrierAgreements, createAgreement, signAgreement,
  runCsaUpdate, runOverbookingCheck, getOverbookingReportEndpoint,
  runVinVerification, runSingleVinVerify, updateUcrStatus,
} from "../controllers/carrierVettingController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { auditLog } from "../middleware/audit";
import { prisma } from "../config/database";
import { upload } from "../config/upload";
import { z } from "zod";
import { vetAndStoreReport, type CarrierVettingReport } from "../services/carrierVettingService";
import { generateCompassReport } from "../services/compassPdfService";
import { getFullInspectionData } from "../services/fmcsaInspectionService";
import { extractCOIData } from "../services/coiReaderService";
import { verifyCarrierWithFMCSA } from "../services/fmcsaService";
import { buildCarrierTrainingSummary } from "../services/trainingService";
import { log } from "../lib/logger";

const router = Router();

const carrierQuerySchema = z.object({
  status: z.string().optional(),
  tier: z.string().optional(),
  region: z.string().optional(),
  search: z.string().optional(),
  include_deleted: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});

const updateCarrierSchema = z.object({
  safetyScore: z.number().min(0).max(100).optional(),
  tier: z.enum(["PLATINUM", "GOLD", "SILVER", "GUEST", "NONE"]).optional(),
  status: z.enum(["NEW", "REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  // v3.8.ajd Sprint 1 — 6-state lifecycle.
  // REVIEWING merges legacy DOCUMENTS_SUBMITTED + UNDER_REVIEW.
  // INFO_REQUESTED added for v3.8.aje workflow.
  onboardingStatus: z.enum(["PENDING", "REVIEWING", "INFO_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  insuranceExpiry: z.string().optional(),
  equipmentTypes: z.array(z.string()).optional(),
  operatingRegions: z.array(z.string()).optional(),
  numberOfTrucks: z.number().int().positive().optional(),
  numberOfDrivers: z.number().int().positive().optional(),
  notes: z.string().optional(),
  // Extended insurance
  autoLiabilityProvider: z.string().optional(),
  autoLiabilityAmount: z.any().optional(),
  autoLiabilityPolicy: z.string().optional(),
  autoLiabilityExpiry: z.string().nullable().optional(),
  cargoInsuranceProvider: z.string().optional(),
  cargoInsuranceAmount: z.any().optional(),
  cargoInsurancePolicy: z.string().optional(),
  cargoInsuranceExpiry: z.string().nullable().optional(),
  generalLiabilityProvider: z.string().optional(),
  generalLiabilityAmount: z.any().optional(),
  generalLiabilityPolicy: z.string().optional(),
  generalLiabilityExpiry: z.string().nullable().optional(),
  workersCompProvider: z.string().optional(),
  workersCompAmount: z.any().optional(),
  workersCompPolicy: z.string().optional(),
  workersCompExpiry: z.string().nullable().optional(),
  additionalInsuredSRL: z.any().optional(),
  waiverOfSubrogation: z.any().optional(),
  thirtyDayCancellationNotice: z.any().optional(),
  insuranceAgentName: z.string().nullable().optional(),
  insuranceAgentEmail: z.string().nullable().optional(),
  insuranceAgentPhone: z.string().nullable().optional(),
  insuranceAgencyName: z.string().nullable().optional(),
});

// Public: carrier self-registration (supports multipart/form-data for file uploads)
router.post("/",
  upload.fields([{ name: "photoId", maxCount: 1 }, { name: "articlesOfInc", maxCount: 1 }]),
  (req, _res, next) => {
    // Normalize FormData array fields (equipmentTypes, operatingRegions come as repeated fields)
    if (typeof req.body.equipmentTypes === "string") req.body.equipmentTypes = [req.body.equipmentTypes];
    if (typeof req.body.operatingRegions === "string") req.body.operatingRegions = [req.body.operatingRegions];
    next();
  },
  validateBody(carrierRegisterSchema),
  registerCarrier
);

// All routes below require auth
router.use(authenticate);

// Carrier vetting
router.post("/vet", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), vetCarrierEndpoint);

// Employee-facing list & detail
router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), validateQuery(carrierQuerySchema), getAllCarriers);
router.get("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getCarrierDetail);
router.get("/:id/score", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getCarrierScore);
router.get("/:id/vetting-report", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getVettingReport);

// FMCSA Inspection history
router.get("/:id/inspections", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }
    if (!carrier.dotNumber) {
      res.status(400).json({ error: "Carrier has no DOT number" });
      return;
    }
    const data = await getFullInspectionData(carrier.dotNumber);
    res.json(data);
  } catch (err) {
    log.error({ err: err }, "[Inspections] Error:");
    res.status(500).json({ error: "Failed to fetch inspection data" });
  }
});

// Compass PDF report download
router.get("/:id/compass-report", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    // Get latest vetting report or run fresh
    let reportData: CarrierVettingReport;
    const latestReport = await prisma.vettingReport.findFirst({
      where: { carrierId: carrier.id },
      orderBy: { createdAt: "desc" },
    });

    if (latestReport) {
      reportData = {
        dotNumber: carrier.dotNumber || "",
        mcNumber: carrier.mcNumber || null,
        legalName: carrier.companyName || null,
        score: latestReport.score,
        grade: latestReport.grade as any,
        riskLevel: latestReport.riskLevel as any,
        recommendation: latestReport.recommendation as any,
        checks: (latestReport.checksJson as any[]) || [],
        fmcsaData: (latestReport.fmcsaSnapshot as any) || {
          operatingStatus: null, entityType: null, safetyRating: null,
          insuranceOnFile: false, outOfServiceDate: null, totalDrivers: null, totalPowerUnits: null,
        },
        identityData: (latestReport.identityData as any) || null,
        flags: (latestReport.flagsJson as string[]) || [],
        previousScore: latestReport.previousScore,
        scoreDelta: latestReport.scoreDelta,
        trendDirection: latestReport.trendDirection,
        vettedAt: latestReport.createdAt.toISOString(),
      };
    } else {
      // No existing report — run a fresh vet
      if (!carrier.dotNumber) {
        res.status(400).json({ error: "Carrier has no DOT number — cannot generate Compass report" });
        return;
      }
      reportData = await vetAndStoreReport(carrier.dotNumber, carrier.id, carrier.mcNumber || undefined, "PDF_DOWNLOAD");
    }

    const carrierInfo = {
      companyName: carrier.companyName || "Unknown Carrier",
      dotNumber: carrier.dotNumber || "N/A",
      mcNumber: carrier.mcNumber || "N/A",
      contactName: carrier.contactName || `${carrier.user?.firstName || ""} ${carrier.user?.lastName || ""}`.trim() || "N/A",
      tier: carrier.tier || "NONE",
      milestone: carrier.milestone || "M1_FIRST_LOAD",
    };

    const pdfDoc = generateCompassReport(reportData, carrierInfo);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Compass-Report-${carrier.id}.pdf"`);
    pdfDoc.pipe(res);
  } catch (err) {
    log.error({ err: err }, "[Compass PDF] Error generating report:");
    res.status(500).json({ error: "Failed to generate Compass PDF report" });
  }
});

// AI COI Reader — upload COI file and extract structured insurance data
router.post("/:id/read-coi", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded. Send a COI file as multipart/form-data with field name 'file'." });
      return;
    }

    const extracted = await extractCOIData(file.buffer, file.mimetype);

    // If user confirms (query param ?apply=true), auto-populate carrier insurance fields
    if (req.query.apply === "true") {
      const updateData: Record<string, unknown> = {};
      if (extracted.insurerName) updateData.insuranceCompany = extracted.insurerName;
      if (extracted.policyNumber) updateData.insurancePolicyNumber = extracted.policyNumber;
      if (extracted.expirationDate) updateData.insuranceExpiry = new Date(extracted.expirationDate);
      if (extracted.generalLiability?.perOccurrence) updateData.generalLiabilityAmount = extracted.generalLiability.perOccurrence;
      if (extracted.autoLiability?.combinedSingleLimit) updateData.autoLiabilityAmount = extracted.autoLiability.combinedSingleLimit;
      if (extracted.cargoInsurance?.perOccurrence) updateData.cargoInsuranceAmount = extracted.cargoInsurance.perOccurrence;
      if (extracted.workersComp?.perAccident) updateData.workersCompAmount = extracted.workersComp.perAccident;
      if (extracted.additionalInsured) updateData.additionalInsuredSRL = true;
      if (extracted.waiverOfSubrogation) updateData.waiverOfSubrogation = true;
      if (extracted.agentName) updateData.insuranceAgentName = extracted.agentName;
      if (extracted.agentEmail) updateData.insuranceAgentEmail = extracted.agentEmail;
      if (extracted.agentPhone) updateData.insuranceAgentPhone = extracted.agentPhone;
      if (extracted.agencyName) updateData.insuranceAgencyName = extracted.agencyName;

      if (Object.keys(updateData).length > 0) {
        await prisma.carrierProfile.update({ where: { id: carrier.id }, data: updateData });
      }
    }

    res.json({ extracted, carrierId: carrier.id });
  } catch (err) {
    log.error({ err: err }, "[COI Reader] Error:");
    res.status(500).json({ error: err instanceof Error ? err.message : "COI reading failed" });
  }
});

router.put("/:id", authorize("ADMIN", "CEO"), validateBody(updateCarrierSchema), auditLog("UPDATE", "Carrier"), updateCarrier);

// Full vetting — runs all checks in one call
router.post("/:id/full-vet", authorize("ADMIN", "CEO", "OPERATIONS"), runFullVetting);

// Identity & fraud detection
router.post("/:id/identity-check", authorize("ADMIN", "CEO", "OPERATIONS"), runIdentityCheckEndpoint);
router.get("/:id/identity", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getIdentityStatus);
router.post("/:id/chameleon-check", authorize("ADMIN", "CEO", "OPERATIONS"), runChameleonCheckEndpoint);
router.get("/:id/chameleon-matches", authorize("ADMIN", "CEO", "OPERATIONS"), getChameleonMatches);
router.get("/:id/vetting-history", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getVettingHistory);
router.get("/:id/compass-history", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getCompassHistory);
router.post("/:id/grace-period", authorize("ADMIN", "OPERATIONS"), grantGracePeriodEndpoint);

// Phase A: OFAC, biometric, ELD, TIN
router.post("/:id/ofac-screen", authorize("ADMIN", "CEO", "OPERATIONS"), runOfacScreen);
router.post("/:id/facial-verify", authorize("ADMIN", "CEO", "OPERATIONS"), runFacialVerify);
router.post("/:id/eld-validate", authorize("ADMIN", "CEO", "OPERATIONS"), runEldValidation);
router.post("/:id/tin-verify", authorize("ADMIN", "CEO", "OPERATIONS"), runTinVerify);

// Fraud reporting
router.get("/:id/fraud-reports", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getFraudReports);
router.post("/:id/fraud-reports", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER", "DISPATCH"), fileFraudReport);
router.patch("/fraud-reports/:reportId/review", authorize("ADMIN", "CEO"), reviewFraudReport);
router.post("/fraud-reports/:reportId/respond", respondToFraudReport);

// Carrier-broker agreements
router.get("/:id/agreements", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getCarrierAgreements);
router.post("/:id/agreements", authorize("ADMIN", "CEO", "OPERATIONS"), createAgreement);
router.post("/agreements/:agreementId/sign", signAgreement);

// Phase B: CSA, overbooking, VIN, UCR
router.post("/:id/csa-update", authorize("ADMIN", "CEO", "OPERATIONS"), runCsaUpdate);
router.post("/:id/overbooking-check", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH"), runOverbookingCheck);
router.get("/:id/overbooking-report", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH"), getOverbookingReportEndpoint);
router.post("/:id/vin-verify", authorize("ADMIN", "CEO", "OPERATIONS"), runVinVerification);
router.patch("/:id/ucr", authorize("ADMIN", "CEO", "OPERATIONS"), updateUcrStatus);

// Chameleon match review (not carrier-scoped)
router.put("/chameleon-matches/:matchId/review", authorize("ADMIN", "CEO"), reviewChameleonMatch);

// Admin verification
router.post("/:id/verify", authorize("ADMIN", "CEO"), validateBody(verifyCarrierSchema), auditLog("VERIFY", "Carrier"), verifyCarrier);

// v3.8.ajl — Security signals for a carrier.
// Returns the three-point geo baseline (registration → email-verify →
// last login) + recent SystemLog forensic events scoped to this
// carrier's user. AE uses this to spot the country-jump fraud signal
// surfaced inline at v3.8.aje (registered from US, verified from KR
// writes a SystemLog WARNING) + the v3.8.ajf unusual-activity OTP
// trigger (login from different country writes a separate WARNING).
// Pre-ajl these signals existed in SystemLog rows but had no AE-visible
// surface; this endpoint closes that visibility gap.
router.get("/:id/security-signals", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      registrationCountry: true,
      // v3.8.ajo — Override fields for the geo-mismatch alert suppression.
      geoMismatchOverriddenAt: true,
      geoMismatchOverrideNote: true,
      user: {
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          emailVerifiedFromIp: true,
          emailVerifiedFromCountry: true,
          lastLoginIp: true,
          lastLoginCountry: true,
          lastLogin: true,
        },
      },
    },
  });
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  // Pull recent SystemLog rows scoped to the two carrier-onboarding
  // sources. Limit 50 — anything older than that the AE can query DB
  // directly. Newest first.
  const sysEvents = await prisma.systemLog.findMany({
    where: {
      OR: [
        { source: "emailVerification", message: { contains: carrier.user.id } },
        { source: "carrierAuth-unusual-activity", message: { contains: carrier.user.email } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      severity: true,
      source: true,
      message: true,
      ipAddress: true,
      createdAt: true,
    },
  });

  // v3.8.ajo — Extended timeline: include recent carrier document uploads
  // and failed OTP attempts. Caps at 10 each to keep the timeline scannable.
  const recentDocs = await prisma.document.findMany({
    where: { userId: carrier.user.id, uploadSource: "CARRIER_PORTAL" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, fileName: true, docType: true, createdAt: true },
  });
  const recentFailedOtps = await prisma.otpCode.findMany({
    where: {
      userId: carrier.user.id,
      failedAttempts: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, failedAttempts: true, createdAt: true, code: true },
  });

  // Normalize all three sources into a unified timeline entry shape.
  // Type tag drives the icon + color on the frontend.
  type TimelineEntry = {
    id: string;
    type: "SYSTEM_LOG" | "DOCUMENT_UPLOAD" | "OTP_FAILURE";
    severity: string;
    source: string;
    message: string;
    ipAddress: string | null;
    createdAt: Date;
  };
  const timeline: TimelineEntry[] = [
    ...sysEvents.map((e) => ({ ...e, type: "SYSTEM_LOG" as const })),
    ...recentDocs.map((d) => ({
      id: d.id,
      type: "DOCUMENT_UPLOAD" as const,
      severity: "INFO",
      source: "documentUpload",
      message: `Document uploaded: ${d.fileName} (${d.docType || "OTHER"})`,
      ipAddress: null,
      createdAt: d.createdAt,
    })),
    ...recentFailedOtps.map((o) => ({
      id: o.id,
      type: "OTP_FAILURE" as const,
      severity: o.failedAttempts >= 5 ? "ERROR" : "WARNING",
      source: "otpFailure",
      message: `OTP verification failed (${o.failedAttempts} attempt${o.failedAttempts === 1 ? "" : "s"}${o.code.startsWith("RESET:") ? " — reset token" : o.code.startsWith("VERIFY:") ? " — verify token" : ""})`,
      ipAddress: null,
      createdAt: o.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);

  // Derived signal: country mismatch between registration + verify-click.
  // v3.8.ajo — Suppressed when geoMismatchOverriddenAt is set (AE confirmed
  // false positive). Override note surfaces alongside the dampened state
  // so the AE who sees the carrier later understands why it's not flagged.
  const rawMismatch = !!(
    carrier.registrationCountry &&
    carrier.user.emailVerifiedFromCountry &&
    carrier.registrationCountry !== carrier.user.emailVerifiedFromCountry
  );
  const geoMismatch = rawMismatch && !carrier.geoMismatchOverriddenAt;

  // v3.8.ajp — Chameleon matches scoped to this carrier. OPEN status
  // = unreviewed alert; surfaces inline at the top of SecuritySignalsCard
  // as a danger pill with match details. AE can navigate to the
  // chameleonDetectionService UI for full triage; this just surfaces
  // the existence of the match alongside other security context.
  const chameleonMatches = await prisma.chameleonMatch.findMany({
    where: { carrierId: carrier.id, status: { in: ["OPEN", "REVIEWED"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      matchType: true,
      riskScore: true,
      status: true,
      createdAt: true,
      matchedCarrier: {
        select: {
          id: true,
          companyName: true,
          mcNumber: true,
          dotNumber: true,
          onboardingStatus: true,
        },
      },
    },
  });

  // v3.8.ajy C7 — Surface active unusual-activity SMS suppression override
  // (if any). Reuses Sprint 40 ComplianceOverride table with
  // checkCode="UNUSUAL_OTP_SMS_DISABLE" — 24h expiry inherited; AE
  // re-applies via the SecuritySignalsCard button.
  const unusualOtpSmsOverride = await prisma.complianceOverride.findFirst({
    where: {
      carrierId: carrier.id,
      checkCode: "UNUSUAL_OTP_SMS_DISABLE",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, reason: true, expiresAt: true, createdAt: true },
  });

  res.json({
    geo: {
      registrationCountry: carrier.registrationCountry,
      emailVerifiedAt: carrier.user.emailVerifiedAt,
      emailVerifiedFromIp: carrier.user.emailVerifiedFromIp,
      emailVerifiedFromCountry: carrier.user.emailVerifiedFromCountry,
      lastLoginAt: carrier.user.lastLogin,
      lastLoginIp: carrier.user.lastLoginIp,
      lastLoginCountry: carrier.user.lastLoginCountry,
      geoMismatch,
      rawMismatch,
      overriddenAt: carrier.geoMismatchOverriddenAt,
      overrideNote: carrier.geoMismatchOverrideNote,
    },
    chameleonMatches,
    events: timeline,
    unusualOtpSmsOverride,
  });
});

// v3.8.and — SRL Driver Academy T6: AE-facing training visibility. Returns the
// carrier's roster × published-course completion matrix (the same shape the
// carrier sees at /api/carrier-drivers/training-summary, via the shared
// trainingService helper). Read-only; AE-cookie authenticated — NOT a
// carrier-portal mount, so it is intentionally absent from CARRIER_PORTAL_MOUNTS.
// :id is the CarrierProfile.id (same identifier as every other /:id route here).
router.get("/:id/training-summary", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }
  const summary = await buildCarrierTrainingSummary(carrier.id);
  res.json(summary);
});

// v3.8.ajo — Geo-mismatch override action. Suppresses the alert pill on
// confirmed false positives. Note required for audit purposes.
const overrideMismatchSchema = z.object({
  note: z.string().min(5, "Please provide a brief justification (min 5 chars)").max(1000),
});
router.post("/:id/override-mismatch", authorize("ADMIN", "CEO"), validateBody(overrideMismatchSchema), auditLog("UPDATE", "Carrier"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }
  await prisma.carrierProfile.update({
    where: { id: req.params.id },
    data: {
      geoMismatchOverriddenAt: new Date(),
      geoMismatchOverriddenById: req.user!.id,
      geoMismatchOverrideNote: req.body.note,
    },
  });
  res.json({ ok: true });
});

// v3.8.ajk — Dedicated reject endpoint with reason capture + per-reason
// reapply window computation. Replaces the bare PUT /:id with status:
// "REJECTED" which lost the reason context. Old PUT path still works
// for backwards compat — AE UI now routes rejection through this
// endpoint for the new schema fields to populate.
const rejectCarrierSchema = z.object({
  reason: z.enum([
    "MISSING_DOCUMENTS",
    "EXPIRED_INSURANCE",
    "AUTHORITY_NOT_ACTIVE",
    "SAFETY_RATING_UNSATISFACTORY",
    "COMPLIANCE_VIOLATION",
    "FRAUD_DETECTED",
    "IDENTITY_FRAUD",
    "DUPLICATE_APPLICATION",
    "OTHER",
  ]),
  note: z.string().max(2000, "Note must be 2000 characters or less").optional(),
});
router.post("/:id/reject", authorize("ADMIN", "CEO"), validateBody(rejectCarrierSchema), auditLog("REJECT", "Carrier"), async (req: AuthRequest, res: Response) => {
  try {
    const { rejectCarrier } = require("../services/rejectionService");
    const updated = await rejectCarrier({
      carrierId: req.params.id,
      rejectedById: req.user!.id,
      reason: req.body.reason,
      note: req.body.note,
    });
    res.json({ carrier: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reject carrier";
    const status = msg === "Carrier not found" ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

// v3.8.ajt B5 — Dedicated AE approval endpoint. Replaces the generic
// PUT /:id { onboardingStatus: APPROVED } path which (a) didn't fire a
// carrier-facing approval email, (b) didn't write a dedicated
// AuditAction.APPROVE row, (c) had no notification fan-out. Service
// layer at approvalService.ts handles atomic update + email + in-app
// notification + legacy isVerified field sync.
const approveCarrierSchema = z.object({
  note: z.string().max(2000).optional(),
});
router.post("/:id/approve", authorize("ADMIN", "CEO"), validateBody(approveCarrierSchema), auditLog("APPROVE", "Carrier"), async (req: AuthRequest, res: Response) => {
  try {
    const { approveCarrier } = require("../services/approvalService");
    const updated = await approveCarrier({
      carrierId: req.params.id,
      approvedById: req.user!.id,
      note: req.body.note,
    });
    res.json({ carrier: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to approve carrier";
    const status = msg === "Carrier not found" ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

// v3.8.ajn — Lift a rejection. Clears all 5 rejection fields + the ajm
// reminder dedup + flips REJECTED → REVIEWING. Carrier is notified.
const liftRejectionSchema = z.object({
  note: z.string().max(2000).optional(),
});
router.post("/:id/lift-rejection", authorize("ADMIN", "CEO"), validateBody(liftRejectionSchema), auditLog("UPDATE", "Carrier"), async (req: AuthRequest, res: Response) => {
  try {
    const { liftCarrierRejection } = require("../services/rejectionService");
    const updated = await liftCarrierRejection({
      carrierId: req.params.id,
      liftedById: req.user!.id,
      note: req.body.note,
    });
    res.json({ carrier: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to lift rejection";
    const status = msg === "Carrier not found" ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

// PATCH /api/carriers/:id/test-account — v3.8.alo §13.3 Item 189.b.
// Admin toggle for the isTestAccount flag (the self-serve control for the
// test-carrier fence shipped across v3.8.aim/alm). When flagged true, the
// carrier is excluded from every analytics/compliance/picker surface +
// the FMCSA/OFAC/CSA/ELD scans + risk-flagging, but retained for manual
// regression testing (NOT deleted). ADMIN/CEO only, audit-logged. The
// admin carriers page surfaces flagged carriers via getAllCarriers
// ?include_test=true so they can be un-flagged.
router.patch(
  "/:id/test-account",
  authorize("ADMIN", "CEO"),
  validateBody(z.object({ isTestAccount: z.boolean() })),
  auditLog("UPDATE", "Carrier"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { isTestAccount } = req.body as { isTestAccount: boolean };
      const existing = await prisma.carrierProfile.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ error: "Carrier not found" });
        return;
      }
      const updated = await prisma.carrierProfile.update({
        where: { id: req.params.id },
        data: { isTestAccount },
        select: { id: true, isTestAccount: true },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update test-account flag" });
    }
  }
);

// DELETE /api/carriers/:id — Soft delete carrier profile
router.delete("/:id", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier || carrier.deletedAt) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }
  await prisma.carrierProfile.update({
    where: { id: carrier.id },
    data: { deletedAt: new Date(), deletedBy: req.user!.email || req.user!.id },
  });
  res.json({ success: true, message: "Carrier archived" });
});

// PUT /api/carriers/:id/restore
router.put("/:id/restore", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier || !carrier.deletedAt) {
    res.status(404).json({ error: "Archived carrier not found" });
    return;
  }
  await prisma.carrierProfile.update({
    where: { id: carrier.id },
    data: { deletedAt: null, deletedBy: null },
  });
  res.json({ success: true, message: "Carrier restored" });
});

// ─── Carrier Documents ─────────────────────────────────

// GET /api/carriers/:carrierId/documents — list all documents for a carrier
router.get("/:carrierId/documents", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const docs = await prisma.document.findMany({
      where: { entityType: "CARRIER", entityId: req.params.carrierId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    res.json({ documents: docs });
  } catch (err) {
    log.error({ err }, "[Carrier Docs] List error");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

// POST /api/carriers/:carrierId/documents — upload document for a carrier (AE/admin)
router.post("/:carrierId/documents", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.carrierId } });
    if (!carrier) { res.status(404).json({ error: "Carrier not found" }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const ext = path.extname(file.originalname).toLowerCase();
    const storagePath = `carrier-docs/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const fileUrl = await uploadFile(file.buffer, storagePath, file.mimetype);

    const doc = await prisma.document.create({
      data: {
        fileName: file.originalname,
        fileUrl,
        fileType: file.mimetype,
        fileSize: file.size,
        entityType: "CARRIER",
        entityId: carrier.id,
        docType: req.body.docType || "OTHER",
        notes: req.body.notes || null,
        status: "PENDING",
        userId: req.user!.id,
      },
    });

    // Update carrier boolean flags if applicable
    const dt = (req.body.docType || "").toUpperCase();
    if (dt === "W9") await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { w9Uploaded: true } });
    else if (dt === "COI") await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { insuranceCertUploaded: true } });
    else if (dt === "AUTHORITY") await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { authorityDocUploaded: true } });

    res.status(201).json({ document: doc });
  } catch (err) {
    log.error({ err }, "[Carrier Docs] Upload error");
    res.status(500).json({ error: "Failed to upload document" });
  }
});

// PATCH /api/carriers/:carrierId/documents/:docId — update document status
router.patch("/:carrierId/documents/:docId", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId, entityType: "CARRIER", entityId: req.params.carrierId },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const { status, notes } = req.body;
    if (status && !["PENDING", "VERIFIED", "REJECTED"].includes(status)) {
      res.status(400).json({ error: "Invalid status. Must be PENDING, VERIFIED, or REJECTED" });
      return;
    }

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        ...(status && { status, reviewedAt: new Date(), reviewedBy: req.user!.id }),
        ...(notes !== undefined && { notes }),
      },
    });

    res.json({ document: updated });
  } catch (err) {
    log.error({ err }, "[Carrier Docs] Status update error");
    res.status(500).json({ error: "Failed to update document" });
  }
});

// ─── Carrier provisioning routes (migrated from carrierMatch.ts v3.4.u) ──
// Rule 5 cleanup — the old /api/carrier-match module has been retired
// and its scoring surface consolidated into waterfallScoringService.
// These non-scoring provisioning endpoints moved here.

const importFromDatSchema = z.object({
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  companyName: z.string(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

// POST /api/carriers/import-from-dat — Import carrier from DAT response
router.post(
  "/import-from-dat",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE"),
  validateBody(importFromDatSchema),
  async (req: AuthRequest, res: Response) => {
    const data = req.body;

    if (data.mcNumber) {
      const existing = await prisma.carrierProfile.findFirst({ where: { mcNumber: data.mcNumber } });
      if (existing) {
        res.status(409).json({ error: "Carrier with this MC# already exists", carrierId: existing.id });
        return;
      }
    }
    if (data.dotNumber) {
      const existing = await prisma.carrierProfile.findFirst({ where: { dotNumber: data.dotNumber } });
      if (existing) {
        res.status(409).json({ error: "Carrier with this DOT# already exists", carrierId: existing.id });
        return;
      }
    }

    const bcrypt = await import("bcryptjs");
    const tempPassword = "CarrierTemp" + Math.random().toString(36).slice(2, 8) + "!";
    const passwordHash = await bcrypt.default.hash(tempPassword, 12);

    const nameParts = (data.contactName || data.companyName).split(" ");
    const firstName = nameParts[0] || data.companyName;
    const lastName = nameParts.slice(1).join(" ") || "Carrier";

    const user = await prisma.user.create({
      data: {
        email: data.email || `dat-${Date.now()}@placeholder.silkroutelogistics.ai`,
        passwordHash,
        firstName,
        lastName,
        company: data.companyName,
        phone: data.phone || null,
        role: "CARRIER",
        carrierProfile: {
          create: {
            mcNumber: data.mcNumber || null,
            dotNumber: data.dotNumber || null,
            companyName: data.companyName,
            contactName: data.contactName || null,
            contactPhone: data.phone || null,
            contactEmail: data.email || null,
            equipmentTypes: [],
            operatingRegions: [],
            onboardingStatus: "REVIEWING",
            status: "REVIEW",
            tier: "GUEST",
            cppTier: "GUEST",
            source: "dat",
          },
        },
      },
      include: { carrierProfile: true },
    });

    const profile = user.carrierProfile!;

    let fmcsaResult = null;
    if (data.dotNumber) {
      try {
        fmcsaResult = await verifyCarrierWithFMCSA(data.dotNumber);
        if (fmcsaResult.verified) {
          await prisma.carrierProfile.update({
            where: { id: profile.id },
            data: {
              onboardingStatus: "APPROVED",
              status: "APPROVED",
              approvedAt: new Date(),
              safetyRating: fmcsaResult.safetyRating,
              fmcsaAuthorityStatus: fmcsaResult.operatingStatus,
              fmcsaLastChecked: new Date(),
              ...(fmcsaResult.legalName && { companyName: fmcsaResult.legalName }),
            },
          });
        } else {
          await prisma.carrierProfile.update({
            where: { id: profile.id },
            data: {
              onboardingStatus: "REJECTED",
              status: "REJECTED",
              fmcsaAuthorityStatus: fmcsaResult.operatingStatus,
              fmcsaLastChecked: new Date(),
              notes: "FMCSA verification failed: " + (fmcsaResult.errors || []).join(", "),
            },
          });
        }
      } catch (err) {
        log.error({ err }, "[FMCSA] Verification error during DAT import:");
      }
    }

    const updated = await prisma.carrierProfile.findUnique({
      where: { id: profile.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, company: true, email: true } } },
    });

    if (data.email && !data.email.includes("placeholder")) {
      try {
        const { startCarrierSequence } = await import("../services/emailSequenceService");
        await startCarrierSequence(profile.id, data.email, data.contactName || data.companyName, req.user!.id);
        log.info(`[DAT Import] Carrier recruitment sequence started for ${data.email}`);
      } catch (err: any) {
        log.info(`[DAT Import] Sequence not started: ${err.message}`);
      }
    }

    res.status(201).json({
      carrier: updated,
      fmcsa: fmcsaResult,
      tempPassword: data.email ? tempPassword : null,
      sequenceStarted: !!(data.email && !data.email.includes("placeholder")),
    });
  }
);

// POST /api/carriers/:id/emergency-approve — Admin emergency approval
router.post(
  "/:id/emergency-approve",
  authorize("ADMIN", "CEO"),
  async (req: AuthRequest, res: Response) => {
    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({ error: "Reason required for emergency approval" });
      return;
    }

    const profile = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    const updated = await prisma.carrierProfile.update({
      where: { id: profile.id },
      data: {
        onboardingStatus: "APPROVED",
        status: "APPROVED",
        approvedAt: new Date(),
        emergencyApproved: true,
        emergencyApproveReason: reason,
        emergencyApprovedById: req.user!.id,
        emergencyApprovedAt: new Date(),
      },
    });

    try {
      await prisma.auditTrail.create({
        data: {
          performedById: req.user!.id,
          action: "CREATE",
          entityType: "EMERGENCY_APPROVE",
          entityId: profile.id,
          changedFields: { reason, carrierId: profile.id } as any,
          ipAddress: req.ip || null,
        },
      });
    } catch { /* non-blocking */ }

    res.json({ success: true, carrier: updated });
  }
);

// POST /api/carriers/:id/promote-to-silver — Manually promote Guest to Silver
// (endpoint path kept as `/promote-to-bronze` for URL compat with any
// long-lived links; the semantics are Guest → Silver (entry tier) in v3.7.a).
router.post(
  "/:id/promote-to-bronze",
  authorize("ADMIN", "CEO", "BROKER"),
  async (req: AuthRequest, res: Response) => {
    const profile = await prisma.carrierProfile.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true } } },
    });

    if (!profile) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    if (profile.tier !== "GUEST" && profile.cppTier !== "GUEST") {
      res.status(400).json({ error: "Carrier is not a Guest tier" });
      return;
    }

    await prisma.carrierProfile.update({
      where: { id: profile.id },
      data: { tier: "SILVER", cppTier: "SILVER", source: "caravan" },
    });

    await prisma.notification.create({
      data: {
        userId: profile.userId,
        type: "GENERAL",
        title: "Welcome to the Caravan Partner Program!",
        message: "You have been promoted to Silver tier in the Caravan Partner Program by your account executive.",
        actionUrl: "/carrier/dashboard",
      },
    });

    res.json({ success: true });
  }
);

export default router;
