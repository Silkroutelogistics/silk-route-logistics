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
  /**
   * Every tender on the load AS IT STANDS NOW, each with its own clock.
   *
   * createdAt is what decides whether a tender is NEW. Absence from the
   * before-image cannot: a v1 snapshot recorded only the tenders the cancel
   * WITHDREW, so a CONFIRMED tender was never in it (Finding B).
   */
  tenders: Array<{ id: string; status: string; createdAt: Date; statusChangedAt: Date | null }>;
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
  const takenAtMs = Date.parse(snapshot.takenAt);

  // The tender's own clock, because absence from the before-image proves
  // nothing: a release lands the tender in SETTLED_STATES, which the capture
  // never recorded even at v2.
  const releasedSince = facts.tenders.filter((t) => {
    if (t.status !== "RELEASED") return false;
    const atCancel = knownAtCancel.get(t.id);
    if (atCancel !== undefined) return atCancel !== "RELEASED";
    if (!Number.isFinite(takenAtMs)) return true;
    return t.statusChangedAt instanceof Date && t.statusChangedAt.getTime() > takenAtMs;
  });
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

  // Created since the cancel, by the tender's OWN createdAt rather than by
  // absence from the recorded set. A tender that predates takenAt existed
  // before the cancel however the snapshot was written, which is what lets a
  // v1 row (SRL-121496: tenders:[]) be read correctly without a migration.
  // An unreadable takenAt falls back to the absence test rather than letting
  // a genuine retender through.
  const newSince = facts.tenders.filter((t) => {
    const created = t.createdAt instanceof Date ? t.createdAt.getTime() : NaN;
    // No usable clock on either side: fall back to the absence test rather
    // than crashing or letting a genuine retender through.
    if (!Number.isFinite(takenAtMs) || !Number.isFinite(created)) return !knownAtCancel.has(t.id);
    return created > takenAtMs;
  });
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
