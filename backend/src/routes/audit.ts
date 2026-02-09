import { Router } from "express";
import { getAuditLogs, getAuditStats } from "../controllers/auditController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/logs", authorize("ADMIN", "CEO"), getAuditLogs);
router.get("/stats", authorize("ADMIN", "CEO"), getAuditStats);

export default router;
