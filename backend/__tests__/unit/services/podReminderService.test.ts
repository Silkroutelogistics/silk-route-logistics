// Audit F-8 — band boundaries for the POD paperwork reminder.
//
// The bands decide who gets told and when, so their edges are the whole
// behaviour. Pinning them here means a future edit to PAPERWORK_DUE_HOURS or to
// the band table cannot silently move the moment a carrier is chased or the
// moment an AE is escalated to.

import { describe, it, expect } from "vitest";
import { podReminderBand, BANDS } from "../../../src/services/podReminderService";
import { PAPERWORK_DUE_HOURS } from "../../../src/lib/accessorialPolicy";

describe("podReminderBand", () => {
  it("stays silent for the first four hours after delivery", () => {
    expect(podReminderBand(0)).toBeNull();
    expect(podReminderBand(1.5)).toBeNull();
    expect(podReminderBand(3.99)).toBeNull();
  });

  it("opens the early carrier band exactly at hour 4", () => {
    const band = podReminderBand(4);
    expect(band?.key).toBe("early");
    expect(band?.notify).toBe("CARRIER");
  });

  it("keeps the early band through hour 19", () => {
    expect(podReminderBand(12)?.key).toBe("early");
    expect(podReminderBand(19.99)?.key).toBe("early");
  });

  it("hands over to the final carrier warning at hour 20", () => {
    const band = podReminderBand(20);
    expect(band?.key).toBe("final");
    expect(band?.notify).toBe("CARRIER");
  });

  it("still warns the carrier — not the AE — right up to the deadline", () => {
    const band = podReminderBand(PAPERWORK_DUE_HOURS - 0.01);
    expect(band?.key).toBe("final");
    expect(band?.notify).toBe("CARRIER");
  });

  it("escalates to the AE the moment the deadline passes", () => {
    const band = podReminderBand(PAPERWORK_DUE_HOURS);
    expect(band?.key).toBe("overdue");
    expect(band?.notify).toBe("AE");
  });

  it("stays overdue however long the load sits", () => {
    expect(podReminderBand(72)?.key).toBe("overdue");
    expect(podReminderBand(24 * 13)?.key).toBe("overdue");
  });

  it("derives the escalation point from the deadline the carrier signed, not a literal", () => {
    // docTimeliness grades against PAPERWORK_DUE_HOURS. If the reminder used its
    // own 24 they could drift, and a carrier would be graded against a deadline
    // different from the one they were reminded of.
    const overdue = BANDS.find((b) => b.key === "overdue");
    const final = BANDS.find((b) => b.key === "final");
    expect(overdue?.fromHours).toBe(PAPERWORK_DUE_HOURS);
    expect(final?.toHours).toBe(PAPERWORK_DUE_HOURS);
  });

  it("leaves no gap and no overlap between bands", () => {
    for (let h = 4; h < 48; h += 0.25) {
      const matches = BANDS.filter((b) => h >= b.fromHours && h < b.toHours);
      expect(matches).toHaveLength(1);
    }
  });
});
