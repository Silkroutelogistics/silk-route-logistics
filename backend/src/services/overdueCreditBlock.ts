import { prisma } from "../config/database";
import { log } from "../lib/logger";

/**
 * v3.8.blg — the 90-day credit block, and nothing else.
 *
 * This used to be one branch of accountingController.processARReminders, a
 * daily job that sent no email but ticked the reminder boxes on every unpaid
 * invoice. The one job that does email (arCollectionsService.processArReminders)
 * skips any box already ticked, so it ran three hours after the ticking and
 * found most of its reminders "already sent". That job is gone. What it did
 * that was real now lives in the one place that should do each thing:
 *
 *   marking an invoice OVERDUE   the hourly invoice-aging job: the rule is in
 *                                services/invoiceAging.ts (v3.8.bmi), run from
 *                                cron/index.ts
 *   counting a late payment      integrationService.onInvoicePaid, once, when
 *                                the invoice is fully paid
 *   blocking credit at 90 days   here
 *
 * The block is remembered per invoice on Invoice.creditBlockApplied, its own
 * column. It must not reuse a reminder box: the mail carrier would read it as a
 * letter, and the next person to add a 90-day letter would collide with it.
 * Being remembered is what keeps an admin's manual unblock from being undone
 * the next morning.
 *
 * The old branch skipped any customer with no email on file, left over from
 * when it meant to email them. So a customer with no email could be months
 * overdue and still be booked. It reads the customer id now, nothing else.
 */

const DAY_MS = 86_400_000;

/**
 * The old job's boundary, kept exactly: it blocked once Math.ceil(days past
 * due) reached 90, which is the first moment the due date is more than 89
 * whole days behind.
 */
export const BLOCK_AFTER_DAYS_OVERDUE = 90;

// Same set the old job read. A partially paid invoice 90 days out still counts.
const UNPAID_STATUSES = ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "OVERDUE", "PARTIAL"];

export interface OverdueCreditBlockResult {
  /** Invoices past the boundary that had not yet been acted on. */
  checked: number;
  /** Customers whose credit this run switched to blocked. */
  blocked: number;
  /** Invoices recorded against a customer who was already blocked. */
  alreadyBlocked: number;
  /** Invoices left unmarked because the customer has no credit record; retried tomorrow. */
  noCreditRecord: number;
  /** Invoices of customers billed through Tipalti: exempt, left unmarked (v3.8.bmf). */
  skippedTipalti: number;
}

export async function applyOverdueCreditBlocks(now: Date = new Date()): Promise<OverdueCreditBlockResult> {
  const cutoff = new Date(now.getTime() - (BLOCK_AFTER_DAYS_OVERDUE - 1) * DAY_MS);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: UNPAID_STATUSES as any[] },
      dueDate: { lt: cutoff },
      creditBlockApplied: false,
      deletedAt: null,
      // Same population as the reminder sender: a cancelled or deleted load's
      // invoice must not block a customer.
      load: { is: { deletedAt: null, status: { not: "CANCELLED" } } },
    },
    select: {
      id: true,
      invoiceNumber: true,
      load: { select: { customerId: true, customer: { select: { defaultInvoiceChannel: true } } } },
    },
    take: 5000,
  });

  const result: OverdueCreditBlockResult = {
    checked: invoices.length, blocked: 0, alreadyBlocked: 0, noCreditRecord: 0, skippedTipalti: 0,
  };

  for (const inv of invoices) {
    const customerId = inv.load?.customerId;
    if (!customerId) continue;

    // v3.8.bmf (ruling 2026-09-27): a customer billed through Tipalti is paid on
    // Tipalti's cycle, not its own, so an invoice past 90 days does not block
    // that customer's credit. Left unmarked, so the block applies if the
    // customer stops billing through Tipalti.
    if (inv.load?.customer?.defaultInvoiceChannel === "TIPALTI") {
      result.skippedTipalti++;
      continue;
    }

    const credit = await prisma.shipperCredit.findUnique({
      where: { customerId },
      select: { id: true, autoBlocked: true },
    });
    if (!credit) {
      // Not marked, so the block is retried tomorrow rather than forgotten.
      result.noCreditRecord++;
      log.warn(
        { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerId },
        "[Credit] Invoice is 90+ days overdue but the customer has no credit record; block not applied",
      );
      continue;
    }

    if (credit.autoBlocked) {
      result.alreadyBlocked++;
    } else {
      await prisma.shipperCredit.updateMany({
        where: { customerId, autoBlocked: false },
        data: {
          autoBlocked: true,
          blockedReason: `Auto-blocked: Invoice ${inv.invoiceNumber} 90+ days overdue`,
          blockedAt: now,
        },
      });
      result.blocked++;
      log.info({ customerId, invoiceNumber: inv.invoiceNumber }, "[Credit] Customer credit blocked: invoice 90+ days overdue");
    }

    await prisma.invoice.update({ where: { id: inv.id }, data: { creditBlockApplied: true } });
  }

  return result;
}
