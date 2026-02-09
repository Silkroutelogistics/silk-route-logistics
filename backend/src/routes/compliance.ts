import { Router } from "express";
import { getAlerts, scanCompliance, dismissAlert, resolveAlert, getComplianceStats } from "../controllers/complianceController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

router.get("/alerts", authorize("ADMIN", "OPERATIONS", "CEO"), getAlerts);
router.post("/scan", authorize("ADMIN", "OPERATIONS", "CEO"), auditLog("SCAN", "Compliance"), scanCompliance);
router.patch("/alerts/:id/dismiss", auditLog("DISMISS", "ComplianceAlert"), dismissAlert);
router.patch("/alerts/:id/resolve", auditLog("RESOLVE", "ComplianceAlert"), resolveAlert);
router.get("/stats", getComplianceStats);

export default router;
