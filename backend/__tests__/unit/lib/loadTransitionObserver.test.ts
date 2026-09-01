// Log-first observation of Load.status transitions.
//
// The audit finding said "wire validateLoadStatusTransition into the AE-side
// write sites." Doing that would have broken production: the map omits
// POSTED/TENDERED -> DISPATCHED (the §2 auto-pilot dispatch divergence) and the
// fall-off recovery re-post. So this observes and classifies instead, and these
// tests pin the classification — including a check that the "known divergence"
// list cannot silently go stale once the map is reconciled.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { observeLoadTransition, __KNOWN_DIVERGENCES } from "../../../src/lib/loadTransitionObserver";
import { validateLoadStatusTransition } from "../../../src/lib/loadStateMachine";
import { log } from "../../../src/lib/logger";

describe("observeLoadTransition", () => {
  beforeEach(() => vi.restoreAllMocks());

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
  it("every documented divergence is allowed under AUTO", () => {
    for (const d of __KNOWN_DIVERGENCES) {
      const v = validateLoadStatusTransition(d.from, d.to, "AUTO");
      expect(
        v.allowed,
        `${d.from} -> ${d.to} is documented as expected (${d.why}) but the AUTO ` +
          `map rejects it. The list and the map have drifted -- fix the map, or ` +
          `drop the entry.`,
      ).toBe(true);
    }
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
