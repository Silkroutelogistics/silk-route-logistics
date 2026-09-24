/**
 * Stop dates are CALENDAR DATES. They are not instants, and rendering them as
 * instants is what put a load on the wrong day.
 *
 * WHAT WENT WRONG. `Load.pickupDate` / `Load.deliveryDate` hold a date the AE
 * typed, stored as UTC midnight. Every surface rendered it with
 * `toLocaleString(undefined, {... hour, minute})` — no `timeZone`, plus an hour
 * and minute the value never carried. On SRL-121497 the stored value is
 * 2026-09-24T00:00:00Z and the Track & Trace panel printed "Sep 23, 2026,
 * 8:00 PM": four hours subtracted across a date boundary, and a clock time
 * invented out of nothing. The audit recorded 09-24. Neither was wrong about
 * the data; the renderer was wrong about what kind of value it had.
 *
 * It gets worse further west. A carrier in Pacific time sees a UTC-midnight
 * pickup date as the day before by seven hours, and one in Hawaii by ten.
 *
 * THE RULE. A calendar date renders in UTC, date only, never with a fabricated
 * hour or minute. A clock time comes only from the window fields, which are
 * plain strings the AE typed ("12:00") and which mean local time at the dock —
 * so they are labelled "local" rather than silently converted, because nothing
 * in the row says which zone that dock is in.
 *
 * WHY UTC AND NOT A BUSINESS ZONE. The stored value is midnight UTC by
 * construction, so reading it back in UTC returns the calendar date the AE
 * typed, on every machine, in every zone. Picking America/New_York instead
 * would be correct for the office and wrong for the same reason the old code
 * was wrong — it would shift the boundary for anyone outside it.
 */

const CALENDAR = { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" } as const;

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

/** A scheduled stop date: calendar date, UTC, no time. */
export function formatStopDate(d: string | Date | null | undefined): string | null {
  const date = toDate(d);
  return date ? date.toLocaleDateString("en-US", CALENDAR) : null;
}

/**
 * A stop window. The parts are strings the AE typed, so they are shown as
 * typed and labelled local — converting them would claim a zone we do not know.
 * Returns null when neither end is set, so a caller can render an em-dash
 * rather than the string "— – —", which reads like a window that exists.
 */
export function formatStopWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start && !end) return null;
  return `${start ?? "—"} – ${end ?? "—"} local`;
}

/**
 * An ACTUAL arrival or departure. Unlike a stop date this is a true instant, so
 * it keeps its time — but it is stamped UTC and says so, because an unlabelled
 * clock time is the ambiguity this module exists to remove.
 */
export function formatActualDatetime(d: string | Date | null | undefined): string | null {
  const date = toDate(d);
  if (!date) return null;
  return `${date.toLocaleString("en-US", { ...CALENDAR, hour: "numeric", minute: "2-digit" })} UTC`;
}
