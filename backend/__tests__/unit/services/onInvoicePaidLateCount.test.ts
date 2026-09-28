/**
 * v3.8.blg — a late payment is recorded once per invoice, when it is fully
 * paid. It was recorded on every payment, so a bill paid late in two parts got
 * two late marks, on top of the one a daily job added at 30 days overdue.
 * Money received still releases credit on every payment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { onInvoicePaid } from "../../../src/services/integrationService";

const mockPrisma = prisma as any;
const DAY = 86_400_000;

interface Settled { id: string; customerId: string; status: string; deletedAt: Date | null; dueDate: Date | null; createdAt: Date; paidAt: Date | null }

function setup(due: number | Date, channel: "EMAIL" | "TIPALTI" = "EMAIL", history: Settled[] = []) {
  // The customer's earlier invoices, answered through the query's own WHERE,
  // so code that dropped a filter would average rows it should not.
  mockPrisma.invoice.findMany.mockImplementation(async ({ where }: any) =>
    history.filter((r) =>
      (where.id?.not === undefined || r.id !== where.id.not) &&
      (where.status === undefined || r.status === where.status) &&
      (where.paidAt?.not !== null || r.paidAt !== null) &&
      (where.deletedAt !== null || r.deletedAt === null) &&
      (where.load?.customerId === undefined || r.customerId === where.load.customerId)));
  // The customer's channel comes back only when the query includes it, so code
  // that stopped asking for it would read a Tipalti customer as EMAIL here too.
  mockPrisma.invoice.findUnique.mockImplementation(async ({ include }: any) => ({
    id: "inv-1",
    invoiceNumber: "121498I",
    dueDate: typeof due === "number" ? new Date(Date.now() + due * DAY) : due,
    createdAt: new Date(Date.now() - 40 * DAY),
    load: {
      id: "load-1", referenceNumber: "SRL-121498", customerId: "cust-1", carrierId: null,
      ...(include?.load?.select?.customer?.select?.defaultInvoiceChannel ? { customer: { defaultInvoiceChannel: channel } } : {}),
    },
  }));
  mockPrisma.factoringFund.findFirst.mockResolvedValue(null);
  mockPrisma.factoringFund.create.mockResolvedValue({});
  mockPrisma.carrierPay.findFirst.mockResolvedValue(null);
  let credit = { id: "sc-1", currentUtilized: 5000, creditLimit: 50000, autoBlocked: false, onTimePayments: 4, latePayments: 1, avgDaysToPay: 31 };
  mockPrisma.shipperCredit.findUnique.mockImplementation(async () => credit);
  mockPrisma.shipperCredit.update.mockImplementation(async ({ data }: any) => {
    // Apply the increments, so a second payment reads what the first wrote.
    const next: any = { ...credit };
    for (const [k, v] of Object.entries<any>(data)) next[k] = v && typeof v === "object" && "increment" in v ? next[k] + v.increment : v;
    credit = next;
    return credit;
  });
  return () => credit;
}

const updates = () => mockPrisma.shipperCredit.update.mock.calls.map((c: any[]) => c[0].data);

beforeEach(() => vi.clearAllMocks());

describe("onInvoicePaid — payment record counted once, at settlement", () => {
  it("a partial payment releases credit but records nothing about timeliness", async () => {
    setup(-10); // 10 days past due
    await onInvoicePaid("inv-1", 2000, false);

    const [data] = updates();
    expect(data.currentUtilized).toBe(3000);
    expect(data).not.toHaveProperty("latePayments");
    expect(data).not.toHaveProperty("onTimePayments");
    expect(data).not.toHaveProperty("avgDaysToPay");
  });

  it("the payment that settles a bill after its due date records one late payment", async () => {
    setup(-10);
    await onInvoicePaid("inv-1", 3000, true);

    const [data] = updates();
    expect(data.latePayments).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty("onTimePayments");
    expect(typeof data.avgDaysToPay).toBe("number");
  });

  it("the payment that settles a bill before its due date records one on-time payment", async () => {
    setup(5);
    await onInvoicePaid("inv-1", 3000, true);

    const [data] = updates();
    expect(data.onTimePayments).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty("latePayments");
  });

  it("a bill paid late in two parts gets exactly one late mark", async () => {
    const credit = setup(-10);
    await onInvoicePaid("inv-1", 2000, false);
    await onInvoicePaid("inv-1", 1000, true);

    expect(credit().latePayments).toBe(2); // 1 before + 1 for this bill
    expect(credit().onTimePayments).toBe(4); // untouched
    expect(credit().currentUtilized).toBe(2000); // both payments released
  });
});

// v3.8.bnk — ruling 2026-09-27, 3: late means paid after the due day is over
// on the America/Toronto clock, the rule every surface reads.
describe("onInvoicePaid — late is judged by the due day on the Toronto clock", () => {
  const DUE_OCT25 = new Date("2026-10-25T00:00:00.000Z"); // Beekeepers' shape: midnight UTC
  const settleAt = async (now: string, due: Date) => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date(now));
    setup(due);
    await onInvoicePaid("inv-1", 3000, true);
    return updates()[0];
  };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a settlement at 9 PM Toronto on the due day is on time", async () => {
    const data = await settleAt("2026-10-26T01:00:00.000Z", DUE_OCT25);
    expect(data.onTimePayments).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty("latePayments");
  });

  it("a settlement from 00:00 Toronto the day after is late", async () => {
    const data = await settleAt("2026-10-26T04:00:00.000Z", DUE_OCT25);
    expect(data.latePayments).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty("onTimePayments");
  });

  it("uses the Toronto clock, not New York's (January 1974, when the two differed)", async () => {
    const due = new Date("1974-01-09T00:00:00.000Z");
    expect((await settleAt("1974-01-10T04:30:00.000Z", due)).onTimePayments).toEqual({ increment: 1 });
    expect((await settleAt("1974-01-10T05:00:00.000Z", due)).latePayments).toEqual({ increment: 1 });
  });
});

// v3.8.bmg — ruling 2026-09-27: customers whose default invoice channel is
// TIPALTI are exempt from the late-payment count. The EMAIL late case above is
// the control. v3.8.bnm — ruling 2026-09-27, 4: they are exempt from that count
// only; their settlements count in the average days to pay.
describe("onInvoicePaid — customers billed through Tipalti", () => {
  it("a late settlement records no late mark but does count in days to pay; credit is still released", async () => {
    setup(-10, "TIPALTI");
    await onInvoicePaid("inv-1", 3000, true);

    const [data] = updates();
    expect(data.currentUtilized).toBe(2000);
    expect(data).not.toHaveProperty("latePayments");
    expect(data).not.toHaveProperty("onTimePayments");
    expect(data.avgDaysToPay).toBe(40); // issued 40 days ago, settled now
  });

  it("an on-time settlement is still counted on time, with its days-to-pay sample", async () => {
    setup(5, "TIPALTI");
    await onInvoicePaid("inv-1", 3000, true);

    const [data] = updates();
    expect(data.onTimePayments).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty("latePayments");
    expect(typeof data.avgDaysToPay).toBe("number");
  });
});

// v3.8.bnm — ruling 2026-09-27, 4: the average is taken over every settled
// invoice of the customer, whichever channel it went through.
describe("onInvoicePaid — average days to pay over the customer's settled invoices", () => {
  const NOW = new Date("2026-10-20T12:00:00.000Z");
  const row = (id: string, created: string, paid: string | null, over: Partial<Settled> = {}): Settled => ({
    id, customerId: "cust-1", status: "PAID", deletedAt: null,
    dueDate: new Date("2026-09-01T00:00:00.000Z"), createdAt: new Date(created), paidAt: paid ? new Date(paid) : null, ...over,
  });
  const HISTORY: Settled[] = [
    row("a", "2026-08-01T00:00:00.000Z", "2026-08-11T00:00:00.000Z"),                     // 10 days
    row("b", "2026-08-01T00:00:00.000Z", "2026-08-21T12:00:00.000Z"),                     // 20 days
    row("c", "2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z", { dueDate: null }),  // no due date: 30
    // Not samples: a void, a deleted invoice, another customer's, this invoice
    // itself (sampled once, at now), and one marked PAID with no payment date.
    row("void", "2026-08-01T00:00:00.000Z", "2026-08-05T00:00:00.000Z", { status: "VOID" }),
    row("gone", "2026-08-01T00:00:00.000Z", "2026-08-06T00:00:00.000Z", { deletedAt: new Date("2026-08-07T00:00:00.000Z") }),
    row("other", "2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z", { customerId: "cust-2" }),
    row("inv-1", "2026-06-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z"),
    row("nodate", "2026-08-01T00:00:00.000Z", null),
  ];
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it.each(["EMAIL", "TIPALTI"] as const)("%s: a late settlement averages in with the rest (10, 20, 30, 40 → 25)", async (channel) => {
    setup(-10, channel, HISTORY); // this invoice: issued 40 days ago, settled now
    await onInvoicePaid("inv-1", 3000, true);
    expect(updates()[0].avgDaysToPay).toBe(25);
  });

  it("rounds to two places (10, 20, 40 → 23.33)", async () => {
    setup(-10, "TIPALTI", HISTORY.filter((r) => r.id !== "c"));
    await onInvoicePaid("inv-1", 3000, true);
    expect(updates()[0].avgDaysToPay).toBe(23.33);
  });

  it("a partial payment adds no sample and does not query the history", async () => {
    setup(-10, "TIPALTI", HISTORY);
    await onInvoicePaid("inv-1", 2000, false);
    expect(updates()[0]).not.toHaveProperty("avgDaysToPay");
    expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
