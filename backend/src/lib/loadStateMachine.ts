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

export type ActorRole = "CARRIER" | "AE";

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

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  code?: "BACKWARDS_NOT_ALLOWED" | "SKIP_NOT_ALLOWED" | "WRONG_STARTING_STATE" | "TERMINAL_NOT_ALLOWED" | "UNKNOWN_TRANSITION";
}

/**
 * Validate that `from → to` is a legitimate transition for the given actor.
 *
 * Idempotent same-state transition (from === to) is allowed and returns
 * `{ allowed: true }` — callers can use this as a no-op safety net rather
 * than special-casing the equal case before invocation.
 *
 * For CARRIER actor: enforces the carrier-side subset above. For AE actor:
 * currently permissive (returns allowed=true for any transition) — Item 159
 * full enforcement deferred. Including the AE param here so callers don't
 * need to refactor their signatures later when full enforcement lands.
 */
export function validateLoadStatusTransition(
  from: LoadStatus,
  to: LoadStatus,
  actor: ActorRole,
): TransitionResult {
  if (from === to) {
    return { allowed: true };
  }

  if (actor === "AE") {
    return { allowed: true };
  }

  // Carrier-side enforcement.
  const allowedNext = CARRIER_ALLOWED_TRANSITIONS[from];

  if (!allowedNext) {
    return {
      allowed: false,
      code: "WRONG_STARTING_STATE",
      reason: `Cannot update status from ${from}. Carrier status updates are only available after the load is BOOKED.`,
    };
  }

  if (!allowedNext.includes(to)) {
    return {
      allowed: false,
      code: "SKIP_NOT_ALLOWED",
      reason: `Cannot jump from ${from} to ${to}. Next allowed: ${allowedNext.join(", ")}.`,
    };
  }

  return { allowed: true };
}

/**
 * Returns the next allowed status(es) for the given current status + actor.
 * Useful for UI dropdowns: carrier portal can show only the legitimate
 * next-state option(s) instead of the full enum.
 */
export function getAllowedNextStatuses(from: LoadStatus, actor: ActorRole): LoadStatus[] {
  if (actor === "AE") {
    return [];
  }
  return CARRIER_ALLOWED_TRANSITIONS[from] ?? [];
}
