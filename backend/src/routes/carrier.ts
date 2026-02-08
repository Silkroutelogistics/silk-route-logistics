import { Router } from "express";
import {
  registerCarrier, uploadCarrierDocuments, getOnboardingStatus, verifyCarrier,
  getDashboard, getScorecard, getRevenue, getBonuses,
} from "../controllers/carrierController";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../config/upload";

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

// Admin only
router.post("/verify/:id", authorize("ADMIN"), verifyCarrier);

export default router;
