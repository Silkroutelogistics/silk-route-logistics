// What SRL agreed to pay the carrier, resolved at the moment of accept.
//
// WHY THIS EXISTS. `Load.carrierRate` was written by exactly five sites, none of
// them a tender-accept path. So a load could be accepted, hauled, delivered and
// settled with `carrierRate` still null — and `createCarrierPayOnDelivery` fell
// back to `load.rate`, which `loadController.createLoad` populates from the
// CUSTOMER rate. The carrier was settled at 100% of SRL's revenue, silently, on
// a document that looked ordinary. (§13.3 Item 221.1.)
//
// Four paths accept a carrier onto a load, and each holds the agreed number in a
// different field. Left to themselves they will drift — so the resolution lives
// here once and they all call it.
//
// THE COUNTER-OFFER CASE IS THE ONE THAT COSTS MONEY. `acceptTenderOnBehalf`
// accepts a tender in status OFFERED **or COUNTERED**. When an AE accepts a
// COUNTERED tender they are accepting the carrier's counter, not SRL's original
// offer. Reading `offeredRate` there would underpay the carrier by exactly the
// counter delta, on a rate confirmation the carrier signed. That is a dispute
// with the carrier holding the paperwork.

/** A tender, in the shape the accept paths already have loaded. */
export interface TenderRateShape {
  status: string;
  offeredRate: number | null;
  counterRate?: number | null;
}

/**
 * The rate SRL agreed to pay, for a tender being accepted.
 *
 * Returns null when neither field carries a number — the caller must treat that
 * as an error rather than substituting anything. There is no safe default for
 * "what we owe someone".
 */
export function agreedRateFromTender(tender: TenderRateShape): number | null {
  // A COUNTERED tender is the carrier's number. Accepting it means accepting
  // that number.
  if (tender.status === "COUNTERED" && tender.counterRate != null) {
    return Number(tender.counterRate);
  }
  // Defensive: a counter recorded without the status having moved still
  // represents the last thing the carrier asked for. Preferring it cannot
  // underpay; ignoring it can.
  if (tender.counterRate != null && tender.status !== "OFFERED") {
    return Number(tender.counterRate);
  }
  return tender.offeredRate == null ? null : Number(tender.offeredRate);
}

/**
 * The rate agreed on a waterfall position (`WaterfallPosition.offeredRate`) or a
 * loadboard bid (`LoadBid.bidRate`). Both are single-number agreements with no
 * counter step, so this only normalises Decimal/null.
 */
export function agreedRateFromValue(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
