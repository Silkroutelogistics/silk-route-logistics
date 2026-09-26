/**
 * D-1 (ruled 2026-09-26): processARReminders, the 11:00 UTC job, does nothing
 * for a customer billed through Tipalti: no reminder flags, no early OVERDUE,
 * no late-payment count, no credit auto-block. Aging still shows, because the
 * hourly aging job and the 14:00 collections run turn a past-due invoice OVERDUE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { processARReminders } from "../../../src/controllers/accountingController";

const mockPrisma = vi.mocked(prisma, true) as any;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const invoice = (channel: string, dueInMs: number, id = "inv-1") => ({
  id, invoiceNumber: "121494I", status: "SENT", dueDate: new Date(Date.now() + dueInMs),
  reminderSentPre7: false, reminderSentDue: false, reminderSent7: false,
  reminderSent31: false, reminderSent60: false, reminderSent90: false,
  load: { referenceNumber: "SRL-121494", customer: { id: `c-${channel}`, name: "Beekeepers", email: "ap@example.com", contactName: null, defaultInvoiceChannel: channel } },
});

// Each branch of the job, with a due date that lands in it. "Due within a day"
// is the early OVERDUE: the invoice is not yet due and the job flips it anyway.
const STAGES: Array<[string, number]> = [
  ["7 days before due", 5 * DAY],
  ["due within a day (the early OVERDUE)", 1 * HOUR],
  ["7 days overdue", -10 * DAY],
  ["30 days overdue (late-payment count)", -40 * DAY],
  ["60 days overdue", -70 * DAY],
  ["90 days overdue (credit auto-block)", -100 * DAY],
];

describe("processARReminders skips customers billed through Tipalti", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.update.mockResolvedValue({});
    mockPrisma.shipperCredit.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each(STAGES)("%s: no flag, no status change, no late count, no credit block", async (_label, dueInMs) => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("TIPALTI", dueInMs)]);
    const out = await processARReminders();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(mockPrisma.shipperCredit.updateMany).not.toHaveBeenCalled();
    expect(out).toEqual({ processed: 1, remindersSent: 0, skippedTipalti: 1 });
  });

  it.each(STAGES)("control, EMAIL customer, %s: the job still acts", async (_label, dueInMs) => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("EMAIL", dueInMs)]);
    const out = await processARReminders();
    expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ processed: 1, remindersSent: 1, skippedTipalti: 0 });
  });

  it("control: the EMAIL customer's early OVERDUE, late count and credit block still happen", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("EMAIL", 1 * HOUR, "due"), invoice("EMAIL", -40 * DAY, "late"), invoice("EMAIL", -100 * DAY, "block")]);
    await processARReminders();
    const byId = Object.fromEntries(mockPrisma.invoice.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data]));
    expect(byId.due).toMatchObject({ reminderSentDue: true, status: "OVERDUE" });
    const credit = mockPrisma.shipperCredit.updateMany.mock.calls.map((c: any[]) => c[0].data);
    expect(credit).toEqual([{ latePayments: { increment: 1 } }, expect.objectContaining({ autoBlocked: true })]);
  });

  it("a Tipalti invoice first in the run does not stop the next customer's", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("TIPALTI", 5 * DAY), invoice("EMAIL", 5 * DAY, "inv-2")]);
    const out = await processARReminders();
    expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.update.mock.calls[0][0]).toMatchObject({ where: { id: "inv-2" }, data: { reminderSentPre7: true } });
    expect(out).toEqual({ processed: 2, remindersSent: 1, skippedTipalti: 1 });
  });

  it("the query selects the channel: without it the real client returns no field and the skip never fires", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    await processARReminders();
    const arg = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(arg.include.load.select.customer.select.defaultInvoiceChannel).toBe(true);
  });
});
