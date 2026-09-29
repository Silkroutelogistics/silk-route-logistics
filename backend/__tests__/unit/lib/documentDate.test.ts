import { describe, it, expect } from "vitest";
import { documentDate } from "../../../src/lib/documentDate";

// RC 5003 (2026-09-27): the draft written on tender accept stored the full ISO
// timestamp, and the rate confirmation printed it raw across two meta-strip
// cells. Every shape a stored date arrives in must print the same calendar date.
describe("documentDate", () => {
  it("prints the auto-draft's full ISO timestamp as the calendar date", () => {
    expect(documentDate("2026-09-27T00:00:00.000Z")).toBe("Sep 27, 2026");
  });
  it("prints the AE modal's date-only string the same way", () => {
    expect(documentDate("2026-09-27")).toBe("Sep 27, 2026");
  });
  it("prints a Date at UTC midnight as that UTC day, not the day before", () => {
    expect(documentDate(new Date("2026-09-27T00:00:00.000Z"))).toBe("Sep 27, 2026");
  });
  it("takes the date part of an ISO string, never shifting it by timezone", () => {
    expect(documentDate("2026-09-27T23:30:00.000Z")).toBe("Sep 27, 2026");
  });
  it("passes a non-date string through as written", () => {
    expect(documentDate("TBD")).toBe("TBD");
  });
  it("returns null for nothing, so the caller chooses the placeholder", () => {
    expect(documentDate(null)).toBeNull();
    expect(documentDate(undefined)).toBeNull();
    expect(documentDate("")).toBeNull();
  });
  it("returns null for an invalid Date rather than printing 'Invalid Date'", () => {
    expect(documentDate(new Date("nope"))).toBeNull();
  });
});
