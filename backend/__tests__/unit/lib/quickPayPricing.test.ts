import { describe, it, expect } from "vitest";
import {
  quickPayFeePercent,
  standardNetDays,
  normalizeTier,
  quickPayAutoApprovePerLoad,
  quickPayMonthlyLimit,
  speedFromPaymentTier,
  paymentTierFromSpeed,
  quickPayFeePercentForPaymentTier,
} from "../../../src/lib/quickPayPricing";
import { getTierConfig } from "../../../src/services/caravanService";

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

  // Quick Pay Agreement §6 auto-approve ceilings.
  it("per-load auto-approve ceilings: Silver $2K · Gold $4K · Platinum $6K", () => {
    expect(quickPayAutoApprovePerLoad("SILVER")).toBe(2000);
    expect(quickPayAutoApprovePerLoad("GOLD")).toBe(4000);
    expect(quickPayAutoApprovePerLoad("PLATINUM")).toBe(6000);
  });

  it("rolling monthly ceilings: Silver $15K · Gold $40K · Platinum $80K", () => {
    expect(quickPayMonthlyLimit("SILVER")).toBe(15000);
    expect(quickPayMonthlyLimit("GOLD")).toBe(40000);
    expect(quickPayMonthlyLimit("PLATINUM")).toBe(80000);
  });
});

// The retired PaymentTier names are a SPEED label, never a price. A resolver
// keyed on them charged PARTNER 1.5%, a rung that exists in no version of §8.
describe("retired PaymentTier names map to speed, never to a fee", () => {
  it("maps every legacy member to a speed (matches the AE modal's uiKeyFromEnum)", () => {
    expect(speedFromPaymentTier("FLASH")).toBe("QP_SAMEDAY");
    expect(speedFromPaymentTier("EXPRESS")).toBe("QP_SAMEDAY");
    expect(speedFromPaymentTier("PRIORITY")).toBe("QP_7DAY");
    expect(speedFromPaymentTier("PARTNER")).toBe("QP_7DAY");
    expect(speedFromPaymentTier("ELITE")).toBe("STANDARD");
    expect(speedFromPaymentTier("STANDARD")).toBe("STANDARD");
    expect(speedFromPaymentTier(null)).toBe("STANDARD");
    expect(speedFromPaymentTier("something-else")).toBe("STANDARD");
  });

  it("round-trips the speeds we still write", () => {
    expect(paymentTierFromSpeed("QP_SAMEDAY")).toBe("FLASH");
    expect(paymentTierFromSpeed("QP_7DAY")).toBe("PRIORITY");
    expect(paymentTierFromSpeed("STANDARD")).toBe("STANDARD");
  });

  it("prices a legacy row from the carrier's tier, not from the retired name", () => {
    // PARTNER used to be a flat 1.5% for everyone. It is 7-day, so it now
    // prices at each tier's published 7-day rung.
    expect(quickPayFeePercentForPaymentTier("SILVER", "PARTNER")).toBe(3);
    expect(quickPayFeePercentForPaymentTier("GOLD", "PARTNER")).toBe(2);
    expect(quickPayFeePercentForPaymentTier("PLATINUM", "PARTNER")).toBe(1);

    // EXPRESS used to be a flat 3.5%. It is same-day, so it prices at the
    // tier's 7-day rung plus the universal +2%.
    expect(quickPayFeePercentForPaymentTier("SILVER", "EXPRESS")).toBe(5);
    expect(quickPayFeePercentForPaymentTier("PLATINUM", "EXPRESS")).toBe(3);
  });

  it("never charges a fee on standard tier terms, at any tier", () => {
    for (const tier of ["SILVER", "GOLD", "PLATINUM"]) {
      expect(quickPayFeePercentForPaymentTier(tier, "STANDARD")).toBe(0);
      expect(quickPayFeePercentForPaymentTier(tier, "ELITE")).toBe(0);
      expect(quickPayFeePercentForPaymentTier(tier, null)).toBe(0);
    }
  });
});

// caravanService TIER_CONFIG holds the same §8 economics in decimal form, and
// quickPayOverrideService prices same-day overrides from it. Two stores of one
// ladder is how the four resolvers happened. Until one derives from the other,
// this test makes any divergence fail loudly instead of quietly mispricing.
describe("caravanService TIER_CONFIG agrees with quickPayPricing", () => {
  it("matches on 7-day fee, same-day fee, net terms and both §6 ceilings", () => {
    for (const tier of ["SILVER", "GOLD", "PLATINUM"] as const) {
      const cfg = getTierConfig(tier);
      expect(cfg.quickPayFee7Day * 100).toBeCloseTo(quickPayFeePercent(tier), 6);
      expect(cfg.quickPayFeeSameDay * 100).toBeCloseTo(quickPayFeePercent(tier, true), 6);
      expect(cfg.paymentTermsDays).toBe(standardNetDays(tier));
      expect(cfg.quickPayAutoLimit).toBe(quickPayAutoApprovePerLoad(tier));
      expect(cfg.quickPayMonthlyLimit).toBe(quickPayMonthlyLimit(tier));
    }
  });
});
