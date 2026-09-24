/**
 * May this cancelled load be un-cancelled, and to what?
 *
 * PURE. It takes facts and returns a verdict; it reads nothing and writes
 * nothing. That is not tidiness -- the seven cases this has to get right are
 * refusals, and a refusal is only worth having if it is cheap enough to test
 * every one of them. With a database in the way, "un-cancel at 72h+1m is
 * refused" costs a container; here it costs a Date.
 *
 * THE SNAPSHOT IS THE BASELINE FOR EVERY "DID SOMETHING HAPPEN AFTER THE
 * CANCEL" QUESTION. A release or a re-tender is not detectable from a tender's
 * current state alone -- a carrier released BEFORE the cancel looks identical
 * to one released after. The before-image says which tenders existed and what
 * they were, so "not in the snapshot" means created since, and "RELEASED now
 * but not RELEASED then" means released since. That is what a before-image is
 * for, and it is why those guards sit downstream of the snapshot check.
 */
import type { CancellationSnapshot } from "../services/cancelCascade";

/**
 * Ratified: ADMIN/CEO only, 72 hours from the cancel.
 *
 * A constant rather than an env var on purpose. The tender TTL and the RC
 * signing SLA are env-bounded because they are operational tuning; this is a
 * policy about who may reverse a commercial decision and for how long, and a
 * deploy-time knob on it is a way for the rule to differ from the rule.
 */
export const UNCANCEL_WINDOW_HOURS = 72;
export const UNCANCEL_ROLES = ["ADMIN", "CEO"] as const;

export type UncancelRefusalCode =
  | "LOAD_NOT_CANCELLED"
  | "UNCANCEL_ROLE_FORBIDDEN"
  | "UNCANCEL_WINDOW_EXPIRED"
  | "UNCANCEL_WINDOW_UNKNOWN"
  | "NO_SNAPSHOT"
  | "SNAPSHOT_INCOMPLETE"
  | "TONU_BILLED"
  | "CARRIER_RELEASED"
  | "LOAD_RETENDERED";

export interface UncancelFacts {
  load: {
    status: string;
    cancelledAt: Date | null;
    /** Raw JSON off the column. Validated here, never trusted. */
    cancellationSnapshot: unknown;
  };
  actorRole: string;
  now: Date;
  /** LoadAccessorial rows of type TONU that are not REJECTED. */
  tonuAccessorialCount: number;
  /** Every tender on the load AS IT STANDS NOW. */
  tenders: Array<{ id: string; status: string }>;
}

export type UncancelVerdict =
  | {
      ok: true;
      snapshot: CancellationSnapshot;
      /** The status to put the load back to. */
      restoreTo: string;
      /** This cancel also hid the load, so the restore has to unhide it. */
      unhide: boolean;
    }
  | { ok: false; code: UncancelRefusalCode; message: string };

/**
 * Every key the cascade writes unconditionally, plus the three the deferred
 * half writes. ALL of them must be PRESENT -- a value of null or [] is a
 * recorded "nothing there", while an absent key means nobody looked.
 *
 * Ruling 1: a value absent from a snapshot is refused on restore, never
 * defaulted. So a cancel whose deferred half failed is permanently
 * un-un-cancellable, and that is the intended outcome rather than a gap:
 * defaulting the money keys would either strand a carrier's pay or
 * double-count a shipper's credit, and refusing says so out loud.
 */
const REQUIRED_SNAPSHOT_KEYS = [
  "version",
  "takenAt",
  "load",
  "shipments",
  "trackingTokenRevoked",
  "shipperTrackingTokens",
  "rateConfirmations",
  "tenders",
  "shipperCredit",
  "carrierPays",
] as const;

export function assessUncancel(facts: UncancelFacts): UncancelVerdict {
  const { load, actorRole, now } = facts;

  if (!(UNCANCEL_ROLES as readonly string[]).includes(actorRole)) {
    return {
      ok: false,
      code: "UNCANCEL_ROLE_FORBIDDEN",
      message: "Reversing a cancellation is restricted to ADMIN and CEO.",
    };
  }

  if (load.status !== "CANCELLED") {
    return {
      ok: false,
      code: "LOAD_NOT_CANCELLED",
      message: "This load is " + load.status + ", not cancelled. There is nothing to reverse.",
    };
  }

  const snap = load.cancellationSnapshot;
  if (snap === null || snap === undefined || typeof snap !== "object" || Array.isArray(snap)) {
    return {
      ok: false,
      code: "NO_SNAPSHOT",
      message:
        "This load was cancelled before SRL began recording what a cancellation changed, " +
        "so there is no before-image to restore from. It cannot be reversed automatically. " +
        "Re-create the load, or restore it by hand from the load's activity history.",
    };
  }

  const missing = REQUIRED_SNAPSHOT_KEYS.filter(
    (k) => !Object.prototype.hasOwnProperty.call(snap, k),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      code: "SNAPSHOT_INCOMPLETE",
      message:
        "The record of this cancellation is missing " + missing.join(", ") + ", so part of what " +
        "the cancel changed was never captured. Restoring the rest would leave the load " +
        "half-reversed, which is worse than leaving it cancelled. Reverse it by hand.",
    };
  }

  const snapshot = snap as unknown as CancellationSnapshot;

  // The cancel time, preferring the column and falling back to the snapshot's
  // own timestamp -- they are written in the same act, and a load cancelled
  // before cancelledAt was populated still has a takenAt.
  const cancelledAtMs = load.cancelledAt ? load.cancelledAt.getTime() : Date.parse(snapshot.takenAt);
  if (!Number.isFinite(cancelledAtMs)) {
    return {
      ok: false,
      code: "UNCANCEL_WINDOW_UNKNOWN",
      message:
        "This load has no recorded cancellation time, so there is no way to tell whether the " +
        UNCANCEL_WINDOW_HOURS + "-hour reversal window is still open. Reverse it by hand.",
    };
  }

  const elapsedHours = (now.getTime() - cancelledAtMs) / 3_600_000;
  if (elapsedHours > UNCANCEL_WINDOW_HOURS) {
    return {
      ok: false,
      code: "UNCANCEL_WINDOW_EXPIRED",
      message:
        "Cancellations can be reversed for " + UNCANCEL_WINDOW_HOURS + " hours. This one was " +
        "cancelled " + Math.floor(elapsedHours) + " hours ago, so the window has closed.",
    };
  }

  // Defensive rather than currently reachable: recordTonuObligation fires from
  // the TONU branch, and TONU and CANCELLED are different terminal states, so a
  // cancelled load carries no TONU today. It is checked anyway because the
  // consequence if some future path does write one is that SRL bills a customer
  // for a truck ordered and not used on a load it then un-cancels -- and the
  // predicate is the one recordTonuObligation already uses for its idempotence.
  if (facts.tonuAccessorialCount > 0) {
    return {
      ok: false,
      code: "TONU_BILLED",
      message:
        "A truck-order-not-used charge has been recorded against this load. Reversing the " +
        "cancellation would leave that charge standing on a live load. Void the TONU first.",
    };
  }

  const snapshotTenders = Array.isArray(snapshot.tenders) ? snapshot.tenders : [];
  const knownAtCancel = new Map(snapshotTenders.map((t) => [t.id, t.status]));

  // RELEASED now and not RELEASED at cancel time. The cancel itself only ever
  // WITHDRAWS (withdrawLiveTenders), so a release is somebody else's act.
  const releasedSince = facts.tenders.filter(
    (t) => t.status === "RELEASED" && knownAtCancel.get(t.id) !== "RELEASED",
  );
  if (releasedSince.length > 0) {
    return {
      ok: false,
      code: "CARRIER_RELEASED",
      message:
        "The carrier has been released from this load since it was cancelled. Releasing settles " +
        "their tender, voids live paperwork and records a fall-off, and none of that is undone " +
        "by reversing the cancellation. Re-tender the load instead.",
    };
  }

  // Present now, absent from the before-image: created since the cancel.
  const newSince = facts.tenders.filter((t) => !knownAtCancel.has(t.id));
  if (newSince.length > 0) {
    return {
      ok: false,
      code: "LOAD_RETENDERED",
      message:
        "This load has been tendered again since it was cancelled. Reversing the cancellation " +
        "would restore the earlier offers alongside the new one and put two carriers on the " +
        "same load. Withdraw the new tender first, or leave the load as it stands.",
    };
  }

  return {
    ok: true,
    snapshot,
    restoreTo: snapshot.load.status,
    unhide: snapshot.load.softDeleted === true,
  };
}
