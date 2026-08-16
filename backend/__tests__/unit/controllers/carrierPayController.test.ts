// Money-path coverage for carrierPayController.createCarrierPay — the Quick Pay
// fee math a carrier's payout depends on.
//
// REWRITTEN. The previous version of this file pinned the opposite contract:
// "whatever pct the caller passes is applied exactly". That was true, and it
// was the bug — POST /carrier-pay took a percentage off the request body and
// applied it with no pilot check, no signed-agreement check, no quickPayEnabled
// read and no per-load election read, and the AE modal defaulted that box to 2
// (the GOLD rate) for every carrier including Silver. The principal removed the
// free-text toggle and ruled that the fee comes from the §8 ladder behind the
// pilot gate, so the caller's number is now ignored on purpose and these tests
// pin THAT.
//
// What is locked here:
//   • non-Quick-Pay pays face value
//   • a Quick Pay fee is the one frozen on the load's rate confirmation
//   • a percentage in the request body changes nothing
//   • with no frozen fee, the fee is derived from tier + elected speed (§8)
//   • all four gates refuse rather than charge: pilot, agreement, account
//     switch, and a per-load election
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/validators/carrierPay", () => ({
  createCarrierPaySchema: { parse: (v: any) => v },
  updateCarrierPaySchema: { parse: (v: any) => v },
  batchCarrierPaySchema: { parse: (v: any) => v },
  carrierPayQuerySchema: { parse: (v: any) => v },
}));

// The pilot resolver lives in carrierController and is shared with the carrier
// gate and the delivery pricing path. Mocked so each case can state plainly
// whether this carrier is in the pilot.
vi.mock("../../../src/controllers/carrierController", () => ({
  isQuickPayPilotApproved: vi.fn(),
}));

import { createCarrierPay } from "../../../src/controllers/carrierPayController";
import { isQuickPayPilotApproved } from "../../../src/controllers/carrierController";

const mockPrisma = vi.mocked(prisma, true);
const mockPilotApproved = vi.mocked(isQuickPayPilotApproved);

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function lastCreateData() {
  return (mockPrisma.carrierPay.create as any).mock.calls[0][0].data;
}

/**
 * Put the carrier and the load in a state where a Quick Pay fee is allowed.
 * Each test then breaks exactly one thing, so a failure names its own cause.
 */
function allowQuickPay(opts: { tier?: string; enabled?: boolean; signed?: boolean; load?: Record<string, unknown> } = {}) {
  mockPilotApproved.mockResolvedValue(true);
  (mockPrisma.carrierProfile.findUnique as any).mockResolvedValue({
    id: "profile-1",
    tier: opts.tier ?? "SILVER",
    quickPayEnabled: opts.enabled ?? true,
  });
  (mockPrisma.carrierAgreement.findFirst as any).mockResolvedValue(opts.signed === false ? null : { id: "qp-agreement-1" });
  (mockPrisma.load.findUnique as any).mockResolvedValue({
    id: "l1",
    carrierId: "c1",
    referenceNumber: "L1001",
    quickPayFeePercent: 3,
    quickPaySpeed: "SEVEN_DAY",
    ...(opts.load ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.carrierPay.create as any).mockImplementation(async (args: any) => ({ id: "cp-1", ...args.data }));
});

describe("createCarrierPay — Quick Pay fee comes from the ladder, never the caller (CLAUDE.md §8)", () => {
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

  it("charges the fee frozen on the load: 3% of $1000 -> $30 fee, $970 net, method QUICKPAY", async () => {
    allowQuickPay();
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true, scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.quickPayDiscount).toBe(30);
    expect(data.netAmount).toBe(970);
    expect(data.paymentMethod).toBe("QUICKPAY");
    // Written alongside the deduction so the row shows the rate that produced it.
    expect(data.quickPayFeePercent).toBe(3);
  });

  it("IGNORES a percentage supplied in the request body", async () => {
    // The load says 1%. The caller says 9%. The load wins — this is the whole
    // point of the change, and the assertion that would have caught the bug.
    allowQuickPay({ tier: "PLATINUM", load: { quickPayFeePercent: 1 } });
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 2000, isQuickPay: true, quickPayDiscountPct: 9, scheduledDate: null, notes: null } } as any,
      res,
    );
    const data = lastCreateData();
    expect(data.quickPayDiscount).toBe(20);
    expect(data.netAmount).toBe(1980);
    expect(data.quickPayFeePercent).toBe(1);
  });

  it("charges nothing when the load has no frozen fee, even with a speed elected", async () => {
    // v3.8.asb — this used to derive the fee from the §8 ladder (Silver same-day
    // 5%) whenever a speed was elected but no fee was frozen. That state is
    // exactly the window between a carrier electing Quick Pay and an AE sending
    // the rate confirmation, so the fallback charged a percentage that had been
    // issued on no document, to a carrier holding no paper saying it.
    //
    // Quick Pay Agreement §3: a load is priced by the fee "recorded on that load
    // when Broker issues the rate confirmation for it, and by nothing else". No
    // frozen fee, no fee — which is what the delivery path, the carrier portal
    // and accounting all already did. This was the last path that disagreed.
    allowQuickPay({ tier: "SILVER", load: { quickPayFeePercent: null, quickPaySpeed: "SAME_DAY" } });
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1500, isQuickPay: true, scheduledDate: null, notes: null } } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].code).toBe("QP_NOT_ELECTED_ON_LOAD");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("forces paymentMethod QUICKPAY even if another method is passed on a QP pay", async () => {
    allowQuickPay();
    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true, paymentMethod: "ACH", scheduledDate: null, notes: null } } as any,
      res,
    );
    expect(lastCreateData().paymentMethod).toBe("QUICKPAY");
  });
});

describe("createCarrierPay — the four gates refuse instead of charging", () => {
  it("refuses when the carrier is not approved into the pilot", async () => {
    allowQuickPay();
    mockPilotApproved.mockResolvedValue(false);
    const res = mockRes();
    await createCarrierPay({ body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe("QP_PILOT_NOT_APPROVED");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("refuses when the Caravan Quick Pay Agreement is not signed", async () => {
    allowQuickPay({ signed: false });
    const res = mockRes();
    await createCarrierPay({ body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe("QP_AGREEMENT_NOT_SIGNED");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("refuses when Quick Pay is switched off on the account", async () => {
    allowQuickPay({ enabled: false });
    const res = mockRes();
    await createCarrierPay({ body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe("QP_NOT_ENABLED");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("refuses when the load carries no Quick Pay election — Quick Pay is per load, not per account", async () => {
    allowQuickPay({ load: { quickPayFeePercent: null, quickPaySpeed: null } });
    const res = mockRes();
    await createCarrierPay({ body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].code).toBe("QP_NOT_ELECTED_ON_LOAD");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("refuses when the load belongs to a different carrier", async () => {
    allowQuickPay({ load: { carrierId: "someone-else" } });
    const res = mockRes();
    await createCarrierPay({ body: { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe("LOAD_CARRIER_MISMATCH");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });
});
