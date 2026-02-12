import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { enhancedHealth, listCronJobs, manualRunCron, toggleCron, getErrorLogs, getErrorStats } from "../controllers/monitoringController";

const router = Router();

// Enhanced health (admin only)
router.get("/health", authenticate, authorize("ADMIN"), enhancedHealth as any);

// Cron management (admin only)
router.get("/crons", authenticate, authorize("ADMIN"), listCronJobs as any);
router.post("/crons/:name/run", authenticate, authorize("ADMIN"), manualRunCron as any);
router.post("/crons/:name/toggle", authenticate, authorize("ADMIN"), toggleCron as any);

// Error logs (admin only)
router.get("/errors", authenticate, authorize("ADMIN"), getErrorLogs as any);
router.get("/errors/stats", authenticate, authorize("ADMIN"), getErrorStats as any);

export default router;
