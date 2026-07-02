// Money-path coverage for autoGenerateInvoice — the DELIVERED -> billing hinge.
// Fired from carrierLoads.ts when a carrier marks a load DELIVERED (and from
// the POD path). Untested before this file (audit §13.3 Item 194 B5). Locks:
//   - duplicate guard (never double-invoices a load)
//   - null-safety (no load / no carrier -> null, no invoice)
//   - zero-rate skip (RFQ/quote loads awaiting pricing)
//   - invoice total = linehaul + RC fuel surcharge + RC accessorials
//   - invoice-number sequencing (INV-1001 first, increment after)
//   - carrier notification fired
//
// Mock convention mirrors settlementController.test.ts: import the globally
// mocked prisma (setup.ts), drive $transaction to run its callback against the
// same mock client, cast mock fns `as any` for mockResolvedValue.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// invoiceService fires a carrier email (fire-and-forget). Stub it so the test
// asserts invoice math, not email delivery.
vi.mock("../../../src/services/emailService", () => ({
  sendAutoInvoiceEmail: vi.fn().mockResolvedValue(undefined),
}));

import { autoGenerateInvoice } from "../../../src/services/invoiceService";

const mockPrisma = vi.mocked(prisma, true);

function makeLoad(overrides: Record<string, any> = {}) {
  return {
    id: "load-1",
    carrierId: "carrier-1",
    referenceNumber: "SRL-5001",
    rate: 1000,
    originCity: "Detroit",
    originState: "MI",
    destCity: "Chicago",
    destState: "IL",
    carrier: { id: "carrier-1", email: "dispatch@ace.example", firstName: "Ace", lastName: "Trucking", company: "Ace Trucking" },
    rateConfirmations: [] as any[], // service filters status=SIGNED; provide the resolved array
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction runs its callback with the same mock client as `tx`.
  (mockPrisma.$transaction as any).mockImplementation(async (cb: any) => cb(mockPrisma));
  (mockPrisma.invoiceLineItem.createMany as any).mockResolvedValue({ count: 1 });
  (mockPrisma.notification.create as any).mockResolvedValue({});
});

describe("autoGenerateInvoice — DELIVERED -> billing hinge", () => {
  it("is idempotent: returns the existing invoice and creates nothing when one already exists", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue({ id: "inv-existing", invoiceNumber: "INV-1042" });

    const result = await autoGenerateInvoice("load-1");

    expect(result).toEqual({ id: "inv-existing", invoiceNumber: "INV-1042" });
    expect(mockPrisma.load.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("returns null when the load is not found", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(null);

    const result = await autoGenerateInvoice("load-x");

    expect(result).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("returns null when the load has no carrier assigned", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ carrierId: null }));

    const result = await autoGenerateInvoice("load-1");

    expect(result).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("skips zero-rate loads (RFQ/quote awaiting pricing) with no signed RC", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ rate: 0, rateConfirmations: [] }));

    const result = await autoGenerateInvoice("load-1");

    expect(result).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("creates a SUBMITTED linehaul-only invoice (INV-1043) for a priced load with no RC", async () => {
    // findFirst #1 = duplicate guard (null), #2 = numbering lookup (last INV-1042)
    (mockPrisma.invoice.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ invoiceNumber: "INV-1042" });
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ rate: 1000 }));
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-1043", amount: 1000 });

    const result = await autoGenerateInvoice("load-1");

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: "INV-1043",
          amount: 1000,
          status: "SUBMITTED",
          userId: "carrier-1",
          loadId: "load-1",
        }),
      }),
    );
    const createManyArg = (mockPrisma.invoiceLineItem.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({ type: "LINEHAUL", amount: 1000 });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "INVOICE", userId: "carrier-1" }) }),
    );
    expect(result).toEqual({ id: "inv-1", invoiceNumber: "INV-1043", amount: 1000 });
  });

  it("rolls RC fuel surcharge + accessorials into the invoice total", async () => {
    (mockPrisma.invoice.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ invoiceNumber: "INV-2000" });
    (mockPrisma.load.findUnique as any).mockResolvedValue(
      makeLoad({ rate: 1000, rateConfirmations: [{ fuelSurcharge: 150, accessorialTotal: 75, totalCharges: 1225 }] }),
    );
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-2", invoiceNumber: "INV-2001", amount: 1225 });

    await autoGenerateInvoice("load-1");

    // total = 1000 linehaul + 150 fuel + 75 accessorial
    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 1225, status: "SUBMITTED" }) }),
    );
    const createManyArg = (mockPrisma.invoiceLineItem.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(3);
    const byType = Object.fromEntries(createManyArg.data.map((li: any) => [li.type, li.amount]));
    expect(byType).toEqual({ LINEHAUL: 1000, FUEL_SURCHARGE: 150, ACCESSORIAL: 75 });
  });

  it("omits RC line items that are zero (no phantom $0 fuel/accessorial rows)", async () => {
    (mockPrisma.invoice.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ invoiceNumber: "INV-3000" });
    (mockPrisma.load.findUnique as any).mockResolvedValue(
      makeLoad({ rate: 800, rateConfirmations: [{ fuelSurcharge: 0, accessorialTotal: 0, totalCharges: 800 }] }),
    );
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-3", invoiceNumber: "INV-3001", amount: 800 });

    await autoGenerateInvoice("load-1");

    const createManyArg = (mockPrisma.invoiceLineItem.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0].type).toBe("LINEHAUL");
    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 800 }) }),
    );
  });

  it("numbers the first-ever invoice INV-1001 when no prior invoice exists", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ rate: 500 }));
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-4", invoiceNumber: "INV-1001" });

    await autoGenerateInvoice("load-1");

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: "INV-1001", amount: 500 }) }),
    );
  });
});
