import cron from "node-cron";
import { prisma } from "../config/database";

/**
 * SRL Cron Job System
 * Schedules: 5-min, hourly, daily, weekly, monthly
 */

export function initCronJobs() {
  console.log("[Cron] Initializing scheduled jobs...");

  // ─── Every 5 minutes: Check call reminders ───────────────────
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);

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
  });

  // ─── Hourly: Invoice aging & overdue detection ───────────────
  cron.schedule("0 * * * *", async () => {
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
  });

  // ─── Daily at 6 AM: DSO calculation, SRCPP tier updates ─────
  cron.schedule("0 6 * * *", async () => {
    try {
      // Update SRCPP tiers based on total loads completed
      const carriers = await prisma.carrierProfile.findMany({
        select: { id: true, srcppTotalLoads: true, srcppTier: true },
      });

      for (const carrier of carriers) {
        const loads = carrier.srcppTotalLoads || 0;
        let newTier: "PLATINUM" | "GOLD" | "SILVER" | "BRONZE";
        if (loads >= 100) newTier = "PLATINUM";
        else if (loads >= 50) newTier = "GOLD";
        else if (loads >= 20) newTier = "SILVER";
        else newTier = "BRONZE";

        if (newTier !== carrier.srcppTier) {
          await prisma.carrierProfile.update({
            where: { id: carrier.id },
            data: { srcppTier: newTier },
          });
          console.log(`[Cron Daily] Updated carrier ${carrier.id} tier: ${carrier.srcppTier} → ${newTier}`);
        }
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
  });

  // ─── Weekly (Monday 7 AM): Generate weekly report snapshot ───
  cron.schedule("0 7 * * 1", async () => {
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
  });

  // ─── Monthly (1st, 6 AM): Invoice reminder emails ───────────
  cron.schedule("0 6 1 * *", async () => {
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
  });

  // ─── Weekly (Monday 3 AM): FMCSA compliance scan ─────────
  cron.schedule("0 3 * * 1", async () => {
    try {
      console.log("[Cron Weekly] Starting FMCSA compliance scan...");
      const { weeklyFmcsaScan } = require("../services/complianceMonitorService");
      const result = await weeklyFmcsaScan();
      console.log("[Cron Weekly] FMCSA scan complete:", result);
    } catch (err) {
      console.error("[Cron Weekly] FMCSA scan error:", err);
    }
  });

  // ─── Daily (5 AM): Compliance reminder emails ──────────────
  cron.schedule("0 5 * * *", async () => {
    try {
      console.log("[Cron Daily] Sending compliance reminders...");
      const { dailyComplianceReminders } = require("../services/complianceMonitorService");
      const result = await dailyComplianceReminders();
      console.log("[Cron Daily] Compliance reminders sent:", result);
    } catch (err) {
      console.error("[Cron Daily] Compliance reminder error:", err);
    }
  });

  // ─── AI Learning Cycles ─────────────────────────────────────────

  // Daily at 4:00 AM: Rate Intelligence learning
  cron.schedule("0 4 * * *", async () => {
    try {
      console.log("[Cron AI] Running Rate Intelligence learning cycle...");
      const { runRateLearningCycle } = require("../services/rateIntelligenceService");
      const result = await runRateLearningCycle();
      console.log("[Cron AI] Rate Intelligence complete:", result);
    } catch (err) {
      console.error("[Cron AI] Rate Intelligence error:", err);
    }
  });

  // Daily at 4:15 AM: Carrier Intelligence learning
  cron.schedule("15 4 * * *", async () => {
    try {
      console.log("[Cron AI] Running Carrier Intelligence learning cycle...");
      const { runCarrierLearningCycle } = require("../services/carrierIntelligenceService");
      const result = await runCarrierLearningCycle();
      console.log("[Cron AI] Carrier Intelligence complete:", result);
    } catch (err) {
      console.error("[Cron AI] Carrier Intelligence error:", err);
    }
  });

  // Weekly Monday at 4:30 AM: Lane Optimizer learning
  cron.schedule("30 4 * * 1", async () => {
    try {
      console.log("[Cron AI] Running Lane Optimizer learning cycle...");
      const { runLaneLearningCycle } = require("../services/laneOptimizerService");
      const result = await runLaneLearningCycle();
      console.log("[Cron AI] Lane Optimizer complete:", result);
    } catch (err) {
      console.error("[Cron AI] Lane Optimizer error:", err);
    }
  });

  // Weekly Monday at 5:00 AM: Customer Intelligence learning
  cron.schedule("0 5 * * 1", async () => {
    try {
      console.log("[Cron AI] Running Customer Intelligence learning cycle...");
      const { runCustomerLearningCycle } = require("../services/customerIntelligenceService");
      const result = await runCustomerLearningCycle();
      console.log("[Cron AI] Customer Intelligence complete:", result);
    } catch (err) {
      console.error("[Cron AI] Customer Intelligence error:", err);
    }
  });

  // Daily at 5:30 AM: Compliance Forecast
  cron.schedule("30 5 * * *", async () => {
    try {
      console.log("[Cron AI] Running Compliance Forecast cycle...");
      const { runComplianceForecastCycle } = require("../services/complianceForecastService");
      const result = await runComplianceForecastCycle();
      console.log("[Cron AI] Compliance Forecast complete:", result);
    } catch (err) {
      console.error("[Cron AI] Compliance Forecast error:", err);
    }
  });

  // Weekly Monday at 6:00 AM: System Self-Optimizer
  cron.schedule("0 6 * * 1", async () => {
    try {
      console.log("[Cron AI] Running System Self-Optimizer...");
      const { runSystemOptimizationCycle } = require("../services/systemOptimizerService");
      const result = await runSystemOptimizationCycle();
      console.log("[Cron AI] System Optimizer complete: Health", result.overallScore, "%");
    } catch (err) {
      console.error("[Cron AI] System Optimizer error:", err);
    }
  });

  console.log("[Cron] All scheduled jobs initialized (including AI learning cycles)");
}
