// TONU fault-side policy and the carrier release window.
//
// Arc 2 Item 5 / carrier-lifecycle audit F-7. Both terms were ratified
// 2026-08-15 and neither had any code behind it: onLoadCancelledOrTONU only
// REVERSES (voids AP, reverses credit and funding, cancels tenders), there is
// no customer-side TONU charge anywhere in the billing path, and nothing
// enforces the release window.
//
// This module is the decision layer only. It answers "given a fault side, who
// gets billed and who gets paid" as a pure function, and records the fault side
// on the load. It deliberately does NOT post the invoice line or the settlement
// payable — see the note at the bottom of this file and §13.3 for why the
// activation is banked rather than shipped half-live.
//
// Amounts always come from the ratified schedule in accessorialPolicy
// (TONU_AMOUNT, single source since v3.8.asc). Nothing here hardcodes a figure.

import { TONU_AMOUNT, CARRIER_RELEASE_WINDOW_HOURS } from "./accessorialPolicy";

/**
 * Who caused the truck not to be used.
 *
 *  CUSTOMER — the shipper cancelled, or the freight was not there.
 *  BROKER   — SRL cancelled, double-covered, or mis-tendered.
 *  CARRIER  — the carrier failed to show or released too late to recover.
 */
export type TonuFaultSide = "CUSTOMER" | "CARRIER" | "BROKER";

export const TONU_FAULT_SIDES: readonly TonuFaultSide[] = ["CUSTOMER", "CARRIER", "BROKER"] as const;

export function isTonuFaultSide(v: unknown): v is TonuFaultSide {
  return typeof v === "string" && (TONU_FAULT_SIDES as readonly string[]).includes(v);
}

export interface TonuBillingDecision {
  /** Raise the TONU accessorial against the customer invoice. */
  billCustomer: boolean;
  /** Owe the carrier TONU through the settlement path. */
  payCarrier: boolean;
  /** Ratified flat amount, from accessorialPolicy. Same figure both directions. */
  amount: number;
  /** Plain-language reason, suitable for an audit row or an AE-facing message. */
  rationale: string;
}

/**
 * The two-sided rule, ratified 2026-08-15.
 *
 * The customer is billed when the failure was theirs. The carrier is paid when
 * the failure was not theirs — that is, when SRL or the customer caused it. The
 * two are independent: a customer-fault TONU both bills the customer and pays
 * the carrier, which is the normal case and the reason the term is called
 * "two-sided" at all. A broker-fault TONU pays the carrier out of SRL's own
 * margin and bills nobody, which is the correct and deliberately uncomfortable
 * outcome of SRL causing the failure.
 *
 * A carrier-fault TONU pays nothing and bills nobody. The existing reversal
 * path in onLoadCancelledOrTONU already handles unwinding whatever was staged,
 * and that behaviour is unchanged.
 */
export function resolveTonuBilling(faultSide: TonuFaultSide): TonuBillingDecision {
  switch (faultSide) {
    case "CUSTOMER":
      return {
        billCustomer: true,
        payCarrier: true,
        amount: TONU_AMOUNT,
        rationale: "Customer caused the failure: customer is billed TONU and the carrier is paid TONU.",
      };
    case "BROKER":
      return {
        billCustomer: false,
        payCarrier: true,
        amount: TONU_AMOUNT,
        rationale: "SRL caused the failure: the carrier is paid TONU and it comes out of margin. Nobody is billed.",
      };
    case "CARRIER":
      return {
        billCustomer: false,
        payCarrier: false,
        amount: 0,
        rationale: "Carrier caused the failure: no TONU is owed in either direction; existing reversal applies.",
      };
  }
}

export interface CarrierReleaseAssessment {
  penaltyFree: boolean;
  hoursBeforePickup: number;
  windowHours: number;
  rationale: string;
}

/**
 * The 4-hour carrier release window, ratified 2026-08-15.
 *
 * This is the CARRIER'S window: they may release a load up to
 * CARRIER_RELEASE_WINDOW_HOURS before pickup without penalty. It is NOT a
 * window for SRL to cancel penalty-free — that misreading is what made this
 * clause and the TONU clause contradict each other on the same signed page,
 * and it is corrected in CLAUDE.md §5 and in pdfService's own comment.
 *
 * Measured BEFORE PICKUP, not before tender acceptance. The Rate Confirmation
 * and accessorialPolicy both say "before pickup", and the item that
 * commissioned this work said "within 4 hours of acceptance" — the printed
 * clause wins, per instruction to read the template as source of truth. Logged
 * as a divergence for Wasi in §13.3 rather than silently picking one.
 *
 * A release at exactly the boundary is penalty-free: the clause says "up to",
 * which reads inclusively in the carrier's favour, and a boundary case on a
 * penalty is the right place to be generous.
 */
export function assessCarrierRelease(
  releasedAt: Date,
  pickupDate: Date,
  windowHours: number = CARRIER_RELEASE_WINDOW_HOURS,
): CarrierReleaseAssessment {
  const hoursBeforePickup = (pickupDate.getTime() - releasedAt.getTime()) / 3_600_000;
  const penaltyFree = hoursBeforePickup >= windowHours;
  return {
    penaltyFree,
    hoursBeforePickup,
    windowHours,
    rationale: penaltyFree
      ? `Released ${hoursBeforePickup.toFixed(1)}h before pickup, at or outside the ${windowHours}h window: no penalty.`
      : `Released ${hoursBeforePickup.toFixed(1)}h before pickup, inside the ${windowHours}h window: penalty may apply.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOT WIRED LIVE — deliberately.
//
// resolveTonuBilling decides correctly and is tested, but nothing in this arc
// posts the customer invoice line or the carrier settlement payable from it.
// That wiring touches invoiceService's accessorial path and the carrierPay /
// settlement path, both of which move real money, and the item that
// commissioned this work said plainly that a half-live billing change is worse
// than a banked one.
//
// What exists now: the fault side is captured and required at the TONU flip, so
// no TONU can be recorded without someone saying whose fault it was, and the
// decision function is here and correct for when the billing legs are built.
// What does not: the two legs. Banked in §13.3 with the exact call sites.
// ─────────────────────────────────────────────────────────────────────────────
