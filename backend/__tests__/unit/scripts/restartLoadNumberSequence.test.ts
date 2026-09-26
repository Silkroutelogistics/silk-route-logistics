// The production sequence move (§21.2, corrected 2026-09-26): 5003 next -> 121498 next,
// forward only, anchored on the last legacy load. The script is dry-run by default.
import { describe, it, expect } from "vitest";
import { planSequenceMove } from "../../../scripts/restart-load-number-sequence";

const prod = { lastValue: 5002, isCalled: true, maxLegacyStem: 121497, lowestBareAtOrAboveFloor: null };

describe("planSequenceMove", () => {
  it("production's state (next 5003) sets the sequence to 121497, so the next load is 121498", () => {
    expect(planSequenceMove(prod)).toEqual({ setTo: 121497 });
  });

  it("does nothing where there is no sequence yet, or it already continues at 121498", () => {
    expect(planSequenceMove({ ...prod, lastValue: null, isCalled: false }).noop).toBeTruthy();
    expect(planSequenceMove({ ...prod, lastValue: 121497, isCalled: true }).noop).toBeTruthy();
    expect(planSequenceMove({ ...prod, lastValue: 121498, isCalled: false }).noop).toBeTruthy();
  });

  it("refuses to move backwards, a moved anchor, and a bare number already at or above 121498", () => {
    expect(planSequenceMove({ ...prod, lastValue: 121498, isCalled: true }).refuse).toMatch(/backwards/);
    expect(planSequenceMove({ ...prod, maxLegacyStem: 121496 }).refuse).toMatch(/121496/);
    expect(planSequenceMove({ ...prod, maxLegacyStem: null }).refuse).toBeTruthy();
    expect(planSequenceMove({ ...prod, lowestBareAtOrAboveFloor: 121498 }).refuse).toMatch(/121498/);
  });
});
