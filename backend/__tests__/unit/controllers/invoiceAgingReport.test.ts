/**
 * The AR aging report (GET /accounting/invoices/aging, getInvoiceAging).
 *
 * v3.8.bnb — ruling 2026-09-27, 2: a partly paid invoice past its due day is
 * OVERDUE "with the balance shown". The report ages what is still owed: each
 * row carries its balance, and the bucket totals and the grand total are sums
 * of balances, not of face amounts.
 *
 * v3.8.bne — ruling 2026-09-27, 3: the report ages by the due day on the
 * America/Toronto clock, from the shared rule every surface reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";

// accountingController imports from integrationService at load; nothing here
// reaches it, so an empty surface keeps its side effects out of the test.
vi.mock("../../../src/services/integrationService", () => ({}));

import { getInvoiceAging } from "../../../src/controllers/accountingController";
import { OPEN_STATUSES } from "../../../../shared/constants/invoiceDueDay";

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

describe("getInvoiceAging — the due day on the Toronto clock", () => {
  const bucketOf = (out: any, id: string) =>
    Object.keys(out.buckets).find((k) => out.buckets[k].invoices.some((i: any) => i.id === id));

  it("an invoice due Oct 25 is current until the day is over, and 1 day past due from 00:00 Toronto", async () => {
    const due = new Date("2026-10-25T00:00:00.000Z"); // Beekeepers' shape: midnight UTC
    vi.setSystemTime(new Date("2026-10-26T03:59:00.000Z")); // 11:59 PM Toronto, Oct 25
    let out = await report([invoice({ id: "bkn", dueDate: due })]);
    expect(bucketOf(out, "bkn")).toBe("current");
    expect(out.buckets.current.invoices[0].daysOutstanding).toBe(0);

    vi.setSystemTime(new Date("2026-10-26T04:00:00.000Z")); // 00:00 Toronto, Oct 26
    out = await report([invoice({ id: "bkn", dueDate: due })]);
    expect(bucketOf(out, "bkn")).toBe("1-30");
    expect(out.buckets["1-30"].invoices[0].daysOutstanding).toBe(1);
  });

  it("the clock is Toronto, not New York (January 1974, when the two differed)", async () => {
    const due = new Date("1974-01-09T00:00:00.000Z");
    vi.setSystemTime(new Date("1974-01-10T04:30:00.000Z")); // Jan 10 in New York, still Jan 9 in Toronto
    expect(bucketOf(await report([invoice({ id: "a", dueDate: due })]), "a")).toBe("current");
    vi.setSystemTime(new Date("1974-01-10T05:00:00.000Z"));
    expect(bucketOf(await report([invoice({ id: "a", dueDate: due })]), "a")).toBe("1-30");
  });

  it("an invoice with no due date is aged from the day it was created, on the same clock", async () => {
    // Created at 9 PM Toronto on Nov 19 (02:00 UTC Nov 20); on Nov 20 it is a day old.
    vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
    const out = await report([invoice({ id: "undated", dueDate: null, createdAt: new Date("2026-11-20T02:00:00.000Z") })]);
    expect(bucketOf(out, "undated")).toBe("1-30");
    expect(out.buckets["1-30"].invoices[0].daysOutstanding).toBe(1);
  });

  it("ages the open statuses from the shared rule", async () => {
    await report([]);
    expect(mockPrisma.invoice.findMany.mock.calls[0][0].where).toEqual({ status: { in: OPEN_STATUSES } });
    expect(OPEN_STATUSES).toEqual(["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PARTIAL", "OVERDUE"]);
  });
});
