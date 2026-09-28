/**
 * The accounting dashboard's overdue count (GET /accounting/dashboard, the
 * /accounting home card, and GET /accounting/dashboard/enhanced).
 *
 * v3.8.bnf — ruling 2026-09-27, 3: the count uses the due day on the
 * America/Toronto clock from the shared rule. It had counted an invoice from
 * its stored instant, so a due date stored at midnight UTC counted as overdue
 * from 8 PM Eastern the evening before; and it left PARTIAL out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/integrationService", () => ({}));

import { getDashboard, getAccountingDashboardEnhanced } from "../../../src/controllers/accountingController";

const mockPrisma = prisma as any;

interface Row { id: string; status: string; dueDate: Date | null }
let rows: Row[];

/** Answers the count's WHERE against rows; refuses any filter it does not know. */
function count({ where }: any): number {
  for (const k of Object.keys(where)) if (k !== "status" && k !== "dueDate") throw new Error(`unexpected filter: ${k}`);
  if (Object.keys(where.status).join() !== "in" || Object.keys(where.dueDate).join() !== "lt") throw new Error("unexpected operator");
  return rows.filter((r) => where.status.in.includes(r.status) && r.dueDate !== null && r.dueDate < where.dueDate.lt).length;
}

function res() {
  const r: any = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}

async function overdueOn(handler: typeof getDashboard) {
  const r = res();
  await handler({ query: {} } as any, r);
  expect(r.status).not.toHaveBeenCalled(); // a 500 would hide the count
  return r.json.mock.calls[0][0].alerts.overdueInvoices;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockPrisma.factoringFund.findFirst.mockResolvedValue(null);
  mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 });
  mockPrisma.carrierPay.aggregate.mockResolvedValue({ _sum: { netAmount: 0, quickPayFeeAmount: 0 }, _count: 0 });
  // The global mock has no count() on these three; the dashboards call it.
  mockPrisma.carrierPay.count = vi.fn().mockResolvedValue(0);
  mockPrisma.shipperCredit.count = vi.fn().mockResolvedValue(0);
  mockPrisma.approvalQueue.count = vi.fn().mockResolvedValue(0);
  mockPrisma.load.findMany.mockResolvedValue([]);
  mockPrisma.paymentDispute.count.mockResolvedValue(0);
  mockPrisma.approvalQueue.findMany.mockResolvedValue([]);
  mockPrisma.invoice.count.mockImplementation(async (args: any) => count(args));
});
afterEach(() => vi.useRealTimers());

const DUE_OCT25 = new Date("2026-10-25T00:00:00.000Z"); // Beekeepers' shape: midnight UTC

describe.each([
  ["GET /accounting/dashboard", getDashboard],
  ["GET /accounting/dashboard/enhanced", getAccountingDashboardEnhanced],
])("%s — the overdue count", (_name, handler) => {
  it("does not count an invoice on its due day, and counts it from 00:00 Toronto the day after", async () => {
    rows = [{ id: "bkn", status: "SENT", dueDate: DUE_OCT25 }];
    vi.setSystemTime(new Date("2026-10-25T20:30:00.000Z")); // 4:30 PM Toronto, the due day
    expect(await overdueOn(handler)).toBe(0);
    vi.setSystemTime(new Date("2026-10-26T03:59:00.000Z")); // 11:59 PM Toronto, the due day
    expect(await overdueOn(handler)).toBe(0);
    vi.setSystemTime(new Date("2026-10-26T04:00:00.000Z")); // 00:00 Toronto, the day after
    expect(await overdueOn(handler)).toBe(1);
  });

  it("uses the Toronto clock, not New York's (January 1974, when the two differed)", async () => {
    rows = [{ id: "a", status: "SENT", dueDate: new Date("1974-01-09T00:00:00.000Z") }];
    vi.setSystemTime(new Date("1974-01-10T04:30:00.000Z"));
    expect(await overdueOn(handler)).toBe(0);
    vi.setSystemTime(new Date("1974-01-10T05:00:00.000Z"));
    expect(await overdueOn(handler)).toBe(1);
  });

  it("counts every open status past due, PARTIAL and OVERDUE included, and nothing settled or unsent", async () => {
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
    rows = ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PARTIAL", "OVERDUE", "DRAFT", "PAID", "VOID", "REJECTED"]
      .map((s) => ({ id: s, status: s, dueDate: DUE_OCT25 }));
    rows.push({ id: "no-due", status: "SENT", dueDate: null });
    expect(await overdueOn(handler)).toBe(7);
  });
});
