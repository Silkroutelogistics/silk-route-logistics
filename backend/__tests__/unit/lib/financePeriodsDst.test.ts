/**
 * The ET period boundaries must be midnight, on the right day, on EVERY day.
 *
 * financePeriods shipped claiming DST was handled, and it was not. etOffsetMs
 * rendered an instant to an ET wall-clock string and re-parsed it with
 * new Date(), which parses in the HOST timezone — so the function only worked
 * when the server was not itself Eastern, and it failed on exactly the two days
 * a year it existed for. On a transition Sunday the wall clock is ambiguous
 * ("1:00 AM" happens twice in November) and the parser picks one, so the
 * round-trip returned an offset that was never in force. For an instant on
 * 1 Nov 2026 it returned SIX HOURS, which US Eastern has never been.
 *
 * WHAT THAT COST, on the surface it was written for:
 *
 *   1 Nov  — etStartOfMonth returned 01:00, so the first hour of November was
 *            excluded from month-to-date revenue.
 *   8 Mar  — etStartOfWeek returned Saturday 23:00, the wrong DAY, so the last
 *            hour of Saturday counted into the new week.
 *
 * An hour of revenue in the wrong bucket, twice a year, on the money surface.
 *
 * THE SWEEP IS THE POINT. Four hand-picked dates would have missed this — the
 * original tests asserted January and July, which are both mid-season and both
 * passed throughout. Walking every day of a year is what makes the two days
 * that matter unmissable, and it is cheap.
 */
import { describe, it, expect, vi } from "vitest";
import { etStartOfMonth, etStartOfWeek, etParts, weekIsInsideMonth } from "../../../src/lib/financePeriods";

/**
 * These sweeps walk four years a day at a time, and every etParts call builds
 * an Intl.DateTimeFormat. That is thorough on purpose and it is not fast: in
 * isolation the file runs in well under a second, but under full-suite load it
 * crossed vitest's 5s default and went red.
 *
 * I shipped that flake to main. Recording it rather than quietly widening the
 * number, because the failure LOOKS like a logic error — a DST assertion going
 * red reads as "the boundary maths broke" — and the same misread cost real time
 * on accountingSummary.test.ts, where a slow supertest import presented exactly
 * as cross-file mock pollution. Slow is not broken. A guard that flakes is a
 * guard somebody eventually deletes.
 */
vi.setConfig({ testTimeout: 30_000 });

/** Every day of a year, sampled at noon UTC. */
function everyDayOf(year: number): Date[] {
  const out: Date[] = [];
  for (let t = Date.UTC(year, 0, 1, 12); t < Date.UTC(year + 1, 0, 1); t += 86400000) {
    out.push(new Date(t));
  }
  return out;
}

describe("ET period boundaries hold on every day of the year", () => {
  const days = everyDayOf(2026);

  it("sampled a real year, so an empty pass is impossible", () => {
    expect(days.length).toBeGreaterThanOrEqual(365);
  });

  it("etStartOfMonth is always midnight ET on the 1st", () => {
    const bad: string[] = [];
    for (const d of days) {
      const p = etParts(etStartOfMonth(d));
      if (p.day !== 1 || p.hour !== 0 || p.minute !== 0 || p.second !== 0) {
        bad.push(`${d.toISOString().slice(0, 10)} -> day ${p.day} ${p.hour}:${p.minute}`);
      }
    }
    expect(bad, bad.slice(0, 5).join(" | ")).toEqual([]);
  });

  it("etStartOfWeek is always midnight ET on a Sunday", () => {
    const bad: string[] = [];
    for (const d of days) {
      const p = etParts(etStartOfWeek(d));
      if (p.weekday !== 0 || p.hour !== 0 || p.minute !== 0 || p.second !== 0) {
        bad.push(`${d.toISOString().slice(0, 10)} -> weekday ${p.weekday} ${p.hour}:${p.minute}`);
      }
    }
    expect(bad, bad.slice(0, 5).join(" | ")).toEqual([]);
  });

  it("a boundary is never in the future relative to the instant asked about", () => {
    for (const d of days) {
      expect(etStartOfMonth(d).getTime()).toBeLessThanOrEqual(d.getTime());
      expect(etStartOfWeek(d).getTime()).toBeLessThanOrEqual(d.getTime());
    }
  });
});

describe("the two days that actually broke", () => {
  const fmtEt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);

  it("spring forward: the week starts SUNDAY, not Saturday 23:00", () => {
    // 8 March 2026 is the transition. Pre-fix this returned "Sat, 03/07, 23:00"
    // — an hour early and on the wrong day.
    for (const iso of ["2026-03-08T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-14T12:00:00Z"]) {
      const w = etStartOfWeek(new Date(iso));
      expect(fmtEt(w), iso).toBe("Sun, 03/08, 00:00");
    }
  });

  it("fall back: the month starts at 00:00, not 01:00", () => {
    // 1 November 2026 is the transition. Pre-fix this returned 01:00, silently
    // dropping the first hour of the month from every MTD figure.
    for (const iso of ["2026-11-01T12:00:00Z", "2026-11-03T12:00:00Z", "2026-11-20T12:00:00Z"]) {
      const m = etStartOfMonth(new Date(iso));
      expect(fmtEt(m), iso).toBe("Sun, 11/01, 00:00");
    }
  });

  it("fall back: the week also starts at 00:00 on the transition Sunday", () => {
    const w = etStartOfWeek(new Date("2026-11-03T12:00:00Z"));
    expect(fmtEt(w)).toBe("Sun, 11/01, 00:00");
  });

  it("holds across several years, so this is not curve-fitted to 2026", () => {
    // DST dates move. If the fix only worked for the year I happened to test,
    // that would be a coincidence rather than a fix.
    for (const year of [2025, 2027, 2028]) {
      for (const d of everyDayOf(year)) {
        const pm = etParts(etStartOfMonth(d));
        const pw = etParts(etStartOfWeek(d));
        expect(pm.hour, `${year} month`).toBe(0);
        expect(pw.hour, `${year} week`).toBe(0);
        expect(pw.weekday, `${year} weekday`).toBe(0);
      }
    }
  });
});

describe("weekIsInsideMonth stays coherent through the transitions", () => {
  it("agrees with a direct comparison of the two boundaries", () => {
    for (const d of everyDayOf(2026)) {
      const expected = etStartOfWeek(d).getTime() >= etStartOfMonth(d).getTime();
      expect(weekIsInsideMonth(d), d.toISOString().slice(0, 10)).toBe(expected);
    }
  });

  it("is true for a mid-month day and false for one in a straddling week", () => {
    // Cheap sanity that the helper is not simply always-true, which would make
    // the assertion above vacuous.
    const results = everyDayOf(2026).map(weekIsInsideMonth);
    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});
