/**
 * v3.8.blg — a late payment is recorded once per invoice, when it is fully
 * paid. It was recorded on every payment, so a bill paid late in two parts got
 * two late marks, on top of the one a daily job added at 30 days overdue.
 * Money received still releases credit on every payment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { onInvoicePaid } from "../../../src/services/integrationService";

const mockPrisma = prisma as any;
const DAY = 86_400_000;

function setup(dueInDays: number) {
  mockPrisma.invoice.findUnique.mockResolvedValue({
    id: "inv-1",
    invoiceNumber: "121498I",
    dueDate: new Date(Date.now() + dueInDays * DAY),
    createdAt: new Date(Date.now() - 40 * DAY),
    load: { id: "load-1", referenceNumber: "SRL-121498", customerId: "cust-1", carrierId: null },
  });
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
