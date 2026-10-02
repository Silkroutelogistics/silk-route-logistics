import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { nextFire } from "../lib/cronSchedule";
import { AR_REMINDER_SWITCH, AR_REMINDER_SCHEDULE, AR_REMINDER_DESCRIPTION } from "../lib/arReminderSwitch";

/**
 * Cron Registry Service
 * Tracks all cron jobs, their schedules, last run times, and status.
 * Supports enable/disable toggling. Runs are recorded by lib/cronRun.ts.
 *
 * health-digest arc B5: registerCronJob / runRegisteredJob and the POST
 * /monitoring/crons/:name/run endpoint are removed. registerCronJob had no
 * callers, so the handler map was always empty and run-now always failed.
 */

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

/**
 * Next run, evaluated in UTC. Replaces an approximation that treated every
 * fixed-hour expression as daily, so a monthly job read "tomorrow".
 */
function getNextRunTime(schedule: string): Date | null {
  return nextFire(schedule, new Date());
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
    // v3.8.bnn — ruling 2026-09-27, 5: this slot runs the 90-day credit block
    // (schedulerService, overdueCreditBlock) and has emailed nobody since
    // v3.8.blg. The row keeps its name so the existing registry row is updated.
    { jobName: "ar-reminders-daily", schedule: "0 11 * * *", description: "90-day credit block, daily 11:00 UTC (7 AM EDT / 6 AM EST): blocks a customer's credit once an invoice is 90 days past due. Tipalti exempt. Sends no reminders." },
    { jobName: "ap-aging-weekly", schedule: "0 12 * * 1", description: "AP aging check weekly Monday 7 AM ET" },
    { jobName: "weekly-report", schedule: "0 7 * * 1", description: "Weekly report snapshot Monday 7 AM" },
    // health-digest arc B6: "daily-cpp-tiers" and "cpp-weekly-recalc" are no longer
    // seeded. No job records under either name (the jobs run as "daily-cpp-cleanup"
    // and "compass-score-recalc"); scripts/delete-orphan-cron-rows.ts removes the rows.
    { jobName: "monthly-report-gen", schedule: "0 13 1 * *", description: "Monthly financial report auto-generation 1st of month 8 AM ET" },
    { jobName: "ai-queue-processor", schedule: "*/10 * * * *", description: "AI learning event queue processor every 10 minutes" },
    { jobName: "ai-anomaly-scan", schedule: "15 */2 * * *", description: "AI anomaly detection scanner every 2 hours" },
    { jobName: "ai-full-training", schedule: "0 7 * * *", description: "Full AI model training cycle daily 2 AM ET" },
    { jobName: "ai-shipment-monitor", schedule: "20,50 * * * *", description: "AI shipment risk monitor every 30 minutes" },
    // v3.8.bko — the payment-reminder email switch. Created OFF; the update
    // clause below never writes `enabled`, so a restart cannot turn it back on.
    { jobName: AR_REMINDER_SWITCH, schedule: AR_REMINDER_SCHEDULE, description: AR_REMINDER_DESCRIPTION, enabled: false },
    // health-digest arc — registered ahead of its first recorded run, so its next
    // run is visible now. The name is schedulerService's withLock key, which is
    // the row lib/cronRun.ts writes when it fires.
    { jobName: "monthly-carrier-revet", schedule: "0 7 1 * *", description: "Monthly carrier re-vetting, 1st of month 07:00 UTC: alerts the AE on a CRITICAL score, never suspends (v3.8.bot)" },
  ];

  for (const { enabled = true, ...job } of jobs as Array<{ jobName: string; schedule: string; description: string; enabled?: boolean }>) {
    await prisma.cronRegistry.upsert({
      where: { jobName: job.jobName },
      update: { schedule: job.schedule, description: job.description },
      create: { ...job, enabled, nextRun: getNextRunTime(job.schedule) },
    }).catch(err => log.error({ err: err }, '[CronRegistry] Error:'));
  }

  log.info(`[CronRegistry] Seeded ${jobs.length} cron jobs into registry`);
}
