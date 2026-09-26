/**
 * v3.8.bko — payment-reminder emails are OFF until an admin turns them on.
 *
 * processArReminders is the only code that emails a customer about an unpaid
 * invoice, and it ran every morning unconditionally. These cases hold the
 * switch at the sender itself — so a second caller inherits it — and hold the
 * seed to never turning a switched-off row back on at restart.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const { sendEmail, resolveBillingRecipients } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  resolveBillingRecipients: vi.fn(),
}));
vi.mock("../../../src/services/emailService", () => ({ sendEmail, wrap: (s: string) => s }));
vi.mock("../../../src/services/customerRecipientResolver", () => ({ resolveBillingRecipients }));

import { prisma } from "../../../src/config/database";
import {
  AR_REMINDER_SWITCH, arReminderEmailsOn, setArReminderSwitch,
} from "../../../src/lib/arReminderSwitch";
import { processArReminders } from "../../../src/services/arCollectionsService";
import { seedCronRegistry } from "../../../src/services/cronRegistryService";

const mockPrisma = prisma as any;

// An invoice 20 days overdue with no reminder sent: the PAST_DUE_15 stage.
const OVERDUE = {
  id: "inv-1", invoiceNumber: "SRL-121494I", amount: 2550, totalAmount: 2550, status: "SENT",
  dueDate: new Date(Date.now() - 20 * 86_400_000),
  reminderSentPre7: false, reminderSentDue: false, reminderSent7: false, reminderSent31: false, reminderSent60: false,
  load: { referenceNumber: "SRL-121494", posterId: "u-ae", customer: { id: "cust-bee", name: "Beekeepers", email: "accountspayable@bee.test", contactName: null } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cronRegistry.findUnique = vi.fn();
  mockPrisma.cronRegistry.upsert = vi.fn();
  mockPrisma.invoice.findMany.mockResolvedValue([OVERDUE]);
  mockPrisma.invoice.update.mockResolvedValue({});
  mockPrisma.user.findMany.mockResolvedValue([]);
  resolveBillingRecipients.mockResolvedValue([{ email: "ap@bee.test", source: "CUSTOMER_EMAIL" }]);
  sendEmail.mockResolvedValue("resend-1");
});

describe("arReminderEmailsOn", () => {
  it("is OFF with no row, OFF with a false row, ON only with a true row", async () => {
    mockPrisma.cronRegistry.findUnique.mockResolvedValueOnce(null);
    expect(await arReminderEmailsOn()).toBe(false);
    mockPrisma.cronRegistry.findUnique.mockResolvedValueOnce({ enabled: false, updatedAt: new Date() });
    expect(await arReminderEmailsOn()).toBe(false);
    mockPrisma.cronRegistry.findUnique.mockResolvedValueOnce({ enabled: true, updatedAt: new Date() });
    expect(await arReminderEmailsOn()).toBe(true);
    expect(mockPrisma.cronRegistry.findUnique.mock.calls[0][0]).toEqual({ where: { jobName: AR_REMINDER_SWITCH } });
  });

  it("is OFF when the read fails — a switch that cannot be read sends no email", async () => {
    mockPrisma.cronRegistry.findUnique.mockRejectedValue(new Error("db down"));
    expect(await arReminderEmailsOn()).toBe(false);
  });

  it("setArReminderSwitch writes the flag on the one row", async () => {
    mockPrisma.cronRegistry.upsert.mockResolvedValue({ enabled: true, updatedAt: new Date() });
    await setArReminderSwitch(true);
    const arg = mockPrisma.cronRegistry.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ jobName: AR_REMINDER_SWITCH });
    expect(arg.update).toEqual({ enabled: true });
    expect(arg.create.enabled).toBe(true);
  });
});

describe("processArReminders behind the switch", () => {
  it("OFF: reads no invoice and sends nothing", async () => {
    mockPrisma.cronRegistry.findUnique.mockResolvedValue({ enabled: false, updatedAt: new Date() });
    const r = await processArReminders();
    expect(r).toEqual({ processed: 0, remindersSent: 0, errors: 0 });
    expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
  });

  it("no row at all behaves as OFF", async () => {
    mockPrisma.cronRegistry.findUnique.mockResolvedValue(null);
    await processArReminders();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ON: the overdue invoice's reminder goes out (control — the gate is what stops it)", async () => {
    mockPrisma.cronRegistry.findUnique.mockResolvedValue({ enabled: true, updatedAt: new Date() });
    const r = await processArReminders();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(r.remindersSent).toBe(1);
  });
});

describe("seedCronRegistry never turns reminder emails on", () => {
  it("creates the switch OFF and leaves `enabled` out of the update clause", async () => {
    mockPrisma.cronRegistry.upsert.mockResolvedValue({});
    await seedCronRegistry();
    const call = mockPrisma.cronRegistry.upsert.mock.calls.find((c: any[]) => c[0].where.jobName === AR_REMINDER_SWITCH);
    expect(call).toBeTruthy();
    expect(call[0].create.enabled).toBe(false);
    expect(call[0].update).not.toHaveProperty("enabled");
    // Every OTHER seeded row still starts enabled, as before.
    const others = mockPrisma.cronRegistry.upsert.mock.calls.filter((c: any[]) => c[0].where.jobName !== AR_REMINDER_SWITCH);
    expect(others.length).toBeGreaterThan(10);
    for (const c of others) expect(c[0].create.enabled).toBe(true);
  });

  it("the gate is the first thing processArReminders does (source guard)", () => {
    const src = readFileSync(join(__dirname, "../../../src/services/arCollectionsService.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function processArReminders"));
    const gate = body.indexOf("arReminderEmailsOn(");
    const query = body.indexOf("prisma.invoice.findMany");
    expect(gate).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(query);
  });
});
