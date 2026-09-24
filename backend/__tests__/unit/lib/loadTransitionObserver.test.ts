// Log-first observation of Load.status transitions.
//
// The audit finding said "wire validateLoadStatusTransition into the AE-side
// write sites." Doing that would have broken production: the map omits
// POSTED/TENDERED -> DISPATCHED (the §2 auto-pilot dispatch divergence) and the
// fall-off recovery re-post. So this observes and classifies instead, and these
// tests pin the classification — including a check that the "known divergence"
// list cannot silently go stale once the map is reconciled.

import { describe, it, expect, vi, afterEach } from "vitest";
import { observeLoadTransition, __KNOWN_DIVERGENCES } from "../../../src/lib/loadTransitionObserver";
import {
  accountedByLens,
  validateLoadStatusTransition,
} from "../../../src/lib/loadStateMachine";
import { log } from "../../../src/lib/logger";

describe("observeLoadTransition", () => {
  // RESTORE ONLY THE SPY THIS FILE INSTALLS -- never vi.restoreAllMocks().
  // setup.ts builds its prisma double from vi.mock factories whose members
  // carry defaults (`findMany: vi.fn().mockResolvedValue([])`).
  // restoreAllMocks calls mockRestore on every one of those, wiping the
  // defaults, and vitest reuses a worker across files -- so it kills whichever
  // file runs next in the same worker, not this one. That is §13.3 Item 318's
  // ERR_IPC_CHANNEL_CLOSED, which presents as an environment problem and is
  // not one. Five other suites still do this; see the arc notes.
  afterEach(() => {
    (log.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("says nothing about a transition the map allows", () => {
    // Silence on the happy path is the point: a line per status write would
    // bury the handful that matter.
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "BOOKED", to: "DISPATCHED", loadId: "l1" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("says nothing when the status is rewritten to itself", () => {
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "IN_TRANSIT", to: "IN_TRANSIT", loadId: "l1" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("flags a genuine skip as unexpected — this is the signal", () => {
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "BOOKED", to: "DELIVERED", loadId: "l9", operation: "update" });

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.expected).toBe(false);
    expect(payload.loadTransition).toBe("BOOKED->DELIVERED");
    expect(payload.loadId).toBe("l9");
    expect(payload.operation).toBe("update");
  });

  it("tags the documented §2 auto-pilot dispatch as expected", () => {
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "POSTED", to: "DISPATCHED", loadId: "l2" });

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.expected).toBe(true);
    expect(payload.why).toContain("auto-pilot");
  });

  it("tags the fall-off recovery re-post as expected", () => {
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "DISPATCHED", to: "POSTED", loadId: "l3" });

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.expected).toBe(true);
    expect(payload.why).toContain("fall-off");
  });

  it("tags a carrier-reported arrival as expected, under the CARRIER lens (C3)", () => {
    // BOOKED -> AT_PICKUP is the one move CARRIER_ALLOWED_TRANSITIONS exists to
    // permit, and carrierLoads validates it as CARRIER before writing. Judged
    // against AE alone it was the single thing in production nobody could
    // account for -- which held the enforcement gate open indefinitely.
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "BOOKED", to: "AT_PICKUP", loadId: "l7" });

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.expected).toBe(true);
    expect(payload.accountedBy, "the lens must be named, not just 'expected'").toBe("CARRIER");
    expect(payload.why).toContain("carrier");
  });

  it("an AE-driven skip is STILL unexpected — the lens widened, the signal did not go", () => {
    // The whole risk of adding a lens is that it quietly accounts for
    // everything. BOOKED -> DELIVERED is allowed by no map at all and must
    // still read as the surprise it is.
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "BOOKED", to: "DELIVERED", loadId: "l8" });

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.expected).toBe(false);
    expect(payload.accountedBy).toBeUndefined();
  });

  it("the CARRIER lens does NOT make an AE skip legal — it only explains the log", () => {
    // Observation is not permission. Adding the lens must not be readable as
    // having widened what an AE may do, because enforcement is the next step
    // and it reads the AE map.
    expect(validateLoadStatusTransition("BOOKED", "AT_PICKUP", "AE").allowed).toBe(false);
    expect(validateLoadStatusTransition("BOOKED", "AT_PICKUP", "CARRIER").allowed).toBe(true);
  });

  it("still emits expected divergences rather than suppressing them", () => {
    // Tagging is not whitelisting. Their frequency is the evidence that decides
    // whether the map gains the transition or the call site changes, so they
    // have to be counted, not hidden.
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    observeLoadTransition({ from: "TENDERED", to: "DISPATCHED", loadId: "l4" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cannot throw into the write path it is watching", () => {
    vi.spyOn(log, "warn").mockImplementation((() => {
      throw new Error("logger exploded");
    }) as any);
    expect(() => observeLoadTransition({ from: "BOOKED", to: "DELIVERED" })).not.toThrow();
  });

  it("tolerates a status the enum does not contain", () => {
    // updateMany with a computed value, or a row written before an enum change.
    const spy = vi.spyOn(log, "warn").mockImplementation((() => {}) as any);
    expect(() =>
      observeLoadTransition({ from: "NONSENSE" as any, to: "DELIVERED", loadId: "l5" }),
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });
});

describe("the known-divergence list cannot go stale silently", () => {
  it("lists only transitions the AE map actually rejects today", () => {
    // Once the map is reconciled to accept auto-pilot dispatch, that entry stops
    // being a divergence and this fails — which is the reminder to delete it
    // rather than leave a comment claiming a gap that closed.
    for (const d of __KNOWN_DIVERGENCES) {
      const verdict = validateLoadStatusTransition(d.from, d.to, "AE");
      expect(
        verdict.allowed,
        `${d.from}->${d.to} is now allowed by the AE map; drop it from KNOWN_DIVERGENCES`,
      ).toBe(false);
    }
  });

  it("covers both documented divergence classes", () => {
    const pairs = __KNOWN_DIVERGENCES.map((d) => `${d.from}->${d.to}`);
    expect(pairs).toContain("POSTED->DISPATCHED");
    expect(pairs).toContain("TENDERED->DISPATCHED");
    expect(pairs).toContain("BOOKED->POSTED");
    expect(pairs).toContain("DISPATCHED->POSTED");
  });
});

/**
 * Row 3a — the AUTO map and the documented divergences must agree.
 *
 * Before this, `expected: true` came from a hand-kept list while the map knew
 * nothing about those edges. Two descriptions of the same four transitions is
 * two things to keep in step, and the list is the one that would quietly go
 * stale. The observer now DERIVES `expected` from the map; the list survives
 * only to supply the human-readable reason.
 */
describe("the AUTO map is the source of `expected`", () => {
  it("every documented divergence is accounted for by SOME lens", () => {
    // Widened from AUTO-only by C3. A carrier reporting arrival is accounted
    // for by the CARRIER map; asserting AUTO alone would have forced the
    // carrier entries out of the list -- or, far worse, forced the edge INTO
    // the AUTO map, which would tell auto-pilot it may report arrivals.
    for (const d of __KNOWN_DIVERGENCES) {
      expect(
        accountedByLens(d.from, d.to),
        `${d.from} -> ${d.to} is documented as expected (${d.why}) but NO lens ` +
          `allows it. The list and the maps have drifted -- fix the map, or ` +
          `drop the entry.`,
      ).not.toBeNull();
    }
  });

  it("a divergence claiming the CARRIER lens is genuinely a CARRIER move", () => {
    // The stated reason is what a postmortem reads. An entry saying "carrier
    // reported arrival" that only AUTO allows would send somebody looking at
    // the wrong actor.
    const carrierEntries = __KNOWN_DIVERGENCES.filter((x) => /CARRIER lens/.test(x.why));
    expect(carrierEntries.length, "no CARRIER-lens entries — C3 was reverted?").toBeGreaterThan(0);
    for (const d of carrierEntries) {
      expect(
        validateLoadStatusTransition(d.from, d.to, "CARRIER").allowed,
        `${d.from} -> ${d.to} claims the CARRIER lens but the CARRIER map rejects it`,
      ).toBe(true);
    }
  });

  it("the lens predicate does not account for everything (vacuity tripwire)", () => {
    // A predicate that had come to return a lens for any input would mark every
    // transition expected, the gate would read zero, and enforcement would be
    // switched on over a signal that had stopped working.
    expect(accountedByLens("BOOKED", "DELIVERED")).toBeNull();
    expect(accountedByLens("POSTED", "COMPLETED")).toBeNull();
  });

  it("and still rejected under AE, which is why it is a divergence at all", () => {
    for (const d of __KNOWN_DIVERGENCES) {
      expect(
        validateLoadStatusTransition(d.from, d.to, "AE").allowed,
        `${d.from} -> ${d.to} is now allowed for an AE. If that is intended it is ` +
          `no longer a divergence and should leave this list.`,
      ).toBe(false);
    }
  });

  it("AUTO is not a superset of AE", () => {
    // The BOOKED checkpoint exists so an AE can review before committing
    // dispatch (§2). If AUTO simply widened AE, a human would inherit the right
    // to skip it and a deliberate control would disappear silently.
    expect(validateLoadStatusTransition("POSTED", "DISPATCHED", "AE").allowed).toBe(false);
    expect(validateLoadStatusTransition("POSTED", "DISPATCHED", "AUTO").allowed).toBe(true);
  });

  it("the divergence list is not empty (vacuity tripwire)", () => {
    expect(__KNOWN_DIVERGENCES.length).toBeGreaterThan(0);
  });
});
