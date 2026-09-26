/**
 * Send lock: the four BKN loads whose invoices SRL delivered through Tipalti on
 * 2026-09-25 cannot be emailed an invoice from the platform. It would bill twice.
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

import { INVOICE_SEND_LOCKED, isInvoiceSendLocked, sendLockedMessage } from "../../../src/lib/invoiceSendLock";
import { sendCustomerInvoiceEmail } from "../../../src/services/emailService";
import { sendInvoice } from "../../../src/controllers/accountingController";

const mockPrisma = vi.mocked(prisma, true) as any;
const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
const load = (loadNumber: string) => ({ loadNumber, referenceNumber: loadNumber, originCity: "Irving", originState: "TX",
  destCity: "Hebron", destState: "KY", customer: { name: "Beekeepers Naturals USA Inc.", email: "ap@example.com", paymentTerms: "Net 30" } });
const draft = (loadNumber: string) => ({ id: "inv-1", invoiceNumber: "X", srlDocNumber: "X", invoiceKind: "BASE", loadId: "load-1",
  status: "DRAFT", amount: 700, totalAmount: 700, dueDate: null, load: load(loadNumber), lineItems: [] });

describe("which loads are locked", () => {
  it("the four delivered BKN loads, in either spelling", () => {
    for (const n of ["121492", "121494", "121495", "121496"]) {
      expect(isInvoiceSendLocked(n)).toBe(true);
      expect(isInvoiceSendLocked(`SRL-${n}`)).toBe(true);
    }
  });

  it("nothing else: the neighbours, the continuing series, the withdrawn series, an invoice number, nothing", () => {
    for (const n of ["SRL-121493", "SRL-121497", "121498", "5003", "SRL-121494I", "121494I", "", null, undefined]) {
      expect(isInvoiceSendLocked(n as any)).toBe(false);
    }
  });

  it("the refusal names the load, the channel and the way out", () => {
    expect(INVOICE_SEND_LOCKED).toBe("INVOICE_SEND_LOCKED");
    const m = sendLockedMessage("SRL-121494");
    for (const s of ["SRL-121494", "Tipalti", "mark-sent"]) expect(m).toContain(s);
  });
});

describe("sendInvoice refuses a locked load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv-1", status: "SENT" });
  });

  it("409 INVOICE_SEND_LOCKED, no email, no status change", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(draft("SRL-121495"));
    const r = res();
    await sendInvoice({ params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0]).toMatchObject({ code: INVOICE_SEND_LOCKED });
    expect(r.json.mock.calls[0][0].error).toContain("SRL-121495");
    expect(sendCustomerInvoiceEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
  });

  it("control: an unlocked load is emailed, so the refusal above is the lock and not the harness", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(draft("121498"));
    const r = res();
    await sendInvoice({ params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } } as any, r);
    expect(sendCustomerInvoiceEmail).toHaveBeenCalledTimes(1);
    expect(r.status).not.toHaveBeenCalledWith(409);
  });
});
