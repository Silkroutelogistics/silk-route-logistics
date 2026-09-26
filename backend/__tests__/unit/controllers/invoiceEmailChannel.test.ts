/**
 * The two paths that email an invoice record EMAIL as its delivery channel, with
 * when and who (RECONCILE step 2). Mark-sent covers every other channel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4")) }));
vi.mock("../../../src/services/emailService", () => ({
  sendCustomerInvoiceEmail: vi.fn().mockResolvedValue("resend-id"),
  sendEmail: vi.fn().mockResolvedValue("resend-id"),
  wrap: (h: string) => h,
}));
vi.mock("../../../src/services/storageService", () => ({ uploadFileToPath: vi.fn().mockResolvedValue("invoices/121498I.pdf") }));
vi.mock("../../../src/services/customerRecipientResolver", () => ({ resolveBillingRecipients: vi.fn().mockResolvedValue([{ email: "ap@example.com" }]) }));
vi.mock("../../../src/services/invoiceService", () => ({ assessLoadBillable: vi.fn() }));

import { sendInvoice } from "../../../src/controllers/accountingController";
import { generateInvoiceFromLoad } from "../../../src/controllers/invoiceController";
import { sendEmail } from "../../../src/services/emailService";
import { resolveBillingRecipients } from "../../../src/services/customerRecipientResolver";

const mockPrisma = vi.mocked(prisma, true) as any;
const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
const LOAD = { id: "load-1", posterId: "poster-1", customerId: "c-1", referenceNumber: "121498", loadNumber: "121498", customerRate: 2550, fuelSurcharge: 0,
  originCity: "A", originState: "MI", destCity: "B", destState: "OH", customer: { name: "Beekeepers", contactName: null, email: "ap@example.com", paymentTerms: "Net 30" } };

describe("an emailed invoice records EMAIL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv-1", status: "SENT" });
    mockPrisma.load.update.mockResolvedValue({});
  });

  it("sendInvoice: channel EMAIL, delivered when sent, by whoever sent it", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-1", invoiceNumber: "121498I", srlDocNumber: "121498I", invoiceKind: "BASE",
      loadId: "load-1", status: "DRAFT", amount: 2550, totalAmount: 2550, dueDate: null, load: LOAD, lineItems: [] });
    await sendInvoice({ params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } } as any, res());
    const { data } = mockPrisma.invoice.update.mock.calls[0][0];
    expect(data).toMatchObject({ status: "SENT", deliveryChannel: "EMAIL", deliveredById: "ae-1" });
    expect(data.deliveredAt).toBe(data.sentDate);
  });

  it("generateInvoiceFromLoad: the SENT flip after the email records EMAIL", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(LOAD);
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-9" });
    mockPrisma.invoiceLineItem = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-9", invoiceNumber: "121498I", srlDocNumber: "121498I", load: LOAD, lineItems: [] });
    await generateInvoiceFromLoad({ params: { loadId: "load-1" }, user: { id: "ae-2", role: "ACCOUNTING" } } as any, res());
    const sent = mockPrisma.invoice.update.mock.calls.map((c: any) => c[0]).find((a: any) => a.data?.status === "SENT");
    expect(sent?.data).toMatchObject({ deliveryChannel: "EMAIL", deliveredById: "ae-2" });
    expect(sent.data.deliveredAt).toBe(sent.data.sentDate);
  });
});

describe("generateInvoiceFromLoad marks SENT only when an email was accepted", () => {
  const run = async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.load.findUnique.mockResolvedValue(LOAD);
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-9" });
    mockPrisma.invoiceLineItem = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-9", invoiceNumber: "121498I", load: LOAD, lineItems: [] });
    const r = res();
    await generateInvoiceFromLoad({ params: { loadId: "load-1" }, user: { id: "ae-2", role: "ACCOUNTING" } } as any, r);
    return { status: r.status.mock.calls[0]?.[0], body: r.json.mock.calls[0]?.[0] };
  };
  const markedSent = () => mockPrisma.invoice.update.mock.calls.some((c: any) => c[0]?.data?.status === "SENT");
  const notified = () => mockPrisma.notification.create.mock.calls.map((c: any) => c[0].data.userId).sort();
  beforeEach(() => vi.clearAllMocks());

  it("a send that throws leaves it DRAFT, records the error, tells the poster and the actor", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("domain suppressed"));
    const { status, body } = await run();
    expect(markedSent()).toBe(false);
    expect(mockPrisma.load.update).not.toHaveBeenCalled(); // customerInvoiced stays false
    expect(mockPrisma.systemLog.create.mock.calls[0][0].data).toMatchObject({ logType: "ERROR", source: "invoice-email" });
    expect(mockPrisma.systemLog.create.mock.calls[0][0].data.message).toContain("domain suppressed");
    expect(notified()).toEqual(["ae-2", "poster-1"]);
    expect(status).toBe(201);
    expect(body.emailDelivery).toEqual({ accepted: 0, failures: ["ap@example.com: domain suppressed"] });
  });
  it("no id back (provider not configured) is not a delivery", async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce(undefined);
    const { body } = await run();
    expect(markedSent()).toBe(false);
    expect(body.emailDelivery.failures[0]).toContain("not configured");
    expect(notified()).toEqual(["ae-2", "poster-1"]);
  });
  it("no billing recipient is not a delivery either, and is reported", async () => {
    vi.mocked(resolveBillingRecipients).mockResolvedValueOnce([]);
    const { body } = await run();
    expect(markedSent()).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(body.emailDelivery).toEqual({ accepted: 0, failures: ["no billing recipient on file"] });
    expect(notified()).toEqual(["ae-2", "poster-1"]);
  });
  it("one of two accepted is SENT, with the failure in the response and no alarm", async () => {
    vi.mocked(resolveBillingRecipients).mockResolvedValueOnce([{ email: "ap@example.com" }, { email: "old@example.com" }] as any);
    vi.mocked(sendEmail).mockResolvedValueOnce("resend-id").mockRejectedValueOnce(new Error("bounced"));
    const { body } = await run();
    expect(markedSent()).toBe(true);
    expect(body.emailDelivery).toEqual({ accepted: 1, failures: ["old@example.com: bounced"] });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
