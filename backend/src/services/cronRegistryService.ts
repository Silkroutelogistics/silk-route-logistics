import { prisma } from "../config/database";
import cron from "node-cron";

/**
 * Cron Registry Service
 * Tracks all cron jobs, their schedules, last run times, and status.
 * Supports manual triggering and enable/disable toggling.
 */

interface CronJobDef {
  jobName: string;
  schedule: string;
  description: string;
  handler: () => Promise<void>;
}

const registeredHandlers = new Map<string, () => Promise<void>>();

/** Register a cron job in the database registry and schedule it */
export async function registerCronJob(def: CronJobDef) {
  registeredHandlers.set(def.jobName, def.handler);

  // Upsert registry entry
  await prisma.cronRegistry.upsert({
    where: { jobName: def.jobName },
    update: { schedule: def.schedule, description: def.description },
    create: {
      jobName: def.jobName,
      schedule: def.schedule,
      description: def.description,
      enabled: true,
      nextRun: getNextRunTime(def.schedule),
    },
  }).catch((e) => console.error(`[CronRegistry] Failed to register ${def.jobName}:`, e.message));

  // Schedule the job
  cron.schedule(def.schedule, async () => {
    await runRegisteredJob(def.jobName);
  });
}

/** Run a registered job (used by scheduler and manual trigger) */
export async function runRegisteredJob(jobName: string): Promise<{ success: boolean; duration?: number; error?: string }> {
  const handler = registeredHandlers.get(jobName);
  if (!handler) {
    return { success: false, error: `No handler registered for job: ${jobName}` };
  }

  // Check if enabled
  const entry = await prisma.cronRegistry.findUnique({ where: { jobName } });
  if (entry && !entry.enabled) {
    console.log(`[CronRegistry] Skipping disabled job: ${jobName}`);
    return { success: false, error: "Job is disabled" };
  }

  // Mark as running
  await prisma.cronRegistry.upsert({
    where: { jobName },
    update: { lastStatus: "RUNNING", lastRun: new Date() },
    create: { jobName, schedule: "manual", lastStatus: "RUNNING", lastRun: new Date() },
  }).catch(() => {});

  const start = Date.now();
  try {
    await handler();
    const duration = Date.now() - start;

    await prisma.cronRegistry.update({
      where: { jobName },
      data: {
        lastStatus: "SUCCESS",
        lastDuration: duration,
        lastError: null,
        runCount: { increment: 1 },
        nextRun: entry?.schedule ? getNextRunTime(entry.schedule) : null,
      },
    }).catch(() => {});

    console.log(`[CronRegistry] ${jobName} completed in ${duration}ms`);
    return { success: true, duration };
  } catch (e: any) {
    const duration = Date.now() - start;

    await prisma.cronRegistry.update({
      where: { jobName },
      data: {
        lastStatus: "FAILED",
        lastDuration: duration,
        lastError: e.message?.slice(0, 500),
        failCount: { increment: 1 },
        runCount: { increment: 1 },
      },
    }).catch(() => {});

    // Log to error_logs table
    await prisma.errorLog.create({
      data: {
        errorType: "CRON",
        message: `Cron job ${jobName} failed: ${e.message}`,
        stackTrace: e.stack?.slice(0, 2000),
        endpoint: `cron:${jobName}`,
      },
    }).catch(() => {});

    console.error(`[CronRegistry] ${jobName} FAILED in ${duration}ms:`, e.message);
    return { success: false, duration, error: e.message };
  }
}

/** Toggle a cron job on/off */
export async function toggleCronJob(jobName: string): Promise<{ enabled: boolean }> {
  const entry = await prisma.cronRegistry.findUnique({ where: { jobName } });
  if (!entry) throw new Error(`Job not found: ${jobName}`);

  const updated = await prisma.cronRegistry.update({
    where: { jobName },
    data: { enabled: !entry.enabled },
  });

  return { enabled: updated.enabled };
}

/** Get all registered cron jobs */
export async function getAllCronJobs() {
  return prisma.cronRegistry.findMany({ orderBy: { jobName: "asc" } });
}

/** Calculate next run time from cron expression (approximate) */
function getNextRunTime(schedule: string): Date | null {
  try {
    // Parse cron expression for next run (simple approximation)
    const parts = schedule.split(" ");
    if (parts.length < 5) return null;

    const now = new Date();
    // For simple schedules, just add the interval
    if (parts[0].startsWith("*/")) {
      const minutes = parseInt(parts[0].replace("*/", ""));
      return new Date(now.getTime() + minutes * 60 * 1000);
    }
    if (parts[1].startsWith("*/")) {
      const hours = parseInt(parts[1].replace("*/", ""));
      return new Date(now.getTime() + hours * 60 * 60 * 1000);
    }
    // Daily jobs
    if (parts[0] !== "*" && parts[1] !== "*") {
      const nextRun = new Date(now);
      nextRun.setUTCHours(parseInt(parts[1]), parseInt(parts[0]), 0, 0);
      if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
      return nextRun;
    }
    return null;
  } catch {
    return null;
  }
}

/** Seed all existing crons into registry (call at startup) */
export async function seedCronRegistry() {
  const jobs = [
    { jobName: "check-call-reminders", schedule: "*/5 * * * *", description: "Check for overdue check calls every 5 minutes" },
    { jobName: "invoice-aging", schedule: "0 * * * *", description: "Mark overdue invoices hourly" },
    { jobName: "pre-tracing", schedule: "0 * * * *", description: "Pre-tracing alerts (48h/24h before pickup) hourly" },
    { jobName: "late-detection", schedule: "0,30 * * * *", description: "Late shipment detection every 30 minutes" },
    { jobName: "check-call-automation", schedule: "*/15 * * * *", description: "Send scheduled check-call texts every 15 minutes" },
    { jobName: "risk-flagging", schedule: "5,35 * * * *", description: "Risk assessment engine every 30 minutes" },
    { jobName: "email-sequences", schedule: "10 * * * *", description: "Process due email sequences hourly" },
    { jobName: "shipper-transit-am", schedule: "0 14 * * *", description: "Shipper transit updates 9 AM ET daily" },
    { jobName: "shipper-transit-pm", schedule: "0 21 * * *", description: "Shipper transit updates 4 PM ET daily" },
    { jobName: "password-expiry", schedule: "0 9 * * *", description: "Password expiry reminders daily at 9 AM" },
    { jobName: "otp-cleanup", schedule: "0 3 * * *", description: "Clean expired OTP codes daily at 3 AM" },
    { jobName: "daily-srcpp-tiers", schedule: "0 6 * * *", description: "SRCPP tier updates + log cleanup daily 6 AM" },
    { jobName: "ar-reminders-daily", schedule: "0 11 * * *", description: "AR overdue reminders daily 6 AM ET" },
    { jobName: "ap-aging-weekly", schedule: "0 12 * * 1", description: "AP aging check weekly Monday 7 AM ET" },
    { jobName: "weekly-report", schedule: "0 7 * * 1", description: "Weekly report snapshot Monday 7 AM" },
    { jobName: "srcpp-weekly-recalc", schedule: "0 11 * * 0", description: "SRCPP tier recalculation weekly Sunday 6 AM ET" },
    { jobName: "monthly-report-gen", schedule: "0 13 1 * *", description: "Monthly financial report auto-generation 1st of month 8 AM ET" },
    { jobName: "monthly-invoice-reminders", schedule: "0 6 1 * *", description: "Invoice reminder emails monthly 1st 6 AM" },
  ];

  for (const job of jobs) {
    await prisma.cronRegistry.upsert({
      where: { jobName: job.jobName },
      update: { schedule: job.schedule, description: job.description },
      create: { ...job, enabled: true, nextRun: getNextRunTime(job.schedule) },
    }).catch(() => {});
  }

  console.log(`[CronRegistry] Seeded ${jobs.length} cron jobs into registry`);
}
