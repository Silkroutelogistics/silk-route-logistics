import { queueDocumentIntake } from "../services/documentIntakeService";
import { Router, Response } from "express";
import { issueInvite } from "../services/onboardingInviteService";
import { transitionToReviewing } from "../services/onboardingLifecycleService";
import path from "path";
import { uploadFile, getFileStream } from "../services/storageService";
import {
  getAllCarriers, getCarrierDetail, registerCarrier, updateCarrier, verifyCarrier,
  getCarrierScore,
  // v3.8.asb — Quick Pay pilot, AE side of request-then-approve.
  listQuickPayEnrollments, approveQuickPayEnrollment,
  declineQuickPayEnrollment, withdrawQuickPayEnrollment,
} from "../controllers/carrierController";
import {
  vetCarrierEndpoint, getVettingReport, runFullVetting,
  runIdentityCheckEndpoint, getIdentityStatus,
  runChameleonCheckEndpoint, getChameleonMatches, reviewChameleonMatch,
  getVettingHistory, getCompassHistory, grantGracePeriodEndpoint,
  runOfacScreen, runFacialVerify, runEldValidation, runTinVerify,
  getFraudReports, fileFraudReport, reviewFraudReport, respondToFraudReport,
  getCarrierAgreements, createAgreement, signAgreement,
  terminateAgreement,
  runCsaUpdate, runOverbookingCheck, getOverbookingReportEndpoint,
  updateUcrStatus,
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
import { uploadLimiter, staffUploadLimiter } from "../middleware/rateLimiters";
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
  // v3.8.aiw added the COI effective/expiry date PAIR to registration and to
  // the updateCarrier writer, but not to this schema — so the writer read four
  // fields validateBody had already stripped, and an effective date could be
  // written at registration and never corrected afterwards. Quieter than the
  // reset-password case because no AE surface calls PUT /carriers/:id with them
  // today, but the handler reads them and the contract should say so.
  autoLiabilityEffective: z.string().optional(),
  cargoInsuranceEffective: z.string().optional(),
  generalLiabilityEffective: z.string().optional(),
  workersCompEffective: z.string().optional(),
});

// Public: carrier self-registration (supports multipart/form-data for file uploads)
router.post("/",
  // v3.8.aqo — public multipart endpoint; it previously had NO upload limiter at
  // all and fell through to the general 300/15min apiLimiter.
  uploadLimiter,
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

// ── v3.8.asb — Quick Pay pilot queue ──
// MOUNTED ABOVE `/:id`. Express matches in declaration order, so declared
// after it this literal path would be swallowed by the parameterised route and
// answer 404 "Carrier not found" for a carrier id of "quickpay-enrollments".
router.get(
  "/quickpay-enrollments",
  authorize("ADMIN", "CEO", "OPERATIONS"),
  listQuickPayEnrollments,
);

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
router.post("/:id/read-coi", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), staffUploadLimiter, upload.single("file"), async (req: AuthRequest, res: Response) => {
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

// ── Arc 33: AE carrier invitations ──────────────────────────────────
// Replaces the "Invite Carriers" anchor that pointed at /onboarding — the
// carrier's own self-registration wizard, which invited nobody.
//
// ADMIN/CEO, matching the customer portal invite (v3.8.aqs) rather than the
// wider set used for Quick Pay decisions: this creates an onboarding record
// and sends outbound mail under SRL's name.
const inviteSchema = z.object({
  email: z.string().email(),
  company: z.string().max(200).optional(),
  mcNumber: z.string().max(50).optional(),
  note: z.string().max(1000).optional(),
});

// Arc 33 Phase 2b — PENDING → REVIEWING. The transition that did not exist:
// nothing moved a submitted application into review, so the carrier heard
// nothing between the receipt email and a decision. Idempotent — an AE
// opening the same file twice is not a state change.
router.post(
  "/:id/start-review",
  authorize("ADMIN", "CEO", "OPERATIONS"),
  auditLog("UPDATE", "Carrier"),
  async (req: AuthRequest, res: Response) => {
    try {
      const out = await transitionToReviewing(req.params.id);
      res.json({ ok: true, ...out });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "Carrier not found" });
    }
  },
);

router.post(
  "/invite",
  authorize("ADMIN", "CEO"),
  validateBody(inviteSchema),
  auditLog("CREATE", "OnboardingInvite"),
  async (req: AuthRequest, res: Response) => {
    const body = req.body as z.infer<typeof inviteSchema>;
    const inviter = req.user
      ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } })
      : null;

    const result = await issueInvite({
      email: body.email,
      invitedById: req.user!.id,
      company: body.company,
      mcNumber: body.mcNumber,
      note: body.note,
      inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : undefined,
    });

    if (!result.ok) {
      // 409 with the real state. The caller is staff, so telling them exactly
      // where this carrier already is IS the useful answer — the enumeration
      // caution that governs the public routes does not apply behind an
      // ADMIN/CEO gate.
      res.status(409).json({ error: result.detail, code: result.reason });
      return;
    }

    // The copy-link is returned even on a successful send, mirroring the
    // driver-invite flow: mail is filtered often enough that an AE needs to be
    // able to paste the link into a phone call.
    res.status(201).json({
      ok: true,
      inviteUrl: result.inviteUrl,
      emailSent: result.emailSent,
      reissued: result.reissued,
    });
  },
);


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
// audit-pass1: MISSING-UI — fraud-report review is AE-managed but has no console surface.
router.patch("/fraud-reports/:reportId/review", authorize("ADMIN", "CEO"), reviewFraudReport);
// v3.8.ani (audit F1) — was behind authenticate but missing role authz, so any
// authenticated user (carrier/shipper included) could write a response to any
// fraud report by id. No frontend caller today; the fraud flow is AE-managed
// (siblings above are ADMIN/CEO/OPERATIONS/BROKER). Gate to AE roles. A future
// carrier-self-response feature would get its own carrier-scoped + owned endpoint.
router.post("/fraud-reports/:reportId/respond", authorize("ADMIN", "CEO", "OPERATIONS"), respondToFraudReport);

const terminateAgreementSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

// Carrier-broker agreements
router.get("/:id/agreements", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getCarrierAgreements);
router.post("/:id/agreements", authorize("ADMIN", "CEO", "OPERATIONS"), createAgreement);
// The AE-side counter-signature path. Previously mounted at
// `/agreements/:agreementId/sign` with NO authorize() and no ownership check,
// so any authenticated principal — a CARRIER, or a DIFFERENT carrier — could
// execute the instrument that allocates cargo liability for anyone, by
// enumerating an id. On a "broker-carrier" row that directly satisfies the
// complianceCheck hard-gate and unblocks tendering. Same defect class the
// fraud-report respond route was gated for in v3.8.ani.
//
// Now (a) gated to the AE roles that own the agreement flow, and (b) mounted
// carrier-scoped so the handler can verify the agreement belongs to the carrier
// in the path — matching every other route in this file, which takes :id =
// CarrierProfile.id. Carriers sign their own BCA through the portal path
// (POST /api/carrier-auth/sign-bca), which is carrier-authed and self-scoped.
// One caller exists and it already used the NEW shape: the AE console at
// frontend/public/ae/compliance/carrier.html POSTs
// /api/carriers/<id>/agreements/<agreementId>/sign, so it was 404ing against the
// old mount and this re-mount fixes it. It sends no body, and signAgreement
// requires signedByName + signatureData, so it now 400s instead — still broken,
// pre-existing, but reachable for the first time. Nothing in frontend/src, e2e,
// backend/scripts or backend/__tests__ referenced either path.
// v3.8.awx — OPERATIONS narrowed OUT, matching terminate below.
//
// Signing a new agreement is what CLEARS the AGREEMENT_TERMINATED block: the
// gate reads the latest SIGNED row, so a fresh signature un-terminates a carrier.
// Termination is ADMIN+CEO precisely because it hard-blocks every tender. Leaving
// sign at OPERATIONS meant a role that cannot terminate a carrier could
// un-terminate one — and through a route with no UI, so it left no trace anyone
// would look at.
//
// Not an override and not a §14 breach: signing changes the underlying fact,
// which §14 names as the legitimate remedy. The defect was the asymmetry, and
// the fix is to make the pair match.
router.post("/:id/agreements/:agreementId/sign", authorize("ADMIN", "CEO"), signAgreement);

// Terminate a signed agreement. ADMIN + CEO only — narrower than create/sign
// above, because terminating a BCA hard-blocks the carrier from every tender,
// which is carrier-approval consequence rather than agreement-admin consequence.
// The row and its PDF survive: termination is a status change, not a delete,
// because a terminated agreement is the record of what governed past loads.
// Policy questions (who may terminate, whether notice is owed) are §16.
router.post(
  "/:id/agreements/:agreementId/terminate",
  authorize("ADMIN", "CEO"),
  validateBody(terminateAgreementSchema),
  auditLog("UPDATE", "CarrierAgreement"),
  terminateAgreement,
);

// Phase B: CSA, overbooking, VIN, UCR
router.post("/:id/csa-update", authorize("ADMIN", "CEO", "OPERATIONS"), runCsaUpdate);
router.post("/:id/overbooking-check", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH"), runOverbookingCheck);
router.get("/:id/overbooking-report", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH"), getOverbookingReportEndpoint);
// audit-pass1: MISSING-UI — UCR is read by Compass vetting; manual correction has no UI.
router.patch("/:id/ucr", authorize("ADMIN", "CEO", "OPERATIONS"), updateUcrStatus);

// Chameleon match review (not carrier-scoped).
// Wired to SecuritySignalsCard in v3.8.aud. ADMIN/CEO matches the card's own
// isAdmin gate, so the control is never shown to a role the route would refuse.
router.put(
  "/chameleon-matches/:matchId/review",
  authorize("ADMIN", "CEO"),
  auditLog("UPDATE", "ChameleonMatch"),
  reviewChameleonMatch,
);

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
    where: { carrierId: carrier.id, status: { in: ["OPEN", "REVIEWED", "CONFIRMED_FRAUD"] } },
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

  // ── Arc launch-fix riders: two read-only AE panels over data that already
  // existed and had no surface. Neither writes anything.

  // AUTH TIMELINE. auth_events has been recorded since Arc 5 and this is its
  // FIRST frontend consumer — every verification, failed login, TOTP failure
  // and password reset for this address has been captured all along with its IP
  // and user agent, readable only by querying the database by hand. An audit
  // trail nobody can reach is not much of an audit trail.
  //
  // Keyed by EMAIL rather than userId because the most interesting events
  // predate the account: onboarding verification happens before a User exists.
  const authEvents = await (prisma as unknown as {
    authEvent?: { findMany: (a: unknown) => Promise<unknown[]> };
  }).authEvent
    ?.findMany({
      where: { email: carrier.user.email.toLowerCase() },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, type: true, ip: true, userAgent: true, createdAt: true },
    })
    .catch(() => [])
    ?? [];

  // ACTIVE SESSIONS. Count and freshness only. Revocation is deliberately NOT
  // duplicated here — logout and the expiry sweep already own it, and a second
  // path to delete a session row is a second place for the two to disagree.
  const sessions = await prisma.staffSession
    .findMany({
      where: { userId: carrier.user.id, portal: "CARRIER" },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
      select: { id: true, issuedAt: true, lastSeenAt: true, rememberMe: true },
    })
    .catch(() => []);

  res.json({
    authEvents,
    sessions,
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

// ── v3.8.asb — Quick Pay pilot decisions ──────────────────────────────────
//
// Request-then-approve. The carrier asks at onboarding
// (carrierRegisterSchema.requestQuickPayPilot); these three endpoints are how
// SRL answers. Reason is required on decline and on withdraw and is sent to
// the carrier verbatim, so it is written for them to read, not for a log.
//
// ADMIN / CEO / OPERATIONS. Wider than the ADMIN+CEO approve/reject pair
// below on purpose: those decide whether a carrier may haul at all, this
// decides whether they may pay a fee for faster money on loads they are
// already cleared to haul. Operations runs the pilot day to day.
//
// Audited under the existing AuditAction values — the enum is closed
// (schema.prisma:471) and adding QUICKPAY_* would be a migration for three
// labels. `entity: "QuickPayEnrollment"` is what makes these greppable apart
// from carrier approval, and entityId is the CarrierProfile id, matching
// every other /:id route in this file.
const quickPayReviewSchema = z.object({
  note: z.string().max(2000).optional(),
});
const quickPayReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters. The carrier is told why, so write it for them to read.")
    .max(2000),
});

router.post(
  "/:id/quickpay/approve",
  authorize("ADMIN", "CEO", "OPERATIONS"),
  validateBody(quickPayReviewSchema),
  auditLog("APPROVE", "QuickPayEnrollment"),
  approveQuickPayEnrollment,
);
router.post(
  "/:id/quickpay/decline",
  authorize("ADMIN", "CEO", "OPERATIONS"),
  validateBody(quickPayReasonSchema),
  auditLog("REJECT", "QuickPayEnrollment"),
  declineQuickPayEnrollment,
);
router.post(
  "/:id/quickpay/withdraw",
  authorize("ADMIN", "CEO", "OPERATIONS"),
  validateBody(quickPayReasonSchema),
  auditLog("UPDATE", "QuickPayEnrollment"),
  withdrawQuickPayEnrollment,
);

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
// audit-pass1: MISSING-UI — soft-delete restore has no console affordance.
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
router.post("/:carrierId/documents", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), staffUploadLimiter, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.carrierId } });
    if (!carrier) { res.status(404).json({ error: "Carrier not found" }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const ext = path.extname(file.originalname).toLowerCase();
    const storagePath = `carrier-docs/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    // v3.8.avs — name the STAGE that failed.
    //
    // Storage and the database were both inside one try whose catch answered
    // "Failed to upload document" for either. Those need completely different
    // responses — a rejected PutObject is an env/permission problem, a failed
    // insert is not — and the operator could not tell which they had. The
    // production documents table has been empty since inception with nobody
    // able to say why, and this is the reason nobody could.
    let fileUrl: string;
    try {
      fileUrl = await uploadFile(file.buffer, storagePath, file.mimetype);
    } catch (storageErr) {
      // AWS SDK errors carry a `name` (AccessDenied, NoSuchBucket, InvalidAccessKeyId)
      // and an HTTP status. Both are safe to surface — they name the
      // misconfiguration without disclosing bucket, key or credential.
      const e = storageErr as {
        name?: string; message?: string; Code?: string;
        $metadata?: { httpStatusCode?: number };
        $response?: { body?: unknown };
      };
      const code = e?.name || "UnknownStorageError";
      const httpStatus = e?.$metadata?.httpStatusCode;
      // v3.8.avw — pass the PROVIDER'S OWN sentence through.
      //
      // The code alone (InvalidArgument) says a request was refused; it does not
      // say which argument. R2 puts that in `message` — "Checksum algorithm
      // provided is not supported", "The specified bucket does not exist" — and
      // we were discarding it, which turned a one-line diagnosis into an
      // afternoon of hypotheses. It is a provider error string, not our data:
      // safe to show, and it names the fix.
      const providerMessage = (e?.message || "").slice(0, 300);
      log.error(
        { err: storageErr, code, httpStatus, providerMessage, storagePath, carrierId: carrier.id },
        "[Carrier Docs] STORAGE REJECTED the upload — the file was not retained",
      );
      res.status(502).json({
        error:
          `Storage rejected the file (${code}${httpStatus ? ` / HTTP ${httpStatus}` : ""})` +
          `${providerMessage ? `: "${providerMessage}"` : ""}. ` +
          `The document was NOT saved. This is an object-storage configuration problem, not a problem with the file.`,
        stage: "STORAGE",
        code,
        providerMessage,
      });
      return;
    }

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

    // v3.8.awh — same seam as registration and the portal. One service decides
    // what a persisted document means; the routes only report that one arrived.
    queueDocumentIntake({
      documentId: doc.id,
      docType: doc.docType,
      entityType: doc.entityType,
      entityId: doc.entityId,
      fileUrl: doc.fileUrl,
      fileType: doc.fileType,
    });

    // Update carrier boolean flags if applicable
    const dt = (req.body.docType || "").toUpperCase();
    if (dt === "W9") await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { w9Uploaded: true } });
    else if (dt === "COI") await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { insuranceCertUploaded: true } });
    else if (dt === "AUTHORITY") await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { authorityDocUploaded: true } });

    res.status(201).json({ document: doc });
  } catch (err) {
    // Storage is handled above and returns before reaching here, so anything
    // landing in this catch is post-upload: the object exists and the RECORD
    // failed. That distinction matters — the file is in the bucket, orphaned,
    // and re-uploading makes a second copy rather than fixing anything.
    const e = err as { name?: string; code?: string; message?: string };
    log.error({ err, carrierId: req.params.carrierId }, "[Carrier Docs] Upload error AFTER storage — object may be orphaned");
    res.status(500).json({
      error:
        `The file reached storage but the record could not be saved (${e?.code || e?.name || "unknown"}). ` +
        `Do not re-upload — tell an admin, since the file is already stored without a record.`,
      stage: "RECORD",
    });
  }
});

// GET /api/carriers/:carrierId/extractions — what a parser read, beside what was typed
//
// v3.8.awh. Returns the most recent extraction per docType. The AE insurance tab
// renders these ALONGSIDE the carrier's typed values, never instead of them: a
// typed value is what the carrier attested to, an extracted value is a second
// reading of the document, and where they disagree that is a finding for a human
// rather than a fact to overwrite with.
router.get("/:carrierId/extractions", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.documentExtraction.findMany({
      where: { carrierProfileId: req.params.carrierId },
      orderBy: { createdAt: "desc" },
      include: { document: { select: { id: true, fileName: true, createdAt: true, fileUrl: true } } },
    });
    // Most recent per docType — an older COI is history, not the current answer.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.docType)) latest.set(r.docType, r);
    res.json({ extractions: [...latest.values()] });
  } catch (err) {
    log.error({ err, carrierId: req.params.carrierId }, "[Carrier Docs] could not load extractions");
    res.status(500).json({ error: "Could not load document readings." });
  }
});

// GET /api/carriers/:carrierId/documents/:docId/file — stream a stored document
//
// v3.8.avx — the preview was embedding `fileUrl` directly, and once storage
// actually worked that value became `s3://srl-documents/carrier-docs/...`. A
// browser cannot load an s3:// scheme, so the first successfully stored document
// rendered as a broken-file icon: upload fixed, read path never wired.
//
// v3.8.avy — the first fix signed an R2 URL and handed it to the iframe. That is
// blocked before it is ever requested: the site CSP is `frame-src
// https://www.google.com`, and a frame blocked by CSP renders as an empty box
// with nothing in it a user could act on. The obvious patch — add the R2 hostname
// to frame-src — ties the browser's security policy to a backend storage setting,
// so the day storage moves the preview goes silently blank again. That is the
// exact failure shape this whole arc was spent on.
//
// So the bytes come through the API and the browser renders a blob: URL. One CSP
// entry, no storage hostname in it, and the presigned URL never reaches the
// browser at all — so it cannot be forwarded out of the console. These are COIs
// and W-9s reviewed by an AE a few at a time; proxying them costs nothing.
router.get("/:carrierId/documents/:docId/file", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId, entityType: "CARRIER", entityId: req.params.carrierId },
      select: { id: true, fileUrl: true, fileName: true, fileType: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    // An UPLOAD_FAILED row has no file. Say so rather than reaching for an
    // object that was never written.
    if (!doc.fileUrl) {
      res.status(409).json({
        error: "This document has no stored file — it was submitted but storage refused it.",
        code: "NO_STORED_FILE",
      });
      return;
    }

    const stream = await getFileStream(doc.fileUrl);

    // The filename is whatever the uploader's file was called, so it goes into a
    // header only after quotes and newlines are stripped — a CR/LF in a filename
    // is header injection, not a display bug.
    const safeName = (doc.fileName || "document").replace(/[\r\n"\\]/g, "_").slice(0, 120);
    res.setHeader("Content-Type", doc.fileType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Once a byte is written the status line is gone, so a mid-stream failure
    // cannot become a JSON error. Destroying the socket makes the client's
    // request fail loudly instead of handing it a silently truncated PDF.
    stream.on("error", (err) => {
      log.error({ err, docId: req.params.docId }, "[Carrier Docs] stream failed mid-flight");
      res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    log.error({ err, docId: req.params.docId }, "[Carrier Docs] could not open a stored document");
    res.status(500).json({ error: "Could not open this document. Try again." });
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

    // v3.8.avu — a document with no stored file cannot be VERIFIED.
    //
    // An UPLOAD_FAILED row carries fileUrl "" by design: the carrier submitted
    // the file and storage refused it. One such row had already been marked
    // VERIFIED — an Operating Authority reading verified with nothing behind it.
    // That is the record that looks clean in an audit and collapses the moment
    // anyone asks to see the document, and the compliance panel would have
    // counted it as satisfied.
    //
    // The UI disables the button, but a disabled button is a hint, not a gate.
    // REJECTED stays allowed: refusing a document that never arrived is a
    // legitimate thing to record.
    if (status === "VERIFIED" && !doc.fileUrl) {
      res.status(409).json({
        error:
          "This document has no stored file — it was submitted but storage refused it. " +
          "It has to be re-uploaded, not verified. Marking it verified would record a " +
          "document that does not exist.",
        code: "NO_STORED_FILE",
      });
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
