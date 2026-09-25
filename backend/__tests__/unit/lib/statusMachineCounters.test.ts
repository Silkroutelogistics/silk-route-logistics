/**
 * The Load.status enforcement gate survives a deploy.
 *
 * WHY THIS EXISTS. /api/health has reported violations_since_boot and
 * unexpected_since_boot since v3.8.ayh, and both reset on boot. The gate §13.3
 * Item 194 sets is "a FULL DEPLOY CYCLE keeps unexpected at zero", which a
 * per-process counter cannot express -- Item 194 says as much about its own
 * first clean reading, a 2h18m window on a platform with almost no traffic.
 *
 * Three properties are pinned here, and each has a way of failing that looks
 * like success:
 *
 *   1. The writer NEVER THROWS. It hangs off a database write path that has
 *      already succeeded, so a counter failure must not reach it.
 *   2. `expected` is DERIVED from the AUTO map at read time, never stored. If it
 *      were stored, reconciling the map would leave history still calling an
 *      accounted-for edge unexpected, and the gate could never close.
 *   3. A FAILED READ REPORTS NULL, NEVER ZERO. Zero and unknown read the same to
 *      anyone glancing at the field, and this is the field used to decide
 *      whether enforcement is safe to switch on (§19 Sub-pattern 16).
 *
 * Phase 1 of the mandatory-ELD arc, commit 3 of 7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  persistTransitionObservation,
  cumulativeStatusMachineCounters,
  __resetCumulativeCache,
  type CounterStore,
} from "../../../src/lib/statusMachineCounters";
import {
  observeLoadTransition,
  setTransitionPersister,
} from "../../../src/lib/loadTransitionObserver";
import { validateLoadStatusTransition } from "../../../src/lib/loadStateMachine";
import * as fs from "fs";
import * as path from "path";

const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-05T00:00:00.000Z");
const T2 = new Date("2026-09-07T00:00:00.000Z");

function row(from: string, to: string, count: number, first = T0, last = T1) {
  return { fromStatus: from as any, toStatus: to as any, count, firstSeenAt: first, lastSeenAt: last };
}

/**
 * `audit` defaults to EMPTY rather than to something authorising.
 *
 * So every pre-existing case keeps the verdict it had: with no authorising rows
 * the UNCANCEL lens subtracts nothing, and a CANCELLED edge still counts. A
 * default that authorised would have quietly relaxed every case in this file.
 */
function store(
  rows: any[] = [],
  opts: { upsert?: any; findMany?: any; audit?: any[]; auditFindMany?: any } = {},
): CounterStore {
  return {
    statusMachineCounter: {
      upsert: opts.upsert ?? vi.fn().mockResolvedValue({}),
      findMany: opts.findMany ?? vi.fn().mockResolvedValue(rows),
    },
    auditTrail: {
      findMany: opts.auditFindMany ?? vi.fn().mockResolvedValue(opts.audit ?? []),
    },
  } as any;
}

/** An authorising LOAD_UNCANCELLED row in the shape recordLifecycleEvent writes. */
function authRow(
  loadId: string,
  to: string,
  at: Date,
  over: { actor?: boolean; reason?: string | null; detail?: string } = {},
) {
  const withActor = over.actor !== false;
  return {
    entityId: loadId,
    performedById: withActor ? "user_1" : null,
    performedAt: at,
    changedFields: {
      actionDetail: over.detail ?? "LOAD_UNCANCELLED",
      reason: over.reason === undefined ? "Need to issue TONU" : over.reason,
      previous: { status: "CANCELLED" },
      new: { status: to },
      actor: withActor ? { kind: "USER", userId: "user_1", email: "a@b.c" } : null,
    },
  };
}

// A tick further than the TTL, so a deliberate cache test can be written without
// waiting and every other case starts from a cold cache.
let clock = 1_000_000;
beforeEach(() => {
  __resetCumulativeCache();
  clock += 10_000_000;
  setTransitionPersister(null);
});

describe("persistTransitionObservation writes the durable half", () => {
  it("increments the row for this exact edge, creating it the first time", () => {
    const db = store();
    persistTransitionObservation(db, "BOOKED" as any, "DELIVERED" as any);

    expect(db.statusMachineCounter.upsert).toHaveBeenCalledTimes(1);
    const arg = (db.statusMachineCounter.upsert as any).mock.calls[0][0];
    expect(arg.where.fromStatus_toStatus).toEqual({ fromStatus: "BOOKED", toStatus: "DELIVERED" });
    expect(arg.update.count).toEqual({ increment: 1 });
    // The create branch is load-bearing rather than a formality: the first
    // observation of any edge has no row, and an update would throw.
    expect(arg.create).toEqual({ fromStatus: "BOOKED", toStatus: "DELIVERED", count: 1 });
  });

  // THE LOAD-BEARING CASE. The caller is a database write that already
  // succeeded. A counter failure that surfaced there would fail an operation
  // that was fine — the same rule recordCompassRecalcRun follows.
  it("never throws when the upsert rejects", async () => {
    const db = store([], { upsert: vi.fn().mockRejectedValue(new Error("counters on fire")) });
    expect(() => persistTransitionObservation(db, "BOOKED" as any, "DELIVERED" as any)).not.toThrow();
    // Let the rejection settle; an unhandled one would fail the run.
    await new Promise((r) => setImmediate(r));
  });

  it("never throws when the client itself is unusable", () => {
    const db = {
      statusMachineCounter: {
        upsert: () => {
          throw new Error("client is not connected");
        },
      },
    } as any;
    expect(() => persistTransitionObservation(db, "BOOKED" as any, "DELIVERED" as any)).not.toThrow();
  });
});

describe("the cumulative read is the gate, and states what it does not know", () => {
  it("sums every AE violation and counts only the AUTO-unaccounted ones as unexpected", async () => {
    // POSTED -> DISPATCHED is the documented auto-pilot divergence (§2): the AE
    // map rejects it and the AUTO map allows it, so it is a violation and is NOT
    // unexpected. BOOKED -> DELIVERED is in neither map.
    expect(validateLoadStatusTransition("POSTED" as any, "DISPATCHED" as any, "AUTO").allowed).toBe(true);
    expect(validateLoadStatusTransition("BOOKED" as any, "DELIVERED" as any, "AUTO").allowed).toBe(false);

    const r = await cumulativeStatusMachineCounters(
      store([row("POSTED", "DISPATCHED", 40), row("BOOKED", "DELIVERED", 2)]),
      clock,
    );

    expect(r.violations_cumulative).toBe(42);
    expect(r.unexpected_cumulative, "the accounted-for edge must not count against the gate").toBe(2);
    expect(r.unexpected_edges.map((e) => `${e.from}->${e.to}`)).toEqual(["BOOKED->DELIVERED"]);
  });

  // Derived, not stored. This is what lets reconciling the map END the soak: an
  // edge added to AUTO stops counting immediately, including its history. A
  // stored flag would keep calling it unexpected forever.
  it("classifies from the map at read time, so history reclassifies with the map", async () => {
    const rows = [row("POSTED", "DISPATCHED", 7)];
    const r = await cumulativeStatusMachineCounters(store(rows), clock);
    expect(r.violations_cumulative).toBe(7);
    expect(r.unexpected_cumulative).toBe(0);
    // Nothing on the row said "expected" — the map did.
    expect(Object.keys(rows[0])).not.toContain("expected");
  });

  it("reports when the record starts and when an unexpected edge was last seen", async () => {
    const r = await cumulativeStatusMachineCounters(
      store([
        row("POSTED", "DISPATCHED", 1, T0, T2), // later, but accounted for
        row("BOOKED", "DELIVERED", 1, T1, T1),
      ]),
      clock,
    );

    expect(r.cumulative_since, "earliest observation of anything").toBe(T0.toISOString());
    expect(
      r.unexpected_last_seen_at,
      "the accounted-for edge is more recent and must not set this",
    ).toBe(T1.toISOString());
  });

  it("an empty table is a real zero with no start date", async () => {
    const r = await cumulativeStatusMachineCounters(store([]), clock);
    expect(r.unexpected_cumulative).toBe(0);
    expect(r.violations_cumulative).toBe(0);
    expect(r.cumulative_since).toBe(null);
    expect(r.unexpected_last_seen_at).toBe(null);
    expect(r.error).toBeUndefined();
  });

  // THE OTHER LOAD-BEARING CASE. A signal that reads the same healthy and broken
  // has no discriminating power, and this is the field enforcement is decided
  // on. Zero must mean zero.
  it("a failed read reports null and an error, never zero", async () => {
    const db = store([], { findMany: vi.fn().mockRejectedValue(new Error("relation does not exist")) });
    const r = await cumulativeStatusMachineCounters(db, clock);

    expect(r.unexpected_cumulative).toBe(null);
    expect(r.violations_cumulative).toBe(null);
    expect(r.error).toContain("relation does not exist");
  });

  it("does not cache a failure, so the next call can still answer", async () => {
    const findMany = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce([row("BOOKED", "DELIVERED", 3)]);
    const db = store([], { findMany });

    expect((await cumulativeStatusMachineCounters(db, clock)).error).toBeDefined();
    const second = await cumulativeStatusMachineCounters(db, clock + 1);
    expect(second.error, "a transient failure must not pin unknown for the process").toBeUndefined();
    expect(second.unexpected_cumulative).toBe(3);
  });

  it("caches inside the TTL so a load-balancer poll does not hit the database", async () => {
    const db = store([row("BOOKED", "DELIVERED", 1)]);
    await cumulativeStatusMachineCounters(db, clock);
    await cumulativeStatusMachineCounters(db, clock + 1_000);
    expect(db.statusMachineCounter.findMany).toHaveBeenCalledTimes(1);

    await cumulativeStatusMachineCounters(db, clock + 60_000);
    expect(db.statusMachineCounter.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("the observer drives the durable half, and cannot be broken by it", () => {
  it("persists a violation, with the edge it observed", () => {
    const seen: Array<[string, string]> = [];
    setTransitionPersister((f, t) => seen.push([f, t]));

    observeLoadTransition({ from: "BOOKED" as any, to: "DELIVERED" as any, loadId: "L1" });
    expect(seen).toEqual([["BOOKED", "DELIVERED"]]);
  });

  it("persists the documented divergences too, because their counts are the evidence", () => {
    const seen: Array<[string, string]> = [];
    setTransitionPersister((f, t) => seen.push([f, t]));

    // Tagging is not whitelisting: how often auto-pilot dispatch actually fires
    // is exactly what decides whether the map gains the edge or the call site
    // changes. Recording only the surprises would throw that away.
    observeLoadTransition({ from: "POSTED" as any, to: "DISPATCHED" as any });
    expect(seen).toEqual([["POSTED", "DISPATCHED"]]);
  });

  it("writes nothing for a transition the AE map allows", () => {
    const persist = vi.fn();
    setTransitionPersister(persist);

    expect(validateLoadStatusTransition("POSTED" as any, "TENDERED" as any, "AE").allowed).toBe(true);
    observeLoadTransition({ from: "POSTED" as any, to: "TENDERED" as any });
    expect(persist).not.toHaveBeenCalled();
  });

  it("survives a persister that throws", () => {
    setTransitionPersister(() => {
      throw new Error("persister exploded");
    });
    expect(() =>
      observeLoadTransition({ from: "BOOKED" as any, to: "DELIVERED" as any }),
    ).not.toThrow();
  });
});

describe("the health payload actually reads the cumulative counters", () => {
  // STRUCTURAL, and narrow on purpose. healthFields.test.ts already asserts that
  // `status_machine` is assigned — and that assertion stays green if the field
  // carries ONLY the per-process pair, which is the state this commit exists to
  // fix. Presence is not function (§19 Sub-pattern 16): this asserts the
  // cumulative reader is called, not merely imported.
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/index.ts"), "utf8");
  const stripped = src.replace(/^\s*\/\/.*$/gm, "");

  it("calls cumulativeStatusMachineCounters inside the payload, not just imports it", () => {
    expect(stripped, "an import alone compiles cleanly and reports nothing").toMatch(
      /status_machine:\s*\{[\s\S]{0,300}?cumulativeStatusMachineCounters\(/,
    );
  });

  it("keeps the per-process pair alongside it", () => {
    expect(stripped).toMatch(/status_machine:\s*\{[\s\S]{0,300}?statusMachineCounters\(\)/);
  });

  it("its own matcher would fail on an import-only wiring", () => {
    const importOnly = 'import { cumulativeStatusMachineCounters } from "x";\n  status_machine: { ...a() },';
    expect(/status_machine:\s*\{[\s\S]{0,300}?cumulativeStatusMachineCounters\(/.test(importOnly)).toBe(
      false,
    );
  });
});

// ─── The UNCANCEL lens, through the read that actually decides ───────────────
//
// The pure predicates live in uncancelLens.test.ts. These drive the DERIVATION,
// because the gate is not the predicate — it is unexpected_cumulative, and a
// correct predicate wired in wrongly still leaves the gate wrong.
//
// Both directions in every case. The directive's own adversarial is "an un-cancel
// with an audit row is not counted; a raw CANCELLED -> DISPATCHED write is", and a
// suite that only proved the first half would pass just as happily on a lens that
// cleared everything.
describe("the UNCANCEL lens decides cancellation reversals at read time", () => {
  const OBS = new Date("2026-09-25T00:31:58.095Z");
  // 20ms after the observation — the real measured gap on SRL-121496, where the
  // audit row lands after the transition commits.
  const AUDIT = new Date("2026-09-25T00:31:58.115Z");

  it("an authorised reversal does NOT count against the gate", async () => {
    const r = await cumulativeStatusMachineCounters(
      store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], {
        audit: [authRow("load_1", "DISPATCHED", AUDIT)],
      }),
      clock,
    );
    expect(r.unexpected_cumulative, "the gate must clear for an authorised reversal").toBe(0);
    expect(r.unexpected_edges).toEqual([]);
    // Still a violation of the AE map, and still reported as one: authorised is
    // not the same as legal-by-the-map, and flattening the two would lose the
    // fact that the reversal happened at all.
    expect(r.violations_cumulative).toBe(1);
    expect(r.authorised_uncancels, "the clearing must be visible, not silent").toBe(1);
  });

  it("a RAW CANCELLED -> DISPATCHED write with no audit row DOES count", async () => {
    const r = await cumulativeStatusMachineCounters(
      store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], { audit: [] }),
      clock,
    );
    expect(r.unexpected_cumulative, "an unauthorised reversal is exactly what the gate is for").toBe(1);
    expect(r.unexpected_edges[0]).toMatchObject({ from: "CANCELLED", to: "DISPATCHED", count: 1 });
    expect(r.authorised_uncancels).toBe(0);
  });

  it("subtracts rather than skips: two observations, one authorised, leaves one", async () => {
    // The case a skip-on-any-authorisation lens would get wrong. A load reversed
    // properly and another moved by a raw write land on the SAME edge, because the
    // counter row is keyed on (from,to) and carries no loadId.
    const r = await cumulativeStatusMachineCounters(
      store([row("CANCELLED", "DISPATCHED", 2, OBS, OBS)], {
        audit: [authRow("load_1", "DISPATCHED", AUDIT)],
      }),
      clock,
    );
    expect(r.unexpected_cumulative).toBe(1);
    expect(r.unexpected_edges[0]).toMatchObject({ count: 1, authorised_count: 1 });
    expect(r.authorised_uncancels).toBe(1);
  });

  it("the window is enforced at BOTH ends", async () => {
    const inside = new Date(OBS.getTime() + 4_900);
    const outside = new Date(OBS.getTime() + 5_100);
    const near = await cumulativeStatusMachineCounters(
      store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], {
        audit: [authRow("load_1", "DISPATCHED", inside)],
      }),
      clock,
    );
    expect(near.unexpected_cumulative, "4.9s away is within the window").toBe(0);

    __resetCumulativeCache();
    const far = await cumulativeStatusMachineCounters(
      store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], {
        audit: [authRow("load_1", "DISPATCHED", outside)],
      }),
      clock + 1,
    );
    expect(
      far.unexpected_cumulative,
      "5.1s away must NOT authorise — otherwise a later reversal retroactively " +
        "clears an older raw write",
    ).toBe(1);
  });

  it("a row with the marker but no reason, or no actor, does not authorise", async () => {
    for (const [label, bad] of [
      ["no reason", authRow("load_1", "DISPATCHED", AUDIT, { reason: null })],
      ["blank reason", authRow("load_1", "DISPATCHED", AUDIT, { reason: "   " })],
      ["no actor", authRow("load_1", "DISPATCHED", AUDIT, { actor: false })],
      ["wrong detail", authRow("load_1", "DISPATCHED", AUDIT, { detail: "LOAD_RESTORED" })],
    ] as Array<[string, any]>) {
      __resetCumulativeCache();
      const r = await cumulativeStatusMachineCounters(
        store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], { audit: [bad] }),
        clock + Math.floor(Math.random() * 0) + 1,
      );
      expect(r.unexpected_cumulative, `${label} must not clear the gate`).toBe(1);
    }
  });

  it("an authorising row for a DIFFERENT target does not clear this edge", async () => {
    const r = await cumulativeStatusMachineCounters(
      store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], {
        audit: [authRow("load_1", "BOOKED", AUDIT)],
      }),
      clock,
    );
    expect(r.unexpected_cumulative, "a reversal to BOOKED says nothing about one to DISPATCHED").toBe(1);
  });

  it("does not read the audit trail at all when no reversal edge exists", async () => {
    // Cost, and blast radius: the audit trail grows without bound, and a read
    // nobody needs is a read that can fail and turn the gate UNKNOWN.
    const db = store([row("BOOKED", "DELIVERED", 1)], { audit: [] });
    await cumulativeStatusMachineCounters(db, clock);
    expect((db.auditTrail.findMany as any)).not.toHaveBeenCalled();
  });

  it("bounds the audit read by the observed window rather than scanning everything", async () => {
    const db = store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], { audit: [] });
    await cumulativeStatusMachineCounters(db, clock);
    const arg = (db.auditTrail.findMany as any).mock.calls[0][0];
    expect(arg.where.entityType).toBe("Load");
    expect(arg.where.performedAt.gte.getTime()).toBe(OBS.getTime() - 5_000);
    expect(arg.where.performedAt.lte.getTime()).toBe(OBS.getTime() + 5_000);
  });

  it("a failing audit read reports UNKNOWN, never a clean zero", async () => {
    // The whole point of the null convention: zero and unknown read identically
    // at a glance, and this is the field enforcement is decided on.
    const db = store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], {
      auditFindMany: vi.fn().mockRejectedValue(new Error("audit trail unreachable")),
    });
    const r = await cumulativeStatusMachineCounters(db, clock);
    expect(r.unexpected_cumulative).toBeNull();
    expect(r.authorised_uncancels).toBeNull();
    expect(r.error).toBeDefined();
  });

  it("never writes to the counter row while classifying", async () => {
    // The directive's explicit prohibition. The lens is a READ: it must not fix
    // the gate by mutating or deleting the row it is judging.
    const db = store([row("CANCELLED", "DISPATCHED", 1, OBS, OBS)], {
      audit: [authRow("load_1", "DISPATCHED", AUDIT)],
    });
    await cumulativeStatusMachineCounters(db, clock);
    expect(db.statusMachineCounter.upsert).not.toHaveBeenCalled();
  });
});
