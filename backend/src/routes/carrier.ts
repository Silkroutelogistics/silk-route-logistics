import { Router } from "express";
import {
  registerCarrier, uploadCarrierDocuments, getOnboardingStatus, verifyCarrier,
  getDashboard, getScorecard, getRevenue, getBonuses,
  getAllCarriers, getCarrierDetail, updateCarrier, setupAdminCarrierProfile,
} from "../controllers/carrierController";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../config/upload";
import { auditLog } from "../middleware/audit";

const router = Router();

// Public
router.post("/register", registerCarrier);

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
router.post("/verify/:id", authorize("ADMIN", "CEO"), auditLog("VERIFY", "Carrier"), verifyCarrier);

export default router;
