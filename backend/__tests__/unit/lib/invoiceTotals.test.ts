/**
 * What a load has been billed — and, more carefully, what it means when it
 * hasn't.
 *
 * `customerBilled()` on the frontend returns `invoicedTotal` whenever it is not
 * null, and 0 satisfies "not null". So an aggregate that yields 0 for a load
 * with no invoice would silently replace the customer rate with $0 on every
 * un-invoiced row — which is most of the board. Absent must stay absent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { BILLED_STATUSES, invoiceValue, invoicedTotalsForLoads } from "../../../src/lib/invoiceTotals";

const mockPrisma = vi.mocked(prisma);

describe("invoiceValue", () => {
  it("prefers the itemised total over the headline amount", () => {
    expect(invoiceValue({ amount: 5000, totalAmount: 5250 })).toBe(5250);
  });

  it("falls back to amount when there is no itemised total", () => {
    // Base invoices created before the itemised-total era carry only `amount`.
    expect(invoiceValue({ amount: 5000, totalAmount: null })).toBe(5000);
  });

  it("is a per-row choice, which is why two column sums cannot express it", () => {
    // A load that mixes an old base (amount only) with a modern supplemental
    // (both). Summing `_sum: {amount}` and `_sum: {totalAmount}` separately
    // gives 5250 and 250 — neither is the answer.
    const rows = [
      { amount: 5000, totalAmount: null },
      { amount: 250, totalAmount: 275 },
    ];
    expect(rows.reduce((t, r) => t + invoiceValue(r), 0)).toBe(5275);
  });
});

describe("invoicedTotalsForLoads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("omits loads with no qualifying invoice — absent, not zero", () => {
    // THE ONE THAT MATTERS. A returned 0 would blank the board.
    mockPrisma.invoice.findMany.mockResolvedValue([] as any);
    return invoicedTotalsForLoads(["L1"]).then((m) => {
      expect(m.has("L1"), "an un-invoiced load must have NO key").toBe(false);
      expect(m.get("L1"), "and therefore be undefined, not 0").toBeUndefined();
    });
  });

  it("sums BASE plus SUPPLEMENTAL for one load", async () => {
    // Invoice.loadId is not unique. A supplemental carries only the accessorial
    // delta while the base keeps its own figure, so the billed total is a sum.
    mockPrisma.invoice.findMany.mockResolvedValue([
      { loadId: "L1", amount: 4100, totalAmount: null },
      { loadId: "L1", amount: 250, totalAmount: null },
    ] as any);
    const m = await invoicedTotalsForLoads(["L1"]);
    expect(m.get("L1")).toBe(4350);
  });

  it("keeps loads separate", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { loadId: "L1", amount: 100, totalAmount: null },
      { loadId: "L2", amount: 200, totalAmount: null },
    ] as any);
    const m = await invoicedTotalsForLoads(["L1", "L2"]);
    expect(m.get("L1")).toBe(100);
    expect(m.get("L2")).toBe(200);
  });

  it("does not query at all for an empty page", async () => {
    const m = await invoicedTotalsForLoads([]);
    expect(m.size).toBe(0);
    expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("asks only for issued invoices, and only live ones", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([] as any);
    await invoicedTotalsForLoads(["L1"]);
    const where = mockPrisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual([...BILLED_STATUSES]);
    expect(where.deletedAt, "a soft-deleted invoice is not a billed fact").toBeNull();
  });
});

describe("the billed-status set", () => {
  it("excludes DRAFT", () => {
    // autoGenerateInvoice creates invoices as DRAFT, so including it would make
    // the board report a billed figure the customer has never seen. The
    // accounting summary already took this position; this is the same rule, not
    // a second one.
    expect(BILLED_STATUSES).not.toContain("DRAFT");
  });

  it("excludes VOID and REJECTED", () => {
    expect(BILLED_STATUSES).not.toContain("VOID");
    expect(BILLED_STATUSES).not.toContain("REJECTED");
  });

  it("includes the statuses that mean money is owed or received", () => {
    for (const s of ["SENT", "PAID", "OVERDUE", "PARTIAL"]) {
      expect(BILLED_STATUSES).toContain(s);
    }
  });
});
