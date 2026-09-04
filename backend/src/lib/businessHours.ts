/**
 * SRL's published business hours. One fact, read by everything that states or
 * enforces it.
 *
 * WHY THIS FILE EXISTS. §5 of the Caravan Quick Pay Agreement decides same-day
 * versus next-day funding on these hours, and used to defer to "Broker's
 * published business hours" without publishing them anywhere in the signed
 * instrument. A carrier reading the agreement alone could not find the cutoff
 * that decides when they get paid — the only published statement was on
 * /contact and /carriers, which are not part of what they signed.
 *
 * The agreement now states the hours inline and GENERATES that sentence from
 * these constants, and integrationService.sameDayQuickPayDueDate enforces the
 * cutoff from the same ones. Moving either number moves both the enforcement
 * and the words a carrier signed, together, and changes the contentHash.
 *
 * It lives in lib/ rather than in integrationService because a legal-text data
 * module must not import a service: agreements.ts would otherwise pull prisma,
 * invoiceService and the rest of the operational graph in behind it. Same shape
 * as lib/accessorialPolicy and lib/quickPayPricing, which agreements.ts already
 * reads. integrationService re-exports them, so existing consumers are
 * unaffected.
 *
 * These are CLAUDE.md §6: Monday to Friday, 7:00 AM to 7:00 PM Eastern.
 */
export const BUSINESS_TZ = "America/New_York";
export const BUSINESS_OPEN_HOUR = 7;
export const BUSINESS_CLOSE_HOUR = 19;

/** "7:00 AM" for an hour in 24h form. Used to render the hours in prose. */
export function formatBusinessHour(hour24: number): string {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h}:00 ${suffix}`;
}

/** "7:00 AM to 7:00 PM Eastern, Monday to Friday" — the published window. */
export const BUSINESS_HOURS_SENTENCE =
  `${formatBusinessHour(BUSINESS_OPEN_HOUR)} to ${formatBusinessHour(BUSINESS_CLOSE_HOUR)} Eastern, Monday to Friday`;
