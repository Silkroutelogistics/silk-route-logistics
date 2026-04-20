// Regression guard for the Caravan Partner Program tier resolver (v3.7.a).
// The pre-v3.7.a bug: `case "PLATINUM": return "GOLD"` silently demoted every
// Platinum carrier to Gold benefits. This suite pins identity mapping for
// the 3 active tiers plus the Silver fallback for Guest / None / unknown.

import { describe, it, expect } from "vitest";
import type { CarrierTier } from "@prisma/client";
import { getEffectiveTier, calculateTierFromMilestone } from "../../../src/services/caravanService";

describe("caravanService.getEffectiveTier", () => {
  it("maps PLATINUM to PLATINUM (identity — the pre-v3.7.a bug fix)", () => {
    expect(getEffectiveTier({ tier: "PLATINUM" })).toBe("PLATINUM");
  });

  it("maps GOLD to GOLD (identity)", () => {
    expect(getEffectiveTier({ tier: "GOLD" })).toBe("GOLD");
  });

  it("maps SILVER to SILVER (identity)", () => {
    expect(getEffectiveTier({ tier: "SILVER" })).toBe("SILVER");
  });

  it("maps GUEST to SILVER (Day-1 entry fallback)", () => {
    expect(getEffectiveTier({ tier: "GUEST" })).toBe("SILVER");
  });

  it("maps NONE to SILVER (Day-1 entry fallback)", () => {
    expect(getEffectiveTier({ tier: "NONE" })).toBe("SILVER");
  });

  it("maps any unexpected value to SILVER via the default branch", () => {
    // TypeScript barrier — cast to CarrierTier to exercise the default
    // branch the way legacy DB rows with orphaned enum values would hit it.
    expect(getEffectiveTier({ tier: "UNKNOWN_TIER" as CarrierTier })).toBe("SILVER");
  });
});

describe("caravanService.calculateTierFromMilestone", () => {
  it("M1_FIRST_LOAD earns SILVER (entry tier)", () => {
    expect(calculateTierFromMilestone("M1_FIRST_LOAD")).toBe("SILVER");
  });

  it("M4_PARTNER promotes the carrier to GOLD", () => {
    expect(calculateTierFromMilestone("M4_PARTNER")).toBe("GOLD");
  });

  it("M5_CORE promotes the carrier to PLATINUM", () => {
    expect(calculateTierFromMilestone("M5_CORE")).toBe("PLATINUM");
  });
});
