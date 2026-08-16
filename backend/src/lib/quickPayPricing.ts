/**
 * Canonical Quick Pay economics — CLAUDE.md §8 (LOCKED) and Caravan Quick Pay
 * Agreement §4 and §6.
 *
 * THIS IS THE ONLY FEE RESOLVER. Nothing else may hold a tier→fee table, a
 * tier→net-terms table, or a tier→approval-limit table. Four resolvers used to
 * disagree here, and one of them was keyed on the RETIRED PaymentTier names
 * (FLASH / EXPRESS / PRIORITY / PARTNER / ELITE) with a PARTNER rung at 1.5%
 * that exists in no version of §8. If you need a Quick Pay number, import it
 * from this file.
 *
 *   7-day standard QP:  Silver 3%  · Gold 2%  · Platinum 1%
 *   Same-day QP:        +2% universal premium (Silver 5% · Gold 4% · Platinum 3%)
 *   Free standard net:  Silver Net-30 · Gold Net-21 · Platinum Net-14
 *   Auto-approve/load:  Silver $2,000 · Gold $4,000 · Platinum $6,000
 *   Rolling month cap:  Silver $15,000 · Gold $40,000 · Platinum $80,000
 *
 * These match caravanService TIER_CONFIG exactly. TIER_CONFIG stores rates as
 * decimals (0.03); this module works in whole percent (3) because that is what
 * the rate confirmation prints and what CarrierPay.quickPayFeePercent stores.
 */

export type CaravanTier = "SILVER" | "GOLD" | "PLATINUM";

/**
 * The three Quick Pay speeds. STANDARD is not Quick Pay at all — it is the
 * carrier's free tier net terms, and it always carries a zero fee.
 */
export type QuickPaySpeed = "STANDARD" | "QP_7DAY" | "QP_SAMEDAY";

// §8 LOCKED — do not change without a versioned §8 update.
const SEVEN_DAY_FEE: Record<CaravanTier, number> = {
  SILVER: 3,
  GOLD: 2,
  PLATINUM: 1,
};
const STANDARD_NET_DAYS: Record<CaravanTier, number> = {
  SILVER: 30,
  GOLD: 21,
  PLATINUM: 14,
};
// Quick Pay Agreement §6 — auto-approve ceilings. Above these the payment is
// not denied, it is queued for review. "Auto-approved up to" is a review
// trigger, never a refusal.
const AUTO_APPROVE_PER_LOAD: Record<CaravanTier, number> = {
  SILVER: 2000,
  GOLD: 4000,
  PLATINUM: 6000,
};
const MONTHLY_LIMIT: Record<CaravanTier, number> = {
  SILVER: 15000,
  GOLD: 40000,
  PLATINUM: 80000,
};

// Same-day is a universal +2% premium on the tier's 7-day fee (§8 "Critical rule").
export const SAME_DAY_PREMIUM = 2;

/** Normalize any stored tier to the three canonical tiers (GUEST/NONE → Silver entry). */
export function normalizeTier(tier?: string | null): CaravanTier {
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

/** Quick Pay Agreement §6 — per-load auto-approve ceiling for a tier. */
export function quickPayAutoApprovePerLoad(tier?: string | null): number {
  return AUTO_APPROVE_PER_LOAD[normalizeTier(tier)];
}

/** Quick Pay Agreement §6 — rolling calendar-month auto-approve ceiling for a tier. */
export function quickPayMonthlyLimit(tier?: string | null): number {
  return MONTHLY_LIMIT[normalizeTier(tier)];
}

/**
 * Maps the legacy PaymentTier enum to a Quick Pay speed.
 *
 * PaymentTier is a reporting label on CarrierPay, not a price. Its members are
 * the RETIRED speed names from before the Caravan ladder; the enum still exists
 * because rows carry those values. Sprint 33 fixed the canonical mapping and
 * the AE rate-confirmation modal has used it since
 * (RateConfirmationModal.uiKeyFromEnum) — this is the server-side twin of that
 * map, so a legacy row prices the same on both sides of the wire.
 *
 * The price always comes from the carrier's Caravan tier. The enum only says
 * how fast, never how much.
 */
export function speedFromPaymentTier(paymentTier?: string | null): QuickPaySpeed {
  switch ((paymentTier || "STANDARD").toUpperCase()) {
    case "FLASH":
    case "EXPRESS":
      return "QP_SAMEDAY";
    case "PRIORITY":
    case "PARTNER":
      return "QP_7DAY";
    // ELITE, STANDARD and anything unrecognised are free tier terms at no fee.
    default:
      return "STANDARD";
  }
}

/** The PaymentTier reporting label that corresponds to a speed. */
export function paymentTierFromSpeed(speed: QuickPaySpeed): "FLASH" | "PRIORITY" | "STANDARD" {
  if (speed === "QP_SAMEDAY") return "FLASH";
  if (speed === "QP_7DAY") return "PRIORITY";
  return "STANDARD";
}

/**
 * Fee percent for a carrier's Caravan tier at the speed a PaymentTier row
 * represents. STANDARD is always zero — free tier terms are free (§3).
 *
 * PRICES, DOES NOT AUTHORIZE. As of v3.8.asc this has no production callers,
 * and that is deliberate: deriving a live fee from a PaymentTier label is the
 * shape of the defect that let `PUT /accounting/payments/:id` deduct 3% from a
 * carrier who had signed no Quick Pay Agreement. A real charge is the
 * percentage recorded on the load, gated by the three §3 conditions (fee
 * recorded on the load, agreement signed, Quick Pay enabled).
 *
 * Use this to DISPLAY what a tier's published rate would be — the §4 schedule
 * on a page, a quote, a projection. Never to compute a deduction.
 */
export function quickPayFeePercentForPaymentTier(
  caravanTier: string | null | undefined,
  paymentTier: string | null | undefined,
): number {
  const speed = speedFromPaymentTier(paymentTier);
  if (speed === "STANDARD") return 0;
  return quickPayFeePercent(caravanTier, speed === "QP_SAMEDAY");
}
