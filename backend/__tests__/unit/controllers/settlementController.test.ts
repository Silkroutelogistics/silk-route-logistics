import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Validators passthrough (the controller calls schema.parse on body/query).
vi.mock("../../../src/validators/settlement", () => ({
  createSettlementSchema: { parse: (v: any) => v },
  settlementQuerySchema: { parse: (v: any) => v },
}));

import {
  createSettlement,
  finalizeSettlement,
  markSettlementPaid,
  getSettlementById,
} from "../../../src/controllers/settlementController";

const mockPrisma = vi.mocked(prisma, true);

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction invokes its callback with the same mock client as tx.
  (mockPrisma.$transaction as any).mockImplementation(async (cb: any) => cb(mockPrisma));
});

describe("settlementController.createSettlement", () => {
  const body = {
    carrierId: "carrier-1",
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-06-30"),
    period: "JUNE_2026",
    notes: null,
  };

  it("increments the settlement number from the last one", async () => {
    (mockPrisma.settlement.findFirst as any).mockResolvedValue({ settlementNumber: "STL-1042" });
    (mockPrisma.carrierPay.findMany as any).mockResolvedValue([]);
    (mockPrisma.invoice.aggregate as any).mockResolvedValue({ _sum: { factoringFee: null } });
    (mockPrisma.settlement.create as any).mockResolvedValue({ id: "stl-1" });
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "stl-1", settlementNumber: "STL-1043" });

    const res = mockRes();
    await createSettlement({ body } as any, res);

    expect(mockPrisma.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ settlementNumber: "STL-1043" }) }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("defaults to STL-1001 when there is no prior settlement", async () => {
    (mockPrisma.settlement.findFirst as any).mockResolvedValue(null);
    (mockPrisma.carrierPay.findMany as any).mockResolvedValue([]);
    (mockPrisma.invoice.aggregate as any).mockResolvedValue({ _sum: { factoringFee: null } });
    (mockPrisma.settlement.create as any).mockResolvedValue({ id: "stl-1" });
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "stl-1" });

    const res = mockRes();
    await createSettlement({ body } as any, res);

    expect(mockPrisma.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ settlementNumber: "STL-1001" }) }),
    );
  });

  it("aggregates gross pay, quick-pay + factoring deductions, and net correctly", async () => {
    (mockPrisma.settlement.findFirst as any).mockResolvedValue({ settlementNumber: "STL-2000" });
    (mockPrisma.carrierPay.findMany as any).mockResolvedValue([
      { id: "cp1", amount: 1000, quickPayDiscount: 30 },
      { id: "cp2", amount: 500, quickPayDiscount: 0 },
      { id: "cp3", amount: 250, quickPayDiscount: null }, // null discount must not NaN the sum
    ]);
    (mockPrisma.invoice.aggregate as any).mockResolvedValue({ _sum: { factoringFee: 20 } });
    (mockPrisma.settlement.create as any).mockResolvedValue({ id: "stl-9" });
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "stl-9" });

    const res = mockRes();
    await createSettlement({ body } as any, res);

    // grossPay = 1750, deductions = 30 (QP) + 20 (factoring) = 50, net = 1700
    expect(mockPrisma.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ grossPay: 1750, deductions: 50, netSettlement: 1700 }),
      }),
    );
    // carrier pays linked to the new settlement
    expect(mockPrisma.carrierPay.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["cp1", "cp2", "cp3"] } },
      data: { settlementId: "stl-9" },
    });
  });

  it("does not link carrier pays when none are found (no updateMany)", async () => {
    (mockPrisma.settlement.findFirst as any).mockResolvedValue(null);
    (mockPrisma.carrierPay.findMany as any).mockResolvedValue([]);
    (mockPrisma.invoice.aggregate as any).mockResolvedValue({ _sum: { factoringFee: null } });
    (mockPrisma.settlement.create as any).mockResolvedValue({ id: "stl-1" });
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "stl-1" });

    const res = mockRes();
    await createSettlement({ body } as any, res);

    expect(mockPrisma.carrierPay.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ grossPay: 0, deductions: 0, netSettlement: 0 }) }),
    );
  });
});

describe("settlementController.finalizeSettlement", () => {
  it("404s when the settlement does not exist", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue(null);
    const res = mockRes();
    await finalizeSettlement({ params: { id: "x" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.settlement.update).not.toHaveBeenCalled();
  });

  it("rejects finalizing a non-DRAFT settlement (state guard)", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "s1", status: "FINALIZED" });
    const res = mockRes();
    await finalizeSettlement({ params: { id: "s1" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.settlement.update).not.toHaveBeenCalled();
  });

  it("finalizes a DRAFT settlement", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "s1", status: "DRAFT" });
    (mockPrisma.settlement.update as any).mockResolvedValue({ id: "s1", status: "FINALIZED" });
    const res = mockRes();
    await finalizeSettlement({ params: { id: "s1" } } as any, res);
    expect(mockPrisma.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: { status: "FINALIZED" } }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "FINALIZED" }));
  });
});

describe("settlementController.markSettlementPaid", () => {
  it("404s when missing", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue(null);
    const res = mockRes();
    await markSettlementPaid({ params: { id: "x" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("rejects marking paid unless FINALIZED (state guard)", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "s1", status: "DRAFT" });
    const res = mockRes();
    await markSettlementPaid({ params: { id: "s1" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.settlement.update).not.toHaveBeenCalled();
  });

  it("marks a FINALIZED settlement PAID and cascades carrier pays to PAID", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "s1", status: "FINALIZED" });
    (mockPrisma.settlement.update as any).mockResolvedValue({ id: "s1", status: "PAID" });
    const res = mockRes();
    await markSettlementPaid({ params: { id: "s1" } } as any, res);

    expect(mockPrisma.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "PAID" }) }),
    );
    expect(mockPrisma.carrierPay.updateMany).toHaveBeenCalledWith({
      where: { settlementId: "s1", status: { not: "PAID" } },
      data: expect.objectContaining({ status: "PAID" }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "PAID" }));
  });
});

describe("settlementController.getSettlementById", () => {
  it("404s when missing", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue(null);
    const res = mockRes();
    await getSettlementById({ params: { id: "x" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns the settlement when found", async () => {
    (mockPrisma.settlement.findUnique as any).mockResolvedValue({ id: "s1", settlementNumber: "STL-1001" });
    const res = mockRes();
    await getSettlementById({ params: { id: "s1" } } as any, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ settlementNumber: "STL-1001" }));
  });
});
