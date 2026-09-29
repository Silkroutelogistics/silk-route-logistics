/**
 * The calendar date a document prints for a pickup or delivery.
 *
 * WHY THIS EXISTS. The rate confirmation printed PICKUP and DELIVERY as
 * whatever string sat in its formData. The AE's modal stores `2026-09-27`,
 * but the draft written on every tender accept (autoRateConfirmationService)
 * stores `load.pickupDate.toISOString()` — `2026-09-27T00:00:00.000Z`. That
 * 24-character string went straight into a 67.5pt meta-strip cell and ran
 * over the next one, and into the stop's "Window:" line, where it pushed the
 * appointment number off the panel. Seen on RC 5003, 2026-09-27. The shipper
 * load confirmation had the same pass-through.
 *
 * Load dates are calendar dates stored at UTC midnight, so the date part of
 * an ISO string IS the date, and it is formatted in UTC so a non-UTC host
 * does not print the day before.
 *
 * A string that is not a date passes through unchanged: an AE may type
 * something like "TBD" and the document should say what they wrote.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

export function documentDate(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).trim();
    const m = ISO_DATE.exec(s);
    if (!m) return s;
    d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}
