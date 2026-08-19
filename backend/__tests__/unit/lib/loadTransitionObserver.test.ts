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
