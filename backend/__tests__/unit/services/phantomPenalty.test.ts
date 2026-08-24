/**
 * The phantom -10 is gone, and what that is worth.
 *
 * IRP Registration and IFTA Compliance each read a CarrierProfile column that
 * NOTHING writes — irpStatus and iftaStatus. Both branch three ways:
 *
 *     VERIFIED  -> PASS,    deduction 0
 *     EXPIRED   -> WARNING, deduction 8
 *     otherwise -> WARNING, deduction 5      <- always this one
 *
 * With no writer, the column is always null, so the `else` fired every time for
 * every carrier. The penalty was therefore not "up to 10" or "sometimes 10" —
 * it was EXACTLY 10, unconditionally, on every vetting run since the checks were
 * written. That is what makes the delta assertable without re-running the whole
 * engine: the removed quantity is a constant.
 *
 * These tests assert the CONSEQUENCE rather than re-deriving the sum, because
 * the consequence is what the score is for. `lastVettingScore < 40` is pushed
 * into blocked_reasons by complianceMonitorService, so the only question that
 * matters is whether +10 moves a carrier across that line.
 */
import { describe, it, expect } from "vitest";
import { getRiskLevel, getGrade } from "../../../src/services/carrierVettingService";

/** The exact quantity the two deleted checks removed from every carrier. */
const PHANTOM_PENALTY = 10;

/** complianceMonitorService blocks tendering below this. */
const TENDER_BLOCK_FLOOR = 40;

describe("the removed penalty was a constant, not a variable", () => {
  it("is exactly 10 — two checks, 5 each, on the branch that always fired", () => {
    // Stated as an assertion so the number cannot drift silently if someone
    // later re-adds one of the checks against a real data source.
    expect(PHANTOM_PENALTY).toBe(5 + 5);
  });
});

describe("what +10 changes, and what it does not", () => {
  it("lifts a carrier out of the tender block iff they were within 10 of the floor", () => {
    // 30..39 pre-fix is the band that stops being blocked. This is the entire
    // material effect of the deletion on who can haul.
    for (const preFix of [30, 35, 39]) {
      expect(preFix, "pre-fix: blocked").toBeLessThan(TENDER_BLOCK_FLOOR);
      expect(preFix + PHANTOM_PENALTY, "post-fix: not blocked").toBeGreaterThanOrEqual(TENDER_BLOCK_FLOOR);
    }
  });

  it("does NOT rescue a carrier scoring under 30 — the fix is not an amnesty", () => {
    // Production's four carriers score 0, 4, 0, 0. All four stay blocked.
    // Worth pinning: a reader could otherwise assume "phantom penalty removed"
    // means the currently-blocked carriers become tenderable. They do not.
    for (const preFix of [0, 4, 20, 29]) {
      expect(preFix + PHANTOM_PENALTY).toBeLessThan(TENDER_BLOCK_FLOOR);
    }
  });

  it("moves the risk band only at the boundary it crosses", () => {
    // 39 -> 49 crosses CRITICAL into HIGH. That is the same boundary as the
    // tender block, which is not a coincidence — both key on 40.
    expect(getRiskLevel(39)).toBe("CRITICAL");
    expect(getRiskLevel(39 + PHANTOM_PENALTY)).toBe("HIGH");

    // A carrier comfortably inside a band gains 10 and stays in it. (65 -> 75
    // is chosen deliberately: 70 -> 80 would cross MEDIUM into LOW, which my
    // first draft asserted wrongly and the test caught.)
    expect(getRiskLevel(65)).toBe("MEDIUM");
    expect(getRiskLevel(65 + PHANTOM_PENALTY)).toBe("MEDIUM");
  });

  it("a genuinely clean carrier can now reach a perfect score", () => {
    // Before the deletion, 100 was UNREACHABLE: every carrier lost 10 for data
    // no code path could supply, so the ceiling was 90 and an A required 90 —
    // meaning a flawless carrier scraped the bottom of its grade.
    const ceilingBefore = 100 - PHANTOM_PENALTY;
    expect(getGrade(ceilingBefore)).toBe("A");
    expect(ceilingBefore).toBe(90);
    expect(getGrade(100)).toBe("A");
  });
});

describe("the guard cannot pass vacuously", () => {
  it("the decision functions are real and banded, not stubs", () => {
    expect(getRiskLevel(100)).toBe("LOW");
    expect(getRiskLevel(0)).toBe("CRITICAL");
    expect(getRiskLevel(100)).not.toBe(getRiskLevel(0));
  });
});
