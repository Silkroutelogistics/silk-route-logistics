/**
 * Canonical Quick Pay pricing — CLAUDE.md §8 (LOCKED).
 *
 * Single source of truth for the tier→fee mapping so the charge site can never
 * again drift from the tier cards the carrier sees. v3.8.aqq fixed a drift where
 * the request-quickpay endpoint charged Silver 2% / Gold 1.5% while §8 (and the
 * carrier portal) publish Silver 3% / Gold 2% / Platinum 1%.
 *
 *   7-day standard QP:  Silver 3%  · Gold 2%  · Platinum 1%
 *   Same-day QP:        +2% universal premium (Silver 5% · Gold 4% · Platinum 3%)
 *   Free standard net:  Silver Net-30 · Gold Net-21 · Platinum Net-14
 */

// §8 LOCKED — do not change without a versioned §8 update.
const SEVEN_DAY_FEE: Record<"SILVER" | "GOLD" | "PLATINUM", number> = {
  SILVER: 3,
  GOLD: 2,
  PLATINUM: 1,
};
const STANDARD_NET_DAYS: Record<"SILVER" | "GOLD" | "PLATINUM", number> = {
  SILVER: 30,
  GOLD: 21,
  PLATINUM: 14,
};
// Same-day is a universal +2% premium on the tier's 7-day fee (§8 "Critical rule").
export const SAME_DAY_PREMIUM = 2;

/** Normalize any stored tier to the three canonical tiers (GUEST/NONE → Silver entry). */
export function normalizeTier(tier?: string | null): "SILVER" | "GOLD" | "PLATINUM" {
  const t = (tier || "SILVER").toUpperCase();
  if (t === "PLATINUM") return "PLATINUM";
  if (t === "GOLD") return "GOLD";
  return "SILVER";
}

/** Quick Pay fee percent for a tier. sameDay adds the universal +2% premium. */
export function quickPayFeePercent(tier?: string | null, sameDay = false): number {
  return SEVEN_DAY_FEE[normalizeTier(tier)] + (sameDay ? SAME_DAY_PREMIUM : 0);
}

/** Free standard (non-QuickPay) net terms in days for a tier. */
export function standardNetDays(tier?: string | null): number {
  return STANDARD_NET_DAYS[normalizeTier(tier)];
}
