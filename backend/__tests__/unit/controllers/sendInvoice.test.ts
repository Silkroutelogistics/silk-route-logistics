// v3.8.aqp regression suite for accountingController.sendInvoice.
//
// The accounting console "Send invoice" button used to ONLY flip status to SENT
// and deliver nothing — no email, no PDF — so the customer was never billed
// while the system reported SENT. The load-bearing assertions here are:
//   (1) a valid invoice generates a PDF, emails the customer with it attached,
//       and flips to SENT;
//   (2) if the customer has no email, it 400s and does NOT flip to SENT;
//   (3) if the email send THROWS, it 500s and does NOT flip to SENT (no false SENT).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// vi.hoisted so these exist when the hoisted vi.mock factories run.
const { generateInvoicePdf, sendCustomerInvoiceEmail } = vi.hoisted(() => ({
  generateInvoicePdf: vi.fn(),
  sendCustomerInvoiceEmail: vi.fn(),
}));
vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf }));
vi.mock("../../../src/services/emailService", () => ({ sendCustomerInvoiceEmail }));

import { sendInvoice } from "../../../src/controllers/accountingController";

const mockPrisma = vi.mocked(prisma, true) as any;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: "inv-1",
    invoiceNumber: "INV-1001",
    status: "DRAFT",
    amount: 2500,
    totalAmount: 2500,
    dueDate: new Date("2026-08-20"),
    load: {
      referenceNumber: "SRL-9001",
      originCity: "Galesburg", originState: "MI",
      destCity: "Chicago", destState: "IL",
      posterId: "ae-1",
      customer: { email: "ap@beekeepers.example", name: "Beekeepers", contactName: "Jane", paymentTerms: "Net 30" },
    },
    ...overrides,
  };
}

describe("accountingController.sendInvoice — v3.8.aqp delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateInvoicePdf.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
    sendCustomerInvoiceEmail.mockResolvedValue("resend-id-123");
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv-1", status: "SENT" });
  });

  it("generates the PDF, emails the customer with it attached, and flips to SENT", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice());
    const req: any = { params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } };
    const res = mockRes();

    await sendInvoice(req, res);

    expect(generateInvoicePdf).toHaveBeenCalledOnce();
    expect(sendCustomerInvoiceEmail).toHaveBeenCalledOnce();
    const emailArgs = sendCustomerInvoiceEmail.mock.calls[0][0];
    expect(emailArgs.email).toBe("ap@beekeepers.example");
    expect(emailArgs.pdf).toBeInstanceOf(Buffer);
    expect(emailArgs.amount).toBe(2500);
    // SENT is flipped only after a successful send.
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1" }, data: expect.objectContaining({ status: "SENT" }) })
    );
    expect(res.json).toHaveBeenCalled();
  });

  it("400s and does NOT flip SENT when the customer has no email (the old silent-SENT defect)", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(
      makeInvoice({ load: { referenceNumber: "SRL-9001", customer: { name: "Beekeepers", email: null } } })
    );
    const req: any = { params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } };
    const res = mockRes();

    await sendInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendCustomerInvoiceEmail).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled(); // never marked SENT
  });

  it("500s and does NOT flip SENT when the email send throws (no false SENT)", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice());
    sendCustomerInvoiceEmail.mockRejectedValue(new Error("Resend: domain suppressed"));
    const req: any = { params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } };
    const res = mockRes();

    await sendInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled(); // NOT marked SENT on a failed send
  });

  it("400s on an invoice not in DRAFT/SUBMITTED", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: "PAID" }));
    const req: any = { params: { id: "inv-1" }, user: { id: "ae-1", role: "ADMIN" } };
    const res = mockRes();

    await sendInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(generateInvoicePdf).not.toHaveBeenCalled();
  });
});
