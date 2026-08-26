/**
 * What a rate figure says when there is no rate to say.
 *
 * Load.rate is a write-only mirror (§13.3 Item 227) whose meaning depends on
 * which path created the load: the CUSTOMER rate on loadController.createLoad,
 * the CARRIER rate on withTenderController. Every display that fell back to it
 * was therefore showing one of two different numbers and could not say which.
 *
 * THE FALLBACK WAS THE BUG, not a safety net. `carrierRate || rate` on the
 * carrier portal renders the customer rate to a carrier when carrierRate is
 * null — that is SRL's revenue shown to the party we pay out of it. Removing
 * the fallback means a load nobody has accepted has nothing to show, which is
 * true and is what an em-dash is for.
 *
 * A dash is not a failure state. It reads as "not set yet", which is exactly
 * the situation, whereas $0 reads as a priced load worth nothing and invites
 * somebody to act on it.
 */

/** Em-dash. The one place the string lives, so surfaces cannot disagree. */
export const NO_VALUE = "—";

/**
 * Format money, or say there is none.
 *
 * Accepts null/undefined/NaN and returns the dash for all three. NaN matters:
 * it is what arithmetic on a missing rate produces, and `$NaN` on a carrier's
 * pay figure is worse than either a dash or a zero.
 */
export function money(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return NO_VALUE;
  // Rounded. The two spellings this replaces disagreed — my-loads rounded, the
  // other carrier surfaces did not — so a rate of 4850.5 rendered "$4,851" on
  // one screen and "$4,850.5" on the next. Rounding is the more careful of the
  // two and cents do not belong on a linehaul figure.
  return `$${Math.round(amount).toLocaleString()}`;
}

/**
 * Per-mile, or nothing.
 *
 * Guards the divisor as well as the numerator — distance is nullable and zero
 * is a real stored value, so an unguarded divide yields Infinity and renders
 * "$Infinity/mi".
 */
export function perMile(amount: number | null | undefined, distance: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return NO_VALUE;
  if (!distance || distance <= 0 || Number.isNaN(distance)) return NO_VALUE;
  return `$${(amount / distance).toFixed(2)}/mi`;
}

/**
 * What SRL pays this carrier for this load, or null if it is not settled yet.
 *
 * NO FALLBACK TO rate. A load that has not been accepted has no agreed carrier
 * rate, and the honest answer is that there isn't one — not the customer's
 * number wearing the carrier's label.
 */
export function carrierPay(load: { carrierRate?: number | null }): number | null {
  const v = load.carrierRate;
  return v === null || v === undefined || Number.isNaN(v) ? null : v;
}

/**
 * What the customer is billed, or null.
 *
 * Prefers an invoiced total where the surface has one, because an invoice is
 * the billed fact and customerRate is only the intent. Falls back to
 * customerRate — never to `rate`.
 */
export function customerBilled(load: {
  invoicedTotal?: number | null;
  customerRate?: number | null;
}): number | null {
  const inv = load.invoicedTotal;
  if (inv !== null && inv !== undefined && !Number.isNaN(inv)) return inv;
  const v = load.customerRate;
  return v === null || v === undefined || Number.isNaN(v) ? null : v;
}

/**
 * Margin, from what the customer is billed minus what the carrier is paid.
 *
 * Null unless BOTH sides are known. A margin computed against a missing cost
 * is just the revenue with a different label, and it would read as 100%.
 */
export function margin(billed: number | null, carrierCost: number | null): number | null {
  if (billed === null || carrierCost === null) return null;
  return billed - carrierCost;
}

/** Margin as a percentage of what was billed, or null. */
export function marginPct(billed: number | null, carrierCost: number | null): number | null {
  const m = margin(billed, carrierCost);
  if (m === null || !billed || billed <= 0) return null;
  return (m / billed) * 100;
}

/** Percentage display, or the dash. */
export function pct(value: number | null): string {
  return value === null || Number.isNaN(value) ? NO_VALUE : `${value.toFixed(1)}%`;
}
