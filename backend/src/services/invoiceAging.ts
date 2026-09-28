import { prisma } from "../config/database";
import { pastDueCutoff } from "../../../shared/constants/invoiceDueDay";

/**
 * v3.8.bmi — when an invoice turns OVERDUE, decided in one place (ruling
 * 2026-09-27: "Overdue is set only by the hourly aging job, on the due date,
 * for every customer including Tipalti").
 *
 * Only here. The reminder emailer no longer writes a status (v3.8.bmh), and
 * the 11:00 helper that set it up to a day early is retired (v3.8.blg). The
 * hourly job in cron/index.ts calls this. It applies to every customer,
 * including those billed through Tipalti, so the aging report shows a late
 * Tipalti invoice the way it shows any other.
 *
 * WHEN. A due date is a calendar day: the day the invoice prints, which is the
 * UTC date of the stored value (v3.8.bjr prints the stored day on any host).
 * It has passed once that day is over on the America/Toronto clock (ruling
 * 2026-09-27; the rule itself is in shared/constants/invoiceDueDay.ts). The
 * job used to compare the stored instant with now, so a due date stored at
 * midnight UTC turned OVERDUE at 8 PM Eastern the evening before it was due:
 * Beekeepers' four invoices, due Oct 25, would have gone overdue on Oct 24.
 * A generated invoice carries its creation time of day, so under the old rule
 * it turned overdue partway through its due day; now it waits for the day to end.
 */

/** The statuses this job moves to OVERDUE. Unchanged from the inline query it replaces. */
export const OVERDUE_FROM = ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED"];

/** Marks every invoice whose due date has passed OVERDUE. Returns how many moved. */
export async function markPastDueInvoicesOverdue(now: Date = new Date()): Promise<number> {
  const r = await prisma.invoice.updateMany({
    where: { status: { in: OVERDUE_FROM as any[] }, dueDate: { lt: pastDueCutoff(now) } },
    data: { status: "OVERDUE" },
  });
  return r.count;
}
