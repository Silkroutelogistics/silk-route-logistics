import { describe, it, expect } from "vitest";
import { quickPayFeePercent, standardNetDays, normalizeTier } from "../../../src/lib/quickPayPricing";

// Locks CLAUDE.md §8 LOCKED Quick Pay pricing. A drift here (someone typing
// Silver 2% again) fails loudly instead of silently under/over-charging carriers.
describe("quickPayPricing — §8 LOCKED", () => {
  it("7-day standard fee: Silver 3% · Gold 2% · Platinum 1%", () => {
    expect(quickPayFeePercent("SILVER")).toBe(3);
    expect(quickPayFeePercent("GOLD")).toBe(2);
    expect(quickPayFeePercent("PLATINUM")).toBe(1);
  });

  it("same-day adds the universal +2% premium (Silver 5 · Gold 4 · Platinum 3)", () => {
    expect(quickPayFeePercent("SILVER", true)).toBe(5);
    expect(quickPayFeePercent("GOLD", true)).toBe(4);
    expect(quickPayFeePercent("PLATINUM", true)).toBe(3);
  });

  it("free standard net terms: Silver Net-30 · Gold Net-21 · Platinum Net-14", () => {
    expect(standardNetDays("SILVER")).toBe(30);
    expect(standardNetDays("GOLD")).toBe(21);
    expect(standardNetDays("PLATINUM")).toBe(14);
  });

  it("GUEST/NONE/null/unknown normalize to the Silver entry tier", () => {
    for (const t of ["GUEST", "NONE", null, undefined, "", "whatever"]) {
      expect(normalizeTier(t as any)).toBe("SILVER");
      expect(quickPayFeePercent(t as any)).toBe(3);
      expect(standardNetDays(t as any)).toBe(30);
    }
  });

  it("is case-insensitive on the stored tier value", () => {
    expect(quickPayFeePercent("platinum")).toBe(1);
    expect(quickPayFeePercent("Gold")).toBe(2);
  });
});
