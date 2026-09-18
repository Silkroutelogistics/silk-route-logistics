// Single source of truth for cancellation reasons, the fault party each one
// implies, and the words a person sees for them. Consumed by the frontend (via
// the @shared alias) and the backend (via rootDir + include), the same bridge
// shared/constants/infoRequestCategories.ts uses — and for the same reason:
// the third hand-kept copy of a vocabulary is the one that drifts.
//
// WHY THE FAULT PARTY IS DERIVED, NOT PICKED. It decides whether a carrier is
// marked (§9 scores acceptance and communication), so it is a consequence of
// the reason and never a second field an AE chooses beside it. The modal shows
// it read-only for exactly that reason: the AE sees what their choice implies
// before confirming, and cannot edit the implication.
//
// The KEYS are the Prisma `CancellationReason` and `FaultParty` enums, in the
// order a picker should show them. backend/src/lib/cancellationPolicy.ts
// re-exports these under the Prisma types, and its test holds the list equal
// to the enum as schema.prisma declares it — so a value added here without a
// migration, or a migration without an entry here, fails the suite.

export type CancellationReason =
  | "SHIPPER_FREIGHT_NOT_READY"
  | "SHIPPER_CANCELLED"
  | "SHIPPER_APPOINTMENT_CHANGE"
  | "CARRIER_NO_SHOW"
  | "CARRIER_LATE"
  | "CARRIER_EQUIPMENT_FAILURE"
  | "CARRIER_FELL_OFF"
  | "BROKER_RATE_ISSUE"
  | "BROKER_COMPLIANCE_HOLD"
  | "DUPLICATE_ENTRY"
  | "OTHER";

export type FaultParty = "SHIPPER" | "CARRIER" | "BROKER" | "NONE";

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

/** Dropdown labels. Each must survive being read inside a sentence. */
export const CANCELLATION_REASON_LABELS: Readonly<Record<CancellationReason, string>> = {
  SHIPPER_FREIGHT_NOT_READY: "Shipper: freight not ready",
  SHIPPER_CANCELLED: "Shipper: cancelled the order",
  SHIPPER_APPOINTMENT_CHANGE: "Shipper: appointment changed",
  CARRIER_NO_SHOW: "Carrier: no-show",
  CARRIER_LATE: "Carrier: late to pickup",
  CARRIER_EQUIPMENT_FAILURE: "Carrier: equipment failure",
  CARRIER_FELL_OFF: "Carrier: fell off the load",
  BROKER_RATE_ISSUE: "SRL: rate could not be agreed",
  BROKER_COMPLIANCE_HOLD: "SRL: compliance hold",
  DUPLICATE_ENTRY: "Duplicate entry",
  OTHER: "Other (note required)",
};

export const FAULT_PARTY_LABELS: Readonly<Record<FaultParty, string>> = {
  SHIPPER: "Shipper",
  CARRIER: "Carrier",
  BROKER: "SRL",
  NONE: "No one",
};

/**
 * What the fault party means for the carrier's record — the sentence the AE
 * reads beside the derived value. Only CARRIER counts against a carrier (§9).
 */
export const FAULT_PARTY_CONSEQUENCE: Readonly<Record<FaultParty, string>> = {
  SHIPPER: "The carrier is not marked. The shipper's cancellation count rises.",
  CARRIER: "This counts against the carrier's record.",
  BROKER: "SRL's own. The carrier is not marked.",
  NONE: "Nobody is marked.",
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

/**
 * The one client-side gate. True when the reason is chosen and, if it is
 * OTHER, the trimmed note reaches the minimum. Pure, so the modal's submit
 * button and the server's assessCancellationInput answer the same question
 * from the same numbers — a modal that lets a submission through which the
 * server then refuses is a modal that has taught the AE to distrust the button.
 */
export function cancellationInputComplete(reason: CancellationReason | "" | null | undefined, note: string): boolean {
  if (!reason || !isCancellationReason(reason)) return false;
  if (!requiresNote(reason)) return true;
  return note.trim().length >= MIN_CANCELLATION_NOTE_LENGTH;
}
