import { describe, it, expect } from "vitest";
import {
  calcOnTimePerformance,
  onTimeDeadline,
  ON_TIME_GRACE_MS,
  type OnTimeRow,
} from "../../../src/lib/onTimePerformance";

// Build A (2026-05-30) — locks the locked decisions:
//   2h grace · exclude no-window loads · exclude no-actual loads ·
//   neutral 100 when nothing measurable.
const DAY = new Date("2026-05-20T00:00:00.000Z");

describe("onTimeDeadline", () => {
  it("returns scheduled date @ timeEnd + 2h grace", () => {
    const d = onTimeDeadline(new Date("2026-05-20T00:00:00"), "14:00");
    expect(d).not.toBeNull();
    // 14:00 local + 2h grace = 16:00 local
    expect(d!.getHours()).toBe(16);
    expect(d!.getMinutes()).toBe(0);
  });
  it("returns null with no timeEnd (no appointment window → unmeasurable)", () => {
    expect(onTimeDeadline(DAY, null)).toBeNull();
    expect(onTimeDeadline(DAY, "")).toBeNull();
    expect(onTimeDeadline(DAY, "not-a-time")).toBeNull();
  });
  it("returns null with no scheduled date", () => {
    expect(onTimeDeadline(null, "14:00")).toBeNull();
  });
});

describe("calcOnTimePerformance", () => {
  const sched = (date: string, timeEnd: string | null, actual: string | null): OnTimeRow => ({
    scheduledDate: new Date(date),
    timeEnd,
    actual: actual ? new Date(actual) : null,
  });

  it("counts an arrival within the window as on-time", () => {
    const r = calcOnTimePerformance([sched("2026-05-20T00:00:00", "14:00", "2026-05-20T13:30:00")]);
    expect(r).toEqual({ pct: 100, measurable: 1, onTime: 1 });
  });

  it("counts an arrival within the 2h grace as on-time", () => {
    // appointment ends 14:00, arrived 15:45 → inside 16:00 grace deadline
    const r = calcOnTimePerformance([sched("2026-05-20T00:00:00", "14:00", "2026-05-20T15:45:00")]);
    expect(r.onTime).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("counts an arrival past the grace as late", () => {
    // appointment ends 14:00, grace to 16:00, arrived 16:30 → late
    const r = calcOnTimePerformance([sched("2026-05-20T00:00:00", "14:00", "2026-05-20T16:30:00")]);
    expect(r).toEqual({ pct: 0, measurable: 1, onTime: 0 });
  });

  it("EXCLUDES loads with no appointment window from the denominator", () => {
    const r = calcOnTimePerformance([sched("2026-05-20T00:00:00", null, "2026-05-20T23:00:00")]);
    expect(r.measurable).toBe(0);
    expect(r.pct).toBe(100); // neutral — nothing measurable
  });

  it("EXCLUDES loads with no actual timestamp from the denominator", () => {
    const r = calcOnTimePerformance([sched("2026-05-20T00:00:00", "14:00", null)]);
    expect(r.measurable).toBe(0);
    expect(r.pct).toBe(100);
  });

  it("computes a real percentage over mixed measurable rows", () => {
    const rows = [
      sched("2026-05-20T00:00:00", "14:00", "2026-05-20T13:00:00"), // on-time
      sched("2026-05-20T00:00:00", "14:00", "2026-05-20T13:30:00"), // on-time
      sched("2026-05-20T00:00:00", "14:00", "2026-05-20T18:00:00"), // late
      sched("2026-05-20T00:00:00", null, "2026-05-20T13:00:00"),    // excluded (no window)
      sched("2026-05-20T00:00:00", "14:00", null),                 // excluded (no actual)
    ];
    const r = calcOnTimePerformance(rows);
    expect(r.measurable).toBe(3);
    expect(r.onTime).toBe(2);
    expect(Math.round(r.pct)).toBe(67);
  });

  it("returns neutral 100 over an empty set", () => {
    expect(calcOnTimePerformance([])).toEqual({ pct: 100, measurable: 0, onTime: 0 });
  });

  it("ON_TIME_GRACE_MS is 2 hours", () => {
    expect(ON_TIME_GRACE_MS).toBe(2 * 60 * 60 * 1000);
  });
});
