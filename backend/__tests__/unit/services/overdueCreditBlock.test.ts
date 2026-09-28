/**
 * v3.8.blg — the 90-day credit block, on its own.
 *
 * The invoice query is answered by evaluating its WHERE against fixture rows,
 * so what is asserted is which invoices the job selects, not what a mock was
 * told to return (§13.3 Item 273.10).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { applyOverdueCreditBlocks } from "../../../src/services/overdueCreditBlock";

const mockPrisma = prisma as any;
const DAY = 86_400_000;
const NOW = new Date("2026-09-26T11:00:00.000Z");

interface Inv {
  id: string;
  invoiceNumber: string;
  status: string;
  dueDate: Date;
  creditBlockApplied: boolean;
  deletedAt: Date | null;
  load: { customerId: string | null; deletedAt: Date | null; status: string; customer?: { email: string | null }; channel?: string };
}

let invoices: Inv[];
let credits: Map<string, { id: string; autoBlocked: boolean }>;

function inv(over: Partial<Inv> & { id: string; daysPastDue: number }): Inv {
  const { daysPastDue, ...rest } = over as any;
  return {
    invoiceNumber: `INV-${over.id}`,
    status: "OVERDUE",
    dueDate: new Date(NOW.getTime() - daysPastDue * DAY),
    creditBlockApplied: false,
    deletedAt: null,
    load: { customerId: "cust-1", deletedAt: null, status: "DELIVERED" },
    ...rest,
  };
}

function matches(i: Inv, where: any): boolean {
  if (where.status?.in && !where.status.in.includes(i.status)) return false;
  if (where.dueDate?.lt && !(i.dueDate < where.dueDate.lt)) return false;
  if ("creditBlockApplied" in where && i.creditBlockApplied !== where.creditBlockApplied) return false;
  if ("deletedAt" in where && where.deletedAt === null && i.deletedAt !== null) return false;
  const lw = where.load?.is;
  if (lw) {
    if ("deletedAt" in lw && lw.deletedAt === null && i.load.deletedAt !== null) return false;
    if (lw.status?.not && i.load.status === lw.status.not) return false;
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  invoices = [];
  credits = new Map([["cust-1", { id: "sc-1", autoBlocked: false }]]);
  // Returns the customer's channel only when the query selects it, so a job
  // that stopped asking for it would read every customer as not-Tipalti here
  // too, and the Tipalti cases below would fail.
  mockPrisma.invoice.findMany.mockImplementation(async ({ where, select }: any) =>
    invoices.filter((i) => matches(i, where)).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      load: {
        customerId: i.load.customerId,
        ...(select?.load?.select?.customer?.select?.defaultInvoiceChannel
          ? { customer: { defaultInvoiceChannel: i.load.channel ?? "EMAIL" } }
          : {}),
      },
    })),
  );
  mockPrisma.invoice.update.mockImplementation(async ({ where, data }: any) => {
    const row = invoices.find((i) => i.id === where.id)!;
    Object.assign(row, data);
    return row;
  });
  mockPrisma.shipperCredit.findUnique.mockImplementation(async ({ where }: any) => credits.get(where.customerId) ?? null);
  mockPrisma.shipperCredit.updateMany.mockImplementation(async ({ where, data }: any) => {
    const c = credits.get(where.customerId);
    if (!c || (where.autoBlocked === false && c.autoBlocked)) return { count: 0 };
    Object.assign(c, data);
    return { count: 1 };
  });
});

describe("applyOverdueCreditBlocks", () => {
  it("blocks a customer whose invoice is 90 days overdue, and remembers it on that invoice", async () => {
    invoices = [inv({ id: "a", daysPastDue: 90 })];
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r).toEqual({ checked: 1, blocked: 1, alreadyBlocked: 0, noCreditRecord: 0, skippedTipalti: 0 });
    const data = mockPrisma.shipperCredit.updateMany.mock.calls[0][0].data;
    expect(data.autoBlocked).toBe(true);
    expect(data.blockedReason).toBe("Auto-blocked: Invoice INV-a 90+ days overdue");
    expect(invoices[0].creditBlockApplied).toBe(true);
  });

  it("keeps the old boundary: exactly 89 days is not yet blocked, 89 days and an hour is", async () => {
    invoices = [inv({ id: "on89", daysPastDue: 89 }), inv({ id: "past89", daysPastDue: 89 + 1 / 24 })];
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r.checked).toBe(1);
    expect(invoices.find((i) => i.id === "on89")!.creditBlockApplied).toBe(false);
    expect(invoices.find((i) => i.id === "past89")!.creditBlockApplied).toBe(true);
  });

  it("a customer with no email on file is blocked all the same", async () => {
    invoices = [inv({ id: "a", daysPastDue: 120, load: { customerId: "cust-1", deletedAt: null, status: "DELIVERED", customer: { email: null } } })];
    const r = await applyOverdueCreditBlocks(NOW);
    expect(r.blocked).toBe(1);
    expect(credits.get("cust-1")!.autoBlocked).toBe(true);
  });

  it("an invoice already acted on is never looked at again, so an admin's unblock stands", async () => {
    invoices = [inv({ id: "a", daysPastDue: 150, creditBlockApplied: true })];
    credits.set("cust-1", { id: "sc-1", autoBlocked: false }); // an admin unblocked them
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r.checked).toBe(0);
    expect(mockPrisma.shipperCredit.updateMany).not.toHaveBeenCalled();
    expect(credits.get("cust-1")!.autoBlocked).toBe(false);
  });

  it("a customer already blocked: the invoice is recorded and the block is not rewritten", async () => {
    invoices = [inv({ id: "a", daysPastDue: 95 })];
    credits.set("cust-1", { id: "sc-1", autoBlocked: true });
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r).toEqual({ checked: 1, blocked: 0, alreadyBlocked: 1, noCreditRecord: 0, skippedTipalti: 0 });
    expect(mockPrisma.shipperCredit.updateMany).not.toHaveBeenCalled();
    expect(invoices[0].creditBlockApplied).toBe(true);
  });

  it("no credit record: nothing is marked, so the block is tried again next run", async () => {
    invoices = [inv({ id: "a", daysPastDue: 95, load: { customerId: "cust-none", deletedAt: null, status: "DELIVERED" } })];
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r.noCreditRecord).toBe(1);
    expect(invoices[0].creditBlockApplied).toBe(false);
  });

  it("a cancelled or deleted load, a deleted invoice, or a paid invoice never blocks anyone", async () => {
    invoices = [
      inv({ id: "cancelled", daysPastDue: 120, load: { customerId: "cust-1", deletedAt: null, status: "CANCELLED" } }),
      inv({ id: "loadGone", daysPastDue: 120, load: { customerId: "cust-1", deletedAt: new Date(), status: "DELIVERED" } }),
      inv({ id: "invGone", daysPastDue: 120, deletedAt: new Date() }),
      inv({ id: "paid", daysPastDue: 120, status: "PAID" }),
    ];
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r.checked).toBe(0);
    expect(credits.get("cust-1")!.autoBlocked).toBe(false);
  });

  it("writes no reminder field and no late-payment mark", async () => {
    invoices = [inv({ id: "a", daysPastDue: 100 }), inv({ id: "b", daysPastDue: 30 })];
    await applyOverdueCreditBlocks(NOW);

    const written = [
      ...mockPrisma.invoice.update.mock.calls,
      ...mockPrisma.invoice.updateMany.mock.calls,
      ...mockPrisma.shipperCredit.update.mock.calls,
      ...mockPrisma.shipperCredit.updateMany.mock.calls,
    ].flatMap((c: any[]) => Object.keys(c[0].data ?? {}));
    expect(written.length).toBeGreaterThan(0);
    expect(written.filter((k) => /reminderSent|lastReminderAt|latePayments/.test(k))).toEqual([]);
  });
});

// v3.8.bmf — ruling 2026-09-27: customers whose default invoice channel is
// TIPALTI are exempt from the 90-day credit block.
describe("applyOverdueCreditBlocks — customers billed through Tipalti", () => {
  const tipalti = (id: string, customerId = "cust-1") =>
    inv({ id, daysPastDue: 120, load: { customerId, deletedAt: null, status: "DELIVERED", channel: "TIPALTI" } });

  it("a Tipalti customer 120 days overdue is not blocked, and the invoice is left unmarked", async () => {
    invoices = [tipalti("t")];
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r).toEqual({ checked: 1, blocked: 0, alreadyBlocked: 0, noCreditRecord: 0, skippedTipalti: 1 });
    expect(mockPrisma.shipperCredit.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.shipperCredit.updateMany).not.toHaveBeenCalled();
    expect(credits.get("cust-1")!.autoBlocked).toBe(false);
    expect(invoices[0].creditBlockApplied).toBe(false);
  });

  it("a Tipalti invoice ahead in the run does not stop the next customer's block", async () => {
    credits.set("cust-2", { id: "sc-2", autoBlocked: false });
    invoices = [
      tipalti("t", "cust-1"),
      inv({ id: "e", daysPastDue: 120, load: { customerId: "cust-2", deletedAt: null, status: "DELIVERED", channel: "EMAIL" } }),
    ];
    const r = await applyOverdueCreditBlocks(NOW);

    expect(r.skippedTipalti).toBe(1);
    expect(r.blocked).toBe(1);
    expect(credits.get("cust-1")!.autoBlocked).toBe(false);
    expect(credits.get("cust-2")!.autoBlocked).toBe(true);
  });
});
