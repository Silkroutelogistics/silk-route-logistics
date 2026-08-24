import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_WEIGHTS,
  normalizeEquipment,
  classifyEquipmentMatch,
  laneHistoryFactor,
  tierFactor,
  rateFactor,
  onTimeFactor,
  equipmentFactor,
  totalWeight,
  routingGuideFactor,
  NEUTRAL_NO_GUIDE,
  compositeScore,
} from "../../../src/services/waterfallScoringService";

// The waterfall scoring core determines carrier dispatch RANK. These are the pure
// factor functions + weights that compose the composite match score; getting them
// wrong silently re-orders who gets offered freight first.

describe("waterfallScoring — DEFAULT_WEIGHTS", () => {
  it("the composite divides by the weight TOTAL, which is no longer 100", () => {
    // This assertion used to read "sums to 100", and it went on passing after
    // routingGuide was added because it only ever summed the ORIGINAL FIVE
    // fields — a sub-sum that still equals 100 while describing a formula that
    // no longer exists. Assert the divisor the code actually uses.
    const w = DEFAULT_WEIGHTS;
    expect(totalWeight(w)).toBe(120);
    expect(totalWeight(w)).toBe(
      w.laneHistory + w.tier + w.rate + w.onTime + w.equipment + w.routingGuide,
    );
  });

  it("gives every factor real weight, so none is wired-but-inert", () => {
    // A zero weight is how a factor gets "shipped" while doing nothing.
    for (const [name, v] of Object.entries(DEFAULT_WEIGHTS)) {
      expect(v, name + " should carry weight").toBeGreaterThan(0);
    }
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

/**
 * B4 — the routing guide becomes a scoring input.
 *
 * A shipper's routing guide names which carriers they want on a lane and in what
 * order. The tables existed and nothing read them, so a customer could rank
 * three carriers for a lane and dispatch would offer freight in whatever order
 * the other five factors happened to produce.
 *
 * THE RISK IN ADDING A SIXTH FACTOR is that it silently re-ranks dispatch for
 * every load in the system on the day it ships — including the ~all of them
 * that have no routing guide, because RoutingGuideEntry has zero rows today.
 * The tests below exist to prove that does NOT happen: with no guide, the new
 * composite is an affine transform of the old one, so the ORDER is identical.
 * The wiring changes what is possible, not who gets offered freight today.
 */
describe("waterfallScoring — routingGuideFactor", () => {
  it("is neutral, not zero, when the carrier is not on a guide", () => {
    // Zero would be a PENALTY for the absence of a table nobody has populated —
    // it would rank every carrier in the system below a hypothetical listed one
    // and, with no rows anywhere, simply drag every score down uniformly.
    expect(routingGuideFactor(null)).toBe(NEUTRAL_NO_GUIDE);
    expect(NEUTRAL_NO_GUIDE).toBe(50);
    expect(routingGuideFactor(null)).toBeGreaterThan(0);
  });

  it("rewards a better rank, and never inverts", () => {
    expect(routingGuideFactor(1)).toBe(100);
    expect(routingGuideFactor(2)).toBe(85);
    expect(routingGuideFactor(3)).toBe(70);
    expect(routingGuideFactor(4)).toBe(60);
    // Monotone non-increasing in rank — rank 1 is the shipper's first choice.
    const ranks = [1, 2, 3, 4, 5, 10];
    const scores = ranks.map(routingGuideFactor);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("keeps a listed carrier above an unlisted one at every rank", () => {
    // The whole point of the factor. A carrier the shipper named must not score
    // below one they did not, however deep in the guide they sit.
    for (const rank of [1, 2, 3, 4, 9, 25]) {
      expect(routingGuideFactor(rank)).toBeGreaterThan(NEUTRAL_NO_GUIDE);
    }
  });

  it("treats rank 0 and negatives as first choice rather than misreading them", () => {
    // Ranks are 1-based; a 0 would mean somebody stored a position wrong. Best
    // choice is the safe reading — the alternative is a listed carrier scoring
    // as if unlisted.
    expect(routingGuideFactor(0)).toBe(100);
    expect(routingGuideFactor(-1)).toBe(100);
  });
});

describe("B4 — adding the factor does not re-rank today's dispatch", () => {
  const W = DEFAULT_WEIGHTS;

  /**
   * The composite as it stood BEFORE B4: five factors over 100.
   *
   * This one is necessarily a local re-statement — the formula no longer exists
   * in the codebase to call. It is the historical baseline the order-preservation
   * proof is measured against, and it is safe to restate precisely because it is
   * frozen: it can never drift, having no live counterpart.
   */
  const oldComposite = (f: {
    lane: number; tier: number; rate: number; onTime: number; equip: number;
  }) =>
    (f.lane * W.laneHistory + f.tier * W.tier + f.rate * W.rate +
      f.onTime * W.onTime + f.equip * W.equipment) / 100;

  /**
   * The composite as it stands NOW — calling the ENGINE'S OWN function, not a
   * copy of it. Re-implementing it here would have passed just as happily if
   * the engine dropped routingGuide from its sum or divided by 100.
   */
  const newComposite = (
    f: { lane: number; tier: number; rate: number; onTime: number; equip: number },
    guideRank: number | null,
  ) =>
    compositeScore({
      laneHistory: f.lane,
      tier: f.tier,
      rate: f.rate,
      onTime: f.onTime,
      equipment: f.equip,
      routingGuide: routingGuideFactor(guideRank),
    });

  const carriers = [
    { name: "strong",  lane: 90, tier: 85, rate: 70, onTime: 95, equip: 100 },
    { name: "middle",  lane: 50, tier: 60, rate: 80, onTime: 70, equip: 100 },
    { name: "weak",    lane: 10, tier: 40, rate: 55, onTime: 45, equip: 60 },
    { name: "cheap",   lane: 20, tier: 40, rate: 100, onTime: 50, equip: 100 },
    { name: "loyal",   lane: 100, tier: 100, rate: 30, onTime: 100, equip: 100 },
  ];

  it("with no guide anywhere, the new composite is an affine transform of the old", () => {
    // new = old * (100 / total) + (NEUTRAL * routingGuideWeight) / total
    // Positive slope, constant intercept => strictly order-preserving.
    const slope = 100 / totalWeight(W);
    const intercept = (NEUTRAL_NO_GUIDE * W.routingGuide) / totalWeight(W);

    for (const c of carriers) {
      expect(newComposite(c, null)).toBeCloseTo(oldComposite(c) * slope + intercept, 10);
    }
    expect(slope).toBeGreaterThan(0);
  });

  it("preserves the exact dispatch ORDER for every pair, which is what ships", () => {
    // Scores move; rank does not. Rank is what decides who gets the tender.
    for (const a of carriers) {
      for (const b of carriers) {
        if (a.name === b.name) continue;
        const oldCmp = Math.sign(oldComposite(a) - oldComposite(b));
        const newCmp = Math.sign(newComposite(a, null) - newComposite(b, null));
        expect(newCmp, a.name + " vs " + b.name + " must not swap").toBe(oldCmp);
      }
    }
  });

  it("the full sorted ranking is unchanged", () => {
    const byOld = [...carriers].sort((a, b) => oldComposite(b) - oldComposite(a)).map((c) => c.name);
    const byNew = [...carriers].sort((a, b) => newComposite(b, null) - newComposite(a, null)).map((c) => c.name);
    expect(byNew).toEqual(byOld);
  });

  it("but a guide entry DOES move a carrier up — the factor is not decorative", () => {
    // The counterpart to the four assertions above. Order-preserving with no
    // guide would be equally true of a factor that did nothing at all, so prove
    // it bites once a shipper actually ranks somebody.
    const weak = carriers.find((c) => c.name === "weak")!;
    const middle = carriers.find((c) => c.name === "middle")!;

    expect(newComposite(weak, null)).toBeLessThan(newComposite(middle, null));
    // Shipper names the weak carrier first choice; it should overtake.
    expect(newComposite(weak, 1)).toBeGreaterThan(newComposite(weak, null));
    // 20 weight over a 120 total moves a listed carrier by (100-50)*20/120 ≈ 8.3
    // points — enough to matter, not enough to erase a large quality gap.
    expect(newComposite(weak, 1) - newComposite(weak, null)).toBeCloseTo(
      ((100 - NEUTRAL_NO_GUIDE) * W.routingGuide) / totalWeight(W), 10,
    );
  });

  it("stays inside 0..100 so the composite is still a percentage", () => {
    const best = { lane: 100, tier: 100, rate: 100, onTime: 100, equip: 100 };
    const worst = { lane: 0, tier: 0, rate: 0, onTime: 0, equip: 0 };
    expect(newComposite(best, 1)).toBeLessThanOrEqual(100);
    expect(newComposite(worst, null)).toBeGreaterThanOrEqual(0);
    expect(newComposite(best, 1)).toBe(100);
  });
  it("the ENGINE routes through compositeScore, so these tests are not a copy", () => {
    // Without this, someone could inline the formula back into
    // scoreCarriersForLoad and every assertion above would keep passing while
    // testing a function the engine no longer calls — the Item 222.5 failure,
    // where a proof reproduces the code instead of exercising it.
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/services/waterfallScoringService.ts"),
      "utf8",
    );
    const at = src.indexOf("export async function scoreCarriersForLoad");
    expect(at, "should have found the engine").toBeGreaterThan(-1);
    const engine = src.slice(at);
    expect(engine.length, "engine body should be substantial").toBeGreaterThan(200);
    expect(engine.includes("const weighted = compositeScore(")).toBe(true);
  });
});
