import { describe, it, expect } from "vitest";
import { formatStopDate, formatStopWindow, formatActualDatetime } from "./stopDate";

/**
 * THE POINT OF THIS FILE. It is run twice by the gate — once under
 * TZ=America/Detroit and once under TZ=UTC — and must give the same answer both
 * times. Run under one zone only it would pass on the old broken code too,
 * which is exactly how the defect survived: every assertion anyone wrote agreed
 * with the machine it was written on.
 */
describe("formatStopDate — a calendar date does not move with the reader", () => {
  it("renders UTC midnight as that calendar date, not the day before", () => {
    // SRL-121497's stored pickupDate. The panel printed "Sep 23, 2026, 8:00 PM".
    expect(formatStopDate("2026-09-24T00:00:00.000Z")).toBe("Sep 24, 2026");
  });

  it("does not invent an hour or a minute", () => {
    const out = formatStopDate("2026-09-24T00:00:00.000Z")!;
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
    expect(out).not.toMatch(/AM|PM/);
  });

  it("holds across a year boundary, where a west-of-UTC shift changes the year", () => {
    expect(formatStopDate("2027-01-01T00:00:00.000Z")).toBe("Jan 1, 2027");
  });

  it("accepts a Date as well as a string", () => {
    expect(formatStopDate(new Date("2026-09-24T00:00:00.000Z"))).toBe("Sep 24, 2026");
  });

  it("returns null for absent or unparseable input, so callers render an em-dash", () => {
    expect(formatStopDate(null)).toBeNull();
    expect(formatStopDate(undefined)).toBeNull();
    expect(formatStopDate("")).toBeNull();
    expect(formatStopDate("not a date")).toBeNull();
  });
});

describe("formatStopWindow — typed times are shown as typed, and labelled", () => {
  it("labels the window local rather than converting it", () => {
    expect(formatStopWindow("12:00", "13:00")).toBe("12:00 – 13:00 local");
  });

  it("renders a half-open window without claiming the missing end", () => {
    expect(formatStopWindow("12:00", null)).toBe("12:00 – — local");
    expect(formatStopWindow(null, "13:00")).toBe("— – 13:00 local");
  });

  it("returns null when there is no window at all", () => {
    // SRL-121497: both ends NULL. The old code rendered "— – —", which reads
    // like a window that exists and happens to be blank.
    expect(formatStopWindow(null, null)).toBeNull();
    expect(formatStopWindow(undefined, undefined)).toBeNull();
  });
});

describe("formatActualDatetime — a real instant keeps its time and names its zone", () => {
  it("keeps the time and stamps it UTC", () => {
    expect(formatActualDatetime("2026-09-24T14:30:00.000Z")).toBe("Sep 24, 2026, 2:30 PM UTC");
  });

  it("returns null for absent input", () => {
    expect(formatActualDatetime(null)).toBeNull();
  });
});
