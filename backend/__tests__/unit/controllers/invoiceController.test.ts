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
    // B4b — the handler now refuses a cancelled load, so it reads the load first.
    mockPrisma.load.findUnique.mockResolvedValue({ status: "DELIVERED", tonuFaultSide: null, deletedAt: null } as any);
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

    // This fixture's load has NO stem, so it exercises the load-less branch:
    // the retired INV- sequence is still correct here and srlDocNumber stays
    // null. Asserting the CREATE PAYLOAD rather than the mocked return value,
    // because the old assertion read back its own mock and was therefore blind
    // to what the handler actually wrote.
    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ srlDocNumber: null }) }),
    );
  });

  // §21.2 ruling 3 — the hand-raised invoice takes the load's number.
  // Both cases assert the CREATE PAYLOAD: the number the handler writes is the
  // thing under test, and a mocked return value cannot show it.
  it("createInvoice — a load-backed invoice mirrors a BARE load number", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "DELIVERED", tonuFaultSide: null, deletedAt: null, loadNumber: "5001", referenceNumber: "5001" } as any);
    mockPrisma.invoice.findMany.mockResolvedValue([] as any); // no prior document on this load
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-9" } as any);
    mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-9", invoiceNumber: "5001" } as any);

    const { req, res } = mockReqRes({ loadId: "load-1", amount: 2500 }, { id: "user-1", role: "BROKER" });
    await createInvoice(req, res);

    const data = (mockPrisma.invoice.create as any).mock.calls[0][0].data;
    expect(data.invoiceNumber).toBe("5001");
    expect(data.srlDocNumber).toBe("5001");
    // The mirror itself: one string, not two columns that happen to agree.
    expect(data.invoiceNumber).toBe(data.srlDocNumber);
    expect(data.invoiceNumber).not.toMatch(/^INV-/);
  });

  it("createInvoice — a LEGACY load keeps its suffixed scheme", async () => {
    // An old load is not renumbered. SRL-5001 takes the I suffix it always did.
    mockPrisma.load.findUnique.mockResolvedValue({ status: "DELIVERED", tonuFaultSide: null, deletedAt: null, loadNumber: null, referenceNumber: "SRL-5001" } as any);
    mockPrisma.invoice.findMany.mockResolvedValue([] as any);
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-10" } as any);
    mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-10", invoiceNumber: "SRL-5001I" } as any);

    const { req, res } = mockReqRes({ loadId: "load-1", amount: 2500 }, { id: "user-1", role: "BROKER" });
    await createInvoice(req, res);

    const data = (mockPrisma.invoice.create as any).mock.calls[0][0].data;
    expect(data.invoiceNumber).toBe("SRL-5001I");
    expect(data.srlDocNumber).toBe("SRL-5001I");
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
