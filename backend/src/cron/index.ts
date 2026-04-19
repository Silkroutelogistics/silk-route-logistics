import cron from "node-cron";
import { prisma } from "../config/database";
import { log } from "../lib/logger";

/**
 * SRL Cron Job System
 * Schedules: 5-min, hourly, daily, weekly, monthly
 * Each job uses an in-memory mutex to prevent overlapping runs.
 */

// In-memory concurrency guard — prevents overlapping runs of the same job
const runningJobs = new Set<string>();

async function withGuard(jobName: string, fn: () => Promise<void>): Promise<void> {
  if (runningJobs.has(jobName)) {
    log.warn({ job: jobName }, "Skipping — previous run still in progress");
    return;
  }
  runningJobs.add(jobName);
  try {
    await fn();
  } finally {
    runningJobs.delete(jobName);
  }
}

export function initCronJobs() {
  log.info("Initializing cron scheduled jobs");

  // ─── Every 5 minutes: Check call reminders ───────────────────
  cron.schedule("*/5 * * * *", () => withGuard("check-call-reminders", async () => {
    try {
      const now = new Date();

      // Find loads in transit without recent check calls
      const loadsNeedingCheckCall = await prisma.load.findMany({
        where: {
          status: { in: ["IN_TRANSIT", "DISPATCHED", "AT_PICKUP", "LOADED"] },
          checkCalls: {
            none: { createdAt: { gte: new Date(now.getTime() - 2 * 3600_000) } }, // No check call in 2 hours
          },
        },
        select: { id: true, referenceNumber: true, carrierId: true, posterId: true },
        take: 50,
      });

      if (loadsNeedingCheckCall.length > 0) {
        // Create notifications for dispatchers about overdue check calls
        const adminUsers = await prisma.user.findMany({
          where: { role: { in: ["ADMIN", "DISPATCH"] }, isActive: true },
          select: { id: true },
        });

        const notificationData = loadsNeedingCheckCall.flatMap(load =>
          adminUsers.map(admin => ({
            userId: admin.id,
            type: "CHECK_CALL_DUE" as const,
            title: "Check Call Overdue",
            message: `Load ${load.referenceNumber} has no check call in the last 2 hours.`,
            link: `/dashboard/tracking?load=${load.id}`,
          }))
        );

        if (notificationData.length > 0) {
          await prisma.notification.createMany({ data: notificationData })
            .catch(err => log.error({ err }, 'Cron notification create error'));
        }
      }
    } catch (err) {
      log.error({ err }, "[Cron 5min] Check call reminder error:");
    }
  }));

  // ─── Hourly: Sequence advance (Lead Hunter v3.6.c) ────────────
  cron.schedule("15 * * * *", () => withGuard("sequence-advance", async () => {
    try {
      const { advanceSequences } = require("./sequenceAdvance");
      const result = await advanceSequences();
      log.info({ result }, "[Cron Hourly] Sequence advance complete");
    } catch (err) {
      log.error({ err }, "[Cron Hourly] Sequence advance error:");
    }
  }));

  // ─── Hourly: Invoice aging & overdue detection ───────────────
  cron.schedule("0 * * * *", () => withGuard("invoice-aging", async () => {
    try {
      const now = new Date();

      // Mark overdue invoices
      const overdueInvoices = await prisma.invoice.updateMany({
        where: {
          status: { in: ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED"] },
          dueDate: { lt: now },
        },
        data: { status: "OVERDUE" },
      });

      if (overdueInvoices.count > 0) {
        log.info(`[Cron Hourly] Marked ${overdueInvoices.count} invoices as overdue`);
      }
    } catch (err) {
      log.error({ err }, "[Cron Hourly] Invoice aging error:");
    }
  }));

  // ─── Daily at 6 AM: DSO calculation, CPP tier updates ─────
  cron.schedule("0 6 * * *", () => withGuard("daily-cpp-cleanup", async () => {
    try {
      // Update CPP tiers based on total loads completed
      const carriers = await prisma.carrierProfile.findMany({
        select: { id: true, cppTotalLoads: true, cppTier: true },
      });

      for (const carrier of carriers) {
        const loads = carrier.cppTotalLoads || 0;
        // 3-tier Caravan Partner Program (v3.7.a): every carrier starts at
        // SILVER on day 1; volume-based fast-track to GOLD (50+ loads) and
        // PLATINUM (100+).
        let newTier: "PLATINUM" | "GOLD" | "SILVER";
        if (loads >= 100) newTier = "PLATINUM";
        else if (loads >= 50) newTier = "GOLD";
        else newTier = "SILVER";

        if (newTier !== carrier.cppTier) {
          await prisma.carrierProfile.update({
            where: { id: carrier.id },
            data: { cppTier: newTier },
          });
          log.info(`[Cron Daily] Updated carrier ${carrier.id} tier: ${carrier.cppTier} → ${newTier}`);
        }
      }

      // Clean expired JWT blacklist entries
      const { cleanupBlacklist } = require("../utils/tokenBlacklist");
      const blacklistCleaned = await cleanupBlacklist();
      if (blacklistCleaned > 0) {
        log.info(`[Cron Daily] Cleaned ${blacklistCleaned} expired blacklist entries`);
      }

      // Clean old system logs (keep 90 days)
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      const deleted = await prisma.systemLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (deleted.count > 0) {
        log.info(`[Cron Daily] Cleaned ${deleted.count} old system logs`);
      }
    } catch (err) {
      log.error({ err }, "[Cron Daily] Error:");
    }
  }));

  // ─── Daily at 7 AM: System health digest email to admins ────
  cron.schedule("0 7 * * *", () => withGuard("health-digest", async () => {
    try {
      log.info("[Cron Daily] Generating system health digest...");
      const { sendHealthDigest } = require("../services/healthDigestService");
      await sendHealthDigest();
      log.info("[Cron Daily] Health digest sent");
    } catch (err) {
      log.error({ err }, "[Cron Daily] Health digest error:");
    }
  }));

  // ─── Weekly (Monday 7 AM): Generate weekly report snapshot ───
  cron.schedule("0 7 * * 1", () => withGuard("weekly-report", async () => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);

      const loads = await prisma.load.count({
        where: { createdAt: { gte: weekAgo } },
      });
      const delivered = await prisma.load.count({
        where: { status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED"] }, deliveryDate: { gte: weekAgo } },
      });
      const revenue = await prisma.load.aggregate({
        where: { deliveryDate: { gte: weekAgo }, customerRate: { not: null } },
        _sum: { customerRate: true },
      });

      log.info(`[Cron Weekly] Report: ${loads} loads created, ${delivered} delivered, $${revenue._sum.customerRate || 0} revenue`);

      // Store as system log for reporting
      await prisma.systemLog.create({
        data: {
          logType: "CRON_JOB",
          severity: "INFO",
          source: "cron:weekly-report",
          message: "Weekly report snapshot",
          details: {
            loadsCreated: loads,
            loadsDelivered: delivered,
            revenue: revenue._sum.customerRate || 0,
            period: `${weekAgo.toISOString()} - ${new Date().toISOString()}`,
          },
        },
      });
    } catch (err) {
      log.error({ err }, "[Cron Weekly] Error:");
    }
  }));

  // ─── Monthly (1st, 6 AM): Invoice reminder emails ───────────
  cron.schedule("0 6 1 * *", () => withGuard("monthly-invoice-reminders", async () => {
    try {
      // Find invoices needing 31/45/60 day reminders
      const now = new Date();

      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          status: { in: ["SENT", "OVERDUE"] },
          paidAt: null,
        },
        include: {
          load: {
            include: { poster: { select: { id: true, email: true, firstName: true } } },
          },
        },
        take: 5000,
      });

      const ids60: string[] = [];
      const ids45: string[] = [];
      const ids31: string[] = [];

      for (const inv of unpaidInvoices) {
        if (!inv.dueDate) continue;
        const daysSinceDue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);

        if (daysSinceDue >= 60 && !inv.reminderSent60) {
          ids60.push(inv.id);
          log.info(`[Cron Monthly] 60-day reminder for invoice ${inv.invoiceNumber}`);
        } else if (daysSinceDue >= 45 && !inv.reminderSent45) {
          ids45.push(inv.id);
          log.info(`[Cron Monthly] 45-day reminder for invoice ${inv.invoiceNumber}`);
        } else if (daysSinceDue >= 31 && !inv.reminderSent31) {
          ids31.push(inv.id);
          log.info(`[Cron Monthly] 31-day reminder for invoice ${inv.invoiceNumber}`);
        }
      }

      await prisma.$transaction([
        ...(ids60.length > 0 ? [prisma.invoice.updateMany({ where: { id: { in: ids60 } }, data: { reminderSent60: true } })] : []),
        ...(ids45.length > 0 ? [prisma.invoice.updateMany({ where: { id: { in: ids45 } }, data: { reminderSent45: true } })] : []),
        ...(ids31.length > 0 ? [prisma.invoice.updateMany({ where: { id: { in: ids31 } }, data: { reminderSent31: true } })] : []),
      ]);
    } catch (err) {
      log.error({ err }, "[Cron Monthly] Invoice reminder error:");
    }
  }));

  // ─── Monthly (1st, 6:30 AM): Quick Pay override variance report (v3.7.a) ───
  cron.schedule("30 6 1 * *", () => withGuard("monthly-qp-variance", async () => {
    try {
      const { summarizeVariance } = require("../services/quickPayOverrideService");
      const { sendQpVarianceReport } = require("../services/emailService");
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      const summary = await summarizeVariance(periodStart, periodEnd);
      log.info({ summary }, "[Cron Monthly] QP override variance summary");
      await sendQpVarianceReport(summary);
    } catch (err) {
      log.error({ err }, "[Cron Monthly] QP override variance error:");
    }
  }));

  // ─── Weekly (Monday 3 AM): FMCSA compliance scan ─────────
  cron.schedule("0 3 * * 1", () => withGuard("fmcsa-compliance", async () => {
    try {
      log.info("[Cron Weekly] Starting FMCSA compliance scan...");
      const { weeklyFmcsaScan } = require("../services/complianceMonitorService");
      const result = await weeklyFmcsaScan();
      log.info({ result }, "[Cron Weekly] FMCSA scan complete");
    } catch (err) {
      log.error({ err }, "[Cron Weekly] FMCSA scan error:");
    }
  }));

  // ─── Daily (6 AM): Identity/email/phone validation for pending carriers ──
  cron.schedule("0 6 * * *", () => withGuard("identity-validation", async () => {
    try {
      log.info("[Cron Daily] Running identity validation for pending carriers...");
      const { runIdentityCheck } = require("../services/identityVerificationService");
      const pendingCarriers = await prisma.carrierProfile.findMany({
        where: {
          onboardingStatus: { in: ["PENDING", "UNDER_REVIEW", "DOCUMENTS_SUBMITTED"] },
          deletedAt: null,
        },
        select: { id: true },
      });

      let checked = 0, errors = 0;
      for (const carrier of pendingCarriers) {
        try {
          await runIdentityCheck(carrier.id);
          checked++;
        } catch (err) {
          errors++;
          log.error({ err, carrierId: carrier.id }, "Identity validation error");
        }
      }
      log.info(`[Cron Daily] Identity validation: ${checked} checked, ${errors} errors`);
    } catch (err) {
      log.error({ err }, "[Cron Daily] Identity validation error:");
    }
  }));

  // ─── Daily (5 AM): Compliance reminder emails ──────────────
  cron.schedule("0 5 * * *", () => withGuard("compliance-reminders", async () => {
    try {
      log.info("[Cron Daily] Sending compliance reminders...");
      const { dailyComplianceReminders } = require("../services/complianceMonitorService");
      const result = await dailyComplianceReminders();
      log.info({ result }, "[Cron Daily] Compliance reminders sent");
    } catch (err) {
      log.error({ err }, "[Cron Daily] Compliance reminder error:");
    }
  }));

  // ─── Weekly (Monday 3:30 AM): Full chameleon scan ─────────────
  cron.schedule("30 3 * * 1", () => withGuard("chameleon-scan", async () => {
    try {
      log.info("[Cron Weekly] Starting full chameleon detection scan...");
      const { runFullChameleonScan } = require("../services/chameleonDetectionService");
      const result = await runFullChameleonScan();
      log.info({ result }, "[Cron Weekly] Chameleon scan complete");
    } catch (err) {
      log.error({ err }, "[Cron Weekly] Chameleon scan error:");
    }
  }));

  // ─── Weekly (Monday 4 AM): Auto-reversal check for suspended carriers ──
  cron.schedule("0 4 * * 1", () => withGuard("auto-reversal", async () => {
    try {
      log.info("[Cron Weekly] Checking auto-reversal for suspended carriers...");
      const { checkAutoReversal } = require("../services/complianceMonitorService");
      const result = await checkAutoReversal();
      log.info({ result }, "[Cron Weekly] Auto-reversal complete");
    } catch (err) {
      log.error({ err }, "[Cron Weekly] Auto-reversal error:");
    }
  }));

  // ─── AI Learning Cycles ─────────────────────────────────────────

  // Daily at 4:00 AM: Rate Intelligence learning
  cron.schedule("0 4 * * *", () => withGuard("ai-rate-intelligence", async () => {
    try {
      log.info("[Cron AI] Running Rate Intelligence learning cycle...");
      const { runRateLearningCycle } = require("../services/rateIntelligenceService");
      const result = await runRateLearningCycle();
      log.info({ result }, "[Cron AI] Rate Intelligence complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] Rate Intelligence error:");
    }
  }));

  // Daily at 4:15 AM: Carrier Intelligence learning
  cron.schedule("15 4 * * *", () => withGuard("ai-carrier-intelligence", async () => {
    try {
      log.info("[Cron AI] Running Carrier Intelligence learning cycle...");
      const { runCarrierLearningCycle } = require("../services/carrierIntelligenceService");
      const result = await runCarrierLearningCycle();
      log.info({ result }, "[Cron AI] Carrier Intelligence complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] Carrier Intelligence error:");
    }
  }));

  // Weekly Monday at 4:30 AM: Lane Optimizer learning
  cron.schedule("30 4 * * 1", () => withGuard("ai-lane-optimizer", async () => {
    try {
      log.info("[Cron AI] Running Lane Optimizer learning cycle...");
      const { runLaneLearningCycle } = require("../services/laneOptimizerService");
      const result = await runLaneLearningCycle();
      log.info({ result }, "[Cron AI] Lane Optimizer complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] Lane Optimizer error:");
    }
  }));

  // Weekly Monday at 5:00 AM: Customer Intelligence learning
  cron.schedule("0 5 * * 1", () => withGuard("ai-customer-intelligence", async () => {
    try {
      log.info("[Cron AI] Running Customer Intelligence learning cycle...");
      const { runCustomerLearningCycle } = require("../services/customerIntelligenceService");
      const result = await runCustomerLearningCycle();
      log.info({ result }, "[Cron AI] Customer Intelligence complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] Customer Intelligence error:");
    }
  }));

  // Daily at 5:30 AM: Compliance Forecast
  cron.schedule("30 5 * * *", () => withGuard("ai-compliance-forecast", async () => {
    try {
      log.info("[Cron AI] Running Compliance Forecast cycle...");
      const { runComplianceForecastCycle } = require("../services/complianceForecastService");
      const result = await runComplianceForecastCycle();
      log.info({ result }, "[Cron AI] Compliance Forecast complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] Compliance Forecast error:");
    }
  }));

  // Weekly Monday at 6:00 AM: System Self-Optimizer
  cron.schedule("0 6 * * 1", () => withGuard("ai-system-optimizer", async () => {
    try {
      log.info("[Cron AI] Running System Self-Optimizer...");
      const { runSystemOptimizationCycle } = require("../services/systemOptimizerService");
      const result = await runSystemOptimizationCycle();
      log.info({ score: result.overallScore }, "[Cron AI] System Optimizer complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] System Optimizer error:");
    }
  }));

  // ─── Every 4 hours: Fetch latest trucking news ──────────────
  cron.schedule("0 */4 * * *", () => withGuard("news-fetch", async () => {
    try {
      log.info("[Cron] Fetching trucking news feeds...");
      const { fetchAllFeeds } = require("../services/newsAggregatorService");
      const result = await fetchAllFeeds();
      log.info({ result }, "[Cron] News fetch complete");
    } catch (err) {
      log.error({ err }, "[Cron] News fetch error:");
    }
  }));

  // ─── Daily (6:30 AM): AI Morning Briefing ──────────────
  cron.schedule("30 6 * * *", () => withGuard("ai-morning-briefing", async () => {
    try {
      const { isFeatureUnlocked } = require("../ai/volumeGates");
      if (!(await isFeatureUnlocked("morningBriefing"))) {
        log.info("[Cron AI] Morning briefing skipped — volume gate locked");
        return;
      }
      log.info("[Cron AI] Generating morning briefing...");
      const { generateMorningBriefing } = require("../automation/tools/morning-briefing");
      const result = await generateMorningBriefing();
      log.info({ summary: result.summary?.slice(0, 80) }, "[Cron AI] Morning briefing complete");
    } catch (err) {
      log.error({ err }, "[Cron AI] Morning briefing error:");
    }
  }));

  // ─── Weekly (Monday 2 AM): OFAC/SDN rescan ──────────────
  cron.schedule("0 2 * * 1", () => withGuard("ofac-rescan", async () => {
    try {
      log.info("[Cron Weekly] Running OFAC/SDN rescan...");
      const { weeklyOfacRescan } = require("../services/ofacScreeningService");
      const result = await weeklyOfacRescan();
      log.info({ result }, "[Cron Weekly] OFAC rescan complete");
    } catch (err) {
      log.error({ err }, "[Cron Weekly] OFAC rescan error:");
    }
  }));

  // ─── Weekly (Monday 2:30 AM): ELD validation sweep ─────
  cron.schedule("30 2 * * 1", () => withGuard("eld-validation", async () => {
    try {
      log.info("[Cron Weekly] Running ELD validation sweep...");
      const { validateAllCarrierElds } = require("../services/eldValidationService");
      const result = await validateAllCarrierElds();
      log.info({ result }, "[Cron Weekly] ELD validation complete");
    } catch (err) {
      log.error({ err }, "[Cron Weekly] ELD validation error:");
    }
  }));

  // ─── Weekly (Monday 2:45 AM): TIN verification batch ───
  cron.schedule("45 2 * * 1", () => withGuard("tin-verification", async () => {
    try {
      log.info("[Cron Weekly] Running TIN verification batch...");
      const { batchVerifyTins } = require("../services/tinMatchService");
      const result = await batchVerifyTins();
      log.info({ result }, "[Cron Weekly] TIN verification complete");
    } catch (err) {
      log.error({ err }, "[Cron Weekly] TIN verification error:");
    }
  }));

  // ─── Every 2 hours: Post-booking load compliance scan (Compass) ──
  cron.schedule("0 */2 * * *", () => withGuard("load-compliance-scan", async () => {
    try {
      log.info("[Compass] Running load-level compliance scan...");
      const { checkAllActiveLoadCompliance } = require("../services/loadComplianceService");
      const result = await checkAllActiveLoadCompliance();
      log.info({ result }, "[Compass] Load compliance scan");
    } catch (err) {
      log.error({ err }, "[Compass] Load compliance error:");
    }
  }));

  // ─── Every 4 hours: Overbooking detection ─────────────
  cron.schedule("30 */4 * * *", () => withGuard("overbooking-check", async () => {
    try {
      log.info("[Compass] Running overbooking detection...");
      const { checkAllCarrierOverbooking } = require("../services/overbookingService");
      const result = await checkAllCarrierOverbooking();
      log.info({ result }, "[Compass] Overbooking check");
    } catch (err) {
      log.error({ err }, "[Compass] Overbooking error:");
    }
  }));

  // ─── Weekly (Monday 1:30 AM): CSA BASIC score update ──
  cron.schedule("30 1 * * 1", () => withGuard("csa-basic-update", async () => {
    try {
      log.info("[Compass] Running CSA BASIC score update...");
      const { batchUpdateCsaScores } = require("../services/csaBasicService");
      const result = await batchUpdateCsaScores();
      log.info({ result }, "[Compass] CSA update");
    } catch (err) {
      log.error({ err }, "[Compass] CSA update error:");
    }
  }));

  // ─── Weekly (Monday 3:15 AM): Batch VIN verification sweep ──
  cron.schedule("15 3 * * 1", () => withGuard("vin-batch-verify", async () => {
    try {
      log.info("[Compass] Running batch VIN verification...");
      const { verifyAllCarrierVins } = require("../services/vinVerificationService");
      const result = await verifyAllCarrierVins();
      log.info({ result }, "[Compass] VIN batch verify");
    } catch (err) {
      log.error({ err }, "[Compass] VIN batch verify error:");
    }
  }));

  // ─── Daily (7:30 AM): Auto-permanent fraud reports ──────
  cron.schedule("30 7 * * *", () => withGuard("fraud-report-permanence", async () => {
    try {
      const { prisma } = require("../config/database");
      const result = await prisma.fraudReport.updateMany({
        where: {
          status: "PENDING",
          permanentAt: { lte: new Date() },
        },
        data: { status: "PERMANENT" },
      });
      if (result.count > 0) {
        log.info(`[Cron Daily] ${result.count} fraud reports made permanent`);
      }
    } catch (err) {
      log.error({ err }, "[Cron Daily] Fraud report permanence error:");
    }
  }));

  // Seed news sources on startup
  try {
    const { seedNewsSources } = require("../services/newsAggregatorService");
    seedNewsSources().catch((e: any) => log.error({ err: e }, "News source seed error"));
  } catch {}

  log.info("[Cron] All scheduled jobs initialized (including AI learning cycles)");
}
