/**
 * v3.8.bki — what the Track & Trace drawer needs to know about a load that
 * has stopped moving. The History tab lists CANCELLED, TONU and COMPLETED loads,
 * and every tab of the drawer was written for a load in motion: no tab said why
 * a load was cancelled or whose fault it was, the Finance tab priced a cancelled
 * load's linehaul as though it were billed, and "Log call" was offered on a load
 * no truck was ever going to run.
 *
 * The labels come from shared/constants/cancellationReasons, the vocabulary the
 * server records, so the drawer cannot name a party the cancel modal did not.
 */
import {
  CANCELLATION_REASON_LABELS,
  FAULT_PARTY_LABELS,
  TONU_SIDE_TO_FAULT_PARTY,
  isCancellationReason,
  type FaultParty,
  type TonuFaultSideValue,
} from "@shared/constants/cancellationReasons";

/** No check call is due on these, and none can move the load. */
export const CHECK_CALLS_CLOSED_STATUSES = ["CANCELLED", "TONU", "COMPLETED"] as const;

export function checkCallsClosed(status: unknown): boolean {
  return (CHECK_CALLS_CLOSED_STATUSES as readonly string[]).includes(String(status ?? ""));
}

export type LoadClosure =
  | {
      kind: "CANCELLED";
      /** The coded reason's label, or null when the load predates coded reasons. */
      reason: string | null;
      /** The AE's free text. On a pre-code load this is the only reason there is. */
      note: string | null;
      fault: string | null;
      at: string | null;
    }
  | { kind: "TONU"; fault: string | null; at: string | null };

function faultLabel(party: unknown): string | null {
  if (typeof party !== "string" || !(party in FAULT_PARTY_LABELS)) return null;
  return FAULT_PARTY_LABELS[party as FaultParty];
}

/** Null for every load that is neither cancelled nor a TONU. */
export function loadClosure(load: any): LoadClosure | null {
  if (!load) return null;
  const note = typeof load.cancellationReason === "string" && load.cancellationReason.trim()
    ? load.cancellationReason.trim()
    : null;

  if (load.status === "CANCELLED") {
    // `unknown`, not the load's `any`: a type guard cannot narrow `any`.
    const code: unknown = load.cancellationReasonCode;
    return {
      kind: "CANCELLED",
      reason: isCancellationReason(code) ? CANCELLATION_REASON_LABELS[code] : null,
      note,
      fault: faultLabel(load.cancellationFaultParty),
      at: load.cancelledAt ?? null,
    };
  }

  if (load.status === "TONU") {
    const side = load.tonuFaultSide as TonuFaultSideValue | null | undefined;
    const party = side && side in TONU_SIDE_TO_FAULT_PARTY ? TONU_SIDE_TO_FAULT_PARTY[side] : null;
    return {
      kind: "TONU",
      fault: faultLabel(party),
      // A TONU writes tonuFaultSide and statusUpdatedAt, never cancelledAt; the
      // flip to TONU is terminal, so statusUpdatedAt is when it happened.
      at: load.cancelledAt ?? load.statusUpdatedAt ?? null,
    };
  }

  return null;
}
