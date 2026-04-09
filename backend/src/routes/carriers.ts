import { Router, Response } from "express";
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
  tier: z.enum(["PLATINUM", "GOLD", "SILVER", "BRONZE", "NONE"]).optional(),
  status: z.enum(["NEW", "REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  insuranceExpiry: z.string().optional(),
  equipmentTypes: z.array(z.string()).optional(),
  operatingRegions: z.array(z.string()).optional(),
  numberOfTrucks: z.number().int().positive().optional(),
  numberOfDrivers: z.number().int().positive().optional(),
  notes: z.string().optional(),
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

export default router;
