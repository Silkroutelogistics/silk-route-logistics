// The Load.status enforcement gate, made to survive a deploy.
//
// WHY THIS EXISTS. /api/health has reported status_machine.violations_since_boot
// and unexpected_since_boot since v3.8.ayh, and both are per-process: they reset
// on boot, which the field names say honestly. The gate §13.3 Item 194 sets is
// "a FULL DEPLOY CYCLE keeps unexpected_since_boot at zero", and a counter that
// resets on every deploy cannot express a deploy cycle. Item 194 says so about
// its own first reading -- a 2h18m window on a platform with almost no traffic,
// recorded with the words "This is one clean window, not the gate."
//
// So the counts are also written to a table. The in-memory pair stays exactly as
// it was and keeps answering "since this process started"; the cumulative pair
// answers "ever", which is the question the gate asks.
//
// GRAIN IS THE EDGE, NOT THE EVENT. One row per (from, to) pair with a running
// count, so the table is bounded by the number of distinct illegal edges rather
// than by load volume, and cannot grow into a log. It also matches what the
// reconciliation actually needs: Item 194's resume state says to read the
// unexpected edges first, because each one is either a real defect or a
// transition nobody wrote down.
//
// `expected` IS DERIVED AT READ TIME, NEVER STORED. Whether an edge is accounted
// for is a property of the AUTO map, and the whole point of the soak is that
// reconciling that map is what ends it. A stored flag would freeze what was true
// when the row was first written and then disagree with the map that governs
// today -- so adding an edge to AUTO would leave history still calling it
// unexpected, and the gate would never close.
//
// THE CLIENT IS A PARAMETER. This module imports nothing from config/database,
// because config/database imports the observer, and the observer is what calls
// the writer here. Taking the client as an argument keeps that chain acyclic and
// makes both halves testable against a plain object.

import { LoadStatus } from "@prisma/client";
import { log } from "./logger";
import { accountedByLens } from "./loadStateMachine";
import {
  authorisedCountForEdge,
  isUncancelEdge,
  UNCANCEL_WINDOW_MS,
  type AuthorisingRow,
} from "./uncancelLens";

/** The subset of the Prisma client this module uses. */
export interface CounterStore {
  statusMachineCounter: {
    upsert(args: any): Promise<unknown>;
    findMany(args?: any): Promise<
      Array<{
        fromStatus: LoadStatus;
        toStatus: LoadStatus;
        count: number;
        firstSeenAt: Date;
        lastSeenAt: Date;
      }>
    >;
  };
  /**
   * Required, not optional, and that is deliberate.
   *
   * The UNCANCEL lens resolves at READ time (lib/uncancelLens.ts explains why the
   * observer cannot do it), so this read is what decides whether an authorised
   * reversal counts against the gate. An optional member would let a caller that
   * forgot to supply one silently fall back to "nothing is authorised" and pin the
   * gate open forever -- the silent-degradation shape §19 Sub-pattern 16 keeps
   * catching. Required means such a caller fails to compile instead.
   */
  auditTrail: {
    findMany(args?: any): Promise<AuthorisingRow[]>;
  };
}

/**
 * Record one observed violation against the durable counter.
 *
 * FIRE AND FORGET, AND IT MUST STAY THAT WAY. The caller is a database write
 * path that has already succeeded; awaiting a second write there would put this
 * counter's latency on every status transition, and letting it throw would fail
 * an operation that was fine. Observation must never be able to affect the thing
 * observed -- the same rule recordCompassRecalcRun follows.
 *
 * ONE UPSERT PER OBSERVATION, deliberately un-buffered. Violations are bounded
 * by status writes, which at present volume is a handful a day; buffering would
 * buy nothing and would cost a flush timer, which is a lifecycle hazard in a
 * library module (tests leak it, the process will not exit). If volume ever
 * makes this a hot path, the fix is a buffered flush and this comment is the
 * note saying so.
 */
export function persistTransitionObservation(
  db: CounterStore,
  from: LoadStatus,
  to: LoadStatus,
): void {
  try {
    void db.statusMachineCounter
      .upsert({
        where: { fromStatus_toStatus: { fromStatus: from, toStatus: to } },
        update: { count: { increment: 1 } },
        create: { fromStatus: from, toStatus: to, count: 1 },
      })
      .catch((err: unknown) => {
        log.warn({ err, from, to }, "[StatusMachine] could not persist transition counter");
      });
  } catch (err) {
    // A synchronous throw here would mean the client itself is unusable, which
    // is not this counter's problem to surface.
    log.warn({ err, from, to }, "[StatusMachine] counter write threw synchronously");
  }
}

export interface UnexpectedEdge {
  from: LoadStatus;
  to: LoadStatus;
  /**
   * The RESIDUAL count — observations with no authorising row behind them.
   *
   * For every edge but a cancellation reversal this is the row's own count. For a
   * CANCELLED -> X row it is count minus the authorised reversals found in window,
   * so a partially-authorised edge reports only the part nobody accounted for.
   * Reporting the raw count here would tell a reader to go and investigate
   * reversals that are already explained.
   */
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  /** Authorised reversals matched on this edge. Present only when non-zero. */
  authorised_count?: number;
}

export interface CumulativeCounters {
  /** Every edge the AE map rejects, summed. null means UNKNOWN, never zero. */
  violations_cumulative: number | null;
  /** Edges the AUTO map does not account for either. This is the gate. */
  unexpected_cumulative: number | null;
  /** Earliest observation on record, so "since when" is answerable. */
  cumulative_since: string | null;
  /** Most recent unexpected edge, or null if there has never been one. */
  unexpected_last_seen_at: string | null;
  /** The edges to go and read. Bounded by distinct illegal pairs. */
  unexpected_edges: UnexpectedEdge[];
  /**
   * Cancellation reversals the UNCANCEL lens accounted for.
   *
   * Surfaced rather than merely subtracted, because "the gate is at zero" and "the
   * gate is at zero because two reversals were authorised" are different facts and
   * the second is the one that lets a reader check the lens is working rather than
   * merely quiet. A lens that had silently stopped matching would show this at 0
   * with the gate back above zero -- which is the failure being made visible.
   */
  authorised_uncancels: number | null;
  /** Present only when the read failed. Its presence is what says "unknown". */
  error?: string;
}

/**
 * A read failure reports null counts and an error, NEVER zero.
 *
 * Zero and unknown are the same word to anyone glancing at this field, and the
 * whole purpose of the field is to decide whether it is safe to switch
 * enforcement on. §19 Sub-pattern 16's eleventh fire is exactly this shape: a
 * signal that reads identically in the healthy and broken states has no
 * discriminating power, and no amount of reading it more carefully helps.
 */
function unknown(err: unknown): CumulativeCounters {
  return {
    violations_cumulative: null,
    unexpected_cumulative: null,
    cumulative_since: null,
    unexpected_last_seen_at: null,
    unexpected_edges: [],
    // null, not 0: an unknown read must not claim it found no authorised
    // reversals, which reads as "the lens matched nothing" rather than "nobody
    // asked". Same rule as the counts above.
    authorised_uncancels: null,
    error: String((err as any)?.message ?? err).slice(0, 200),
  };
}

// Short TTL rather than the per-process cache schemaInfo uses. That answer is
// fixed for a process lifetime because a migration implies a restart; this one
// changes while the process runs, so it is cached only enough to keep a
// load-balancer poll off the database.
const TTL_MS = 30_000;
let cache: { at: number; value: CumulativeCounters } | null = null;

/** Exposed so tests do not have to wait out the TTL. */
export function __resetCumulativeCache(): void {
  cache = null;
}

export async function cumulativeStatusMachineCounters(
  db: CounterStore,
  nowMs: number = Date.now(),
): Promise<CumulativeCounters> {
  if (cache && nowMs - cache.at < TTL_MS) return cache.value;

  try {
    const rows = await db.statusMachineCounter.findMany({
      orderBy: { lastSeenAt: "desc" },
    });

    // The authorising rows, fetched ONCE and only when a reversal edge exists.
    //
    // Bounded by the widest observed window across the reversal rows, so this
    // never becomes a full scan of the audit trail as history grows. The
    // actionDetail marker is filtered in JS rather than in the where clause on
    // purpose: it lives inside a Json column, and a Prisma JSON-path filter is
    // provider-shaped and would tie this read to Postgres specifics for a
    // predicate that already has one definition in uncancelLens.authorises.
    const reversalRows = rows.filter((r) => isUncancelEdge(r.fromStatus, r.toStatus));
    let authRows: AuthorisingRow[] = [];
    if (reversalRows.length > 0) {
      const lo = new Date(
        Math.min(...reversalRows.map((r) => r.firstSeenAt.getTime())) - UNCANCEL_WINDOW_MS,
      );
      const hi = new Date(
        Math.max(...reversalRows.map((r) => r.lastSeenAt.getTime())) + UNCANCEL_WINDOW_MS,
      );
      authRows = await db.auditTrail.findMany({
        where: { entityType: "Load", performedAt: { gte: lo, lte: hi } },
        select: { entityId: true, performedById: true, performedAt: true, changedFields: true },
      });
    }

    let violations = 0;
    let unexpected = 0;
    let authorisedUncancels = 0;
    let since: Date | null = null;
    let lastUnexpected: Date | null = null;
    const edges: UnexpectedEdge[] = [];

    for (const r of rows) {
      violations += r.count;
      if (!since || r.firstSeenAt < since) since = r.firstSeenAt;

      // Derived, not stored — see the header. An edge a lens now accounts for
      // stops counting against the gate the moment the maps are reconciled,
      // and RECLASSIFIES HISTORY with them: C3 adding the carrier lens is what
      // clears the single BOOKED -> AT_PICKUP row production has recorded,
      // without touching the row or losing the fact that it happened.
      //
      // Shared with the observer rather than re-derived here, so the number on
      // /api/health and the number in the logs cannot disagree about whether
      // the gate has closed.
      const accountedFor = accountedByLens(r.fromStatus, r.toStatus) !== null;
      if (accountedFor) continue;

      // THE UNCANCEL LENS. CANCELLED is terminal in both maps, so accountedByLens
      // can never account for a reversal -- but a reversal through the canonical
      // endpoint is an authorised act with a named actor and a typed reason, and
      // counting it against the gate made the gate unreachable for the one thing
      // the un-cancel arc was built to do (§13.3, SRL-121496, 2026-09-25).
      //
      // It subtracts rather than skips: an edge whose observations outnumber its
      // authorising rows keeps the difference, so a raw CANCELLED -> X write is
      // still counted even when an authorised reversal exists on the same edge.
      let residual = r.count;
      let authorisedHere = 0;
      if (isUncancelEdge(r.fromStatus, r.toStatus)) {
        authorisedHere = authorisedCountForEdge(authRows, r.toStatus, r.firstSeenAt, r.lastSeenAt);
        authorisedUncancels += Math.min(authorisedHere, r.count);
        residual = Math.max(0, r.count - authorisedHere);
        if (residual === 0) continue;
      }

      unexpected += residual;
      if (!lastUnexpected || r.lastSeenAt > lastUnexpected) lastUnexpected = r.lastSeenAt;
      edges.push({
        from: r.fromStatus,
        to: r.toStatus,
        count: residual,
        first_seen_at: r.firstSeenAt.toISOString(),
        last_seen_at: r.lastSeenAt.toISOString(),
        ...(authorisedHere > 0 ? { authorised_count: authorisedHere } : {}),
      });
    }

    const value: CumulativeCounters = {
      violations_cumulative: violations,
      unexpected_cumulative: unexpected,
      cumulative_since: since ? since.toISOString() : null,
      unexpected_last_seen_at: lastUnexpected ? lastUnexpected.toISOString() : null,
      unexpected_edges: edges,
      authorised_uncancels: authorisedUncancels,
    };
    cache = { at: nowMs, value };
    return value;
  } catch (err) {
    // Not cached: a transient database problem must not pin "unknown" for the
    // life of the process when the next call could answer properly.
    return unknown(err);
  }
}
