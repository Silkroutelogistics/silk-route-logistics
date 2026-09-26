/**
 * PO integrity, the plumbing half (ruled 2026-09-26). An invoice prints its PO
 * from the load record only, so every path that loads an invoice's load with a
 * `select` must fetch Load.poNumbers. A field the select leaves out is simply
 * absent, and the page would say "none on file" for a load that has a PO.
 * generateInvoiceFromLoad includes the whole load, so it carries poNumbers by
 * construction and is not listed here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { downloadInvoicePDF } from "../../../src/controllers/pdfController";
import { sendInvoice } from "../../../src/controllers/accountingController";

const mockPrisma = vi.mocked(prisma, true) as any;
const res = () => {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  r.setHeader = vi.fn();
  return r;
};

describe("every invoice path that selects the load fetches poNumbers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("the invoice PDF download", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    await downloadInvoicePDF({ params: { invoiceId: "inv-1" }, user: { id: "u-1", role: "ADMIN" } } as any, res());
    expect(mockPrisma.invoice.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.findFirst.mock.calls[0][0].include.load.select.poNumbers).toBe(true);
  });

  it("sending an invoice by email, whose attachment is the same PDF", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);
    await sendInvoice({ params: { id: "inv-1" }, user: { id: "u-1", role: "ADMIN" }, body: {} } as any, res());
    expect(mockPrisma.invoice.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.findUnique.mock.calls[0][0].include.load.select.poNumbers).toBe(true);
  });
});
