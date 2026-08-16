// Regression guard for the Quick Pay pricing helpers (v3.8.asa).
//
// These pin the three promises the Caravan Quick Pay Agreement makes that the
// pay path previously could not keep:
//   §3  the election is per load, so an absent election is standard terms
//   §4  same-day exists at every tier (7-day fee + a universal 2% premium)
//   §4  at-cost reimbursements, lumper above all, are outside the fee base
//
// Pure helpers only — no database, no Prisma client.

import { describe, it, expect } from "vitest";
import {
  resolveQuickPaySpeed,
  isAtCostReimbursement,
  sumAtCostReimbursements,
  sameDayQuickPayDueDate,
} from "../../../src/services/integrationService";

// CLAUDE.md §8 LOCKED ladder, mirroring caravanService TIER_CONFIG.
const SILVER = { quickPayFee7Day: 0.03, quickPayFeeSameDay: 0.05 };
const GOLD = { quickPayFee7Day: 0.02, quickPayFeeSameDay: 0.04 };
const PLATINUM = { quickPayFee7Day: 0.01, quickPayFeeSameDay: 0.03 };

describe("resolveQuickPaySpeed", () => {
  it("treats no election as standard terms — enabling Quick Pay on the account is not an election", () => {
    expect(resolveQuickPaySpeed(null, SILVER)).toBe("STANDARD");
    expect(resolveQuickPaySpeed(undefined, SILVER)).toBe("STANDARD");
    expect(resolveQuickPaySpeed(0, SILVER)).toBe("STANDARD");
  });

  it("resolves the same-day rung at every tier (§8: 5% / 4% / 3%)", () => {
    expect(resolveQuickPaySpeed(5, SILVER)).toBe("QP_SAMEDAY");
    expect(resolveQuickPaySpeed(4, GOLD)).toBe("QP_SAMEDAY");
    expect(resolveQuickPaySpeed(3, PLATINUM)).toBe("QP_SAMEDAY");
  });

  it("resolves the 7-day rung at every tier (§8: 3% / 2% / 1%)", () => {
    expect(resolveQuickPaySpeed(3, SILVER)).toBe("QP_7DAY");
    expect(resolveQuickPaySpeed(2, GOLD)).toBe("QP_7DAY");
    expect(resolveQuickPaySpeed(1, PLATINUM)).toBe("QP_7DAY");
  });

  it("reads the SAME percent differently by tier — 3% is same-day on Platinum, 7-day on Silver", () => {
    expect(resolveQuickPaySpeed(3, PLATINUM)).toBe("QP_SAMEDAY");
    expect(resolveQuickPaySpeed(3, SILVER)).toBe("QP_7DAY");
  });

  it("treats an AE override on neither rung as the 7-day product, never the faster one", () => {
    expect(resolveQuickPaySpeed(2.5, SILVER)).toBe("QP_7DAY");
    expect(resolveQuickPaySpeed(6, GOLD)).toBe("QP_7DAY");
  });
});

describe("isAtCostReimbursement", () => {
  it("recognises lumper on either the type or the description", () => {
    expect(isAtCostReimbursement({ type: "LUMPER", description: "" })).toBe(true);
    expect(isAtCostReimbursement({ description: "Lumper fee at Kroger DC" })).toBe(true);
    expect(isAtCostReimbursement({ description: "Reimbursement - scale ticket" })).toBe(true);
  });

  it("leaves earnings inside the fee base — detention, layover and TONU are not reimbursements", () => {
    expect(isAtCostReimbursement({ type: "DETENTION", description: "2 hrs over free time" })).toBe(false);
    expect(isAtCostReimbursement({ description: "Layover" })).toBe(false);
    expect(isAtCostReimbursement({ description: "TONU" })).toBe(false);
    expect(isAtCostReimbursement({ description: "Extra stop" })).toBe(false);
  });
});

describe("sumAtCostReimbursements", () => {
  it("sums only the at-cost lines", () => {
    const lines = [
      { description: "Detention", amount: 150 },
      { description: "Lumper", amount: 150 },
      { type: "LUMPER", description: "Second stop lumper", amount: 75 },
    ];
    expect(sumAtCostReimbursements(lines)).toBe(225);
  });

  it("is safe on missing, empty and malformed input", () => {
    expect(sumAtCostReimbursements(null)).toBe(0);
    expect(sumAtCostReimbursements(undefined)).toBe(0);
    expect(sumAtCostReimbursements([])).toBe(0);
    expect(sumAtCostReimbursements([{ description: "Lumper", amount: null }])).toBe(0);
  });

  it("keeps a carrier's fronted lumper whole — the §4 carve-out", () => {
    // $2,000 line haul + $150 lumper. The fee is charged on $2,000, not $2,150.
    const gross = 2150;
    const reimbursed = sumAtCostReimbursements([{ description: "Lumper", amount: 150 }]);
    const feeBase = gross - reimbursed;
    expect(feeBase).toBe(2000);
    expect(Math.round(feeBase * 0.03 * 100) / 100).toBe(60); // not 64.50
  });
});

describe("sameDayQuickPayDueDate", () => {
  // 2026-08-17 is a Monday. Eastern is UTC-4 in August (EDT).
  const monday = (etHour: number) => new Date(Date.UTC(2026, 7, 17, etHour + 4));

  it("pays the same day when documentation lands inside published business hours", () => {
    const received = monday(10); // 10:00 ET Monday
    expect(sameDayQuickPayDueDate(received).getTime()).toBe(received.getTime());
  });

  it("pays at open the same day when documentation lands before 7:00 AM Eastern", () => {
    const due = sameDayQuickPayDueDate(monday(5)); // 05:00 ET Monday
    expect(due.getTime()).toBe(monday(7).getTime());
  });

  it("pays the next business day when documentation lands after close", () => {
    const due = sameDayQuickPayDueDate(monday(20)); // 20:00 ET Monday
    expect(due.getTime()).toBe(new Date(Date.UTC(2026, 7, 18, 11)).getTime()); // Tue 07:00 ET
  });

  it("rolls a Friday evening to Monday morning, not Saturday", () => {
    const fridayNight = new Date(Date.UTC(2026, 7, 21, 22 + 4)); // Fri 22:00 ET
    const due = sameDayQuickPayDueDate(fridayNight);
    expect(due.getTime()).toBe(new Date(Date.UTC(2026, 7, 24, 11)).getTime()); // Mon 07:00 ET
  });

  it("rolls a Saturday to Monday morning", () => {
    const saturday = new Date(Date.UTC(2026, 7, 22, 10 + 4)); // Sat 10:00 ET
    const due = sameDayQuickPayDueDate(saturday);
    expect(due.getTime()).toBe(new Date(Date.UTC(2026, 7, 24, 11)).getTime()); // Mon 07:00 ET
  });

  it("holds through the winter offset — a January Friday night still lands Monday 07:00 ET", () => {
    // 2027-01-15 is a Friday. Eastern is UTC-5 in January (EST).
    const fridayNight = new Date(Date.UTC(2027, 0, 15, 22 + 5));
    const due = sameDayQuickPayDueDate(fridayNight);
    expect(due.getTime()).toBe(new Date(Date.UTC(2027, 0, 18, 12)).getTime()); // Mon 07:00 EST
  });
});
