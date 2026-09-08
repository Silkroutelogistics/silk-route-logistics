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
import { validateLoadStatusTransition } from "./loadStateMachine";

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
  count: number;
  first_seen_at: string;
  last_seen_at: string;
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

    let violations = 0;
    let unexpected = 0;
    let since: Date | null = null;
    let lastUnexpected: Date | null = null;
    const edges: UnexpectedEdge[] = [];

    for (const r of rows) {
      violations += r.count;
      if (!since || r.firstSeenAt < since) since = r.firstSeenAt;

      // Derived, not stored — see the header. An edge the AUTO map now allows
      // stops counting against the gate the moment the map is reconciled.
      const accountedFor = validateLoadStatusTransition(r.fromStatus, r.toStatus, "AUTO").allowed;
      if (accountedFor) continue;

      unexpected += r.count;
      if (!lastUnexpected || r.lastSeenAt > lastUnexpected) lastUnexpected = r.lastSeenAt;
      edges.push({
        from: r.fromStatus,
        to: r.toStatus,
        count: r.count,
        first_seen_at: r.firstSeenAt.toISOString(),
        last_seen_at: r.lastSeenAt.toISOString(),
      });
    }

    const value: CumulativeCounters = {
      violations_cumulative: violations,
      unexpected_cumulative: unexpected,
      cumulative_since: since ? since.toISOString() : null,
      unexpected_last_seen_at: lastUnexpected ? lastUnexpected.toISOString() : null,
      unexpected_edges: edges,
    };
    cache = { at: nowMs, value };
    return value;
  } catch (err) {
    // Not cached: a transient database problem must not pin "unknown" for the
    // life of the process when the next call could answer properly.
    return unknown(err);
  }
}
