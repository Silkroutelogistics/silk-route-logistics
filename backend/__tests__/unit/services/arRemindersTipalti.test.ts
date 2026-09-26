/**
 * RECONCILE step 4 (2026-09-26): no automated email reminder for a customer
 * whose default invoice channel is TIPALTI. Aging and overdue status still
 * show: the invoice turns OVERDUE when past due, whatever the channel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn().mockResolvedValue("resend-id"), wrap: (h: string) => h }));
vi.mock("../../../src/services/customerRecipientResolver", () => ({ resolveBillingRecipients: vi.fn().mockResolvedValue([{ email: "ap@example.com" }]) }));
// v3.8.bko — the job runs only while the reminder-email switch is on (it is off
// by default). These cases are about what the job does when it runs, so the
// switch is on here; the switch itself is tested in arReminderSwitch.test.ts.
vi.mock("../../../src/lib/arReminderSwitch", () => ({ arReminderEmailsOn: vi.fn().mockResolvedValue(true) }));

import { processArReminders } from "../../../src/services/arCollectionsService";
import { sendEmail } from "../../../src/services/emailService";

const mockPrisma = vi.mocked(prisma, true) as any;
const DAY = 86_400_000;
const invoice = (channel: string, dueInDays: number) => ({
  id: "inv-1", invoiceNumber: "121494I", status: "SENT", amount: 2550, totalAmount: 2550,
  dueDate: new Date(Date.now() + dueInDays * DAY + 3_600_000),
  reminderSentPre7: false, reminderSentDue: false, reminderSent7: false, reminderSent31: false, reminderSent60: false,
  load: { referenceNumber: "SRL-121494", posterId: "u-1", customer: { id: "c-bkn", name: "Beekeepers", email: "ap@example.com", contactName: null, defaultInvoiceChannel: channel } },
});

describe("AR reminders skip TIPALTI customers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.update.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    mockPrisma.notification.create.mockResolvedValue({});
  });

  it("coming due: no email, no reminder flag, no notice, no log", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("TIPALTI", 10)]);
    const out = await processArReminders();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.systemLog.create).not.toHaveBeenCalled();
    expect(out).toMatchObject({ processed: 1, remindersSent: 0, errors: 0 });
  });

  it("past due: it still turns OVERDUE, with no reminder flag and no email", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("TIPALTI", -5)]);
    await processArReminders();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.update.mock.calls[0][0]).toEqual({ where: { id: "inv-1" }, data: { status: "OVERDUE" } });
  });

  it("control: an EMAIL customer's invoice coming due is emailed and flagged", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("EMAIL", 10)]);
    const out = await processArReminders();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.update.mock.calls[0][0].data).toMatchObject({ reminderSentPre7: true });
    expect(out.remindersSent).toBe(1);
  });

  it("a TIPALTI invoice first in the run does not stop the next customer's reminder", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([invoice("TIPALTI", 10), { ...invoice("EMAIL", 10), id: "inv-2" }]);
    const out = await processArReminders();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ processed: 2, remindersSent: 1, errors: 0 });
  });
});
