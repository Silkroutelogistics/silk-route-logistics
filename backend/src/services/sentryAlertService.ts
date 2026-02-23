import * as Sentry from "@sentry/node";
import { prisma } from "../config/database";
import { sendEmail } from "./emailService";

/**
 * Sentry Alert Service
 * Provides programmatic Sentry health checks and proactive error alerting.
 *
 * Sentry alert rules (email on new issues, spike detection) must be configured
 * in the Sentry dashboard (Settings > Alerts). This service supplements that
 * with in-app error monitoring that sends email alerts independently.
 */

// ── Error Spike Detection ──
// Tracks error velocity and sends immediate email alerts for spikes

interface ErrorWindow {
  count: number;
  firstSeen: number;
}

const errorWindows = new Map<string, ErrorWindow>();
const SPIKE_THRESHOLD = 5;       // errors of same type
const SPIKE_WINDOW_MS = 5 * 60_000; // within 5 minutes
const COOLDOWN_MS = 30 * 60_000;    // don't re-alert for 30 min
const lastAlertTimes = new Map<string, number>();

/**
 * Track an error for spike detection. Called from error handler.
 * Groups errors by type+endpoint and alerts when spike threshold is exceeded.
 */
export function trackError(errorType: string, endpoint: string, message: string) {
  const key = `${errorType}:${endpoint}`;
  const now = Date.now();

  const window = errorWindows.get(key);
  if (!window || now - window.firstSeen > SPIKE_WINDOW_MS) {
    errorWindows.set(key, { count: 1, firstSeen: now });
    return;
  }

  window.count++;

  if (window.count >= SPIKE_THRESHOLD) {
    const lastAlert = lastAlertTimes.get(key) || 0;
    if (now - lastAlert > COOLDOWN_MS) {
      lastAlertTimes.set(key, now);
      sendErrorSpikeAlert(errorType, endpoint, message, window.count).catch(() => {});

      // Also report to Sentry as a separate issue
      Sentry.captureMessage(`Error spike detected: ${window.count}x ${errorType} on ${endpoint}`, {
        level: "warning",
        tags: { alertType: "error-spike", errorType, endpoint },
        extra: { count: window.count, windowMs: SPIKE_WINDOW_MS, message },
      });
    }
    // Reset window after alert
    errorWindows.set(key, { count: 0, firstSeen: now });
  }
}

async function sendErrorSpikeAlert(errorType: string, endpoint: string, message: string, count: number) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true },
  });

  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0D1B2A;color:#E0E7EE;padding:24px;border-radius:10px;border-left:4px solid #f87171;">
      <h2 style="color:#f87171;margin:0 0 12px;font-size:16px;">&#9888; Error Spike Alert</h2>
      <p style="margin:0 0 16px;color:#8899AA;font-size:13px;">
        ${count} errors of the same type detected within 5 minutes.
      </p>
      <table style="width:100%;font-size:13px;">
        <tr><td style="padding:6px 0;color:#8899AA;">Error Type</td><td style="padding:6px 0;font-weight:600;">${errorType}</td></tr>
        <tr><td style="padding:6px 0;color:#8899AA;">Endpoint</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${endpoint}</td></tr>
        <tr><td style="padding:6px 0;color:#8899AA;">Latest Message</td><td style="padding:6px 0;color:#f87171;">${message.slice(0, 200)}</td></tr>
        <tr><td style="padding:6px 0;color:#8899AA;">Count</td><td style="padding:6px 0;font-weight:700;color:#f87171;">${count}x in 5 min</td></tr>
        <tr><td style="padding:6px 0;color:#8899AA;">Time</td><td style="padding:6px 0;">${new Date().toISOString()}</td></tr>
      </table>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid #243447;font-size:11px;color:#4a5e70;">
        Silk Route Logistics — Automated Error Alert
      </div>
    </div>
  `;

  for (const admin of admins) {
    await sendEmail(admin.email, `[SRL ALERT] Error spike: ${count}x ${errorType} on ${endpoint}`, html).catch(() => {});
  }
}

/**
 * Get Sentry integration status for the health dashboard
 */
export function getSentryStatus() {
  const dsn = process.env.SENTRY_DSN;
  return {
    enabled: !!dsn,
    configured: !!dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.2,
    features: {
      errorCapture: !!dsn,
      performanceMonitoring: !!dsn,
      userContext: true,       // Set in auth middleware
      expressIntegration: true, // setupExpressErrorHandler
      errorSpikeDetection: true, // This service
      dailyHealthDigest: true,   // healthDigestService
    },
    alertChannels: {
      sentryDashboard: !!dsn ? "Configure at https://sentry.io > Settings > Alerts" : "Not available (no DSN)",
      emailAlerts: "Active — error spikes and daily digest",
      inAppNotifications: "Active — 10+ errors/hour threshold",
    },
  };
}
