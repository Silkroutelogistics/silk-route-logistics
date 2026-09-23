// The bill of lading printed "[HH:MM–HH:MM]" — a literal template placeholder —
// on any load with no window. 4 of 7 live loads on production 2026-09-23,
// SRL-121497 among them, on the document that sends a driver to a dock.
//
// These cases are the five shapes ruling 1 names: range, single appointment,
// end-only, no time, and the exact production values.

import { describe, it, expect } from "vitest";
import { formatStopWindow, formatStopWindowLine } from "../../../src/lib/stopWindow";

describe("formatStopWindow", () => {
  it("a range reads 'to', not a dash — a dash reads as one hyphenated value at 7.75pt", () => {
    expect(formatStopWindow("08:00", "14:00")).toBe("08:00 to 14:00 local");
  });

  it("a single appointment carries no range", () => {
    expect(formatStopWindow("09:00", null)).toBe("09:00 local");
  });

  it("identical start and end is one appointment, not a zero-length range", () => {
    expect(formatStopWindow("09:00", "09:00")).toBe("09:00 local");
  });

  it("an end with no start still prints — a delivery-only 'by 14:00' is a real shape", () => {
    expect(formatStopWindow(null, "14:00")).toBe("14:00 local");
  });

  it("no time at all returns null, so the caller renders the date alone", () => {
    expect(formatStopWindow(null, null)).toBeNull();
    expect(formatStopWindow(undefined, undefined)).toBeNull();
    expect(formatStopWindow("", "")).toBeNull();
    expect(formatStopWindow("   ", "  ")).toBeNull();
  });

  it("never emits a bracketed placeholder, whatever it is given", () => {
    for (const [a, b] of [[null, null], ["08:00", "14:00"], ["", "09:00"]] as const) {
      const out = formatStopWindow(a, b) ?? "";
      expect(out).not.toContain("[");
      expect(out).not.toContain("HH:MM");
    }
  });

  it("says 'local' and never a timezone abbreviation — no zone is recorded anywhere", () => {
    // Ruling 1. TX and KY are both split-timezone and lat/lng is 0% populated,
    // so an abbreviation could only ever be a guess, and an hour wrong on a dock
    // time sends a driver at the wrong time with paper that told them to.
    const out = formatStopWindow("08:00", "14:00")!;
    expect(out.endsWith(" local")).toBe(true);
    expect(out).not.toMatch(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT)\b/);
  });

  it("the production shapes, transcribed from the 2026-09-23 census", () => {
    expect(formatStopWindow("12:00", "13:00")).toBe("12:00 to 13:00 local"); // SRL-121496
    expect(formatStopWindow("10:00", "12:00")).toBe("10:00 to 12:00 local"); // SRL-121495
    expect(formatStopWindow(null, null)).toBeNull();                          // SRL-121497
  });
});

describe("formatStopWindowLine", () => {
  it("appends the window to the date when there is one", () => {
    expect(formatStopWindowLine("Thu, Sep 24, 2026", "08:00", "14:00"))
      .toBe("Thu, Sep 24, 2026 · 08:00 to 14:00 local");
  });

  it("is the bare date when no time is recorded — never a placeholder", () => {
    expect(formatStopWindowLine("Thu, Sep 24, 2026", null, null)).toBe("Thu, Sep 24, 2026");
  });

  it("honours the caller's separator, because the two documents space it differently", () => {
    expect(formatStopWindowLine("Thu, Sep 24, 2026", "08:00", null, "  ·  "))
      .toBe("Thu, Sep 24, 2026  ·  08:00 local");
  });
});
