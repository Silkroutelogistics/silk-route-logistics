/**
 * A missing rate reads as a dash, never as zero and never as somebody else's
 * number.
 *
 * The carrier portal rendered `carrierRate || rate`. Load.rate is a write-only
 * mirror whose meaning depends on which path created the load — the CUSTOMER
 * rate on the primary creation path — so that fallback showed SRL's revenue to
 * the party we pay out of it, on four screens, whenever carrierRate was null.
 */
import { describe, it, expect } from "vitest";
import {
  NO_VALUE, money, perMile, carrierPay, customerBilled, margin, marginPct, pct,
} from "./rateDisplay";

describe("money", () => {
  it("renders a dash for every flavour of absent", () => {
    // $0 would read as a priced load worth nothing and invite somebody to act
    // on it. A dash reads as "not set yet", which is the truth.
    expect(money(null)).toBe(NO_VALUE);
    expect(money(undefined)).toBe(NO_VALUE);
    expect(money(NaN)).toBe(NO_VALUE);
  });

  it("still shows a real zero, which is different from absent", () => {
    expect(money(0)).toBe("$0");
  });

  it("rounds, and groups", () => {
    expect(money(4850)).toBe("$4,850");
    expect(money(4850.5)).toBe("$4,851");
  });
});

describe("perMile", () => {
  it("guards the divisor as well as the numerator", () => {
    // An unguarded divide by a null or zero distance renders "$Infinity/mi".
    expect(perMile(1000, null)).toBe(NO_VALUE);
    expect(perMile(1000, 0)).toBe(NO_VALUE);
    expect(perMile(null, 500)).toBe(NO_VALUE);
  });

  it("computes when both sides are real", () => {
    expect(perMile(1000, 500)).toBe("$2.00/mi");
  });
});

describe("carrierPay — no fallback to Load.rate", () => {
  it("is null when the load has not been accepted", () => {
    // THE FIX. Previously this rendered the customer rate.
    expect(carrierPay({ carrierRate: null })).toBeNull();
    expect(carrierPay({})).toBeNull();
  });

  it("is the agreed rate once accepted", () => {
    expect(carrierPay({ carrierRate: 4100 })).toBe(4100);
  });

  it("cannot be reached by a Load.rate value", () => {
    // Even with rate present and carrierRate absent, the answer is null.
    expect(carrierPay({ carrierRate: null, rate: 5100 } as never)).toBeNull();
  });

  it("end to end, an un-accepted load renders a dash", () => {
    expect(money(carrierPay({ carrierRate: null }))).toBe(NO_VALUE);
    expect(money(carrierPay({ carrierRate: 4100 }))).toBe("$4,100");
  });
});

describe("customerBilled — the invoice wins over the intent", () => {
  it("prefers an invoiced total", () => {
    expect(customerBilled({ invoicedTotal: 5200, customerRate: 5100 })).toBe(5200);
  });

  it("falls back to customerRate, never to rate", () => {
    expect(customerBilled({ customerRate: 5100 })).toBe(5100);
    expect(customerBilled({ rate: 5100 } as never)).toBeNull();
  });

  it("is null when neither is known", () => {
    expect(customerBilled({})).toBeNull();
  });
});

describe("margin comes from billed minus cost, never from Load.rate", () => {
  it("is null unless BOTH sides are known", () => {
    // A margin computed against a missing cost is the revenue with a different
    // label, and it renders as 100%.
    expect(margin(5200, null)).toBeNull();
    expect(margin(null, 4100)).toBeNull();
    expect(marginPct(5200, null)).toBeNull();
  });

  it("computes when both are known", () => {
    expect(margin(5200, 4100)).toBe(1100);
    expect(marginPct(5200, 4100)).toBeCloseTo(21.15, 2);
  });

  it("does not divide by a zero or missing billed total", () => {
    expect(marginPct(0, 0)).toBeNull();
  });

  it("renders a dash rather than a misleading percentage", () => {
    expect(pct(marginPct(5200, null))).toBe(NO_VALUE);
    expect(pct(marginPct(5200, 4100))).toBe("21.2%");
  });
});

describe("the helpers are not constants", () => {
  it("distinguish present from absent in both directions", () => {
    // Every assertion above bar a few expects the dash; pin that these can say
    // something else, or `() => NO_VALUE` would satisfy most of the file.
    expect(money(1)).not.toBe(NO_VALUE);
    expect(perMile(10, 5)).not.toBe(NO_VALUE);
    expect(carrierPay({ carrierRate: 1 })).not.toBeNull();
    expect(customerBilled({ customerRate: 1 })).not.toBeNull();
  });
});
