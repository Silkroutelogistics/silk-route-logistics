// Arc 2 Item 5 — TONU fault-side billing and the carrier release window.
//
// Money path, so the branches are pinned individually rather than sampled. Both
// terms were ratified 2026-08-15 and had no code behind them until now
// (carrier-lifecycle audit F-7).

import { describe, it, expect } from "vitest";
import {
  resolveTonuBilling,
  assessCarrierRelease,
  isTonuFaultSide,
  TONU_FAULT_SIDES,
} from "../../../src/lib/tonuPolicy";
import { TONU_AMOUNT, CARRIER_RELEASE_WINDOW_HOURS } from "../../../src/lib/accessorialPolicy";

describe("isTonuFaultSide", () => {
  it("accepts exactly the three ratified sides", () => {
    expect(TONU_FAULT_SIDES).toEqual(["CUSTOMER", "CARRIER", "BROKER"]);
    for (const s of TONU_FAULT_SIDES) expect(isTonuFaultSide(s)).toBe(true);
  });

  it("rejects anything else, including the shapes a sloppy client would send", () => {
    for (const v of ["customer", "SHIPPER", "", null, undefined, 3, {}]) {
      expect(isTonuFaultSide(v)).toBe(false);
    }
  });
});

describe("resolveTonuBilling", () => {
  it("bills the customer AND pays the carrier when the customer caused it", () => {
    // The normal case, and the reason the term is called two-sided.
    const d = resolveTonuBilling("CUSTOMER");
    expect(d.billCustomer).toBe(true);
    expect(d.payCarrier).toBe(true);
    expect(d.amount).toBe(TONU_AMOUNT);
  });

  it("pays the carrier and bills nobody when SRL caused it", () => {
    // Comes out of SRL's margin. Deliberately uncomfortable, and correct.
    const d = resolveTonuBilling("BROKER");
    expect(d.payCarrier).toBe(true);
    expect(d.billCustomer).toBe(false);
    expect(d.amount).toBe(TONU_AMOUNT);
  });

  it("owes nothing in either direction when the carrier caused it", () => {
    const d = resolveTonuBilling("CARRIER");
    expect(d.billCustomer).toBe(false);
    expect(d.payCarrier).toBe(false);
    expect(d.amount).toBe(0);
  });

  it("reads the ratified amount rather than carrying its own figure", () => {
    // v3.8.asc made accessorialPolicy the single source. A literal here would
    // drift the moment the schedule changes, which is exactly the class of bug
    // that sprint existed to kill.
    expect(resolveTonuBilling("CUSTOMER").amount).toBe(TONU_AMOUNT);
    expect(resolveTonuBilling("BROKER").amount).toBe(TONU_AMOUNT);
  });

  it("never bills the customer without also paying the carrier", () => {
    // There is no ratified case where SRL collects a TONU and keeps it while
    // the carrier who held the appointment gets nothing.
    for (const side of TONU_FAULT_SIDES) {
      const d = resolveTonuBilling(side);
      if (d.billCustomer) expect(d.payCarrier).toBe(true);
    }
  });
});

describe("assessCarrierRelease", () => {
  const pickup = new Date("2026-08-20T12:00:00Z");

  it("is penalty-free well before the window", () => {
    const r = assessCarrierRelease(new Date("2026-08-19T12:00:00Z"), pickup);
    expect(r.penaltyFree).toBe(true);
    expect(r.hoursBeforePickup).toBeCloseTo(24, 5);
  });

  it("is penalty-free exactly at the boundary", () => {
    // "up to 4 hours" reads inclusively, and a boundary case on a penalty is
    // the right place to favour the carrier.
    const at = new Date(pickup.getTime() - CARRIER_RELEASE_WINDOW_HOURS * 3_600_000);
    expect(assessCarrierRelease(at, pickup).penaltyFree).toBe(true);
  });

  it("is not penalty-free just inside the window", () => {
    const inside = new Date(pickup.getTime() - (CARRIER_RELEASE_WINDOW_HOURS * 3_600_000 - 60_000));
    expect(assessCarrierRelease(inside, pickup).penaltyFree).toBe(false);
  });

  it("is not penalty-free after pickup time has passed", () => {
    const late = new Date(pickup.getTime() + 3_600_000);
    const r = assessCarrierRelease(late, pickup);
    expect(r.penaltyFree).toBe(false);
    expect(r.hoursBeforePickup).toBeLessThan(0);
  });

  it("measures against pickup, not against tender acceptance", () => {
    // The Rate Confirmation and accessorialPolicy both say "before pickup". The
    // brief that commissioned this said "within 4 hours of acceptance"; the
    // printed clause wins, and the divergence is logged for Wasi rather than
    // silently resolved. This test is what would fail if someone re-anchored it.
    const acceptedAt = new Date("2026-08-01T00:00:00Z");
    const releasedAt = new Date("2026-08-20T11:00:00Z"); // 1h before pickup, weeks after acceptance
    const r = assessCarrierRelease(releasedAt, pickup);
    expect(r.penaltyFree).toBe(false);
    expect(releasedAt.getTime()).toBeGreaterThan(acceptedAt.getTime());
  });

  it("uses the ratified window rather than a literal", () => {
    expect(assessCarrierRelease(new Date(pickup.getTime() - 3_600_000), pickup).windowHours).toBe(
      CARRIER_RELEASE_WINDOW_HOURS,
    );
  });
});
