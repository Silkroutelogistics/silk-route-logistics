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

// Storage self-test (admin only) — proves the live bucket credentials actually
// permit PutObject/GetObject/DeleteObject, which isS3Active() cannot tell you.
router.get("/storage/selftest", authenticate, authorize("ADMIN", "CEO"), async (_req: AuthRequest, res: Response) => {
  try {
    const { runStorageSelfTest } = await import("../services/storageService");
    const result = await runStorageSelfTest();
    res.status(result.ok ? 200 : 503).json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: `Storage self-test failed to run: ${e.message}` });
  }
});

// Sentry capture self-test (admin only) — proves error telemetry is not just
// ENABLED (a DSN is present) but actually CAPTURING to your Sentry project. A
// stale/wrong DSN enables Sentry yet sends nowhere useful — the same "set but
// broken" trap as an S3 bucket with the wrong IAM policy. This deliberately
// captures a marked test exception and flushes it, returning the event id.
// After calling it, confirm the event with that id appears in your Sentry
// dashboard. It does NOT throw past the handler — the error is captured, not
// propagated — so it never trips the error-spike alarm beyond this one event.
router.get("/sentry-test", authenticate, authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const status = getSentryStatus();
  if (!status.enabled) {
    res.status(503).json({
      ok: false,
      enabled: false,
      note: "SENTRY_DSN is not set on this environment — error capture is OFF. Set it in the Render dashboard.",
      status,
    });
    return;
  }

  const marker = `srl-sentry-selftest-${req.user?.id ?? "admin"}`;
  let eventId: string | undefined;
  try {
    throw new Error(`Sentry self-test — deliberate captured test error (${marker})`);
  } catch (e) {
    eventId = Sentry.captureException(e, { tags: { area: "sentry-selftest" }, extra: { marker } });
  }
  // Force delivery so the caller knows the event actually left the process.
  const flushed = await Sentry.flush(3000).catch(() => false);

  res.status(200).json({
    ok: !!eventId && flushed,
    enabled: true,
    eventId,
    flushed,
    note: eventId && flushed
      ? `Captured + flushed. Confirm event ${eventId} appears in your Sentry dashboard (search tag area:sentry-selftest).`
      : "Sentry is enabled but the event did not confirm delivery — check the DSN points at a live project.",
    status,
  });
});

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
