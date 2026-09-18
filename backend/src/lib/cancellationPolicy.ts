/**
 * Cancellation reasons and the fault party each one implies — decided once.
 *
 * WHY A CLOSED VOCABULARY. A free-text reason cannot be grouped, cannot be
 * compared across loads, and above all cannot say WHOSE failure it was — and
 * that last question decides money and standing: §9 scores a carrier's
 * acceptance rate and communication, and a load the shipper pulled must not
 * mark the carrier who was ready to haul it. So the reason is an enum, the
 * fault party is DERIVED from the reason here rather than chosen separately
 * (two fields an AE picks independently is two fields that disagree), and the
 * free text survives only as the note — required when the reason is OTHER,
 * because "other" with no note is no reason at all.
 *
 * FaultParty.SHIPPER and Load.tonuFaultSide "CUSTOMER" ARE THE SAME PARTY.
 * tonuFaultSide predates this enum (Arc 2, Item 5) and keeps its vocabulary;
 * decision 3 of 2026-09-18 banks its migration onto FaultParty to a hold/
 * branch. Until then TONU_SIDE_TO_FAULT_PARTY is the bridge, and it lives here
 * so nobody re-derives the equivalence in a controller.
 */

import type { CancellationReason, FaultParty } from "@prisma/client";
import type { TonuFaultSide } from "./tonuPolicy";

/** Every reason, in the order a picker should show them. */
export const CANCELLATION_REASONS: readonly CancellationReason[] = [
  "SHIPPER_FREIGHT_NOT_READY",
  "SHIPPER_CANCELLED",
  "SHIPPER_APPOINTMENT_CHANGE",
  "CARRIER_NO_SHOW",
  "CARRIER_LATE",
  "CARRIER_EQUIPMENT_FAILURE",
  "CARRIER_FELL_OFF",
  "BROKER_RATE_ISSUE",
  "BROKER_COMPLIANCE_HOLD",
  "DUPLICATE_ENTRY",
  "OTHER",
];

/**
 * The single mapping. DUPLICATE_ENTRY and OTHER are NONE: a duplicate row is
 * a data-entry slip in which no freight failed, and an unclassified reason
 * must never be read as anyone's fault — NONE is the direction that cannot
 * wrongly penalise a carrier.
 */
export const REASON_FAULT_PARTY: Readonly<Record<CancellationReason, FaultParty>> = {
  SHIPPER_FREIGHT_NOT_READY: "SHIPPER",
  SHIPPER_CANCELLED: "SHIPPER",
  SHIPPER_APPOINTMENT_CHANGE: "SHIPPER",
  CARRIER_NO_SHOW: "CARRIER",
  CARRIER_LATE: "CARRIER",
  CARRIER_EQUIPMENT_FAILURE: "CARRIER",
  CARRIER_FELL_OFF: "CARRIER",
  BROKER_RATE_ISSUE: "BROKER",
  BROKER_COMPLIANCE_HOLD: "BROKER",
  DUPLICATE_ENTRY: "NONE",
  OTHER: "NONE",
};

/** Load.tonuFaultSide vocabulary → FaultParty. CUSTOMER ≡ SHIPPER. */
export const TONU_SIDE_TO_FAULT_PARTY: Readonly<Record<TonuFaultSide, FaultParty>> = {
  CUSTOMER: "SHIPPER",
  CARRIER: "CARRIER",
  BROKER: "BROKER",
};

export const MIN_CANCELLATION_NOTE_LENGTH = 10;

export function isCancellationReason(v: unknown): v is CancellationReason {
  return typeof v === "string" && (CANCELLATION_REASONS as readonly string[]).includes(v);
}

export function faultPartyFor(reason: CancellationReason): FaultParty {
  return REASON_FAULT_PARTY[reason];
}

export function requiresNote(reason: CancellationReason): boolean {
  return reason === "OTHER";
}

/** The one question scoring asks. Only CARRIER counts against a carrier. */
export function carrierAtFault(party: FaultParty | null | undefined): boolean {
  return party === "CARRIER";
}

export type CancellationInputVerdict =
  | { ok: true; reason: CancellationReason; faultParty: FaultParty; note: string | null }
  | { ok: false; code: "REASON_CODE_REQUIRED" | "REASON_CODE_INVALID" | "NOTE_REQUIRED"; message: string };

/**
 * Validate what a cancel request carried. Used by the Zod refine AND by the
 * controller, so the rule is stated once and the controller cannot be reached
 * with an input the validator would have refused (Sub-pattern 5).
 */
export function assessCancellationInput(input: {
  cancellationReasonCode?: unknown;
  cancellationReason?: unknown;
}): CancellationInputVerdict {
  const code = input.cancellationReasonCode;
  if (code === undefined || code === null || code === "") {
    return {
      ok: false,
      code: "REASON_CODE_REQUIRED",
      message: `A cancellation must carry a reason code. One of: ${CANCELLATION_REASONS.join(", ")}.`,
    };
  }
  if (!isCancellationReason(code)) {
    return { ok: false, code: "REASON_CODE_INVALID", message: `Unknown cancellation reason "${String(code)}".` };
  }
  const rawNote = typeof input.cancellationReason === "string" ? input.cancellationReason.trim() : "";
  if (requiresNote(code) && rawNote.length < MIN_CANCELLATION_NOTE_LENGTH) {
    return {
      ok: false,
      code: "NOTE_REQUIRED",
      message: `Reason OTHER needs a note of at least ${MIN_CANCELLATION_NOTE_LENGTH} characters saying what happened.`,
    };
  }
  return { ok: true, reason: code, faultParty: faultPartyFor(code), note: rawNote || null };
}
