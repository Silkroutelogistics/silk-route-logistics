// Money-path coverage for autoGenerateInvoice — the DELIVERED -> shipper-AR
// billing hinge. go-live audit: this now drafts a SHIPPER invoice at the
// CUSTOMER rate (never the carrier rate), owned to the load poster, in DRAFT
// (AE reviews + sends; DRAFT is hidden from the shipper portal). Carrier pay
// flows through CarrierPay, not Invoice. Locks:
//   - duplicate guard (never double-invoices a load)
//   - null-safety (no load / no posterId -> null, no invoice)
//   - NEVER bills the carrier rate: no customerRate -> skip + notify AE
//   - total = customerRate + load.fuelSurcharge; DRAFT; owned to posterId
//   - invoice-number sequencing
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

import { autoGenerateInvoice } from "../../../src/services/invoiceService";

const mockPrisma = vi.mocked(prisma, true);

function makeLoad(overrides: Record<string, any> = {}) {
  return {
    id: "load-1",
    referenceNumber: "SRL-5001",
    posterId: "ae-1",
    customerRate: 2400,
    fuelSurcharge: 0,
    originCity: "Detroit",
    originState: "MI",
    destCity: "Chicago",
    destState: "IL",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.$transaction as any).mockImplementation(async (cb: any) => cb(mockPrisma));
  (mockPrisma.invoiceLineItem.createMany as any).mockResolvedValue({ count: 1 });
  (mockPrisma.notification.create as any).mockResolvedValue({});
  // numbering now reads recent invoices via findMany (nextSequentialInvoiceNumber);
  // default to none -> INV-1001. Individual tests override for a specific max.
  (mockPrisma.invoice.findMany as any).mockResolvedValue([]);
});

describe("autoGenerateInvoice — DELIVERED -> shipper-AR draft", () => {
  it("is idempotent: returns the existing invoice and creates nothing when one exists", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue({ id: "inv-existing", invoiceNumber: "INV-1042" });

    const result = await autoGenerateInvoice("load-1");

    expect(result).toEqual({ id: "inv-existing", invoiceNumber: "INV-1042" });
    expect(mockPrisma.load.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("returns null when the load is not found", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(null);

    expect(await autoGenerateInvoice("load-x")).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("returns null when the load has no poster (can't own the AR invoice)", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ posterId: null }));

    expect(await autoGenerateInvoice("load-1")).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("NEVER bills the carrier rate: skips + notifies the AE when customerRate is not set", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ customerRate: null }));

    const result = await autoGenerateInvoice("load-1");

    expect(result).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    // AE gets a "set customer rate to invoice" nudge
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "ae-1", title: "Set customer rate to invoice" }) }),
    );
  });

  it("drafts a shipper invoice at the CUSTOMER rate, owned to the poster, in DRAFT", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null); // dup guard
    (mockPrisma.invoice.findMany as any).mockResolvedValue([{ invoiceNumber: "INV-1042" }]); // numbering -> INV-1043
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ customerRate: 2400 }));
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-1043", amount: 2400 });

    const result = await autoGenerateInvoice("load-1");

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: "INV-1043",
          amount: 2400, // customer rate, NOT a carrier rate
          lineHaulAmount: 2400,
          status: "DRAFT",
          userId: "ae-1", // owned to the load poster, NOT the carrier
          loadId: "load-1",
        }),
      }),
    );
    const createManyArg = (mockPrisma.invoiceLineItem.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({ type: "LINEHAUL", amount: 2400 });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "ae-1", title: "Shipper invoice drafted" }) }),
    );
    expect(result).toEqual({ id: "inv-1", invoiceNumber: "INV-1043", amount: 2400 });
  });

  it("adds the load fuel surcharge to the total", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.invoice.findMany as any).mockResolvedValue([{ invoiceNumber: "INV-2000" }]);
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ customerRate: 2400, fuelSurcharge: 180 }));
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-2", invoiceNumber: "INV-2001", amount: 2580 });

    await autoGenerateInvoice("load-1");

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2580, lineHaulAmount: 2400, fuelSurchargeAmount: 180 }) }),
    );
    const createManyArg = (mockPrisma.invoiceLineItem.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(2);
    const byType = Object.fromEntries(createManyArg.data.map((li: any) => [li.type, li.amount]));
    expect(byType).toEqual({ LINEHAUL: 2400, FUEL_SURCHARGE: 180 });
  });

  it("numbers the first-ever invoice INV-1001 when no prior invoice exists", async () => {
    (mockPrisma.invoice.findFirst as any).mockResolvedValue(null);
    (mockPrisma.invoice.findMany as any).mockResolvedValue([]); // no prior -> INV-1001
    (mockPrisma.load.findUnique as any).mockResolvedValue(makeLoad({ customerRate: 500 }));
    (mockPrisma.invoice.create as any).mockResolvedValue({ id: "inv-3", invoiceNumber: "INV-1001" });

    await autoGenerateInvoice("load-1");

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: "INV-1001", amount: 500 }) }),
    );
  });
});
