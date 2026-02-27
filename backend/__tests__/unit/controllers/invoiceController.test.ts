import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Mock dependent services
vi.mock("../../../src/services/pdfService", () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}));
vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  wrap: vi.fn((html: string) => html),
}));

// Mock validators to passthrough
vi.mock("../../../src/validators/invoice", () => ({
  createInvoiceSchema: { parse: (v: any) => v },
  submitForFactoringSchema: { parse: (v: any) => v },
  updateLineItemsSchema: { parse: (v: any) => v },
  batchInvoiceStatusSchema: { parse: (v: any) => v },
}));

import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  getAllInvoices,
  updateInvoiceStatus,
} from "../../../src/controllers/invoiceController";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(body: Record<string, any> = {}, user?: any, params?: any, query?: any) {
  return {
    req: { body, user, params: params || {}, query: query || {}, headers: {} } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

describe("invoiceController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock $transaction to execute the callback with mockPrisma
    (mockPrisma as any).$transaction = vi.fn((fn: any) => {
      if (typeof fn === "function") return fn(mockPrisma);
      // Array form: resolve each promise
      return Promise.all(fn);
    });
  });

  // ── createInvoice ───────────────────────────────────────
  it("createInvoice — creates invoice with line items and returns 201", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ invoiceNumber: "INV-1005" } as any);
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-1006" } as any);
    mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 1 } as any);
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      invoiceNumber: "INV-1006",
      amount: 2500,
      lineItems: [{ description: "Linehaul", amount: 2500 }],
    } as any);

    const { req, res } = mockReqRes(
      {
        loadId: "load-1",
        amount: 2500,
        lineItems: [{ description: "Linehaul", quantity: 1, rate: 2500, amount: 2500, type: "LINEHAUL" }],
      },
      { id: "user-1", role: "BROKER" }
    );

    await createInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumber: "INV-1006" })
    );
  });

  // ── getInvoices ─────────────────────────────────────────
  it("getInvoices — returns invoices for current user", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", invoiceNumber: "INV-1001", amount: 3000 },
    ] as any);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "BROKER" });

    await getInvoices(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "inv-1" })])
    );
    expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  // ── getInvoiceById ──────────────────────────────────────
  it("getInvoiceById — returns invoice when found and authorized", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      invoiceNumber: "INV-1001",
      userId: "user-1",
      amount: 3000,
    } as any);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "BROKER" }, { id: "inv-1" });

    await getInvoiceById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "inv-1" }));
  });

  it("getInvoiceById — returns 404 when not found", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "BROKER" }, { id: "nonexistent" });

    await getInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Invoice not found" });
  });

  it("getInvoiceById — returns 403 when not authorized", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      invoiceNumber: "INV-1001",
      userId: "other-user",
      amount: 3000,
    } as any);

    const { req, res } = mockReqRes({}, { id: "shipper-1", role: "SHIPPER" }, { id: "inv-1" });

    await getInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized" });
  });

  // ── getAllInvoices ──────────────────────────────────────
  it("getAllInvoices — returns paginated invoices for admin", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", invoiceNumber: "INV-1001", amount: 3000 },
      { id: "inv-2", invoiceNumber: "INV-1002", amount: 4500 },
    ] as any);
    mockPrisma.invoice.count.mockResolvedValue(2);

    const { req, res } = mockReqRes(
      {},
      { id: "admin-1", role: "ADMIN" },
      {},
      { page: "1", limit: "50" }
    );

    await getAllInvoices(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ total: 2, page: 1 })
    );
  });
});
