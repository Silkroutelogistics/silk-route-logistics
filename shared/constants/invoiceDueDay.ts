// When an invoice's due day is over, in the one form every surface reads.
//
// A due date is a calendar day: the day the invoice prints. It is stored at
// midnight UTC and printed in UTC (v3.8.bjr), so the day is the UTC date of
// the stored value. The day is over at 00:00 America/Toronto on the day after
// (ruling 2026-09-27), and from then the invoice is past due.

/**
 * Issued to the customer and not settled: the statuses an invoice can be past
 * due in. The aging report ages invoices in these statuses.
 */
export const OPEN_STATUSES = ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PARTIAL", "OVERDUE"];

/**
 * The statuses the hourly aging job moves to OVERDUE: the open ones not already
 * there. PARTIAL is among them (ruling 2026-09-27, 2): a partly paid invoice
 * past its due day is overdue, and its balance is what is owed.
 */
export const OVERDUE_FROM = OPEN_STATUSES.filter((s) => s !== "OVERDUE");

/** The clock a due day is judged on, by ruling. */
const DUE_DAY_ZONE = "America/Toronto";

const dateOnDueDayClock = new Intl.DateTimeFormat("en-US", {
  timeZone: DUE_DAY_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_MS = 86_400_000;

/** The calendar date on the due-day clock at `at`, as 00:00 UTC of that date. */
export function dueDayClockDate(at: Date): Date {
  const p = Object.fromEntries(dateOnDueDayClock.formatToParts(at).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

/**
 * 00:00 UTC on today's date on the due-day clock. A due date earlier than this
 * has passed; one on that date or later has not.
 */
export function pastDueCutoff(now: Date): Date {
  return dueDayClockDate(now);
}

/**
 * Whole days past the due day: 0 on the due day itself, 1 from 00:00 on the
 * due-day clock the day after, negative before the due day.
 */
export function daysPastDue(dueDate: Date | string, now: Date): number {
  const d = new Date(dueDate);
  const dueDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((pastDueCutoff(now).getTime() - dueDay) / DAY_MS);
}
