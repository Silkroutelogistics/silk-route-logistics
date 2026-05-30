import { describe, it, expect } from "vitest";
import {
  calcDocTimeliness,
  POD_GRACE_MS,
  type DocTimelinessRow,
} from "../../../src/lib/docTimeliness";

const row = (delivery: string | null, pod: string | null): DocTimelinessRow => ({
  actualDelivery: delivery ? new Date(delivery) : null,
  podUploadedAt: pod ? new Date(pod) : null,
});

describe("calcDocTimeliness", () => {
  it("POD uploaded before/at delivery is timely", () => {
    const r = calcDocTimeliness([row("2026-05-20T12:00:00", "2026-05-20T11:00:00")]);
    expect(r).toEqual({ pct: 100, measurable: 1, timely: 1 });
  });

  it("POD within the 24h window is timely", () => {
    // delivered 12:00, POD next day 11:00 → 23h later → timely
    const r = calcDocTimeliness([row("2026-05-20T12:00:00", "2026-05-21T11:00:00")]);
    expect(r.timely).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("POD past 24h is late", () => {
    // delivered 12:00, POD next day 13:00 → 25h later → late
    const r = calcDocTimeliness([row("2026-05-20T12:00:00", "2026-05-21T13:00:00")]);
    expect(r).toEqual({ pct: 0, measurable: 1, timely: 0 });
  });

  it("excludes loads with no actual delivery timestamp", () => {
    const r = calcDocTimeliness([row(null, "2026-05-20T11:00:00")]);
    expect(r.measurable).toBe(0);
    expect(r.pct).toBe(100); // neutral
  });

  it("excludes loads with no POD on file", () => {
    const r = calcDocTimeliness([row("2026-05-20T12:00:00", null)]);
    expect(r.measurable).toBe(0);
    expect(r.pct).toBe(100);
  });

  it("computes a real percentage over mixed rows", () => {
    const rows = [
      row("2026-05-20T12:00:00", "2026-05-20T13:00:00"), // timely (1h)
      row("2026-05-20T12:00:00", "2026-05-21T10:00:00"), // timely (22h)
      row("2026-05-20T12:00:00", "2026-05-22T12:00:01"), // late (48h)
      row(null, "2026-05-20T13:00:00"),                  // excluded (no delivery)
      row("2026-05-20T12:00:00", null),                  // excluded (no POD)
    ];
    const r = calcDocTimeliness(rows);
    expect(r.measurable).toBe(3);
    expect(r.timely).toBe(2);
    expect(Math.round(r.pct)).toBe(67);
  });

  it("returns neutral 100 over an empty set", () => {
    expect(calcDocTimeliness([])).toEqual({ pct: 100, measurable: 0, timely: 0 });
  });

  it("POD_GRACE_MS is 24 hours", () => {
    expect(POD_GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
