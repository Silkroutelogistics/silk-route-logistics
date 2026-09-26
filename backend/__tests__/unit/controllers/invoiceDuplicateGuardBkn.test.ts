/**
 * RECONCILE step 3e (ruled 2026-09-26): the four BKN invoices SRL delivered through
 * Tipalti on 2026-09-25 are recorded SENT via TIPALTI (step 3c), and the duplicate
 * guard is what refuses a second email for them: sendInvoice refuses a non-DRAFT,
 * generateInvoiceFromLoad returns the invoice a load already has. It replaced the
 * send lock (v3.8.blq), whose module is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4")) }));
vi.mock("../../../src/services/emailService", () => ({
  sendCustomerInvoiceEmail: vi.fn().mockResolvedValue("resend-id"),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  wrap: (h: string) => h,
}));
vi.mock("../../../src/services/invoiceService", () => ({ assessLoadBillable: vi.fn() }));
vi.mock("../../../src/services/storageService", () => ({ uploadFileToPath: vi.fn().mockResolvedValue("invoices/x.pdf") }));
vi.mock("../../../src/services/customerRecipientResolver", () => ({ resolveBillingRecipients: vi.fn().mockResolvedValue([{ email: "ap@example.com" }]) }));

import { sendCustomerInvoiceEmail, sendEmail } from "../../../src/services/emailService";
import { sendInvoice } from "../../../src/controllers/accountingController";
import { generateInvoiceFromLoad } from "../../../src/controllers/invoiceController";

const mockPrisma = vi.mocked(prisma, true) as any;
const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
const load = (loadNumber: string) => ({ loadNumber, referenceNumber: loadNumber, originCity: "Irving", originState: "TX",
  destCity: "Hebron", destState: "KY", customer: { name: "Beekeepers Naturals USA Inc.", email: "ap@example.com", paymentTerms: "Net 30" } });
const draft = (loadNumber: string) => ({ id: "inv-1", invoiceNumber: "X", srlDocNumber: "X", invoiceKind: "BASE", loadId: "load-1",
  status: "DRAFT", amount: 700, totalAmount: 700, dueDate: null, load: load(loadNumber), lineItems: [] });

const FOUR = ["SRL-121492", "SRL-121494", "SRL-121495", "SRL-121496"];

describe("sendInvoice: a reconciled invoice is refused by the duplicate guard, not a lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv-1", status: "SENT" });
  });
  const send = async (inv: object) => {
    mockPrisma.invoice.findUnique.mockResolvedValue(inv);
    const r = res();
    await sendInvoice({ params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } } as any, r);
    return r;
  };

  it("each of the four, SENT via TIPALTI: 400 not-DRAFT, no email, no status change", async () => {
    for (const n of FOUR) {
      const r = await send({ ...draft(n), status: "SENT", deliveryChannel: "TIPALTI" });
      expect(r.status).toHaveBeenCalledWith(400);
      expect(r.json.mock.calls[0][0].error).toContain("SENT");
    }
    expect(sendCustomerInvoiceEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
  });

  it("control: a DRAFT on SRL-121495 is emailed, so no lock stands in the way", async () => {
    const r = await send(draft("SRL-121495"));
    expect(sendCustomerInvoiceEmail).toHaveBeenCalledTimes(1);
    expect(r.status).not.toHaveBeenCalledWith(409);
  });
});

describe("generateInvoiceFromLoad: a reconciled load returns the invoice it has", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-9" });
    mockPrisma.invoiceLineItem = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    mockPrisma.invoice.update.mockResolvedValue({});
    mockPrisma.load.update.mockResolvedValue({});
  });
  const gen = async (loadNumber: string) => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", customerId: "c-1", customerRate: 250, fuelSurcharge: 0, ...load(loadNumber) });
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-9", invoiceNumber: "X", srlDocNumber: "X", load: load(loadNumber), lineItems: [] });
    const r = res();
    await generateInvoiceFromLoad({ params: { loadId: "load-1" }, user: { id: "ae-2", role: "ACCOUNTING" } } as any, r);
    return r;
  };

  it("each of the four already holds its invoice: 'Invoice already exists', nothing created, nothing emailed", async () => {
    for (const n of FOUR) {
      mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-sent", status: "SENT", deliveryChannel: "TIPALTI" });
      const r = await gen(n);
      expect(r.json.mock.calls[0][0]).toMatchObject({ message: "Invoice already exists" });
    }
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("control: with no invoice on it, SRL-121492 is created and emailed, so no lock stands in the way", async () => {
    const r = await gen("SRL-121492");
    expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(r.status).toHaveBeenCalledWith(201);
  });
});
