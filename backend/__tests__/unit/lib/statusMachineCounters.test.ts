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

function store(rows: any[] = [], opts: { upsert?: any; findMany?: any } = {}): CounterStore {
  return {
    statusMachineCounter: {
      upsert: opts.upsert ?? vi.fn().mockResolvedValue({}),
      findMany: opts.findMany ?? vi.fn().mockResolvedValue(rows),
    },
  } as any;
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
