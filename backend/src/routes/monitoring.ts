import { Router, Response } from "express";
import * as Sentry from "@sentry/node";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { enhancedHealth, listCronJobs, manualRunCron, toggleCron, getErrorLogs, getErrorStats } from "../controllers/monitoringController";
import { sendHealthDigest } from "../services/healthDigestService";
import { getSentryStatus } from "../services/sentryAlertService";

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

// Manual health digest trigger (admin only)
router.post("/health-digest", authenticate, authorize("ADMIN"), async (_req: AuthRequest, res: Response) => {
  try {
    await sendHealthDigest();
    res.json({ message: "Health digest email sent to all admin users" });
  } catch (e: any) {
    res.status(500).json({ error: `Failed to send digest: ${e.message}` });
  }
});

// Sentry status and test (admin only)
router.get("/sentry", authenticate, authorize("ADMIN"), (_req: AuthRequest, res: Response) => {
  res.json(getSentryStatus());
});

router.post("/sentry/test", authenticate, authorize("ADMIN"), (_req: AuthRequest, res: Response) => {
  const sentryEnabled = !!process.env.SENTRY_DSN;
  if (!sentryEnabled) {
    res.status(400).json({ error: "Sentry not configured — set SENTRY_DSN environment variable" });
    return;
  }

  const testId = Sentry.captureMessage("SRL Sentry test alert — triggered manually from admin panel", {
    level: "info",
    tags: { source: "admin-test", triggeredBy: (_req as AuthRequest).user?.email || "unknown" },
  });

  res.json({
    message: "Test event sent to Sentry",
    eventId: testId,
    note: "Check your Sentry dashboard to confirm it arrived. If you have alert rules configured, you should also receive notifications.",
  });
});

export default router;
