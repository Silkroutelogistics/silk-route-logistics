// v3.8.ajw C3 — Load lifecycle state-machine validator.
//
// Closes §13.3 Item 159's carrier-side surface specifically. Full refactor of
// the 13+ AE-side write sites stays banked as the Item 159 multi-day epic
// (Sprint 53+). This module is the canonical reference + the wired-in gate
// on the highest-risk single surface: POST /api/carrier-loads/:id/status.
//
// CarrierProfile = the system; carrier driver = the actor most likely to
// produce a bogus transition (BOOKED → DELIVERED skip, AT_PICKUP → IN_TRANSIT
// skip, backwards jumps). Pre-ajw the carrier-side endpoint accepted any of
// {AT_PICKUP, LOADED, IN_TRANSIT, AT_DELIVERY, DELIVERED} regardless of
// current load state. A driver tapping "Mark Delivered" on a fresh tender
// would flip the load from BOOKED straight to DELIVERED — downstream
// invoice/POD flow then fires on a load that never went through pickup.
//
// Canonical happy-path pipeline (§A.1):
//   DRAFT → POSTED → TENDERED → BOOKED → DISPATCHED →
//   AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED →
//   POD_RECEIVED → INVOICED → COMPLETED
//
// Plus terminal aborts: TONU, CANCELLED. Plus legacy alias: PICKED_UP.
// CONFIRMED is an optional alias between TENDERED and BOOKED (rarely used in
// modern flows; accepted as an upstream state from carrier-side for
// backward-compat).

import { LoadStatus } from "@prisma/client";

/**
 * WHO the rules are being applied FOR -- which is the RULE SET that governs the
 * transition, not the human who pressed the button.
 *
 * AE is a person moving a load through the ordinary pipeline. AUTO is the
 * PLATFORM performing a dispatch or a recovery move: auto-pilot accept,
 * loadboard-bid accept, fall-off recovery, release. A loadboard bid is accepted
 * by an AE and is still AUTO, because what happens next is auto-pilot dispatch
 * semantics rather than the AE-curated BOOKED checkpoint.
 */
export type ActorRole = "CARRIER" | "AE" | "AUTO";

/**
 * Carrier-side transitions: what a logged-in carrier may transition a load
 * FROM (key) TO (values). Strictly forward-only; backwards jumps blocked;
 * skip-ahead blocked. Terminal aborts (TONU, CANCELLED) NOT available to
 * carrier-side — those require AE action.
 *
 * BOOKED + DISPATCHED + CONFIRMED all share the same allowed "next" set
 * because operationally these are interchangeable upstream states from the
 * driver's perspective (AE may have used either to arm the load for pickup).
 */
const CARRIER_ALLOWED_TRANSITIONS: Partial<Record<LoadStatus, LoadStatus[]>> = {
  BOOKED: ["AT_PICKUP"],
  DISPATCHED: ["AT_PICKUP"],
  CONFIRMED: ["AT_PICKUP"],
  AT_PICKUP: ["LOADED"],
  LOADED: ["IN_TRANSIT"],
  IN_TRANSIT: ["AT_DELIVERY"],
  AT_DELIVERY: ["DELIVERED"],
};

/**
 * v3.8.akb Item 159 Sprint 1 — AE-side transitions, consolidated from the
 * pre-existing inline VALID_TRANSITIONS map in loadController.ts (lines
 * 425-444 pre-akb). AE actor can move loads through more states than
 * carrier (early DRAFT/PLANNED authoring, terminal aborts TONU/CANCELLED,
 * accounting flow DELIVERED → POD_RECEIVED → INVOICED → COMPLETED).
 *
 * Same forward-bias as carrier-side: most transitions are progress;
 * documented backward step is TENDERED → POSTED (un-tender by the AE).
 * Other backward jumps banked as Item 159 Sprint 2 (selective unblock).
 *
 * PICKED_UP retained as a legacy alias — pre-PICKED_UP loads can advance
 * to IN_TRANSIT, but new flows should land at LOADED + IN_TRANSIT instead.
 */
const AE_ALLOWED_TRANSITIONS: Partial<Record<LoadStatus, LoadStatus[]>> = {
  DRAFT: ["PLANNED", "POSTED", "CANCELLED"],
  PLANNED: ["POSTED", "CANCELLED"],
  POSTED: ["TENDERED", "BOOKED", "CANCELLED"],
  TENDERED: ["CONFIRMED", "BOOKED", "POSTED", "CANCELLED"],
  CONFIRMED: ["BOOKED", "DISPATCHED", "CANCELLED"],
  BOOKED: ["DISPATCHED", "CANCELLED", "TONU"],
  DISPATCHED: ["AT_PICKUP", "CANCELLED", "TONU"],
  AT_PICKUP: ["LOADED", "PICKED_UP", "CANCELLED", "TONU"],
  LOADED: ["IN_TRANSIT", "PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["AT_DELIVERY"],
  AT_DELIVERY: ["DELIVERED"],
  DELIVERED: ["POD_RECEIVED", "INVOICED", "COMPLETED"],
  POD_RECEIVED: ["INVOICED", "COMPLETED"],
  INVOICED: ["COMPLETED"],
  COMPLETED: [],
  TONU: [],
  CANCELLED: [],
};

/**
 * Auto-pilot and recovery transitions.
 *
 * DELIBERATELY NOT A SUPERSET OF AE. These are a DIFFERENT set, not a wider
 * one: the auto paths may skip BOOKED and may move backwards to POSTED, and a
 * human AE must inherit neither. The BOOKED checkpoint exists so an AE can
 * review before committing dispatch (§2), and letting an AE skip it silently
 * would erase a deliberate control.
 *
 * The four edges the AE map lacks, and why each is correct:
 *   POSTED -> DISPATCHED      §2 auto-pilot divergence: bulk accept IS dispatch,
 *   TENDERED -> DISPATCHED    and dispatchedAt feeds the dispatched-today views.
 *   BOOKED -> POSTED          a fallen-off or released load returns to the board.
 *   DISPATCHED -> POSTED      same.
 *
 * Item 194 established that enforcing the AE map over these breaks production.
 * This map is what makes them expressible; enforcement is a later step.
 */
const AUTO_ALLOWED_TRANSITIONS: Partial<Record<LoadStatus, LoadStatus[]>> = {
  DRAFT: ["POSTED", "CANCELLED"],
  POSTED: ["TENDERED", "BOOKED", "DISPATCHED", "CANCELLED"],
  TENDERED: ["CONFIRMED", "BOOKED", "DISPATCHED", "POSTED", "CANCELLED"],
  CONFIRMED: ["BOOKED", "DISPATCHED", "POSTED", "CANCELLED"],
  BOOKED: ["DISPATCHED", "POSTED", "CANCELLED", "TONU"],
  DISPATCHED: ["AT_PICKUP", "POSTED", "CANCELLED", "TONU"],
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  code?: "BACKWARDS_NOT_ALLOWED" | "SKIP_NOT_ALLOWED" | "WRONG_STARTING_STATE" | "TERMINAL_NOT_ALLOWED" | "UNKNOWN_TRANSITION";
  /** v3.8.akb — emit the allowed-next list on failure so callers can echo
   * it in the response payload (preserves loadController.ts:462 contract
   * where the 400 body carried `allowed: VALID_TRANSITIONS[from] || []`). */
  allowedNext?: LoadStatus[];
}

/**
 * Validate that `from → to` is a legitimate transition for the given actor.
 *
 * Idempotent same-state transition (from === to) is allowed and returns
 * `{ allowed: true }` — callers can use this as a no-op safety net rather
 * than special-casing the equal case before invocation.
 *
 * For CARRIER actor: enforces the carrier-side subset.
 * For AE actor: enforces the AE-side superset (v3.8.akb Item 159 Sprint 1).
 *
 * Item 159 Sprint 2+ scope (banked): refactor the 12 other AE-side write
 * sites currently doing prisma.load.update({ status }) without invoking
 * this validator (tenderController, waterfallEngineService,
 * carrierController.advance, settlementController, invoiceController,
 * shipperPortalController, ediService, checkCallAutomation, etc.).
 */
export function validateLoadStatusTransition(
  from: LoadStatus,
  to: LoadStatus,
  actor: ActorRole,
): TransitionResult {
  if (from === to) {
    return { allowed: true };
  }

  // Pick the right transition map by actor.
  const map =
    actor === "AE" ? AE_ALLOWED_TRANSITIONS
    : actor === "AUTO" ? AUTO_ALLOWED_TRANSITIONS
    : CARRIER_ALLOWED_TRANSITIONS;
  const allowedNext = map[from];

  if (!allowedNext) {
    return {
      allowed: false,
      code: "WRONG_STARTING_STATE",
      reason: actor === "CARRIER"
        ? `Cannot update status from ${from}. Carrier status updates are only available after the load is BOOKED.`
        : `Cannot transition from terminal/unknown state ${from}.`,
      allowedNext: [],
    };
  }

  if (allowedNext.length === 0) {
    // Terminal state (COMPLETED, TONU, CANCELLED). No further transitions.
    return {
      allowed: false,
      code: "TERMINAL_NOT_ALLOWED",
      reason: `${from} is a terminal state. No further transitions allowed.`,
      allowedNext: [],
    };
  }

  if (!allowedNext.includes(to)) {
    return {
      allowed: false,
      code: "SKIP_NOT_ALLOWED",
      reason: `Cannot transition from ${from} to ${to}. Next allowed: ${allowedNext.join(", ")}.`,
      allowedNext,
    };
  }

  return { allowed: true };
}

/**
 * Returns the next allowed status(es) for the given current status + actor.
 * Useful for UI dropdowns: carrier portal can show only the legitimate
 * next-state option(s) instead of the full enum; AE Console can do the
 * same for its status-advance picker.
 */
export function getAllowedNextStatuses(from: LoadStatus, actor: ActorRole): LoadStatus[] {
  const map = actor === "AE" ? AE_ALLOWED_TRANSITIONS : CARRIER_ALLOWED_TRANSITIONS;
  return map[from] ?? [];
}
