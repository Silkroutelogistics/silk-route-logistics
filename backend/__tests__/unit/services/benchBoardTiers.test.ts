/**
 * The bench board's tier classification must AGREE with the gate.
 *
 * A dashboard that computes its own opinion of who can haul is a dashboard that
 * will eventually disagree with the thing that actually decides, and the
 * disagreement gets discovered by an AE who has already promised a shipper a
 * truck. These tests pin the board's banding to complianceMonitorService's, and
 * pin the constants to the same module rather than to numbers typed twice.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  authorityTier,
  previousEtWeekStart,
  AUTHORITY_MIN_MONTHS,
  AUTHORITY_STANDARD_MONTHS,
} from "../../../src/services/benchBoardService";
import { AUTHORITY_AGE_GATE_LIVE_AT } from "../../../src/services/complianceMonitorService";
import { etStartOfWeek, etParts } from "../../../src/lib/financePeriods";

const NOW = new Date("2026-08-24T15:00:00Z");
const monthsAgo = (n: number) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
};

/** Approved AFTER the gate went live, so the grandfather clause does not apply. */
const POST_GATE = new Date(AUTHORITY_AGE_GATE_LIVE_AT.getTime() + 86_400_000);
/** Approved BEFORE it, so the carrier is grandfathered. */
const PRE_GATE = new Date(AUTHORITY_AGE_GATE_LIVE_AT.getTime() - 86_400_000);

describe("authorityTier — Item 182's three tiers", () => {
  it("18 months and over is READY", () => {
    expect(authorityTier({ authorityGrantedDate: monthsAgo(18), approvedAt: POST_GATE }, NOW)).toBe("READY");
    expect(authorityTier({ authorityGrantedDate: monthsAgo(60), approvedAt: POST_GATE }, NOW)).toBe("READY");
  });

  it("12 up to 18 months is OVERRIDE_ELIGIBLE", () => {
    expect(authorityTier({ authorityGrantedDate: monthsAgo(12), approvedAt: POST_GATE }, NOW)).toBe("OVERRIDE_ELIGIBLE");
    expect(authorityTier({ authorityGrantedDate: monthsAgo(17), approvedAt: POST_GATE }, NOW)).toBe("OVERRIDE_ELIGIBLE");
  });

  it("under 12 months is BLOCKED", () => {
    expect(authorityTier({ authorityGrantedDate: monthsAgo(11), approvedAt: POST_GATE }, NOW)).toBe("BLOCKED");
    expect(authorityTier({ authorityGrantedDate: monthsAgo(0), approvedAt: POST_GATE }, NOW)).toBe("BLOCKED");
  });

  it("is exactly three tiers — the retired four-tier model has no 6-month band", () => {
    // The strategy scoping floated a fourth tier at 6 months. It was retired,
    // and the ruling was explicit that no sub-12 admission path gets built.
    // Everything under 12 collapses to one answer.
    const under12 = [0, 1, 3, 5, 6, 7, 9, 11].map((m) =>
      authorityTier({ authorityGrantedDate: monthsAgo(m), approvedAt: POST_GATE }, NOW),
    );
    expect(new Set(under12)).toEqual(new Set(["BLOCKED"]));
  });

  it("the thresholds are 12 and 18, stated once", () => {
    expect(AUTHORITY_MIN_MONTHS).toBe(12);
    expect(AUTHORITY_STANDARD_MONTHS).toBe(18);
  });
});

describe("authorityTier — the states the real world is actually in", () => {
  it("a null grant date is AGE_NOT_ON_FILE, never BLOCKED", () => {
    // THE ASSERTION THAT MATTERS TODAY. authorityGrantedDate is null for every
    // real carrier — QCMobile returns current status, not grant history, and
    // the Socrata backfill was never committed. Classifying that as BLOCKED
    // would render a board claiming every carrier is refused for being too
    // young, when nobody has established how old they are.
    expect(authorityTier({ authorityGrantedDate: null, approvedAt: POST_GATE }, NOW)).toBe("AGE_NOT_ON_FILE");
    expect(authorityTier({ authorityGrantedDate: null, approvedAt: null }, NOW)).toBe("AGE_NOT_ON_FILE");
    expect(authorityTier({ authorityGrantedDate: null, approvedAt: PRE_GATE }, NOW)).toBe("AGE_NOT_ON_FILE");
  });

  it("the gate agrees: a null grant date warns rather than blocks", () => {
    // Read the gate's own source. If somebody later makes that branch push a
    // block, the board's colour becomes a lie and this fails.
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/services/complianceMonitorService.ts"),
      "utf8",
    );
    expect(src.includes("AUTHORITY_AGE_UNAVAILABLE")).toBe(true);
    // AUTHORITY_UNVERIFIED is declared in the BlockedCode union but has never
    // been pushed — v3.8.apq downgraded that branch after hard-blocking on a
    // null date started rejecting 17-year-old authorities. A board rendering
    // tiers off the type union would show a block that cannot occur.
    const pushes = src.split("AUTHORITY_UNVERIFIED").length - 1;
    expect(
      src.includes('code: "AUTHORITY_UNVERIFIED"'),
      "AUTHORITY_UNVERIFIED is still declared-but-never-pushed; if that changed, revisit the board",
    ).toBe(false);
    expect(pushes).toBeGreaterThan(0); // it IS still declared
  });

  it("a grandfathered carrier is never painted as blocked", () => {
    // Approved before the gate went live: the gate warns and allows whatever
    // the age says, so the board must not colour them red.
    expect(authorityTier({ authorityGrantedDate: monthsAgo(2), approvedAt: PRE_GATE }, NOW)).toBe("READY");
    expect(authorityTier({ authorityGrantedDate: monthsAgo(13), approvedAt: PRE_GATE }, NOW)).toBe("READY");
  });

  it("a null approvedAt is NOT grandfathered — it gets the full gate", () => {
    // Mirrors the gate's `!!carrier.approvedAt` test. Missing approval is not
    // an old approval.
    expect(authorityTier({ authorityGrantedDate: monthsAgo(3), approvedAt: null }, NOW)).toBe("BLOCKED");
  });

  it("the thresholds still appear in the gate, so the two cannot drift apart silently", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/services/complianceMonitorService.ts"),
      "utf8",
    );
    expect(src.length, "should have read the real gate").toBeGreaterThan(1000);
    expect(src.includes("< 12")).toBe(true);
    expect(src.includes("< 18")).toBe(true);
  });
});

describe("previousEtWeekStart", () => {
  it("is a Sunday at midnight Eastern", () => {
    const p = etParts(previousEtWeekStart(NOW));
    expect(p.weekday).toBe(0); // Sunday
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(0);
  });

  it("is strictly before this week's start", () => {
    expect(previousEtWeekStart(NOW).getTime()).toBeLessThan(etStartOfWeek(NOW).getTime());
  });

  it("survives the DST weeks, where a week is not 168 hours", () => {
    // THE REASON IT IS NOT `thisWeekStart - 7 days`. In March a week is 167
    // hours and in November 169, so a fixed subtraction lands an hour off and
    // silently moves a carrier's approval between weeks.
    for (const iso of [
      "2026-03-10T12:00:00Z", // week after EST -> EDT
      "2026-11-03T12:00:00Z", // week after EDT -> EST
      "2026-01-15T12:00:00Z",
      "2026-07-15T12:00:00Z",
    ]) {
      const now = new Date(iso);
      const prev = previousEtWeekStart(now);
      const p = etParts(prev);
      expect(p.weekday, `${iso} should land on a Sunday`).toBe(0);
      expect(p.hour, `${iso} should land at midnight`).toBe(0);

      // And the naive version would NOT always agree, which is the point.
      const naive = new Date(etStartOfWeek(now).getTime() - 7 * 24 * 3600 * 1000);
      const naiveParts = etParts(naive);
      if (naiveParts.hour !== 0) {
        expect(prev.getTime()).not.toBe(naive.getTime());
      }
    }
  });

  it("the two windows are adjacent — no gap, no overlap", () => {
    // Counted rows must fall in exactly one bucket. The queries use
    // [lastWeekStart, weekStart) and [weekStart, now], so the boundary has to
    // be the same instant on both sides.
    const thisWeek = etStartOfWeek(NOW);
    const prev = previousEtWeekStart(NOW);
    expect(prev.getTime()).toBeLessThan(thisWeek.getTime());
    // Stepping one ms back from this week's start must land in the previous
    // week, not two weeks ago.
    expect(etStartOfWeek(new Date(thisWeek.getTime() - 1)).getTime()).toBe(prev.getTime());
  });
});
