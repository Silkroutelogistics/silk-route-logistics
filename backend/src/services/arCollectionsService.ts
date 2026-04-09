import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

// ─── Types ──────────────────────────────────────────────────────────

type ReminderStage = "FRIENDLY_7" | "COMING_DUE_14" | "DUE_TODAY" | "PAST_DUE_7" | "PAST_DUE_15" | "FINAL_NOTICE";

interface ArAgingBucket {
  label: string;
  count: number;
  total: number;
  invoiceIds: string[];
}

export interface ArAgingSummary {
  current: ArAgingBucket;
  days31to60: ArAgingBucket;
  days61to90: ArAgingBucket;
  days90plus: ArAgingBucket;
  totalOverdue: number;
  totalOverdueCount: number;
  totalOutstanding: number;
  totalOutstandingCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function stageToFlagField(stage: ReminderStage): string {
  switch (stage) {
    case "FRIENDLY_7": return "reminderSentPre7";
    case "COMING_DUE_14": return "reminderSentPre7"; // reuse pre-7 flag for 14-day
    case "DUE_TODAY": return "reminderSentDue";
    case "PAST_DUE_7": return "reminderSent7";
    case "PAST_DUE_15": return "reminderSent31"; // map to 31 flag
    case "FINAL_NOTICE": return "reminderSent60";
  }
}

function stageLabel(stage: ReminderStage): string {
  switch (stage) {
    case "FRIENDLY_7": return "Friendly Reminder (7 days before due)";
    case "COMING_DUE_14": return "Payment Coming Due (14 days before due)";
    case "DUE_TODAY": return "Payment Due Today";
    case "PAST_DUE_7": return "7 Days Past Due";
    case "PAST_DUE_15": return "15 Days Past Due";
    case "FINAL_NOTICE": return "Final Notice (60+ days past due)";
  }
}

function stageNotificationType(stage: ReminderStage): string {
  switch (stage) {
    case "FRIENDLY_7":
    case "COMING_DUE_14":
    case "DUE_TODAY":
      return "PAYMENT_REMINDER";
    case "PAST_DUE_7":
    case "PAST_DUE_15":
      return "PAYMENT_OVERDUE";
    case "FINAL_NOTICE":
      return "PAYMENT_FINAL_NOTICE";
  }
}

// ─── Email Generation ───────────────────────────────────────────────

export function generateReminderEmail(
  invoice: { invoiceNumber: string; amount: number; totalAmount: number | null; dueDate: Date },
  customerName: string,
  contactName: string | null,
  stage: ReminderStage,
): { subject: string; html: string } {
  const displayAmount = formatCurrency(invoice.totalAmount ?? invoice.amount);
  const dueStr = formatDate(invoice.dueDate);
  const daysOverdue = daysBetween(invoice.dueDate, new Date());
  const name = contactName || customerName || "Valued Customer";
  const portalLink = "https://silkroutelogistics.ai/shipper/invoices";

  let subject: string;
  let bodyContent: string;

  switch (stage) {
    case "FRIENDLY_7":
      subject = `Friendly Reminder: Invoice ${invoice.invoiceNumber} — ${displayAmount}`;
      bodyContent = `
        <h2 style="color:#0f172a">Payment Reminder</h2>
        <p>Hi ${name},</p>
        <p>We hope you're doing well! This is a friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> is coming due soon.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount Due</td><td style="padding:8px;border:1px solid #e2e8f0">${displayAmount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">${dueStr}</td></tr>
        </table>
        <p>Please ensure payment is submitted by the due date. You can view and manage your invoices in the Shipper Portal.</p>
        <a href="${portalLink}" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View Invoice</a>
        <p style="color:#64748b;font-size:13px;margin-top:16px">Thank you for your business!</p>
      `;
      break;

    case "COMING_DUE_14":
      subject = `Payment Coming Due: Invoice ${invoice.invoiceNumber} — ${displayAmount}`;
      bodyContent = `
        <h2 style="color:#0f172a">Payment Coming Due</h2>
        <p>Hi ${name},</p>
        <p>This is a reminder that payment for invoice <strong>${invoice.invoiceNumber}</strong> is coming due on <strong>${dueStr}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount Due</td><td style="padding:8px;border:1px solid #e2e8f0">${displayAmount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">${dueStr}</td></tr>
        </table>
        <p>If payment has already been submitted, please disregard this notice. Otherwise, please process payment before the due date.</p>
        <a href="${portalLink}" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Pay Now</a>
      `;
      break;

    case "DUE_TODAY":
      subject = `Payment Due Today: Invoice ${invoice.invoiceNumber} — ${displayAmount}`;
      bodyContent = `
        <h2 style="color:#f59e0b">Payment Due Today</h2>
        <p>Hi ${name},</p>
        <p>Invoice <strong>${invoice.invoiceNumber}</strong> is due <strong>today</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount Due</td><td style="padding:8px;border:1px solid #e2e8f0">${displayAmount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">${dueStr}</td></tr>
        </table>
        <p>Please submit payment today to avoid late fees. If you've already sent payment, thank you!</p>
        <a href="${portalLink}" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Pay Now</a>
      `;
      break;

    case "PAST_DUE_7":
      subject = `PAST DUE: Invoice ${invoice.invoiceNumber} — 7 Days Overdue (${displayAmount})`;
      bodyContent = `
        <h2 style="color:#dc2626">7 Days Past Due</h2>
        <p>Hi ${name},</p>
        <p>Invoice <strong>${invoice.invoiceNumber}</strong> is now <strong>${daysOverdue} days past due</strong>. The original due date was ${dueStr}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount Due</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold">${displayAmount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">${dueStr}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Days Overdue</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold">${daysOverdue}</td></tr>
        </table>
        <p>We kindly request immediate payment. If there are any issues with the invoice, please contact your account representative right away.</p>
        <a href="${portalLink}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Pay Now</a>
      `;
      break;

    case "PAST_DUE_15":
      subject = `URGENT: Invoice ${invoice.invoiceNumber} — 15+ Days Overdue (${displayAmount})`;
      bodyContent = `
        <h2 style="color:#dc2626">15 Days Past Due — Please Resolve</h2>
        <p>Hi ${name},</p>
        <p>Invoice <strong>${invoice.invoiceNumber}</strong> is now <strong>${daysOverdue} days past due</strong>. This requires your immediate attention.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount Due</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold">${displayAmount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">${dueStr}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Days Overdue</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold">${daysOverdue}</td></tr>
        </table>
        <p><strong>Please resolve this outstanding balance as soon as possible.</strong> Continued non-payment may affect your account standing with Silk Route Logistics.</p>
        <p>If you're experiencing payment difficulties, please contact us — we're happy to discuss payment arrangements.</p>
        <a href="${portalLink}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Pay Now</a>
      `;
      break;

    case "FINAL_NOTICE":
      subject = `FINAL NOTICE: Invoice ${invoice.invoiceNumber} — Account Suspension Warning (${displayAmount})`;
      bodyContent = `
        <h2 style="color:#dc2626">FINAL NOTICE — Account May Be Suspended</h2>
        <p>Hi ${name},</p>
        <p>This is a <strong>final notice</strong> regarding invoice <strong>${invoice.invoiceNumber}</strong>, which is now <strong>${daysOverdue} days past due</strong>.</p>
        <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#dc2626;font-weight:bold;margin:0 0 8px 0">IMPORTANT: Your account may be suspended if payment is not received within 7 days.</p>
          <p style="color:#991b1b;margin:0;font-size:14px">Account suspension will prevent new shipment bookings and may require reinstatement fees.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount Due</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold;font-size:18px">${displayAmount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Original Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">${dueStr}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Days Overdue</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold">${daysOverdue}</td></tr>
        </table>
        <p>Please process payment immediately or contact your SRL account representative at <a href="mailto:accounting@silkroutelogistics.ai">accounting@silkroutelogistics.ai</a> to make payment arrangements.</p>
        <a href="${portalLink}" style="display:inline-block;background:#dc2626;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin-top:8px">Pay Immediately</a>
      `;
      break;
  }

  return { subject, html: wrap(bodyContent) };
}

// ─── Main AR Processing ─────────────────────────────────────────────

/**
 * Daily AR reminders job — processes all unpaid invoices and sends
 * escalating reminder emails based on aging.
 */
export async function processArReminders(): Promise<{ processed: number; remindersSent: number; errors: number }> {
  const now = new Date();
  const unpaidStatuses: string[] = ["SUBMITTED", "SENT", "UNDER_REVIEW", "APPROVED", "FUNDED", "OVERDUE", "PARTIAL"];

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: unpaidStatuses as any[] },
      dueDate: { not: null },
      deletedAt: null,
    },
    include: {
      load: {
        select: {
          referenceNumber: true,
          customer: { select: { id: true, name: true, email: true, contactName: true } },
          posterId: true,
        },
      },
    },
    take: 5000,
  });

  let sent = 0;
  let errors = 0;

  for (const inv of invoices) {
    if (!inv.dueDate || !inv.load?.customer?.email) continue;

    const daysToDue = daysBetween(now, inv.dueDate); // positive = before due
    const daysOverdue = -daysToDue;

    let stage: ReminderStage | null = null;
    let flagField: string | null = null;

    // Determine which reminder to send based on aging
    if (daysToDue <= 14 && daysToDue > 7) {
      // 14 days before due — "coming due" email
      // Use reminderSentPre7 check loosely (we only send one pre-due reminder)
      if (!inv.reminderSentPre7) {
        stage = "COMING_DUE_14";
        flagField = "reminderSentPre7";
      }
    } else if (daysToDue <= 7 && daysToDue > 0) {
      // 7 days before due — friendly reminder
      if (!inv.reminderSentPre7) {
        stage = "FRIENDLY_7";
        flagField = "reminderSentPre7";
      }
    } else if (daysToDue <= 0 && daysOverdue < 7) {
      // Due date or just past — "due today" email
      if (!inv.reminderSentDue) {
        stage = "DUE_TODAY";
        flagField = "reminderSentDue";
      }
    } else if (daysOverdue >= 7 && daysOverdue < 15) {
      // 7 days past due
      if (!inv.reminderSent7) {
        stage = "PAST_DUE_7";
        flagField = "reminderSent7";
      }
    } else if (daysOverdue >= 15 && daysOverdue < 60) {
      // 15-45 days past due
      if (!inv.reminderSent31) {
        stage = "PAST_DUE_15";
        flagField = "reminderSent31";
      }
    } else if (daysOverdue >= 60) {
      // 60+ days — final notice
      if (!inv.reminderSent60) {
        stage = "FINAL_NOTICE";
        flagField = "reminderSent60";
      }
    }

    if (!stage || !flagField) continue;

    try {
      // Generate and send email
      const { subject, html } = generateReminderEmail(
        { invoiceNumber: inv.invoiceNumber, amount: inv.amount, totalAmount: inv.totalAmount, dueDate: inv.dueDate },
        inv.load.customer.name,
        inv.load.customer.contactName,
        stage,
      );

      await sendEmail(inv.load.customer.email, subject, html);

      // Update invoice reminder flag
      const updateData: Record<string, any> = {
        [flagField]: true,
        lastReminderAt: now,
      };
      // Mark as OVERDUE if past due
      if (daysOverdue > 0 && inv.status !== "OVERDUE") {
        updateData.status = "OVERDUE";
      }
      await prisma.invoice.update({ where: { id: inv.id }, data: updateData });

      // Create notifications for ADMIN/BROKER
      const adminsAndBrokers = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "BROKER"] as any[] } },
        select: { id: true },
        take: 50,
      });

      const notificationTitle = `AR Reminder: ${inv.invoiceNumber} — ${stageLabel(stage)}`;
      const notificationMessage = `${stage === "FINAL_NOTICE" ? "FINAL NOTICE " : ""}Invoice ${inv.invoiceNumber} (${formatCurrency(inv.totalAmount ?? inv.amount)}) to ${inv.load.customer.name}: ${stageLabel(stage)}. Due: ${formatDate(inv.dueDate)}.`;

      for (const user of adminsAndBrokers) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "PAYMENT_UPDATE" as any,
            title: notificationTitle,
            message: notificationMessage,
            actionUrl: "/dashboard/accounting",
          },
        });
      }

      // Log to SystemLog
      await prisma.systemLog.create({
        data: {
          logType: "CRON_JOB",
          severity: daysOverdue >= 60 ? "WARNING" : "INFO",
          source: "arCollectionsService",
          message: `AR reminder sent: ${inv.invoiceNumber} — ${stageLabel(stage)}`,
          details: {
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amount: inv.totalAmount ?? inv.amount,
            dueDate: inv.dueDate.toISOString(),
            daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
            stage,
            customerName: inv.load.customer.name,
            customerEmail: inv.load.customer.email,
          },
        },
      });

      sent++;
      log.info(`[ARCollections] ${stageLabel(stage)}: ${inv.invoiceNumber} → ${inv.load.customer.email}`);
    } catch (err) {
      errors++;
      log.error({ err: err }, `[ARCollections] Error processing ${inv.invoiceNumber}:`);
    }
  }

  log.info(`[ARCollections] Processed ${invoices.length} invoices, sent ${sent} reminders, ${errors} errors`);
  return { processed: invoices.length, remindersSent: sent, errors };
}

// ─── AR Aging Summary ───────────────────────────────────────────────

/**
 * Returns aging breakdown for dashboard display.
 */
export async function getArAgingSummary(): Promise<ArAgingSummary> {
  const now = new Date();
  const unpaidStatuses: string[] = ["SUBMITTED", "SENT", "UNDER_REVIEW", "APPROVED", "FUNDED", "OVERDUE", "PARTIAL"];

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: unpaidStatuses as any[] },
      dueDate: { not: null },
      deletedAt: null,
    },
    select: {
      id: true,
      amount: true,
      totalAmount: true,
      dueDate: true,
    },
  });

  const current: ArAgingBucket = { label: "Current (0-30)", count: 0, total: 0, invoiceIds: [] };
  const days31to60: ArAgingBucket = { label: "31-60 Days", count: 0, total: 0, invoiceIds: [] };
  const days61to90: ArAgingBucket = { label: "61-90 Days", count: 0, total: 0, invoiceIds: [] };
  const days90plus: ArAgingBucket = { label: "90+ Days", count: 0, total: 0, invoiceIds: [] };

  let totalOverdue = 0;
  let totalOverdueCount = 0;
  let totalOutstanding = 0;

  for (const inv of invoices) {
    const amount = inv.totalAmount ?? inv.amount;
    const daysOverdue = inv.dueDate ? daysBetween(inv.dueDate, now) : 0;
    totalOutstanding += amount;

    if (daysOverdue <= 30) {
      current.count++;
      current.total += amount;
      current.invoiceIds.push(inv.id);
    } else if (daysOverdue <= 60) {
      days31to60.count++;
      days31to60.total += amount;
      days31to60.invoiceIds.push(inv.id);
      totalOverdue += amount;
      totalOverdueCount++;
    } else if (daysOverdue <= 90) {
      days61to90.count++;
      days61to90.total += amount;
      days61to90.invoiceIds.push(inv.id);
      totalOverdue += amount;
      totalOverdueCount++;
    } else {
      days90plus.count++;
      days90plus.total += amount;
      days90plus.invoiceIds.push(inv.id);
      totalOverdue += amount;
      totalOverdueCount++;
    }
  }

  // Round totals
  current.total = Math.round(current.total * 100) / 100;
  days31to60.total = Math.round(days31to60.total * 100) / 100;
  days61to90.total = Math.round(days61to90.total * 100) / 100;
  days90plus.total = Math.round(days90plus.total * 100) / 100;

  return {
    current,
    days31to60,
    days61to90,
    days90plus,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    totalOverdueCount,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalOutstandingCount: invoices.length,
  };
}
