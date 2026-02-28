import cron from "node-cron";
import { prisma } from "../config/database";

/**
 * SRL Cron Job System
 * Schedules: 5-min, hourly, daily, weekly, monthly
 * Each job uses an in-memory mutex to prevent overlapping runs.
 */

// In-memory concurrency guard — prevents overlapping runs of the same job
const runningJobs = new Set<string>();

async function withGuard(jobName: string, fn: () => Promise<void>): Promise<void> {
  if (runningJobs.has(jobName)) {
    console.warn(`[Cron] Skipping ${jobName} — previous run still in progress`);
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
  console.log("[Cron] Initializing scheduled jobs...");

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

        for (const load of loadsNeedingCheckCall) {
          for (const admin of adminUsers) {
            await prisma.notification.create({
              data: {
                userId: admin.id,
                type: "CHECK_CALL_DUE",
                title: "Check Call Overdue",
                message: `Load ${load.referenceNumber} has no check call in the last 2 hours.`,
                link: `/dashboard/tracking?load=${load.id}`,
              },
            }).catch(err => console.error('[Cron] Error:', err.message));
          }
        }
      }
    } catch (err) {
      console.error("[Cron 5min] Check call reminder error:", err);
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
        console.log(`[Cron Hourly] Marked ${overdueInvoices.count} invoices as overdue`);
      }
    } catch (err) {
      console.error("[Cron Hourly] Invoice aging error:", err);
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
        let newTier: "PLATINUM" | "GOLD" | "SILVER" | "BRONZE";
        if (loads >= 100) newTier = "PLATINUM";
        else if (loads >= 50) newTier = "GOLD";
        else if (loads >= 20) newTier = "SILVER";
        else newTier = "BRONZE";

        if (newTier !== carrier.cppTier) {
          await prisma.carrierProfile.update({
            where: { id: carrier.id },
            data: { cppTier: newTier },
          });
          console.log(`[Cron Daily] Updated carrier ${carrier.id} tier: ${carrier.cppTier} → ${newTier}`);
        }
      }

      // Clean expired JWT blacklist entries
      const { cleanupBlacklist } = require("../utils/tokenBlacklist");
      const blacklistCleaned = await cleanupBlacklist();
      if (blacklistCleaned > 0) {
        console.log(`[Cron Daily] Cleaned ${blacklistCleaned} expired blacklist entries`);
      }

      // Clean old system logs (keep 90 days)
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      const deleted = await prisma.systemLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (deleted.count > 0) {
        console.log(`[Cron Daily] Cleaned ${deleted.count} old system logs`);
      }
    } catch (err) {
      console.error("[Cron Daily] Error:", err);
    }
  }));

  // ─── Daily at 7 AM: System health digest email to admins ────
  cron.schedule("0 7 * * *", () => withGuard("health-digest", async () => {
    try {
      console.log("[Cron Daily] Generating system health digest...");
      const { sendHealthDigest } = require("../services/healthDigestService");
      await sendHealthDigest();
      console.log("[Cron Daily] Health digest sent");
    } catch (err) {
      console.error("[Cron Daily] Health digest error:", err);
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

      console.log(`[Cron Weekly] Report: ${loads} loads created, ${delivered} delivered, $${revenue._sum.customerRate || 0} revenue`);

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
      console.error("[Cron Weekly] Error:", err);
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

      for (const inv of unpaidInvoices) {
        if (!inv.dueDate) continue;
        const daysSinceDue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);

        if (daysSinceDue >= 60 && !inv.reminderSent60) {
          await prisma.invoice.update({ where: { id: inv.id }, data: { reminderSent60: true } });
          console.log(`[Cron Monthly] 60-day reminder for invoice ${inv.invoiceNumber}`);
        } else if (daysSinceDue >= 45 && !inv.reminderSent45) {
          await prisma.invoice.update({ where: { id: inv.id }, data: { reminderSent45: true } });
          console.log(`[Cron Monthly] 45-day reminder for invoice ${inv.invoiceNumber}`);
        } else if (daysSinceDue >= 31 && !inv.reminderSent31) {
          await prisma.invoice.update({ where: { id: inv.id }, data: { reminderSent31: true } });
          console.log(`[Cron Monthly] 31-day reminder for invoice ${inv.invoiceNumber}`);
        }
      }
    } catch (err) {
      console.error("[Cron Monthly] Invoice reminder error:", err);
    }
  }));

  // ─── Weekly (Monday 3 AM): FMCSA compliance scan ─────────
  cron.schedule("0 3 * * 1", () => withGuard("fmcsa-compliance", async () => {
    try {
      console.log("[Cron Weekly] Starting FMCSA compliance scan...");
      const { weeklyFmcsaScan } = require("../services/complianceMonitorService");
      const result = await weeklyFmcsaScan();
      console.log("[Cron Weekly] FMCSA scan complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] FMCSA scan error:", err);
    }
  }));

  // ─── Daily (6 AM): Identity/email/phone validation for pending carriers ──
  cron.schedule("0 6 * * *", () => withGuard("identity-validation", async () => {
    try {
      console.log("[Cron Daily] Running identity validation for pending carriers...");
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
          console.error(`[Cron Identity] Error for ${carrier.id}:`, (err as Error).message);
        }
      }
      console.log(`[Cron Daily] Identity validation: ${checked} checked, ${errors} errors`);
    } catch (err) {
      console.error("[Cron Daily] Identity validation error:", err);
    }
  }));

  // ─── Daily (5 AM): Compliance reminder emails ──────────────
  cron.schedule("0 5 * * *", () => withGuard("compliance-reminders", async () => {
    try {
      console.log("[Cron Daily] Sending compliance reminders...");
      const { dailyComplianceReminders } = require("../services/complianceMonitorService");
      const result = await dailyComplianceReminders();
      console.log("[Cron Daily] Compliance reminders sent:", result);
    } catch (err) {
      console.error("[Cron Daily] Compliance reminder error:", err);
    }
  }));

  // ─── Weekly (Monday 3:30 AM): Full chameleon scan ─────────────
  cron.schedule("30 3 * * 1", () => withGuard("chameleon-scan", async () => {
    try {
      console.log("[Cron Weekly] Starting full chameleon detection scan...");
      const { runFullChameleonScan } = require("../services/chameleonDetectionService");
      const result = await runFullChameleonScan();
      console.log("[Cron Weekly] Chameleon scan complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] Chameleon scan error:", err);
    }
  }));

  // ─── Weekly (Monday 4 AM): Auto-reversal check for suspended carriers ──
  cron.schedule("0 4 * * 1", () => withGuard("auto-reversal", async () => {
    try {
      console.log("[Cron Weekly] Checking auto-reversal for suspended carriers...");
      const { checkAutoReversal } = require("../services/complianceMonitorService");
      const result = await checkAutoReversal();
      console.log("[Cron Weekly] Auto-reversal complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] Auto-reversal error:", err);
    }
  }));

  // ─── AI Learning Cycles ─────────────────────────────────────────

  // Daily at 4:00 AM: Rate Intelligence learning
  cron.schedule("0 4 * * *", () => withGuard("ai-rate-intelligence", async () => {
    try {
      console.log("[Cron AI] Running Rate Intelligence learning cycle...");
      const { runRateLearningCycle } = require("../services/rateIntelligenceService");
      const result = await runRateLearningCycle();
      console.log("[Cron AI] Rate Intelligence complete:", result);
    } catch (err) {
      console.error("[Cron AI] Rate Intelligence error:", err);
    }
  }));

  // Daily at 4:15 AM: Carrier Intelligence learning
  cron.schedule("15 4 * * *", () => withGuard("ai-carrier-intelligence", async () => {
    try {
      console.log("[Cron AI] Running Carrier Intelligence learning cycle...");
      const { runCarrierLearningCycle } = require("../services/carrierIntelligenceService");
      const result = await runCarrierLearningCycle();
      console.log("[Cron AI] Carrier Intelligence complete:", result);
    } catch (err) {
      console.error("[Cron AI] Carrier Intelligence error:", err);
    }
  }));

  // Weekly Monday at 4:30 AM: Lane Optimizer learning
  cron.schedule("30 4 * * 1", () => withGuard("ai-lane-optimizer", async () => {
    try {
      console.log("[Cron AI] Running Lane Optimizer learning cycle...");
      const { runLaneLearningCycle } = require("../services/laneOptimizerService");
      const result = await runLaneLearningCycle();
      console.log("[Cron AI] Lane Optimizer complete:", result);
    } catch (err) {
      console.error("[Cron AI] Lane Optimizer error:", err);
    }
  }));

  // Weekly Monday at 5:00 AM: Customer Intelligence learning
  cron.schedule("0 5 * * 1", () => withGuard("ai-customer-intelligence", async () => {
    try {
      console.log("[Cron AI] Running Customer Intelligence learning cycle...");
      const { runCustomerLearningCycle } = require("../services/customerIntelligenceService");
      const result = await runCustomerLearningCycle();
      console.log("[Cron AI] Customer Intelligence complete:", result);
    } catch (err) {
      console.error("[Cron AI] Customer Intelligence error:", err);
    }
  }));

  // Daily at 5:30 AM: Compliance Forecast
  cron.schedule("30 5 * * *", () => withGuard("ai-compliance-forecast", async () => {
    try {
      console.log("[Cron AI] Running Compliance Forecast cycle...");
      const { runComplianceForecastCycle } = require("../services/complianceForecastService");
      const result = await runComplianceForecastCycle();
      console.log("[Cron AI] Compliance Forecast complete:", result);
    } catch (err) {
      console.error("[Cron AI] Compliance Forecast error:", err);
    }
  }));

  // Weekly Monday at 6:00 AM: System Self-Optimizer
  cron.schedule("0 6 * * 1", () => withGuard("ai-system-optimizer", async () => {
    try {
      console.log("[Cron AI] Running System Self-Optimizer...");
      const { runSystemOptimizationCycle } = require("../services/systemOptimizerService");
      const result = await runSystemOptimizationCycle();
      console.log("[Cron AI] System Optimizer complete: Health", result.overallScore, "%");
    } catch (err) {
      console.error("[Cron AI] System Optimizer error:", err);
    }
  }));

  // ─── Every 4 hours: Fetch latest trucking news ──────────────
  cron.schedule("0 */4 * * *", () => withGuard("news-fetch", async () => {
    try {
      console.log("[Cron] Fetching trucking news feeds...");
      const { fetchAllFeeds } = require("../services/newsAggregatorService");
      const result = await fetchAllFeeds();
      console.log("[Cron] News fetch complete:", result);
    } catch (err) {
      console.error("[Cron] News fetch error:", err);
    }
  }));

  // ─── Weekly (Monday 2 AM): OFAC/SDN rescan ──────────────
  cron.schedule("0 2 * * 1", () => withGuard("ofac-rescan", async () => {
    try {
      console.log("[Cron Weekly] Running OFAC/SDN rescan...");
      const { weeklyOfacRescan } = require("../services/ofacScreeningService");
      const result = await weeklyOfacRescan();
      console.log("[Cron Weekly] OFAC rescan complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] OFAC rescan error:", err);
    }
  }));

  // ─── Weekly (Monday 2:30 AM): ELD validation sweep ─────
  cron.schedule("30 2 * * 1", () => withGuard("eld-validation", async () => {
    try {
      console.log("[Cron Weekly] Running ELD validation sweep...");
      const { validateAllCarrierElds } = require("../services/eldValidationService");
      const result = await validateAllCarrierElds();
      console.log("[Cron Weekly] ELD validation complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] ELD validation error:", err);
    }
  }));

  // ─── Weekly (Monday 2:45 AM): TIN verification batch ───
  cron.schedule("45 2 * * 1", () => withGuard("tin-verification", async () => {
    try {
      console.log("[Cron Weekly] Running TIN verification batch...");
      const { batchVerifyTins } = require("../services/tinMatchService");
      const result = await batchVerifyTins();
      console.log("[Cron Weekly] TIN verification complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] TIN verification error:", err);
    }
  }));

  // ─── Every 2 hours: Post-booking load compliance scan (Compass) ──
  cron.schedule("0 */2 * * *", () => withGuard("load-compliance-scan", async () => {
    try {
      console.log("[Compass] Running load-level compliance scan...");
      const { checkAllActiveLoadCompliance } = require("../services/loadComplianceService");
      const result = await checkAllActiveLoadCompliance();
      console.log("[Compass] Load compliance scan:", result);
    } catch (err) {
      console.error("[Compass] Load compliance error:", err);
    }
  }));

  // ─── Every 4 hours: Overbooking detection ─────────────
  cron.schedule("30 */4 * * *", () => withGuard("overbooking-check", async () => {
    try {
      console.log("[Compass] Running overbooking detection...");
      const { checkAllCarrierOverbooking } = require("../services/overbookingService");
      const result = await checkAllCarrierOverbooking();
      console.log("[Compass] Overbooking check:", result);
    } catch (err) {
      console.error("[Compass] Overbooking error:", err);
    }
  }));

  // ─── Weekly (Monday 1:30 AM): CSA BASIC score update ──
  cron.schedule("30 1 * * 1", () => withGuard("csa-basic-update", async () => {
    try {
      console.log("[Compass] Running CSA BASIC score update...");
      const { batchUpdateCsaScores } = require("../services/csaBasicService");
      const result = await batchUpdateCsaScores();
      console.log("[Compass] CSA update:", result);
    } catch (err) {
      console.error("[Compass] CSA update error:", err);
    }
  }));

  // ─── Weekly (Monday 3:00 AM): Batch VIN verification sweep ──
  cron.schedule("0 3 * * 1", () => withGuard("vin-batch-verify", async () => {
    try {
      console.log("[Compass] Running batch VIN verification...");
      const { verifyAllCarrierVins } = require("../services/vinVerificationService");
      const result = await verifyAllCarrierVins();
      console.log("[Compass] VIN batch verify:", result);
    } catch (err) {
      console.error("[Compass] VIN batch verify error:", err);
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
        console.log(`[Cron Daily] ${result.count} fraud reports made permanent`);
      }
    } catch (err) {
      console.error("[Cron Daily] Fraud report permanence error:", err);
    }
  }));

  // Seed news sources on startup
  try {
    const { seedNewsSources } = require("../services/newsAggregatorService");
    seedNewsSources().catch((e: any) => console.error("[Cron] News source seed error:", e.message));
  } catch {}

  console.log("[Cron] All scheduled jobs initialized (including AI learning cycles)");
}
