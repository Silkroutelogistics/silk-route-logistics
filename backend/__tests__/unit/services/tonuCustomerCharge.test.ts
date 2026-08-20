// The customer's TONU charge (Arc 7 Phase 2) — the second leg of F-7.
//
// recordTonuObligation writes the TONU to the accessorial ledger and stamps
// billedTo: "SHIPPER" when the customer is at fault. The customer-side reader of
// that ledger, syncInvoiceAccessorials, gives up at `if (!base) return null` —
// and autoGenerateInvoice, which would create that base, prices a DELIVERED
// load. A TONU load never delivers. So the charge was recorded correctly and had
// no document to land on, exactly as the carrier payable had no settlement.
//
// The two legs are asserted together at the bottom, because the ratified rule is
// a matrix over fault side and "bills the customer" is only half of any row.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    load: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn(), create: vi.fn() },
    loadAccessorial: { findMany: vi.fn(), updateMany: vi.fn() },
    invoiceLineItem: { count: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../src/lib/invoiceNumber", () => ({
  createInvoiceWithRetry: (fn: any) => fn("INV-TEST-0001"),
}));
// withDocumentNumber lives in documentNumber, not invoiceNumber. Mocking the
// wrong module let the real allocator run and fail on client[model].findMany —
// worth the note, because the two helpers are used side by side on one line.
vi.mock("../../../src/lib/documentNumber", () => ({
  resolveLoadStem: () => "SRL-121485",
  withDocumentNumber: (_k: string, _stem: string, fn: any) => fn("SRL-121485I"),
}));

import { raiseTonuCustomerCharge } from "../../../src/services/invoiceService";
import { resolveTonuBilling } from "../../../src/lib/tonuPolicy";
import { TONU_AMOUNT } from "../../../src/lib/accessorialPolicy";

const TONU_LOAD = {
  id: "load-1",
  status: "TONU",
  referenceNumber: "SRL-121485",
  loadNumber: "SRL-121485",
  posterId: "ae-1",
  customerId: "cust-1",
  tonuFaultSide: "CUSTOMER",
};

function armHappyPath() {
  mockPrisma.load.findUnique.mockResolvedValue(TONU_LOAD);
  mockPrisma.invoice.findFirst.mockResolvedValue(null); // no base yet
  mockPrisma.invoice.create.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-TEST-0001" });
  // unbilledCustomerAccessorials reads these two.
  mockPrisma.loadAccessorial.findMany.mockResolvedValue([
    { id: "acc-1", type: "TONU", amount: TONU_AMOUNT, customerAmount: null, quantity: null, billedTo: "SHIPPER", notes: null },
  ]);
  // syncInvoiceAccessorials is called after creation; let its transaction no-op.
  mockPrisma.$transaction.mockResolvedValue(undefined);
  mockPrisma.invoiceLineItem.count.mockResolvedValue(0);
}

describe("raiseTonuCustomerCharge", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates the missing base invoice when the customer is at fault", async () => {
    armHappyPath();
    const result = await raiseTonuCustomerCharge("load-1");

    expect(result.created).toBe(true);
    expect(mockPrisma.invoice.create).toHaveBeenCalled();
  });

  it("bills no linehaul — the load never moved", async () => {
    // The whole reason a TONU cannot go through autoGenerateInvoice: that prices
    // a delivered load and would bill the freight for a truck that never left.
    armHappyPath();
    await raiseTonuCustomerCharge("load-1");

    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.lineHaulAmount).toBe(0);
    expect(data.fuelSurchargeAmount).toBe(0);
  });

  it("creates the invoice empty and lets the shared path fill it", async () => {
    // It must not itemise here. syncInvoiceAccessorials owns itemisation,
    // customerPriceFor pricing, and the shipperInvoiceId stamp — duplicating any
    // of that is the parallel plumbing this deliberately avoids.
    armHappyPath();
    await raiseTonuCustomerCharge("load-1");

    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.amount).toBe(0);
    expect(data.totalAmount).toBe(0);
    expect(data.accessorialsAmount).toBe(0);
  });

  it("drafts rather than sends — the AE reviews before the shipper sees it", async () => {
    armHappyPath();
    await raiseTonuCustomerCharge("load-1");

    expect(mockPrisma.invoice.create.mock.calls[0][0].data.status).toBe("DRAFT");
    expect(mockPrisma.invoice.create.mock.calls[0][0].data.invoiceKind).toBe("BASE");
  });

  it("bills nothing when the CARRIER was at fault", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...TONU_LOAD, tonuFaultSide: "CARRIER" });

    const result = await raiseTonuCustomerCharge("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("bills nothing when the BROKER was at fault — SRL pays out of margin", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...TONU_LOAD, tonuFaultSide: "BROKER" });

    const result = await raiseTonuCustomerCharge("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("bills once on a double flip", async () => {
    armHappyPath();
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-existing" });

    const result = await raiseTonuCustomerCharge("load-1");

    expect(result.created).toBe(false);
    expect(result.reason).toContain("already exists");
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("does not let a VOID invoice block a replacement", async () => {
    // Voiding says "that document was wrong", never "this load is never billed".
    armHappyPath();
    await raiseTonuCustomerCharge("load-1");

    const where = mockPrisma.invoice.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "VOID" });
    expect(where.invoiceKind).toBe("BASE");
  });

  it("creates nothing when the ledger row is missing", async () => {
    // Checked BEFORE creating, so a missing obligation cannot leave an empty
    // invoice stranded on the load.
    armHappyPath();
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([]);

    const result = await raiseTonuCustomerCharge("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("does nothing on a load that is not a TONU", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...TONU_LOAD, status: "CANCELLED" });

    const result = await raiseTonuCustomerCharge("load-1");
    expect(result.created).toBe(false);
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });
});

describe("the two-sided TONU rule, as a matrix", () => {
  // §5 ratified 2026-08-15: bill the customer on any cancellation; pay the
  // carrier when SRL or the shipper caused it. Asserting both legs of each row
  // together, because "bills the customer" is only half of any of them.
  it("CUSTOMER fault bills the customer and pays the carrier", () => {
    const r = resolveTonuBilling("CUSTOMER");
    expect(r.billCustomer).toBe(true);
    expect(r.payCarrier).toBe(true);
  });

  it("BROKER fault pays the carrier out of margin and bills nobody", () => {
    const r = resolveTonuBilling("BROKER");
    expect(r.billCustomer).toBe(false);
    expect(r.payCarrier).toBe(true);
  });

  it("CARRIER fault does neither", () => {
    const r = resolveTonuBilling("CARRIER");
    expect(r.billCustomer).toBe(false);
    expect(r.payCarrier).toBe(false);
  });
});

describe("ordering against the reversal", () => {
  it("is invoked after the invoice-void step, not before it", async () => {
    // Step 4 of onLoadCancelledOrTONU voids every invoice on the load. An
    // invoice raised before that runs is voided by the same event that created
    // it — the invoice-side twin of the payable race.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/services/integrationService.ts"),
      "utf8",
    );

    const voidInvoices = src.indexOf("// 4. Soft-delete invoices");
    const call = src.indexOf("await raiseTonuCustomerCharge(loadId)");
    expect(voidInvoices).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(voidInvoices);

    // And not called from the flip site, same as the payable.
    const controller = fs.readFileSync(
      path.join(__dirname, "../../../src/controllers/loadController.ts"),
      "utf8",
    );
    expect(controller).not.toContain("raiseTonuCustomerCharge");
  });
});
