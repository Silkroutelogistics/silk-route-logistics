/**
 * Whether a load may still be cancelled — decided once, applied by BOTH paths.
 *
 * Two doors cancel a load: PATCH /loads/:id/status with CANCELLED, and
 * DELETE /loads/:id (archive = cancel + hide). Until the lifecycle-gaps arc
 * (2026-09-18) only the first ran the state machine; the delete path wrote
 * CANCELLED from any status — COMPLETED and INVOICED included — with the UI's
 * DRAFT|CANCELLED|TONU button gate as the only thing in the way. A UI gate is
 * not a gate.
 *
 * Two checks, in this order:
 *
 *   1. A POD on file. Defense in depth over (2): a load with a proof of
 *      delivery has been delivered whatever its status column says, and
 *      cancelling it erases the record of the delivery it is about to bill.
 *      Checked first so the refusal names the real reason rather than the
 *      status the POD implies.
 *   2. The AE transition map. It already blocks CANCELLED from LOADED onward:
 *      once freight is on a truck the question is a TONU or a claim, not a
 *      cancel (ratified 2026-09-18, decision 1). The map is the source; this
 *      module keeps no second list, so widening or narrowing the map moves
 *      this verdict with it.
 *
 * An already-CANCELLED load is allowed through as a no-op so a repeat cancel
 * or an archive of a cancelled load is idempotent rather than a 409.
 */

import { LoadStatus } from "@prisma/client";
import { validateLoadStatusTransition } from "./loadStateMachine";

/** Terminal aborts. Archiving one must not rewrite its status. */
export const TERMINAL_ABORTS: LoadStatus[] = ["CANCELLED", "TONU"];

export type CancellabilityVerdict =
  | { allowed: true; alreadyCancelled: boolean }
  | {
      allowed: false;
      code: "POD_ON_FILE" | "NOT_CANCELLABLE_STATUS";
      reason: string;
      allowedNext: LoadStatus[];
    };

export function assessCancellability(load: {
  status: LoadStatus;
  podUrl?: string | null;
  podReceivedAt?: Date | null;
}): CancellabilityVerdict {
  if (load.status === "CANCELLED") return { allowed: true, alreadyCancelled: true };

  if (load.podUrl || load.podReceivedAt) {
    return {
      allowed: false,
      code: "POD_ON_FILE",
      reason:
        "A proof of delivery is on file for this load. It has been delivered and cannot be cancelled; " +
        "record a claim or a TONU instead.",
      allowedNext: [],
    };
  }

  const t = validateLoadStatusTransition(load.status, "CANCELLED", "AE");
  if (!t.allowed) {
    return {
      allowed: false,
      code: "NOT_CANCELLABLE_STATUS",
      reason:
        t.reason ??
        `A load at ${load.status} cannot be cancelled. Once freight is loaded the question is a TONU or a claim.`,
      allowedNext: t.allowedNext ?? [],
    };
  }

  return { allowed: true, alreadyCancelled: false };
}
