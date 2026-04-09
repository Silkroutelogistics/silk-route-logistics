import { prisma } from "../config/database";
import { sendEmail } from "./emailService";
import * as Sentry from "@sentry/node";
import { log } from "../lib/logger";

/**
 * Daily Health Digest — Emails admins a system status summary every morning.
 * Covers: DB health, error rates, cron status, entity counts, Sentry status.
 */

interface ComponentHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  detail: string;
}

export async function sendHealthDigest() {
  const components: ComponentHealth[] = [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // ── Database Health ──
  let dbLatency = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
    components.push({
      name: "Database",
      status: dbLatency < 100 ? "healthy" : dbLatency < 500 ? "degraded" : "unhealthy",
      detail: `Latency: ${dbLatency}ms`,
    });
  } catch (e: any) {
    components.push({ name: "Database", status: "unhealthy", detail: e.message });
  }

  // ── Error Rate (last 24h and last hour) ──
  const [errors24h, errorsLastHour] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: oneDayAgo } } }).catch(() => -1),
    prisma.errorLog.count({ where: { createdAt: { gte: oneHourAgo } } }).catch(() => -1),
  ]);

  // Top error types in last 24h
  const topErrors = await prisma.errorLog
    .groupBy({
      by: ["errorType"],
      where: { createdAt: { gte: oneDayAgo } },
      _count: true,
      orderBy: { _count: { errorType: "desc" } },
      take: 5,
    })
    .catch(() => []);

  components.push({
    name: "Error Rate",
    status: errorsLastHour < 5 ? "healthy" : errorsLastHour < 10 ? "degraded" : "unhealthy",
    detail: `Last hour: ${errorsLastHour} | Last 24h: ${errors24h}`,
  });

  // ── Memory ──
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  components.push({
    name: "Memory",
    status: heapMB < 512 ? "healthy" : heapMB < 768 ? "degraded" : "unhealthy",
    detail: `Heap: ${heapMB}MB | RSS: ${(mem.rss / 1024 / 1024).toFixed(0)}MB`,
  });

  // ── Cron Jobs ──
  const cronJobs = await prisma.cronRegistry.findMany().catch(() => []);
  const failedCrons = cronJobs.filter((c) => c.lastStatus === "FAILED");
  const staleThreshold = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h for daily jobs
  const staleCrons = cronJobs.filter((c) => c.enabled && c.lastRun && c.lastRun < staleThreshold);

  components.push({
    name: "Cron Jobs",
    status: failedCrons.length === 0 && staleCrons.length === 0 ? "healthy" : "degraded",
    detail: `Total: ${cronJobs.length} | Failed: ${failedCrons.length} | Stale: ${staleCrons.length}`,
  });

  // ── Entity Counts ──
  const [users, loads, invoices, carriers] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.load.count().catch(() => 0),
    prisma.invoice.count().catch(() => 0),
    prisma.carrierProfile.count().catch(() => 0),
  ]);

  // ── Recent Activity (last 24h) ──
  const [newLoads, newUsers, deliveredLoads] = await Promise.all([
    prisma.load.count({ where: { createdAt: { gte: oneDayAgo } } }).catch(() => 0),
    prisma.user.count({ where: { createdAt: { gte: oneDayAgo } } }).catch(() => 0),
    prisma.load.count({ where: { status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED"] }, updatedAt: { gte: oneDayAgo } } }).catch(() => 0),
  ]);

  // ── Sentry Status ──
  const sentryEnabled = !!process.env.SENTRY_DSN;
  components.push({
    name: "Sentry",
    status: sentryEnabled ? "healthy" : "degraded",
    detail: sentryEnabled ? "Connected and capturing errors" : "Not configured (SENTRY_DSN missing)",
  });

  // ── Build Email ──
  const overallStatus = components.some((c) => c.status === "unhealthy")
    ? "UNHEALTHY"
    : components.some((c) => c.status === "degraded")
      ? "DEGRADED"
      : "HEALTHY";

  const statusEmoji: Record<string, string> = { healthy: "&#9989;", degraded: "&#9888;&#65039;", unhealthy: "&#10060;" };
  const overallEmoji: Record<string, string> = { HEALTHY: "&#9989;", DEGRADED: "&#9888;&#65039;", UNHEALTHY: "&#10060;" };

  const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:640px;margin:0 auto;background:#0D1B2A;color:#E0E7EE;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#C8963E;font-size:20px;margin:0;">SRL Daily Health Digest</h1>
        <p style="color:#8899AA;font-size:13px;margin:4px 0 0;">${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>

      <div style="background:#162236;border-radius:8px;padding:16px;margin-bottom:16px;text-align:center;">
        <span style="font-size:28px;">${overallEmoji[overallStatus]}</span>
        <h2 style="color:${overallStatus === "HEALTHY" ? "#4ade80" : overallStatus === "DEGRADED" ? "#fbbf24" : "#f87171"};margin:8px 0 0;font-size:18px;">
          System ${overallStatus}
        </h2>
        <p style="color:#8899AA;font-size:12px;margin:4px 0 0;">Uptime: ${formatUptime(process.uptime())}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr style="background:#1a2d44;">
          <th style="text-align:left;padding:10px 12px;color:#C8963E;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Component</th>
          <th style="text-align:center;padding:10px 12px;color:#C8963E;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Status</th>
          <th style="text-align:left;padding:10px 12px;color:#C8963E;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Detail</th>
        </tr>
        ${components
          .map(
            (c) => `
          <tr style="border-bottom:1px solid #243447;">
            <td style="padding:10px 12px;font-weight:600;font-size:13px;">${c.name}</td>
            <td style="padding:10px 12px;text-align:center;">${statusEmoji[c.status]}</td>
            <td style="padding:10px 12px;color:#8899AA;font-size:12px;">${c.detail}</td>
          </tr>`
          )
          .join("")}
      </table>

      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="flex:1;background:#162236;border-radius:8px;padding:14px;text-align:center;">
          <div style="color:#C8963E;font-size:22px;font-weight:700;">${users}</div>
          <div style="color:#8899AA;font-size:11px;text-transform:uppercase;">Users</div>
        </div>
        <div style="flex:1;background:#162236;border-radius:8px;padding:14px;text-align:center;">
          <div style="color:#C8963E;font-size:22px;font-weight:700;">${loads}</div>
          <div style="color:#8899AA;font-size:11px;text-transform:uppercase;">Loads</div>
        </div>
        <div style="flex:1;background:#162236;border-radius:8px;padding:14px;text-align:center;">
          <div style="color:#C8963E;font-size:22px;font-weight:700;">${invoices}</div>
          <div style="color:#8899AA;font-size:11px;text-transform:uppercase;">Invoices</div>
        </div>
        <div style="flex:1;background:#162236;border-radius:8px;padding:14px;text-align:center;">
          <div style="color:#C8963E;font-size:22px;font-weight:700;">${carriers}</div>
          <div style="color:#8899AA;font-size:11px;text-transform:uppercase;">Carriers</div>
        </div>
      </div>

      <div style="background:#162236;border-radius:8px;padding:14px;margin-bottom:16px;">
        <h3 style="color:#C8963E;font-size:13px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Last 24 Hours</h3>
        <div style="display:flex;gap:16px;">
          <div><span style="color:#4ade80;font-weight:700;">${newLoads}</span> <span style="color:#8899AA;font-size:12px;">new loads</span></div>
          <div><span style="color:#4ade80;font-weight:700;">${deliveredLoads}</span> <span style="color:#8899AA;font-size:12px;">delivered</span></div>
          <div><span style="color:#4ade80;font-weight:700;">${newUsers}</span> <span style="color:#8899AA;font-size:12px;">new users</span></div>
          <div><span style="color:${errors24h > 10 ? "#f87171" : "#4ade80"};font-weight:700;">${errors24h}</span> <span style="color:#8899AA;font-size:12px;">errors</span></div>
        </div>
      </div>

      ${
        topErrors.length > 0
          ? `
      <div style="background:#162236;border-radius:8px;padding:14px;margin-bottom:16px;">
        <h3 style="color:#C8963E;font-size:13px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Top Error Types (24h)</h3>
        ${topErrors.map((e) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span style="color:#E0E7EE;">${e.errorType}</span><span style="color:#f87171;font-weight:600;">${e._count}</span></div>`).join("")}
      </div>`
          : ""
      }

      ${
        failedCrons.length > 0
          ? `
      <div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.2);border-radius:8px;padding:14px;margin-bottom:16px;">
        <h3 style="color:#f87171;font-size:13px;margin:0 0 8px;">Failed Cron Jobs</h3>
        ${failedCrons.map((c) => `<div style="font-size:12px;color:#E0E7EE;padding:2px 0;">${c.jobName} — last run: ${c.lastRun?.toISOString() || "never"}</div>`).join("")}
      </div>`
          : ""
      }

      <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #243447;">
        <p style="color:#4a5e70;font-size:11px;margin:0;">Silk Route Logistics — Automated System Health Report</p>
        <p style="color:#4a5e70;font-size:11px;margin:4px 0 0;">View full dashboard: <a href="https://silkroutelogistics.ai/ae/dashboard/index.html" style="color:#C8963E;">AE Console</a></p>
      </div>
    </div>
  `;

  // Send to all admin users
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true, firstName: true },
  });

  for (const admin of admins) {
    try {
      await sendEmail(
        admin.email,
        `${overallEmoji[overallStatus]} SRL Health Digest — ${overallStatus} — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        html
      );
    } catch (e: any) {
      log.error({ err: e }, `[HealthDigest] Failed to send to ${admin.email}:`);
      Sentry.captureException(e, { tags: { service: "health-digest" } });
    }
  }

  // Log to system log
  await prisma.systemLog
    .create({
      data: {
        logType: "CRON_JOB",
        severity: overallStatus === "HEALTHY" ? "INFO" : "WARNING",
        source: "cron:health-digest",
        message: `Daily health digest sent: ${overallStatus}`,
        details: {
          status: overallStatus,
          components: components.map((c) => ({ name: c.name, status: c.status })),
          errors24h,
          recipients: admins.length,
        },
      },
    })
    .catch(() => {});
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
