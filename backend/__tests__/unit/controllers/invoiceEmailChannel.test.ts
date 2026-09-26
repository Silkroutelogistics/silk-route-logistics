/**
 * The two paths that email an invoice record EMAIL as its delivery channel, with
 * when and who (RECONCILE step 2). Mark-sent covers every other channel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4")) }));
vi.mock("../../../src/services/emailService", () => ({
  sendCustomerInvoiceEmail: vi.fn().mockResolvedValue("resend-id"),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  wrap: (h: string) => h,
}));
vi.mock("../../../src/services/storageService", () => ({ uploadFileToPath: vi.fn().mockResolvedValue("invoices/121498I.pdf") }));
vi.mock("../../../src/services/customerRecipientResolver", () => ({ resolveBillingRecipients: vi.fn().mockResolvedValue([{ email: "ap@example.com" }]) }));
vi.mock("../../../src/services/invoiceService", () => ({ assessLoadBillable: vi.fn() }));

import { sendInvoice } from "../../../src/controllers/accountingController";
import { generateInvoiceFromLoad } from "../../../src/controllers/invoiceController";

const mockPrisma = vi.mocked(prisma, true) as any;
const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
const LOAD = { id: "load-1", customerId: "c-1", referenceNumber: "121498", loadNumber: "121498", customerRate: 2550, fuelSurcharge: 0,
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
