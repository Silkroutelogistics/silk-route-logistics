import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { generate204, parse990, generate214, generate210 } from "../../../src/services/ediService";

const mockPrisma = vi.mocked(prisma);

const sampleLoad = {
  id: "load-1",
  referenceNumber: "SRL-100",
  originCity: "Chicago",
  originState: "IL",
  originZip: "60601",
  destCity: "Dallas",
  destState: "TX",
  destZip: "75201",
  weight: 40000,
  pieces: 24,
  equipmentType: "Dry Van",
  commodity: "Electronics",
  rate: 2500,
  distance: 920,
  pickupDate: new Date("2026-03-01"),
  deliveryDate: new Date("2026-03-03"),
  hazmat: false,
  tempMin: null,
  tempMax: null,
  specialInstructions: "Handle with care",
  contactName: "John Doe",
  contactPhone: "555-1234",
};

describe("ediService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── generate204 ─────────────────────────────────────────
  it("generate204 — creates 204 Motor Carrier Load Tender transaction", async () => {
    mockPrisma.eDITransaction.create.mockResolvedValue({
      id: "edi-1",
      transactionSet: "204",
      direction: "OUTBOUND",
      status: "SENT",
    } as any);

    const result = await generate204(sampleLoad, "carrier-1");

    expect(result.transaction.transactionSet).toBe("204");
    expect(result.payload.transactionSet).toBe("204");
    expect(result.payload.referenceNumber).toBe("SRL-100");
    expect(result.payload.stops).toHaveLength(2);
    expect(result.payload.stops[0].type).toBe("PU");
    expect(result.payload.stops[1].type).toBe("DL");
    expect(result.payload.equipmentType).toBe("TL"); // Dry Van maps to TL
    expect(mockPrisma.eDITransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ transactionSet: "204", direction: "OUTBOUND" }),
      })
    );
  });

  // ── parse990 ────────────────────────────────────────────
  it("parse990 — parses acceptance response and books load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-100" } as any);
    mockPrisma.eDITransaction.create.mockResolvedValue({
      id: "edi-2",
      transactionSet: "990",
      direction: "INBOUND",
      status: "RECEIVED",
    } as any);
    mockPrisma.load.update.mockResolvedValue({ id: "load-1", status: "BOOKED" } as any);

    const payload = JSON.stringify({
      referenceNumber: "SRL-100",
      response: "A",
      carrierId: "carrier-1",
    });

    const result = await parse990(payload);

    expect(result.accepted).toBe(true);
    expect(mockPrisma.load.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "BOOKED" } })
    );
  });

  it("parse990 — handles decline without updating load status", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-100" } as any);
    mockPrisma.eDITransaction.create.mockResolvedValue({
      id: "edi-3",
      transactionSet: "990",
    } as any);

    const payload = JSON.stringify({
      referenceNumber: "SRL-100",
      response: "D",
      reason: "No capacity",
    });

    const result = await parse990(payload);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("No capacity");
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
  });

  // ── generate214 ─────────────────────────────────────────
  it("generate214 — creates status update transaction", async () => {
    mockPrisma.eDITransaction.create.mockResolvedValue({
      id: "edi-4",
      transactionSet: "214",
      direction: "OUTBOUND",
    } as any);

    const result = await generate214(sampleLoad, "PICKED_UP", "Chicago, IL");

    expect(result.payload.transactionSet).toBe("214");
    expect(result.payload.statusCode).toBe("X3"); // PICKED_UP maps to X3
    expect(result.payload.location).toBe("Chicago, IL");
  });

  // ── generate210 ─────────────────────────────────────────
  it("generate210 — creates freight invoice transaction", async () => {
    mockPrisma.eDITransaction.create.mockResolvedValue({
      id: "edi-5",
      transactionSet: "210",
      direction: "OUTBOUND",
    } as any);

    const invoice = {
      id: "inv-1",
      invoiceNumber: "INV-1001",
      amount: 2500,
      loadId: "load-1",
      load: {
        referenceNumber: "SRL-100",
        originCity: "Chicago",
        originState: "IL",
        destCity: "Dallas",
        destState: "TX",
        weight: 40000,
        distance: 920,
      },
    };

    const result = await generate210(invoice);

    expect(result.payload.transactionSet).toBe("210");
    expect(result.payload.invoiceNumber).toBe("INV-1001");
    expect(result.payload.totalCharge).toBe(2500);
    expect(result.payload.origin).toBe("Chicago, IL");
    expect(result.payload.destination).toBe("Dallas, TX");
  });
});
