/**
 * The AR aging report (GET /accounting/invoices/aging, getInvoiceAging).
 *
 * v3.8.bnb — ruling 2026-09-27, 2: a partly paid invoice past its due day is
 * OVERDUE "with the balance shown". The report ages what is still owed: each
 * row carries its balance, and the bucket totals and the grand total are sums
 * of balances, not of face amounts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";

// accountingController imports from integrationService at load; nothing here
// reaches it, so an empty surface keeps its side effects out of the test.
vi.mock("../../../src/services/integrationService", () => ({}));

import { getInvoiceAging } from "../../../src/controllers/accountingController";

const mockPrisma = prisma as any;
const DAY = 86_400_000;
const NOW = new Date("2026-11-20T15:00:00.000Z");

function res() {
  const r: any = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}

function invoice(over: Record<string, unknown>) {
  return {
    id: "inv", invoiceNumber: "INV-1", status: "SENT", amount: 1000, totalAmount: null, paidAmount: null,
    dueDate: new Date(NOW.getTime() + 10 * DAY), createdAt: new Date(NOW.getTime() - 20 * DAY),
    load: null, user: null, ...over,
  };
}

async function report(rows: unknown[]) {
  mockPrisma.invoice.findMany.mockResolvedValue(rows);
  const r = res();
  await getInvoiceAging({ query: {} } as any, r);
  return r.json.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("getInvoiceAging — what is still owed", () => {
  it("a partly paid invoice is aged at its balance, not its face amount", async () => {
    const out = await report([
      invoice({ id: "part", status: "OVERDUE", amount: 1000, paidAmount: 600, dueDate: new Date(NOW.getTime() - 40 * DAY) }),
      invoice({ id: "open", status: "SENT", amount: 500 }),
    ]);
    const part = out.buckets["31-60"].invoices[0];
    expect(part.id).toBe("part");
    expect(part.balance).toBe(400);
    expect(part.amount).toBe(1000); // the face amount is still on the row
    expect(out.buckets["31-60"].total).toBe(400);
    expect(out.buckets.current.total).toBe(500);
    expect(out.summary.grandTotal).toBe(900);
  });

  it("an itemised invoice with nothing paid is aged on its total (totalAmount), not its base amount", async () => {
    const out = await report([
      invoice({ id: "itemised", amount: 1000, totalAmount: 1150, dueDate: new Date(NOW.getTime() - 5 * DAY) }),
    ]);
    expect(out.buckets["1-30"].invoices[0].balance).toBe(1150);
    expect(out.summary["1-30"]).toBe(1150);
    expect(out.summary.grandTotal).toBe(1150);
  });
});
