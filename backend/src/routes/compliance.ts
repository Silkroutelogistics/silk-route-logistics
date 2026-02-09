import { Router } from "express";
import { getAlerts, scanCompliance, dismissAlert, resolveAlert, getComplianceStats } from "../controllers/complianceController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/alerts", authorize("ADMIN", "OPERATIONS", "CEO"), getAlerts);
router.post("/scan", authorize("ADMIN", "OPERATIONS", "CEO"), scanCompliance);
router.patch("/alerts/:id/dismiss", dismissAlert);
router.patch("/alerts/:id/resolve", resolveAlert);
router.get("/stats", getComplianceStats);

export default router;
