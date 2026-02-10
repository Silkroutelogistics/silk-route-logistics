import { Router } from "express";
import { getAuditLogs, getAuditStats, getLoginActivity } from "../controllers/auditController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/logs", authorize("ADMIN", "CEO"), getAuditLogs);
router.get("/stats", authorize("ADMIN", "CEO"), getAuditStats);
router.get("/login-activity", authorize("ADMIN", "CEO"), getLoginActivity);

export default router;
