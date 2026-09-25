// The UNCANCEL lens: when a CANCELLED -> X transition is an AUTHORISED reversal
// rather than a raw write, and when it is not.
//
// WHAT THIS FIXES. CANCELLED is terminal in BOTH the AE and AUTO maps, so
// accountedByLens returns null for every CANCELLED -> X edge and the durable
// counter files it under unexpected_cumulative -- the field §13.3 Item 194 makes
// the enforcement gate. On 2026-09-25 that is exactly what happened: SRL-121496
// was reversed through the canonical PUT /loads/:id/uncancel by a named admin
// with a typed reason, the carrier got the reinstatement notice, and the gate
// still counted it. The gate then could not reach zero for an act the platform
// had just been built to support.
//
// AND THE OPPOSITE MUST STAY COUNTED. A raw CANCELLED -> DISPATCHED write with no
// audit row behind it is precisely the thing the observer exists to surface. So
// this is not "stop counting CANCELLED edges"; it is "count the ones nobody
// authorised", which is a per-LOAD-per-EVENT question rather than a per-edge one.
//
// ─── WHY THE CLASSIFICATION HAPPENS AT READ TIME AND NOT IN THE OBSERVER ─────
//
// MEASURED, not assumed. For the 2026-09-25 reversal the durable counter row was
// stamped at 00:31:58.095Z and its LOAD_UNCANCELLED audit row at 00:31:58.115Z --
// the audit row is 20ms AFTER the status write, because recordLifecycleEvent runs
// after the transition commits (lib/lifecycleAudit.ts:35-39, and that ordering is
// deliberate: an audit write inside the transaction would take the transition down
// with it). observeLoadTransition is synchronous and fires DURING the write, so at
// that instant the authorising row does not exist yet. A write-time check would
// therefore report every un-cancel as unauthorised -- the exact failure it was
// added to prevent, arriving from the other direction.
//
// So the observer TAGS the edge (uncancelEdge: true) and the read-time derivation
// in statusMachineCounters DECIDES. Both import this module, so there is one
// definition of "authorised"; what differs is only what each can see at its own
// moment. That preserves the property statusMachineCounters' header insists on:
// `expected` is derived at read time and never stored, so history reclassifies.
//
// ─── THE AGGREGATION LIMIT, STATED RATHER THAN HIDDEN ────────────────────────
//
// status_machine_counters is keyed on (fromStatus, toStatus) with a running count
// and first/last timestamps -- deliberately, so the table is bounded by distinct
// illegal edges rather than by load volume. It carries no loadId. So the read-time
// path cannot pair each individual observation with its own audit row; it counts
// authorising rows inside the row's own observed window and subtracts.
//
// That is exact when count = 1 (today's case: first === last) and conservative
// when count > 1 -- N observations with N authorising rows in window clear
// entirely, and any excess observations keep counting. It can never clear an
// observation that has no authorising row anywhere near it, which is the property
// that matters. `wasAuthorisedUncancel` applies the strict per-event rule and is
// what the proof drives; it is not on the read path because of the ordering above.

import type { LoadStatus } from "@prisma/client";

/**
 * The discriminator. `auditLog("UPDATE","Load")` on the uncancel route writes an
 * AuditLog row whose action is a generic "UPDATE", indistinguishable from any
 * other load edit -- so the identifying mark is this key inside the AuditTrail
 * row's changedFields, which is the convention lib/lifecycleAudit.ts establishes
 * and every reader in this repo greps (lifecycleAudit.ts:27-33).
 */
export const UNCANCEL_ACTION_DETAIL = "LOAD_UNCANCELLED";

/**
 * How close an authorising row has to be to the observation.
 *
 * Five seconds. The two writes are milliseconds apart in practice (20ms measured
 * above) and share a request, so the window only has to absorb clock skew and a
 * slow audit insert. Making it minutes would let an unrelated later reversal
 * authorise an earlier raw write, which is the whole failure this guards.
 */
export const UNCANCEL_WINDOW_MS = 5_000;

/**
 * Is this edge a cancellation reversal at all?
 *
 * Any CANCELLED -> X. Deliberately not a fixed target list: the canonical path
 * restores to whatever status the cancellation snapshot recorded
 * (uncancelPolicy.ts:236-241 — `restoreTo: snapshot.load.status`), so the target
 * is whatever the load was before it was cancelled and enumerating it here would
 * go stale the first time a load was cancelled from a status nobody listed.
 */
export function isUncancelEdge(from: LoadStatus | string, to: LoadStatus | string): boolean {
  return from === "CANCELLED" && to !== "CANCELLED";
}

/** An AuditTrail row, narrowed to the fields this lens reads. */
export interface AuthorisingRow {
  entityId: string;
  performedById: string | null;
  performedAt: Date;
  changedFields: unknown;
}

/**
 * Does this row authorise a reversal — actor AND reason, not merely the marker?
 *
 * BOTH are required because the directive's standard is "with actor + reason",
 * and each carries its own weight: `performedById` is who can be asked about it,
 * and `reason` is the only field that says why. A row with the marker and neither
 * is a trace, not an authorisation, and clearing the gate on a trace would make
 * the gate a formality.
 *
 * `performedById` is a required FK on AuditTrail so in practice it is always set;
 * it is checked anyway rather than assumed, because "the schema makes this
 * impossible" is how a nullable column added later goes unnoticed.
 */
export function authorises(row: AuthorisingRow): boolean {
  const cf = row.changedFields;
  if (cf === null || typeof cf !== "object" || Array.isArray(cf)) return false;
  const f = cf as Record<string, unknown>;
  if (f.actionDetail !== UNCANCEL_ACTION_DETAIL) return false;

  // Actor: the column, or the copy inside changedFields. Either satisfies it —
  // they are written together by recordLifecycleEvent and a reader should not
  // care which survived.
  const actorInFields =
    typeof f.actor === "object" && f.actor !== null
      ? (f.actor as Record<string, unknown>).userId
      : undefined;
  const hasActor =
    (typeof row.performedById === "string" && row.performedById.length > 0) ||
    (typeof actorInFields === "string" && actorInFields.length > 0);
  if (!hasActor) return false;

  // Reason: the endpoint's validator already enforces a trimmed minimum of 10
  // characters (validators/load.ts:136-138). This asserts only that it is
  // present and not whitespace, so a caller that writes the row by another route
  // cannot satisfy the lens with an empty string.
  const reason = f.reason;
  return typeof reason === "string" && reason.trim().length > 0;
}

/** The restored status this row authorises, or null when it records none. */
export function authorisedTarget(row: AuthorisingRow): string | null {
  const cf = row.changedFields as Record<string, unknown> | null;
  if (!cf || typeof cf !== "object") return null;
  const next = cf.new;
  if (typeof next !== "object" || next === null) return null;
  const status = (next as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

/**
 * STRICT per-event rule: was THIS load's move to THIS status authorised, within
 * the window of THIS observation?
 *
 * Not used on the read path — see the header on ordering. It is the precise
 * statement of the rule, it is what the proof drives in both directions, and it
 * is what a future enforcement gate would call at decision time once the audit
 * row is guaranteed to precede the check.
 */
export function wasAuthorisedUncancel(
  rows: readonly AuthorisingRow[],
  loadId: string,
  to: LoadStatus | string,
  observedAt: Date,
  windowMs: number = UNCANCEL_WINDOW_MS,
): boolean {
  const at = observedAt.getTime();
  return rows.some(
    (r) =>
      r.entityId === loadId &&
      authorises(r) &&
      authorisedTarget(r) === to &&
      Math.abs(r.performedAt.getTime() - at) <= windowMs,
  );
}

/**
 * AGGREGATE rule for one counter row: how many of its `count` observations have
 * an authorising row for the same target inside the row's own observed window.
 *
 * The window is [firstSeenAt - windowMs, lastSeenAt + windowMs]. Widening it to
 * the row's span rather than a single instant is what makes count > 1 tractable
 * at all; bounding it at both ends is what stops a reversal months later from
 * retroactively authorising an old raw write.
 *
 * Each authorising row is consumed at most once, so two observations cannot both
 * be cleared by a single audit row.
 */
export function authorisedCountForEdge(
  rows: readonly AuthorisingRow[],
  to: LoadStatus | string,
  firstSeenAt: Date,
  lastSeenAt: Date,
  windowMs: number = UNCANCEL_WINDOW_MS,
): number {
  const lo = firstSeenAt.getTime() - windowMs;
  const hi = lastSeenAt.getTime() + windowMs;
  let n = 0;
  for (const r of rows) {
    if (!authorises(r)) continue;
    if (authorisedTarget(r) !== to) continue;
    const t = r.performedAt.getTime();
    if (t < lo || t > hi) continue;
    n += 1;
  }
  return n;
}
