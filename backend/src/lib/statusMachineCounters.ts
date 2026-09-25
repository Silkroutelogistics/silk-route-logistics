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
import { accountedByLens, validateLoadStatusTransition } from "./loadStateMachine";
import {
  authorisedCountForEdge,
  isUncancelEdge,
  UNCANCEL_WINDOW_MS,
  wasAuthorisedUncancel,
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
  /**
   * The trigger-written transition log (C1).
   *
   * Required for the same reason auditTrail is: a caller that omitted it would
   * silently report only the frozen pre-migration aggregates and call that the
   * gate — the silent-degradation shape §19 Sub-pattern 16 keeps catching.
   * Required means such a caller fails to compile instead.
   *
   * TWO READS, EACH BOUNDED, and the split is the design rather than an
   * optimisation.
   *
   * `groupBy` returns the same (from, to, count, first, last) shape the counter
   * table has, so it is bounded by the number of DISTINCT edges rather than by
   * load volume. A read on /api/health must not grow with the business, and the
   * counter model's own header gives that reasoning for its grain.
   *
   * `findMany` is then used for reversal edges ALONE — rare, and the one case
   * needing per-event resolution. The uncancel lens pairs an observation with its
   * authorising audit row, and the counter table could never do that because it
   * carries no loadId, which is why it had to settle for a conservative
   * window-aggregate. These rows carry one, so the strict per-event rule applies
   * to everything the log records.
   */
  loadStatusTransition: {
    groupBy(args: any): Promise<
      Array<{
        fromStatus: LoadStatus;
        toStatus: LoadStatus;
        _count: { _all: number };
        _min: { occurredAt: Date | null };
        _max: { occurredAt: Date | null };
      }>
    >;
    findMany(args?: any): Promise<
      Array<{ loadId: string; fromStatus: LoadStatus; toStatus: LoadStatus; occurredAt: Date }>
    >;
  };
}

// THE COUNTER TABLE IS NOW READ-ONLY. C1, 2026-09-25.
//
// persistTransitionObservation lived here and was called from the $allOperations
// client extension. It is gone with that extension: a trigger writes every
// transition to load_status_transitions, so this table stops gaining rows at the
// deploy that installs the trigger and keeps the ones it has.
//
// IT IS KEPT RATHER THAN DROPPED because cumulative_since is the soak window's
// start date (§13.3 Item 194). Reading only the log would reset it to the
// migration and restart the clock, discarding the evidence that the gate has been
// clean since 2026-09-22. Two rows are frozen there: BOOKED -> AT_PICKUP, which
// the carrier lens now accounts for, and CANCELLED -> DISPATCHED, which the
// uncancel lens accounts for — so both contribute 0 to the gate and only their
// dates still matter.

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

    // ── The trigger-written log (C1) ──────────────────────────────────────
    //
    // TWO SOURCES, ONE ANSWER, AND THEY DO NOT OVERLAP. The counter table stops
    // being written in the same deploy the trigger starts, so it is frozen
    // pre-migration history and the log is everything after. They are a union of
    // two disjoint time windows rather than two answers to one question, which
    // is what keeps this from being the dual-source drift this codebase keeps
    // unpicking.
    //
    // THE COUNTER TABLE IS KEPT RATHER THAN DROPPED, for one concrete reason:
    // `cumulative_since` is the soak window's start date. Reading only the log
    // would reset it to the migration and restart Item 194's clock, discarding
    // the evidence that the gate has been clean since 2026-09-22.
    //
    // THE SEAM, STATED. The migration runs during the BUILD while the previous
    // process is still serving (§13.3 Item 213), so for a minute or two the old
    // process's client extension could still write a counter row for a
    // transition the new trigger also logs. That double-counts. It can only
    // INFLATE the gate, never falsely clear it, so the failure direction is the
    // safe one — and at a volume of 29 loads all time the expected number of
    // such transitions is zero.
    const logEdges = await db.loadStatusTransition.groupBy({
      by: ["fromStatus", "toStatus"],
      _count: { _all: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    });

    // Reversal rows in full, and ONLY reversal rows. These are the only edges
    // that need per-event resolution, and they are rare.
    const logHasReversal = logEdges.some((e) => isUncancelEdge(e.fromStatus, e.toStatus));
    const reversalLogRows = logHasReversal
      ? await db.loadStatusTransition.findMany({
          where: { fromStatus: "CANCELLED" },
          select: { loadId: true, fromStatus: true, toStatus: true, occurredAt: true },
        })
      : [];

    // One audit fetch covering both sources' reversal windows. Fetching per
    // source would double the round trips for a predicate with one definition.
    if (reversalLogRows.length > 0) {
      const times = reversalLogRows.map((r) => r.occurredAt.getTime());
      const lo2 = new Date(Math.min(...times) - UNCANCEL_WINDOW_MS);
      const hi2 = new Date(Math.max(...times) + UNCANCEL_WINDOW_MS);
      const more = await db.auditTrail.findMany({
        where: { entityType: "Load", performedAt: { gte: lo2, lte: hi2 } },
        select: { entityId: true, performedById: true, performedAt: true, changedFields: true },
      });
      authRows = authRows.concat(more);
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

    // ── The same classification, applied to the log ───────────────────────
    //
    // The predicate is not re-derived here: validateLoadStatusTransition and
    // accountedByLens are the same two functions the loop above calls and the
    // observer logs from, so the gate cannot mean one thing for pre-migration
    // history and another for everything since.
    //
    // WHAT IS DIFFERENT IS THE UNCANCEL RESOLUTION, and it is strictly better.
    // The counter table has no loadId, so it could only ask "were there N
    // authorising rows anywhere in this edge's window" — exact at count 1,
    // conservative above it. These rows carry the loadId and the instant, so
    // each observation is paired with its own authorising row or with none.
    for (const e of logEdges) {
      const count = e._count._all;
      const first = e._min.occurredAt;
      const last = e._max.occurredAt;
      if (!count || !first || !last) continue;

      // A legal transition is not a violation and never reaches the gate. The
      // log records every transition, unlike the counter table which only ever
      // held rejected ones, so this filter is what makes the two comparable.
      if (validateLoadStatusTransition(e.fromStatus, e.toStatus, "AE").allowed) continue;

      violations += count;
      if (!since || first < since) since = first;

      if (accountedByLens(e.fromStatus, e.toStatus) !== null) continue;

      let residual = count;
      let authorisedHere = 0;
      if (isUncancelEdge(e.fromStatus, e.toStatus)) {
        for (const row of reversalLogRows) {
          if (row.toStatus !== e.toStatus) continue;
          if (wasAuthorisedUncancel(authRows, row.loadId, row.toStatus, row.occurredAt)) {
            authorisedHere += 1;
          }
        }
        authorisedUncancels += Math.min(authorisedHere, count);
        residual = Math.max(0, count - authorisedHere);
        if (residual === 0) continue;
      }

      unexpected += residual;
      if (!lastUnexpected || last > lastUnexpected) lastUnexpected = last;

      // Merged by edge rather than appended, so an edge seen both before and
      // after the migration reads as one row with one total. Two entries for one
      // pair would read as two distinct problems to investigate.
      const existing = edges.find((x) => x.from === e.fromStatus && x.to === e.toStatus);
      if (existing) {
        existing.count += residual;
        if (last.toISOString() > existing.last_seen_at) existing.last_seen_at = last.toISOString();
        if (first.toISOString() < existing.first_seen_at) existing.first_seen_at = first.toISOString();
        if (authorisedHere > 0) existing.authorised_count = (existing.authorised_count ?? 0) + authorisedHere;
      } else {
        edges.push({
          from: e.fromStatus,
          to: e.toStatus,
          count: residual,
          first_seen_at: first.toISOString(),
          last_seen_at: last.toISOString(),
          ...(authorisedHere > 0 ? { authorised_count: authorisedHere } : {}),
        });
      }
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


/**
 * The since-boot pair, derived from the SAME log as the cumulative pair.
 *
 * WHY IT IS NO LONGER AN IN-MEMORY COUNTER. It used to be two module-level
 * integers incremented by the client extension. With the counting moved to a
 * database trigger, leaving them client-side would have given /api/health two
 * derivations of the same question — a cumulative pair that sees every writer
 * and a since-boot pair that sees only the shared Prisma client. They would
 * disagree the first time a script with its own client moved a status, and the
 * disagreement would look like a bug in the gate rather than in the counter.
 * One source, two windows.
 *
 * The window is `occurredAt >= bootedAt`, which is what "since this process
 * started" has always meant; the field names are unchanged and now describe
 * something true of every writer rather than of one client.
 *
 * NOT CACHED, deliberately. It is a single bounded groupBy, and the cumulative
 * read beside it already carries the 30s TTL that keeps a load-balancer poll off
 * the database.
 *
 * A FAILED READ REPORTS NULL, NEVER ZERO — the same rule the cumulative pair
 * follows, and for the same reason: zero and unknown read identically at a
 * glance, on the field used to decide whether enforcement is safe to enable.
 */
export async function sinceBootStatusMachineCounters(
  db: CounterStore,
  bootedAt: Date,
): Promise<{ violations_since_boot: number | null; unexpected_since_boot: number | null }> {
  try {
    const edges = await db.loadStatusTransition.groupBy({
      by: ["fromStatus", "toStatus"],
      _count: { _all: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
      where: { occurredAt: { gte: bootedAt } },
    });

    // Reversal edges need the authorising rows to resolve, exactly as the
    // cumulative read does. Fetched only when one exists.
    const reversalRows = edges.some((e) => isUncancelEdge(e.fromStatus, e.toStatus))
      ? await db.loadStatusTransition.findMany({
          where: { fromStatus: "CANCELLED", occurredAt: { gte: bootedAt } },
          select: { loadId: true, fromStatus: true, toStatus: true, occurredAt: true },
        })
      : [];

    let authRows: AuthorisingRow[] = [];
    if (reversalRows.length > 0) {
      const times = reversalRows.map((r) => r.occurredAt.getTime());
      authRows = await db.auditTrail.findMany({
        where: {
          entityType: "Load",
          performedAt: {
            gte: new Date(Math.min(...times) - UNCANCEL_WINDOW_MS),
            lte: new Date(Math.max(...times) + UNCANCEL_WINDOW_MS),
          },
        },
        select: { entityId: true, performedById: true, performedAt: true, changedFields: true },
      });
    }

    let violations = 0;
    let unexpected = 0;

    for (const e of edges) {
      const count = e._count._all;
      if (!count) continue;
      if (validateLoadStatusTransition(e.fromStatus, e.toStatus, "AE").allowed) continue;

      violations += count;
      if (accountedByLens(e.fromStatus, e.toStatus) !== null) continue;

      let residual = count;
      if (isUncancelEdge(e.fromStatus, e.toStatus)) {
        let authorised = 0;
        for (const row of reversalRows) {
          if (row.toStatus !== e.toStatus) continue;
          if (wasAuthorisedUncancel(authRows, row.loadId, row.toStatus, row.occurredAt)) authorised += 1;
        }
        residual = Math.max(0, count - authorised);
      }
      unexpected += residual;
    }

    return { violations_since_boot: violations, unexpected_since_boot: unexpected };
  } catch (err) {
    log.warn({ err }, "[StatusMachine] since-boot read failed");
    return { violations_since_boot: null, unexpected_since_boot: null };
  }
}
