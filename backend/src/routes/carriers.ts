import { Router, Response } from "express";
import {
  getAllCarriers, getCarrierDetail, registerCarrier, updateCarrier, verifyCarrier,
  getCarrierScore,
} from "../controllers/carrierController";
import {
  vetCarrierEndpoint, getVettingReport,
  runIdentityCheckEndpoint, getIdentityStatus,
  runChameleonCheckEndpoint, getChameleonMatches, reviewChameleonMatch,
  getVettingHistory, grantGracePeriodEndpoint,
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
router.put("/:id", authorize("ADMIN", "CEO"), validateBody(updateCarrierSchema), auditLog("UPDATE", "Carrier"), updateCarrier);

// Identity & fraud detection
router.post("/:id/identity-check", authorize("ADMIN", "CEO", "OPERATIONS"), runIdentityCheckEndpoint);
router.get("/:id/identity", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getIdentityStatus);
router.post("/:id/chameleon-check", authorize("ADMIN", "CEO", "OPERATIONS"), runChameleonCheckEndpoint);
router.get("/:id/chameleon-matches", authorize("ADMIN", "CEO", "OPERATIONS"), getChameleonMatches);
router.get("/:id/vetting-history", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER"), getVettingHistory);
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
