import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
  registerCarrier, uploadCarrierDocuments, getOnboardingStatus, verifyCarrier,
  getDashboard, getScorecard, getRevenue, getBonuses,
  getAllCarriers, getCarrierDetail, updateCarrier, setupAdminCarrierProfile,
} from "../controllers/carrierController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { prisma } from "../config/database";
import { upload } from "../config/upload";
import { auditLog } from "../middleware/audit";
import { validateBody } from "../middleware/validate";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { verifyCarrierWithFMCSA, lookupByMcNumber } from "../services/fmcsaService";
import { log } from "../lib/logger";

const router = Router();

// Rate limiter for public FMCSA lookup endpoints: 30 requests per 15 min per IP
const fmcsaLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many FMCSA lookup requests, please try again later" },
});

// Public: FMCSA DOT lookup for onboarding form auto-verification
router.get("/fmcsa-lookup/:dotNumber", fmcsaLookupLimiter, async (req: Request, res: Response) => {
  const dot = String(req.params.dotNumber);
  if (!dot || dot.length < 5 || !/^\d+$/.test(dot)) {
    res.status(400).json({ error: "Invalid DOT number. Must be at least 5 digits." });
    return;
  }
  try {
    const result = await verifyCarrierWithFMCSA(dot);
    res.json({
      verified: result.verified,
      legalName: result.legalName,
      dbaName: result.dbaName,
      mcNumber: result.mcNumber,
      operatingStatus: result.operatingStatus,
      entityType: result.entityType,
      safetyRating: result.safetyRating,
      insuranceOnFile: result.insuranceOnFile,
      totalPowerUnits: result.totalPowerUnits,
      totalDrivers: result.totalDrivers,
      outOfServiceDate: result.outOfServiceDate,
      phyStreet: result.phyStreet,
      phyCity: result.phyCity,
      phyState: result.phyState,
      phyZipcode: result.phyZipcode,
      phone: result.phone,
      errors: result.errors,
    });
  } catch (err) {
    log.error({ err: err }, "[FMCSA Lookup] Error:");
    res.status(500).json({ error: "FMCSA lookup failed. Please try again." });
  }
});

// Public: FMCSA MC# reverse lookup (MC → DOT + carrier data)
router.get("/fmcsa-mc-lookup/:mcNumber", fmcsaLookupLimiter, async (req: Request, res: Response) => {
  const mc = String(req.params.mcNumber).replace(/^MC-?/i, "").trim();
  if (!mc || !/^\d+$/.test(mc)) {
    res.status(400).json({ error: "Invalid MC number. Enter digits only (e.g. 156588)." });
    return;
  }
  try {
    const result = await lookupByMcNumber(mc);
    res.json({
      verified: result.verified,
      legalName: result.legalName,
      dbaName: result.dbaName,
      mcNumber: result.mcNumber,
      dotNumber: result.dotNumber,
      operatingStatus: result.operatingStatus,
      entityType: result.entityType,
      safetyRating: result.safetyRating,
      insuranceOnFile: result.insuranceOnFile,
      totalPowerUnits: result.totalPowerUnits,
      totalDrivers: result.totalDrivers,
      outOfServiceDate: result.outOfServiceDate,
      phyStreet: result.phyStreet,
      phyCity: result.phyCity,
      phyState: result.phyState,
      phyZipcode: result.phyZipcode,
      phone: result.phone,
      errors: result.errors,
    });
  } catch (err) {
    log.error({ err: err }, "[FMCSA MC Lookup] Error:");
    res.status(500).json({ error: "FMCSA MC lookup failed. Please try again." });
  }
});

// Public: carrier self-registration (multipart/form-data for file uploads)
router.post("/register",
  upload.fields([{ name: "photoId", maxCount: 1 }, { name: "articlesOfInc", maxCount: 1 }]),
  (req: any, _res: any, next: any) => {
    // Normalize FormData array fields (equipmentTypes, operatingRegions come as repeated fields)
    if (typeof req.body.equipmentTypes === "string") req.body.equipmentTypes = [req.body.equipmentTypes];
    if (typeof req.body.operatingRegions === "string") req.body.operatingRegions = [req.body.operatingRegions];
    next();
  },
  validateBody(carrierRegisterSchema),
  registerCarrier
);

// Authenticated carrier
router.use(authenticate);
router.post("/documents", upload.array("files", 5), uploadCarrierDocuments);
router.get("/onboarding-status", getOnboardingStatus);
router.get("/dashboard", getDashboard);
router.get("/scorecard", getScorecard);
router.get("/revenue", getRevenue);
router.get("/bonuses", getBonuses);

// Admin carrier profile setup
router.post("/admin-setup", authorize("ADMIN", "CEO"), setupAdminCarrierProfile);

// Admin / Employee view
router.get("/all", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getAllCarriers);
router.get("/:id/detail", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getCarrierDetail);
router.patch("/:id", authorize("ADMIN", "CEO"), auditLog("UPDATE", "Carrier"), updateCarrier);

// Admin only
router.post("/verify/:id", authorize("ADMIN", "CEO"), validateBody(verifyCarrierSchema), auditLog("VERIFY", "Carrier"), verifyCarrier);

// Capacity feed — carriers who have posted availability
router.get("/capacity-feed", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (_req: AuthRequest, res: Response) => {
  try {
    const profiles = await prisma.carrierProfile.findMany({
      where: { preferredLanes: { not: undefined } },
      select: {
        userId: true, companyName: true, mcNumber: true, equipmentTypes: true,
        operatingRegions: true, preferredLanes: true, activeLoadCount: true,
        numberOfTrucks: true,
      },
    });

    const feed = profiles
      .map((p) => {
        const lanes = p.preferredLanes as any;
        if (!lanes?.lastCapacityPost) return null;
        const post = lanes.lastCapacityPost;
        // Only include posts from the last 7 days
        const postedAt = new Date(post.postedAt);
        if (Date.now() - postedAt.getTime() > 7 * 24 * 60 * 60 * 1000) return null;
        return {
          carrierId: p.userId, companyName: p.companyName, mcNumber: p.mcNumber,
          equipmentTypes: p.equipmentTypes, trucks: p.numberOfTrucks,
          activeLoads: p.activeLoadCount,
          currentCity: post.currentCity, currentState: post.currentState,
          availableDate: post.availableDate, equipmentType: post.equipmentType,
          preferredDestStates: post.preferredDestStates, notes: post.notes,
          postedAt: post.postedAt,
        };
      })
      .filter(Boolean);

    res.json({ feed });
  } catch (err) {
    log.error({ err: err }, "[Capacity] Feed error:");
    res.status(500).json({ error: "Failed to fetch capacity feed" });
  }
});

export default router;
