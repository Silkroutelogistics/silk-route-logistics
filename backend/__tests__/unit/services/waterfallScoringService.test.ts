import { describe, it, expect } from "vitest";
import {
  DEFAULT_WEIGHTS,
  normalizeEquipment,
  classifyEquipmentMatch,
  laneHistoryFactor,
  tierFactor,
  rateFactor,
  onTimeFactor,
  equipmentFactor,
} from "../../../src/services/waterfallScoringService";

// The waterfall scoring core determines carrier dispatch RANK. These are the pure
// factor functions + weights that compose the composite match score; getting them
// wrong silently re-orders who gets offered freight first.

describe("waterfallScoring — DEFAULT_WEIGHTS", () => {
  it("sums to 100 (the weighted formula divides each factor by 100)", () => {
    const w = DEFAULT_WEIGHTS;
    expect(w.laneHistory + w.tier + w.rate + w.onTime + w.equipment).toBe(100);
  });
});

describe("waterfallScoring — laneHistoryFactor", () => {
  it("rewards repeat-lane history in tiers", () => {
    expect(laneHistoryFactor(0)).toBe(0);
    expect(laneHistoryFactor(1)).toBe(40);
    expect(laneHistoryFactor(2)).toBe(60);
    expect(laneHistoryFactor(3)).toBe(100);
    expect(laneHistoryFactor(10)).toBe(100); // saturates at 3+
  });
});

describe("waterfallScoring — tierFactor", () => {
  it("ranks CPP tiers", () => {
    expect(tierFactor("PLATINUM" as any)).toBe(100);
    expect(tierFactor("GOLD" as any)).toBe(75);
    expect(tierFactor("SILVER" as any)).toBe(50);
  });
});

describe("waterfallScoring — rateFactor", () => {
  it("is neutral (50) when either rate is unknown or target is non-positive", () => {
    expect(rateFactor(null, 1000)).toBe(50);
    expect(rateFactor(1000, null)).toBe(50);
    expect(rateFactor(1000, 0)).toBe(50);
  });
  it("rewards at-or-under target, penalizes overshoot by band", () => {
    expect(rateFactor(900, 1000)).toBe(100); // under
    expect(rateFactor(1000, 1000)).toBe(100); // exactly at
    expect(rateFactor(1050, 1000)).toBe(50); // 5% over (<=10%)
    expect(rateFactor(1100, 1000)).toBe(50); // exactly 10% over
    expect(rateFactor(1200, 1000)).toBe(0); // 20% over
  });
});

describe("waterfallScoring — onTimeFactor", () => {
  it("bands on-time delivery %", () => {
    expect(onTimeFactor(99)).toBe(100);
    expect(onTimeFactor(95)).toBe(100);
    expect(onTimeFactor(94)).toBe(75);
    expect(onTimeFactor(90)).toBe(75);
    expect(onTimeFactor(89)).toBe(50);
    expect(onTimeFactor(85)).toBe(50);
    expect(onTimeFactor(84)).toBe(25);
    expect(onTimeFactor(0)).toBe(25); // new carrier (no scorecard) floors here
  });
});

describe("waterfallScoring — equipmentFactor", () => {
  it("scores match quality", () => {
    expect(equipmentFactor("exact")).toBe(100);
    expect(equipmentFactor("compatible")).toBe(50);
    expect(equipmentFactor("none")).toBe(0);
  });
});

describe("waterfallScoring — normalizeEquipment", () => {
  it("upper-cases and strips spaces/underscores/dashes", () => {
    expect(normalizeEquipment("Dry Van")).toBe("DRYVAN");
    expect(normalizeEquipment("step-deck")).toBe("STEPDECK");
    expect(normalizeEquipment("reefer_van")).toBe("REEFERVAN");
    expect(normalizeEquipment("")).toBe("");
  });
});

describe("waterfallScoring — classifyEquipmentMatch", () => {
  it("returns exact on identical normalized keys", () => {
    expect(classifyEquipmentMatch("DRYVAN", "Dry Van")).toBe("exact");
    expect(classifyEquipmentMatch("FLATBED", "flatbed")).toBe("exact");
  });
  it("returns compatible within an equipment family", () => {
    expect(classifyEquipmentMatch("FLATBED", "Step Deck")).toBe("compatible");
    expect(classifyEquipmentMatch("STEPDECK", "Flatbed")).toBe("compatible");
    expect(classifyEquipmentMatch("DRYVAN", "Van")).toBe("compatible");
  });
  it("returns null for incompatible or empty", () => {
    expect(classifyEquipmentMatch("FLATBED", "Reefer")).toBeNull();
    expect(classifyEquipmentMatch("", "Van")).toBeNull();
    expect(classifyEquipmentMatch("DRYVAN", "")).toBeNull();
  });
});

describe("waterfallScoring — composite ranking (factors × DEFAULT_WEIGHTS)", () => {
  // Mirrors the weighted sum in scoreCarriersForLoad: sum(factor * weight / 100).
  const composite = (f: { lane: number; tier: number; rate: number; onTime: number; equip: number }) =>
    (f.lane * DEFAULT_WEIGHTS.laneHistory) / 100 +
    (f.tier * DEFAULT_WEIGHTS.tier) / 100 +
    (f.rate * DEFAULT_WEIGHTS.rate) / 100 +
    (f.onTime * DEFAULT_WEIGHTS.onTime) / 100 +
    (f.equip * DEFAULT_WEIGHTS.equipment) / 100;

  it("ranks a proven platinum exact-match above a new silver no-match", () => {
    const strong = composite({
      lane: laneHistoryFactor(3), tier: tierFactor("PLATINUM" as any),
      rate: rateFactor(900, 1000), onTime: onTimeFactor(98), equip: equipmentFactor("exact"),
    });
    const weak = composite({
      lane: laneHistoryFactor(0), tier: tierFactor("SILVER" as any),
      rate: rateFactor(1300, 1000), onTime: onTimeFactor(0), equip: equipmentFactor("none"),
    });
    expect(strong).toBe(100); // all factors max → weighted sum = sum(weights) = 100
    expect(weak).toBeLessThan(strong);
    // weak: lane=0, tier=50, rate=0 (20%>10% overshoot), onTime=25 (no scorecard), equip=0
    // → only tier (50×25/100) + onTime (25×15/100) contribute = 12.5 + 3.75
    expect(weak).toBeCloseTo(
      (50 * DEFAULT_WEIGHTS.tier) / 100 + (25 * DEFAULT_WEIGHTS.onTime) / 100,
      5,
    );
  });
});
