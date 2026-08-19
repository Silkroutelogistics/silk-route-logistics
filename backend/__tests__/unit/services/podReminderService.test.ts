// Audit F-8 — band boundaries for the POD paperwork reminder.
//
// The bands decide who gets told and when, so their edges are the whole
// behaviour. Pinning them here means a future edit to PAPERWORK_DUE_HOURS or to
// the band table cannot silently move the moment a carrier is chased or the
// moment an AE is escalated to.

import { describe, it, expect } from "vitest";
import {
  podReminderBand,
  BANDS,
  isPodChaseableStatus,
  POD_CHASE_STATUSES,
  overdueEscalationOrdinal,
  podDedupKey,
  OVERDUE_REESCALATION_HOURS,
} from "../../../src/services/podReminderService";
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

describe("isPodChaseableStatus", () => {
  it("chases a delivered load", () => {
    expect(isPodChaseableStatus("DELIVERED")).toBe(true);
  });

  it("chases an INVOICED load — the escape hatch this closes", () => {
    // The AE map allows DELIVERED -> INVOICED directly (loadStateMachine:77).
    // Before Arc 2 Item 1 the sweep only looked at DELIVERED, so invoicing a
    // load before its POD landed removed it from the population permanently —
    // and INVOICED only advances to COMPLETED, so it could never reach
    // POD_RECEIVED either. It exited the pipeline owing paperwork.
    expect(isPodChaseableStatus("INVOICED")).toBe(true);
  });

  it("never chases a load whose paperwork is already in", () => {
    expect(isPodChaseableStatus("POD_RECEIVED")).toBe(false);
  });

  it("never chases a closed load", () => {
    expect(isPodChaseableStatus("COMPLETED")).toBe(false);
  });

  it("never chases a load that was never delivered", () => {
    for (const s of ["TONU", "CANCELLED", "IN_TRANSIT", "AT_DELIVERY", "BOOKED", "POSTED", "DRAFT"]) {
      expect(isPodChaseableStatus(s)).toBe(false);
    }
  });

  it("keeps the population to exactly the two owing-paperwork statuses", () => {
    expect([...POD_CHASE_STATUSES].sort()).toEqual(["DELIVERED", "INVOICED"]);
  });
});

describe("overdueEscalationOrdinal", () => {
  const DUE = PAPERWORK_DUE_HOURS;

  it("is null before the deadline", () => {
    expect(overdueEscalationOrdinal(0)).toBeNull();
    expect(overdueEscalationOrdinal(DUE - 0.01)).toBeNull();
  });

  it("opens at ordinal 0 exactly on the deadline", () => {
    expect(overdueEscalationOrdinal(DUE)).toBe(0);
  });

  it("holds ordinal 0 for the first re-escalation window", () => {
    expect(overdueEscalationOrdinal(DUE + 1)).toBe(0);
    expect(overdueEscalationOrdinal(DUE + OVERDUE_REESCALATION_HOURS - 0.01)).toBe(0);
  });

  it("advances one ordinal per re-escalation window", () => {
    expect(overdueEscalationOrdinal(DUE + OVERDUE_REESCALATION_HOURS)).toBe(1);
    expect(overdueEscalationOrdinal(DUE + 2 * OVERDUE_REESCALATION_HOURS)).toBe(2);
    expect(overdueEscalationOrdinal(DUE + 3 * OVERDUE_REESCALATION_HOURS)).toBe(3);
  });

  it("keeps escalating right up to the 14-day abandon window", () => {
    // The sweep drops the load from the population at 14 days, so escalation
    // stops on its own rather than needing a separate cap. Just before that
    // point the ordinal is still climbing.
    const justBeforeAbandon = 14 * 24 - 0.01;
    const ordinal = overdueEscalationOrdinal(justBeforeAbandon);
    expect(ordinal).toBe(6);
  });
});

describe("podDedupKey", () => {
  const band = (k: "early" | "final" | "overdue") => BANDS.find((b) => b.key === k)!;

  it("gives a carrier band one key, so it fires once", () => {
    expect(podDedupKey(band("early"), 5)).toBe("early");
    expect(podDedupKey(band("early"), 19)).toBe("early");
    expect(podDedupKey(band("final"), 21)).toBe("final");
    expect(podDedupKey(band("final"), 23)).toBe("final");
  });

  it("gives the overdue band a fresh key per escalation, so the AE keeps hearing", () => {
    const first = podDedupKey(band("overdue"), PAPERWORK_DUE_HOURS);
    const sameWindow = podDedupKey(band("overdue"), PAPERWORK_DUE_HOURS + 1);
    const nextWindow = podDedupKey(band("overdue"), PAPERWORK_DUE_HOURS + OVERDUE_REESCALATION_HOURS);

    expect(first).toBe("overdue-0");
    expect(sameWindow).toBe("overdue-0"); // no duplicate inside one window
    expect(nextWindow).toBe("overdue-1"); // new window, new key
    expect(nextWindow).not.toBe(first);
  });

  it("never collides a carrier key with an overdue key", () => {
    const keys = new Set<string>();
    for (let h = 4; h < 14 * 24; h += 0.5) {
      const b = podReminderBand(h);
      if (!b) continue;
      keys.add(podDedupKey(b, h));
    }
    expect(keys.has("early")).toBe(true);
    expect(keys.has("final")).toBe(true);
    expect([...keys].filter((k) => k.startsWith("overdue-")).length).toBeGreaterThan(1);
  });
});
