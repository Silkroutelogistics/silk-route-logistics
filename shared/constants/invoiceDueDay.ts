// When an invoice's due day is over, in the one form every surface reads.
//
// A due date is a calendar day: the day the invoice prints. It is stored at
// midnight UTC and printed in UTC (v3.8.bjr), so the day is the UTC date of
// the stored value. The day is over at 00:00 America/Toronto on the day after
// (ruling 2026-09-27), and from then the invoice is past due.

/**
 * The statuses the hourly aging job moves to OVERDUE: issued to the customer
 * and not settled. PARTIAL is among them (ruling 2026-09-27, 2): a partly paid
 * invoice past its due day is overdue, and its balance is what is owed.
 */
export const OVERDUE_FROM = ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PARTIAL"];

/** The clock a due day is judged on, by ruling. */
const DUE_DAY_ZONE = "America/Toronto";

const dateOnDueDayClock = new Intl.DateTimeFormat("en-US", {
  timeZone: DUE_DAY_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 00:00 UTC on today's date on the due-day clock. A due date earlier than this
 * has passed; one on that date or later has not.
 */
export function pastDueCutoff(now: Date): Date {
  const p = Object.fromEntries(dateOnDueDayClock.formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}
