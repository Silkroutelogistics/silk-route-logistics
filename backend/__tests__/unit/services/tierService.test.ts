/**
 * The Compass composite scores what was measured and nothing else.
 *
 * Until Phase 0 of the mandatory-ELD arc every carrier without telematics was
 * fed a constant 100 for tracking compliance, worth 15 points of the composite
 * on §9's published weights. That was not a neutral default: it was a claim of
 * a perfect tracking record on a platform that has never captured one. The
 * factor is now null when nothing measured it, and the composite renormalises
 * the six remaining weights so the score reflects the factors SRL can observe.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect } from "vitest";
import { calculateOverallScore } from "../../../src/services/tierService";

// 100*.2 + 90*.2 + 80*.1 + (100-10)*.15 + 70*.1 + 60*.1 = 72.5 over weight 0.85
const SIX = {
  onTimePickupPct: 100,
  onTimeDeliveryPct: 90,
  communicationScore: 80,
  claimRatio: 10,
  documentSubmissionTimeliness: 70,
  acceptanceRate: 60,
};
const SIX_WEIGHTED = 72.5;
const SIX_WEIGHT = 0.85;

describe("calculateOverallScore", () => {
  it("scores all seven factors on the published weights when tracking is measured", () => {
    // 72.5 + 50 * 0.15 = 80 exactly, so a change to any weight surfaces here.
    expect(calculateOverallScore({ ...SIX, gpsCompliancePct: 50 })).toBe(80);
  });

  it("excludes an unmeasured tracking factor and renormalises the remaining weights", () => {
    const expected = Math.round((SIX_WEIGHTED / SIX_WEIGHT) * 100) / 100; // 85.29
    expect(calculateOverallScore({ ...SIX, gpsCompliancePct: null })).toBe(expected);
  });

  it("does not credit an unmeasured carrier with a perfect tracking record", () => {
    const creditedWithPerfectTracking = calculateOverallScore({ ...SIX, gpsCompliancePct: 100 });
    const unmeasured = calculateOverallScore({ ...SIX, gpsCompliancePct: null });
    expect(unmeasured).not.toBe(creditedWithPerfectTracking);
    // And it is not the old constant-100 arithmetic wearing a null: the two
    // differ by the 15 tracking points minus the renormalisation lift.
    expect(creditedWithPerfectTracking).toBe(87.5);
  });

  // Phase 1 of the mandatory-ELD arc widened every factor to nullable, because
  // the recalc now writes a row for a carrier with no loads and every
  // load-derived factor is genuinely unmeasured for that carrier.

  it("excludes an unmeasured claimRatio instead of reading it as a perfect record", () => {
    // The trap: claimRatio is the one inverted term, computed as
    // `100 - claimRatio`, and `100 - null` is 100 in JavaScript. Left alone
    // that would have credited a carrier nobody has ever filed against with a
    // flawless claim history, which is a measurement rather than an absence.
    const withNullClaims = calculateOverallScore({ ...SIX, claimRatio: null, gpsCompliancePct: null });
    const withPerfectClaims = calculateOverallScore({ ...SIX, claimRatio: 0, gpsCompliancePct: null });
    expect(withNullClaims).not.toBe(withPerfectClaims);
  });

  it("scores 0 when nothing at all was measured, rather than inventing a number", () => {
    expect(
      calculateOverallScore({
        onTimePickupPct: null,
        onTimeDeliveryPct: null,
        communicationScore: null,
        claimRatio: null,
        documentSubmissionTimeliness: null,
        acceptanceRate: null,
        gpsCompliancePct: null,
      }),
    ).toBe(0);
  });

  it("renormalises over whichever factors survive, not just tracking", () => {
    // Two present out of seven: 20/20 weights on the two on-time factors, so
    // an average of 90 and 70 renormalises to exactly 80.
    expect(
      calculateOverallScore({
        onTimePickupPct: 90,
        onTimeDeliveryPct: 70,
        communicationScore: null,
        claimRatio: null,
        documentSubmissionTimeliness: null,
        acceptanceRate: null,
        gpsCompliancePct: null,
      }),
    ).toBe(80);
  });

  it("a carrier perfect on every measured factor still reads 100", () => {
    expect(
      calculateOverallScore({
        onTimePickupPct: 100,
        onTimeDeliveryPct: 100,
        communicationScore: 100,
        claimRatio: 0,
        documentSubmissionTimeliness: 100,
        acceptanceRate: 100,
        gpsCompliancePct: null,
      }),
    ).toBe(100);
  });

  it("a measured zero is a measurement, not an absence", () => {
    // 72.5 + 0 * 0.15 = 72.5: the factor counts, at zero, against the carrier.
    expect(calculateOverallScore({ ...SIX, gpsCompliancePct: 0 })).toBe(72.5);
  });
});
