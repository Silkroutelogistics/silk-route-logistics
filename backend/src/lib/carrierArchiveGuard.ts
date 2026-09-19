/**
 * The carrier-archive guard: the reason, and the vocabulary the census reads.
 *
 * DELETE /api/carriers/:id (carrierController.archiveCarrier) archives a
 * carrier. This module DECIDES two things for it and WRITES nothing — the
 * carrier-side twin of lib/cancellationGuard.ts + lib/cancellationPolicy.ts,
 * and it keeps that discipline: no prisma import, no second list of load
 * statuses (the pipeline is derived from the state machine).
 *
 *   1. assessArchiveInput — is the REASON well-formed? The same 422 shape as
 *      the load side ({ error, code }), because validateBody's 400
 *      { error: "Validation failed", details } is the wrong contract here.
 *   2. The status vocabulary the census (lib/carrierReferences.ts) reads to
 *      decide what is IN FLIGHT and what is an OPEN OFFER — PRE_POD_STATUSES
 *      and BINDING_TENDER_STATES. The census does the reading; the controller
 *      does the refusing; nothing here touches a row.
 *
 * RATIFIED (CLAUDE.md §14, 2026-09-19): only in-flight work blocks an archive;
 * history never does. A load counts as in flight when EITHER
 *   - Load.carrierId (a User.id — Item 222.4) names this carrier's user and the
 *     load can still reach POD_RECEIVED, or
 *   - a tender in a HOLDS_LOAD state (ACCEPTED / RC_SENT / CONFIRMED) sits on a
 *     load that can still reach POD_RECEIVED.
 * Both signals, because they are written by different services and the second
 * is what survives an assignment-column drift. An OFFERED / COUNTERED tender is
 * an open offer, not in-flight work: the archive WITHDRAWS it inside its
 * transaction instead of refusing.
 *
 * "Can still reach POD_RECEIVED" is computed from the transition maps rather
 * than copied as a status list: DELIVERED is IN (the POD is still owed — Item
 * 195 F-8 — and the ruling says so by name), while CANCELLED, TONU,
 * POD_RECEIVED, INVOICED and COMPLETED fall out by construction. Widening or
 * narrowing the machine moves this verdict with it, and the test pins the
 * shape so a reordering that changes the meaning goes red.
 */

import { CarrierArchiveReason, LoadStatus, TenderStatus } from "@prisma/client";
import { getAllowedNextStatuses } from "./loadStateMachine";
import { HOLDS_LOAD, LIVE_STATES } from "./tenderLifecycle";
import { archiveCarrierSchema } from "../validators/carrier";

/** The statusReason written onto every offer an archive withdraws. */
export const CARRIER_ARCHIVED_WITHDRAW_REASON = "carrier_archived";

export const CARRIER_ARCHIVE_REASONS = Object.values(CarrierArchiveReason) as CarrierArchiveReason[];

/** Every tender state that still binds the carrier: an open offer or a committed haul. */
export const BINDING_TENDER_STATES: TenderStatus[] = [...LIVE_STATES, ...HOLDS_LOAD];

/**
 * Statuses from which POD_RECEIVED is still reachable under the AE or the
 * CARRIER map — the ruling's "in flight", DELIVERED-pre-POD included. Derived
 * at module load; the test pins the shape (DISPATCHED in, DELIVERED in,
 * COMPLETED out) so a change to the machine that changes the meaning goes red.
 * (The AUTO map's four edges add no reachability the union lacks.)
 */
export const PRE_POD_STATUSES: LoadStatus[] = derivePrePodStatuses();

/** Is a load in this status still in flight for the purposes of an archive? */
export function isInFlightStatus(status: LoadStatus | string): boolean {
  return (PRE_POD_STATUSES as string[]).includes(status);
}

function derivePrePodStatuses(): LoadStatus[] {
  const all = Object.values(LoadStatus) as LoadStatus[];
  const next = (s: LoadStatus): LoadStatus[] => [
    ...getAllowedNextStatuses(s, "AE"),
    ...getAllowedNextStatuses(s, "CARRIER"),
  ];
  const reachesPod = (start: LoadStatus): boolean => {
    const seen = new Set<LoadStatus>([start]);
    const queue: LoadStatus[] = [start];
    while (queue.length) {
      const s = queue.shift() as LoadStatus;
      for (const n of next(s)) {
        if (n === "POD_RECEIVED") return true;
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return false;
  };
  return all.filter((s) => s !== "POD_RECEIVED" && reachesPod(s));
}

// ---------------------------------------------------------------------------
// 1. The reason
// ---------------------------------------------------------------------------

export type ArchiveInputVerdict =
  | { ok: true; reason: CarrierArchiveReason; note: string | null }
  | {
      ok: false;
      code: "ARCHIVE_REASON_REQUIRED" | "ARCHIVE_REASON_INVALID" | "ARCHIVE_NOTE_INVALID";
      message: string;
    };

export function assessArchiveInput(body: unknown): ArchiveInputVerdict {
  const parsed = archiveCarrierSchema.safeParse(body ?? {});
  if (parsed.success) {
    return { ok: true, reason: parsed.data.reason, note: parsed.data.archiveNote || null };
  }
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === "archiveNote") {
    return { ok: false, code: "ARCHIVE_NOTE_INVALID", message: `archiveNote: ${issue.message}` };
  }
  const raw = (body as { reason?: unknown } | null | undefined)?.reason;
  if (raw === undefined || raw === null || raw === "") {
    return {
      ok: false,
      code: "ARCHIVE_REASON_REQUIRED",
      message: `Archiving a carrier must carry a reason. One of: ${CARRIER_ARCHIVE_REASONS.join(", ")}.`,
    };
  }
  return { ok: false, code: "ARCHIVE_REASON_INVALID", message: `Unknown archive reason "${String(raw)}".` };
}

// ---------------------------------------------------------------------------
// 2. The shape of a refusal — filled by the census, returned by the controller
// ---------------------------------------------------------------------------

export interface BlockingLoad {
  id: string;
  loadNumber: string | null;
  referenceNumber: string;
  status: LoadStatus;
  /** Which signal put it here. Both may hold; the first seen is recorded. */
  via: "assignment" | "committed_tender";
}
