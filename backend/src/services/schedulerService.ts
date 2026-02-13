import crypto from "crypto";
import cron from "node-cron";
import { prisma } from "../config/database";
import { sendPreTracingEmail, sendLateAlertEmail, sendPasswordExpiryReminder } from "./emailService";
import { processDueCheckCalls } from "./checkCallAutomation";
import { runRiskFlagging } from "./riskEngine";
import { processDueSequences } from "./emailSequenceService";
import { processShipperTransitUpdates } from "./shipperNotificationService";
import { processARReminders } from "../controllers/accountingController";
import { processAllCPPRecalculations } from "./integrationService";
import { processQueue } from "./aiLearningLoop/feedbackCollector";
import { runAnomalyScan } from "./aiLearningLoop/anomalyDetector";
import { runFullTrainingCycle } from "./aiLearningLoop/modelTrainer";
import { scanActiveShipments } from "./shipmentMonitorService";

const INSTANCE_ID = crypto.randomUUID();

/**
 * Database-based distributed lock.
 * Only one instance can acquire a lock for a given job within the TTL window.
 */
async function acquireLock(jobName: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  try {
    // Delete expired locks first
    await prisma.schedulerLock.deleteMany({
      where: { id: jobName, expiresAt: { lt: now } },
    });
    // Try to create a new lock (fails if another instance holds it)
    await prisma.schedulerLock.create({
      data: { id: jobName, lockedBy: INSTANCE_ID, expiresAt: new Date(now.getTime() + ttlMs) },
    });
    return true;
  } catch {
    return false; // Lock held by another instance
  }
}

async function releaseLock(jobName: string) {
  try {
    await prisma.schedulerLock.delete({ where: { id: jobName, lockedBy: INSTANCE_ID } });
  } catch {
    // Already released or expired
  }
}

/**
 * Pre-tracing: runs every hour.
 * Sends emails to carriers at 48h and 24h before pickup.
 * Dedup via Notification table (type "PRE_TRACING").
 */
async function runPreTracing() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Find shipments with pickup in the next 48 hours that are BOOKED or DISPATCHED
  const shipments = await prisma.shipment.findMany({
    where: {
      status: { in: ["BOOKED", "DISPATCHED"] },
      pickupDate: { lte: in48h, gte: now },
      loadId: { not: null },
    },
    include: {
      load: {
        include: {
          carrier: { select: { id: true, email: true, firstName: true, lastName: true, company: true } },
        },
      },
    },
  });

  for (const shipment of shipments) {
    if (!shipment.load?.carrier) continue;

    const hoursUntilPickup = (shipment.pickupDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const window = hoursUntilPickup <= 24 ? "24H" : "48H";

    // Check if we already sent a notification for this window
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: shipment.load.carrier.id,
        type: "LOAD_UPDATE",
        title: { contains: `Pre-Tracing ${window}` },
        createdAt: { gte: twoHoursAgo },
      },
    });
    if (alreadySent) continue;

    const carrier = shipment.load.carrier;
    const origin = `${shipment.originCity}, ${shipment.originState}`;
    const dest = `${shipment.destCity}, ${shipment.destState}`;

    // In-app notification
    await prisma.notification.create({
      data: {
        userId: carrier.id,
        type: "LOAD_UPDATE",
        title: `Pre-Tracing ${window}: ${shipment.load.referenceNumber}`,
        message: `Pickup in ~${Math.round(hoursUntilPickup)}h. ${origin} → ${dest}. Are you on time?`,
        actionUrl: "/dashboard/loads",
      },
    });

    // Email
    await sendPreTracingEmail(
      carrier.email,
      carrier.firstName || carrier.company || "Carrier",
      shipment.load.referenceNumber,
      origin,
      dest,
      shipment.pickupDate,
      hoursUntilPickup,
    );

    console.log(`[PreTracing] Sent ${window} alert to ${carrier.email} for ${shipment.load.referenceNumber}`);
  }
}

/**
 * Late detection: runs every 30 minutes.
 * Flags IN_TRANSIT shipments with no location update in 4+ hours.
 */
async function runLateDetection() {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const staleShipments = await prisma.shipment.findMany({
    where: {
      status: "IN_TRANSIT",
      OR: [
        { lastLocationAt: { lt: fourHoursAgo } },
        { lastLocationAt: null },
      ],
      loadId: { not: null },
    },
    include: {
      load: {
        include: {
          poster: { select: { id: true, email: true, firstName: true, lastName: true } },
          carrier: { select: { id: true, email: true, firstName: true, lastName: true, company: true } },
        },
      },
    },
  });

  for (const shipment of staleShipments) {
    if (!shipment.load?.poster) continue;

    const hoursSinceUpdate = shipment.lastLocationAt
      ? (now.getTime() - shipment.lastLocationAt.getTime()) / (1000 * 60 * 60)
      : 999;

    // Dedup: check if late alert already sent in last 4 hours
    const dedup = await prisma.notification.findFirst({
      where: {
        userId: shipment.load.poster.id,
        type: "LOAD_UPDATE",
        title: { contains: "Late Alert" },
        message: { contains: shipment.shipmentNumber },
        createdAt: { gte: fourHoursAgo },
      },
    });
    if (dedup) continue;

    // Mark shipment as late (update status note via lastLocation)
    const broker = shipment.load.poster;

    // In-app notification to broker
    await prisma.notification.create({
      data: {
        userId: broker.id,
        type: "LOAD_UPDATE",
        title: `Late Alert: ${shipment.shipmentNumber}`,
        message: `Shipment ${shipment.shipmentNumber} (Load ${shipment.load.referenceNumber}) has not moved in ${Math.round(hoursSinceUpdate)}h. Last location: ${shipment.lastLocation || "Unknown"}.`,
        actionUrl: "/dashboard/tracking",
      },
    });

    // Email
    await sendLateAlertEmail(
      broker.email,
      broker.firstName || "Broker",
      shipment.load.referenceNumber,
      shipment.shipmentNumber,
      shipment.lastLocation,
      hoursSinceUpdate,
    );

    console.log(`[LateDetection] Alert sent for ${shipment.shipmentNumber} — ${Math.round(hoursSinceUpdate)}h stale`);
  }
}

const PASSWORD_EXPIRY_DAYS = 60;

/**
 * Password expiry reminders: runs daily at 9 AM.
 * Sends emails at 14, 7, and 2 days before password expiry.
 */
async function runPasswordExpiryReminder() {
  const now = new Date();
  const reminderWindows = [14, 7, 2]; // days before expiry

  for (const daysLeft of reminderWindows) {
    // Find users whose password will expire in exactly `daysLeft` days (within a 24h window)
    const targetDaysAgo = PASSWORD_EXPIRY_DAYS - daysLeft;
    const windowStart = new Date(now.getTime() - (targetDaysAgo + 1) * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() - targetDaysAgo * 24 * 60 * 60 * 1000);

    // Users with passwordChangedAt in the window
    const usersWithPwChange = await prisma.user.findMany({
      where: {
        passwordChangedAt: { gte: windowStart, lt: windowEnd },
      },
      select: { id: true, email: true, firstName: true },
    });

    // Users with passwordChangedAt IS NULL — use createdAt as fallback
    const usersNullPwChange = await prisma.user.findMany({
      where: {
        passwordChangedAt: null,
        createdAt: { gte: windowStart, lt: windowEnd },
      },
      select: { id: true, email: true, firstName: true },
    });

    const users = [...usersWithPwChange, ...usersNullPwChange];

    for (const user of users) {
      // Dedup: check if reminder already sent in last 24h
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const alreadySent = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: "PASSWORD_EXPIRY",
          createdAt: { gte: oneDayAgo },
        },
      });
      if (alreadySent) continue;

      // In-app notification
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "PASSWORD_EXPIRY",
          title: `Password expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
          message: `Your password will expire in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Please change it in Settings to avoid being locked out.`,
          actionUrl: "/dashboard/settings",
        },
      });

      // Email
      await sendPasswordExpiryReminder(user.email, user.firstName, daysLeft);

      console.log(`[PasswordExpiry] Sent ${daysLeft}-day reminder to ${user.email}`);
    }
  }
}

/**
 * OTP cleanup: runs daily at 3 AM.
 * Deletes expired and used OTP codes older than 24 hours.
 */
async function runOtpCleanup() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.otpCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: oneDayAgo } },
        { used: true, createdAt: { lt: oneDayAgo } },
      ],
    },
  });
  if (result.count > 0) {
    console.log(`[OtpCleanup] Purged ${result.count} expired/used OTP codes`);
  }
}

/** Wrapper that acquires a distributed lock before running a job. */
async function withLock(jobName: string, ttlMs: number, fn: () => Promise<void>) {
  if (!(await acquireLock(jobName, ttlMs))) {
    console.log(`[Scheduler] Skipping ${jobName} — another instance holds the lock`);
    return;
  }
  try {
    await fn();
  } finally {
    await releaseLock(jobName);
  }
}

export function startSchedulers() {
  // Pre-tracing: every hour at :00
  cron.schedule("0 * * * *", async () => {
    console.log("[Scheduler] Running pre-tracing check...");
    await withLock("pre-tracing", 5 * 60 * 1000, runPreTracing);
  });

  // Late detection: every 30 minutes at :00 and :30
  cron.schedule("0,30 * * * *", async () => {
    console.log("[Scheduler] Running late detection check...");
    await withLock("late-detection", 5 * 60 * 1000, runLateDetection);
  });

  // Password expiry reminders: daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] Running password expiry reminder check...");
    await withLock("password-expiry", 10 * 60 * 1000, runPasswordExpiryReminder);
  });

  // OTP cleanup: daily at 3:00 AM
  cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] Running OTP cleanup...");
    await withLock("otp-cleanup", 5 * 60 * 1000, runOtpCleanup);
  });

  // Phase C: Check-call automation: every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    console.log("[Scheduler] Running check-call automation...");
    await withLock("check-call-automation", 5 * 60 * 1000, processDueCheckCalls);
  });

  // Phase C: Risk flagging: every 30 minutes at :05 and :35
  cron.schedule("5,35 * * * *", async () => {
    console.log("[Scheduler] Running risk flagging engine...");
    await withLock("risk-flagging", 10 * 60 * 1000, runRiskFlagging);
  });

  // Phase C: Email sequence processor: every hour at :10
  cron.schedule("10 * * * *", async () => {
    console.log("[Scheduler] Processing due email sequences...");
    await withLock("email-sequences", 5 * 60 * 1000, processDueSequences);
  });

  // Shipper transit updates: 9 AM ET (14:00 UTC) daily
  cron.schedule("0 14 * * *", async () => {
    console.log("[Scheduler] Running shipper transit updates (9 AM ET)...");
    await withLock("shipper-transit-am", 10 * 60 * 1000, processShipperTransitUpdates);
  });

  // Shipper transit updates: 4 PM ET (21:00 UTC) daily
  cron.schedule("0 21 * * *", async () => {
    console.log("[Scheduler] Running shipper transit updates (4 PM ET)...");
    await withLock("shipper-transit-pm", 10 * 60 * 1000, processShipperTransitUpdates);
  });

  // Accounting: Daily AR reminders at 6 AM ET (11:00 UTC)
  cron.schedule("0 11 * * *", async () => {
    console.log("[Scheduler] Running daily AR reminder processing...");
    await withLock("ar-reminders-daily", 10 * 60 * 1000, async () => {
      const result = await processARReminders();
      console.log(`[Scheduler] AR reminders: ${result.remindersSent} sent of ${result.processed} processed`);
    });
  });

  // Accounting: Weekly AP aging check — Monday 7 AM ET (12:00 UTC)
  cron.schedule("0 12 * * 1", async () => {
    console.log("[Scheduler] Running weekly AP aging check...");
    await withLock("ap-aging-weekly", 10 * 60 * 1000, async () => {
      const overduePayments = await prisma.carrierPay.findMany({
        where: {
          status: { in: ["PENDING", "PREPARED", "SUBMITTED"] },
          dueDate: { lt: new Date() },
        },
        select: { id: true, paymentNumber: true, netAmount: true, dueDate: true },
      });
      console.log(`[Scheduler] Weekly AP: ${overduePayments.length} overdue carrier payments found`);
    });
  });

  // Accounting: Monthly financial report generation — 1st of month 8 AM ET (13:00 UTC)
  cron.schedule("0 13 1 * *", async () => {
    console.log("[Scheduler] Running monthly financial report generation...");
    await withLock("monthly-report-gen", 15 * 60 * 1000, async () => {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const monthName = prevMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

      // Gather summary
      const loads = await prisma.load.findMany({
        where: {
          status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
          deliveryDate: { gte: prevMonth, lte: prevMonthEnd },
        },
        select: { customerRate: true, carrierRate: true, grossMargin: true, marginPercent: true },
      });
      const revenue = loads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
      const cost = loads.reduce((s, l) => s + (l.carrierRate ?? 0), 0);
      const margin = loads.reduce((s, l) => s + (l.grossMargin ?? 0), 0);
      const margins = loads.filter((l) => l.marginPercent !== null).map((l) => l.marginPercent!);
      const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;

      await prisma.financialReport.create({
        data: {
          reportType: "MONTHLY",
          title: `Monthly Financial Report — ${monthName}`,
          periodStart: prevMonth,
          periodEnd: prevMonthEnd,
          status: "COMPLETED",
          generatedAt: now,
          summary: {
            loads: { count: loads.length, revenue, cost, margin, avgMarginPercent: Math.round(avgMargin * 100) / 100 },
          },
        },
      });
      console.log(`[Scheduler] Monthly report generated for ${monthName}`);
    });
  });

  // CPP: Weekly tier recalculation — Sunday 6 AM ET (11:00 UTC)
  cron.schedule("0 11 * * 0", async () => {
    console.log("[Scheduler] Running weekly CPP tier recalculation...");
    await withLock("cpp-weekly-recalc", 30 * 60 * 1000, async () => {
      const result = await processAllCPPRecalculations();
      console.log(`[Scheduler] CPP recalc: ${result.recalculated}/${result.total} carriers processed`);
    });
  });

  // ─── AI Learning Loop Crons ────────────────────────────────────

  // AI Queue Processor: every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    console.log("[Scheduler] Processing AI learning queue...");
    await withLock("ai-queue-processor", 5 * 60 * 1000, async () => {
      const result = await processQueue();
      console.log(`[Scheduler] AI queue: ${result.processed} processed, ${result.failed} failed, ${result.dead} dead-lettered`);
    });
  });

  // Anomaly Scanner: every 2 hours
  cron.schedule("15 */2 * * *", async () => {
    console.log("[Scheduler] Running anomaly scan...");
    await withLock("ai-anomaly-scan", 10 * 60 * 1000, async () => {
      const result = await runAnomalyScan();
      console.log(`[Scheduler] Anomaly scan: ${result.totalAnomalies} anomalies found`);
    });
  });

  // Full AI Training Cycle: daily 2 AM ET (07:00 UTC)
  cron.schedule("0 7 * * *", async () => {
    console.log("[Scheduler] Running full AI training cycle...");
    await withLock("ai-full-training", 60 * 60 * 1000, async () => {
      const result = await runFullTrainingCycle();
      console.log(`[Scheduler] AI training: ${result.results.filter(r => r.success).length}/${result.results.length} services, ${result.totalDurationMs}ms`);
    });
  });

  // Shipment Risk Monitor: every 30 minutes
  cron.schedule("20,50 * * * *", async () => {
    console.log("[Scheduler] Running shipment risk monitor...");
    await withLock("ai-shipment-monitor", 10 * 60 * 1000, async () => {
      const result = await scanActiveShipments();
      console.log(`[Scheduler] Risk scan: ${result.scanned} loads, ${result.critical} critical, ${result.highRisk} high`);
    });
  });

  console.log(`[Scheduler] All jobs started (instance: ${INSTANCE_ID.slice(0, 8)})`);
}
