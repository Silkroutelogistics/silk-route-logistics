// Load 5003 (ruled 2026-09-26): renumber only if no rate confirmation and no
// BOL was issued for it; otherwise it stays. The script is dry run by default
// and executing it is an open decision.
import { describe, it, expect } from "vitest";
import { planRenumber, type RenumberFacts } from "../../../scripts/renumber-load-5003";

// Production as read on 2026-09-26 (read-only census): nothing issued.
const prod: RenumberFacts = {
  holders: 1, rateConfirmations: 0, trackingTokens: 0, documents: 0, invoices: 0, tenders: 0, carrierAssigned: false,
};

describe("planRenumber", () => {
  it("production's state, with nothing issued, renumbers", () => {
    expect(planRenumber(prod)).toEqual({ go: true });
  });

  it("a rate confirmation keeps the number", () => {
    expect(planRenumber({ ...prod, rateConfirmations: 1 }).stay?.join(" ")).toMatch(/rate confirmation/);
  });

  it("a printed BOL keeps the number (a print mints a tracking token)", () => {
    expect(planRenumber({ ...prod, trackingTokens: 1 }).stay?.join(" ")).toMatch(/BOL print/);
  });

  it("a document, an invoice, a tender or an assigned carrier keeps the number", () => {
    for (const over of [{ documents: 1 }, { invoices: 1 }, { tenders: 1 }, { carrierAssigned: true }]) {
      expect(planRenumber({ ...prod, ...over }).go, JSON.stringify(over)).toBeUndefined();
      expect(planRenumber({ ...prod, ...over }).stay?.length, JSON.stringify(over)).toBe(1);
    }
  });

  it("lists every reason at once, not the first", () => {
    expect(planRenumber({ ...prod, rateConfirmations: 2, trackingTokens: 1, tenders: 1 }).stay).toHaveLength(3);
  });

  it("does nothing once no load holds 5003, and refuses when two do", () => {
    expect(planRenumber({ ...prod, holders: 0 }).noop).toMatch(/no live load holds 5003/);
    expect(planRenumber({ ...prod, holders: 2 }).stay?.join(" ")).toMatch(/2 live loads/);
  });
});
