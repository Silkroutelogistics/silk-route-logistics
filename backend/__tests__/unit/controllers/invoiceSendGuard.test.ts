/**
 * One BASE invoice per load leaves SRL (queue amendment, item 4).
 *
 * Asserted through the real send route: with a BASE invoice already SENT on the
 * load, sending a second BASE is refused with 409 and nothing is emailed or
 * flipped. A supplemental is still sendable. And neither AR reminder job
 * selects a DRAFT invoice, which is what keeps the three Beekeepers drafts
 * (121494, 121495, 121496) from being dunned while their state is undecided.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../../../src/config/database";

const { generateInvoicePdf, sendCustomerInvoiceEmail } = vi.hoisted(() => ({
  generateInvoicePdf: vi.fn(),
  sendCustomerInvoiceEmail: vi.fn(),
}));
vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf }));
vi.mock("../../../src/services/emailService", () => ({ sendCustomerInvoiceEmail }));

import { sendInvoice } from "../../../src/controllers/accountingController";
import { SENT_OR_LATER } from "../../../src/lib/invoiceSendGuard";

const mockPrisma = vi.mocked(prisma, true) as any;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const DRAFT = {
  id: "inv-2", invoiceNumber: "SRL-121494I", srlDocNumber: "SRL-121494I", invoiceKind: "BASE", loadId: "load-1",
  status: "DRAFT", amount: 2550, totalAmount: 2550, dueDate: new Date("2026-10-25"),
  load: { referenceNumber: "SRL-121494", customer: { email: "ap@example.com", name: "Beekeepers", paymentTerms: "Net 30" } },
};
const req = () => ({ params: { id: "inv-2" }, user: { id: "ae-1", role: "ADMIN" } }) as any;

describe("send guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateInvoicePdf.mockResolvedValue(Buffer.from("%PDF-1.4"));
    sendCustomerInvoiceEmail.mockResolvedValue("resend-id");
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv-2", status: "SENT" });
  });

  it("refuses a second BASE invoice for a load whose first was already sent — 409, no email, no flip", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(DRAFT);
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-9", srlDocNumber: "SRL-121494I", status: "SENT" });
    const res = mockRes();
    await sendInvoice(req(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe("LOAD_ALREADY_INVOICED");
    expect(sendCustomerInvoiceEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    const where = mockPrisma.invoice.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ loadId: "load-1", id: { not: "inv-2" }, invoiceKind: "BASE", deletedAt: null });
    expect(new Set(where.status.in)).toEqual(new Set(SENT_OR_LATER));
  });

  it("sends when no other BASE invoice on the load has gone out", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(DRAFT);
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await sendInvoice(req(), res);
    expect(sendCustomerInvoiceEmail).toHaveBeenCalledOnce();
  });

  it("a supplemental is still sendable after the base, and is not even checked", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ ...DRAFT, invoiceKind: "SUPPLEMENTAL" });
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-9", srlDocNumber: "SRL-121494I", status: "SENT" });
    const res = mockRes();
    await sendInvoice(req(), res);
    expect(sendCustomerInvoiceEmail).toHaveBeenCalledOnce();
    expect(mockPrisma.invoice.findFirst).not.toHaveBeenCalled();
  });

  it("SENT or later means every status after a document leaves SRL, and not DRAFT, SUBMITTED, VOID or REJECTED", () => {
    for (const s of ["SENT", "PARTIAL", "UNDER_REVIEW", "APPROVED", "FUNDED", "PAID", "OVERDUE"]) expect(SENT_OR_LATER).toContain(s);
    for (const s of ["DRAFT", "SUBMITTED", "VOID", "REJECTED"]) expect(SENT_OR_LATER).not.toContain(s);
  });
});

describe("neither AR reminder job selects a DRAFT invoice", () => {
  const src = (p: string) => readFileSync(join(__dirname, "../../../src", p), "utf8");
  const statusSet = (body: string, fn: string) => {
    const at = body.indexOf(fn);
    expect(at, `${fn} not found`).toBeGreaterThan(-1);
    const m = body.slice(at, at + 1200).match(/unpaidStatuses[^=]*=\s*\[([^\]]+)\]/);
    expect(m, `${fn}: unpaidStatuses not found`).toBeTruthy();
    return m![1].match(/"([A-Z_]+)"/g)!.map((s) => s.replace(/"/g, ""));
  };

  it("the 11:00 job (accountingController.processARReminders) and the 14:00 job (arCollectionsService)", () => {
    const a = statusSet(src("controllers/accountingController.ts"), "export async function processARReminders");
    const b = statusSet(src("services/arCollectionsService.ts"), "export async function processArReminders");
    for (const set of [a, b]) {
      expect(set.length).toBeGreaterThan(3);
      expect(set).not.toContain("DRAFT");
    }
  });
});
