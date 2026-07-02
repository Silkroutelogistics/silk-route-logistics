// Money-path coverage for carrierPayController.createCarrierPay — the Quick Pay
// fee math a carrier's payout depends on. Untested before this file (audit
// §13.3 Item 194 money-path). Locks the discount arithmetic per CLAUDE.md §8:
//   quickPayDiscount = amount * (pct / 100);  netAmount = amount - discount.
// The pct itself is chosen upstream by tier + speed (Silver 3% / Gold 2% /
// Platinum 1% at 7 days; +2% same-day) — this test pins that whatever pct the
// caller passes is applied exactly, and that non-QP pays face value.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/validators/carrierPay", () => ({
  createCarrierPaySchema: { parse: (v: any) => v },
  updateCarrierPaySchema: { parse: (v: any) => v },
  batchCarrierPaySchema: { parse: (v: any) => v },
  carrierPayQuerySchema: { parse: (v: any) => v },
}));

import { createCarrierPay } from "../../../src/controllers/carrierPayController";

const mockPrisma = vi.mocked(prisma, true);

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// Capture what the controller tried to persist.
function lastCreateData() {
  return (mockPrisma.carrierPay.create as any).mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.carrierPay.create as any).mockImplementation(async (args: any) => ({ id: "cp-1", ...args.data }));
});

describe("createCarrierPay — Quick Pay fee math (CLAUDE.md §8)", () => {
  it("pays face value with no discount when Quick Pay is off", async () => {
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: false, paymentMethod: "ACH", scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.quickPayDiscount).toBeNull();
    expect(data.netAmount).toBe(1000);
    expect(data.paymentMethod).toBe("ACH");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("applies Silver 7-day 3%: $1000 -> $30 fee, $970 net, method QUICKPAY", async () => {
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true, quickPayDiscountPct: 3, scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.quickPayDiscount).toBe(30);
    expect(data.netAmount).toBe(970);
    expect(data.paymentMethod).toBe("QUICKPAY");
  });

  it("applies Platinum 7-day 1%: $2000 -> $20 fee, $1980 net", async () => {
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 2000, isQuickPay: true, quickPayDiscountPct: 1, scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.quickPayDiscount).toBe(20);
    expect(data.netAmount).toBe(1980);
  });

  it("applies Silver same-day 5% (3% + 2% universal premium): $1500 -> $75 fee, $1425 net", async () => {
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1500, isQuickPay: true, quickPayDiscountPct: 5, scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.quickPayDiscount).toBe(75);
    expect(data.netAmount).toBe(1425);
  });

  it("forces paymentMethod QUICKPAY even if a different method is passed on a QP pay", async () => {
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true, quickPayDiscountPct: 2, paymentMethod: "ACH", scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.paymentMethod).toBe("QUICKPAY");
    expect(data.netAmount).toBe(980);
  });
});
