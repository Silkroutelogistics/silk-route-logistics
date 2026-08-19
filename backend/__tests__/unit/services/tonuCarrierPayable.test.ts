// The carrier's TONU payable (Arc 6 Phase 4).
//
// recordTonuObligation writes the TONU to the accessorial ledger, which is where
// both money readers already look. On the carrier side that reader is
// syncCarrierPayAccessorials, and its first line is `if (!pay) return`. A
// CarrierPay is created by createCarrierPayOnDelivery, which fires from
// onLoadDelivered — and a TONU load never delivers. The obligation was recorded
// correctly and had nothing to attach to, permanently.
//
// The property with teeth here is ORDERING. onLoadCancelledOrTONU voids every
// non-PAID CarrierPay on the load and is invoked fire-and-forget, so a payable
// raised at the flip site would race the void loop and lose some of the time.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    load: { findUnique: vi.fn() },
    loadAccessorial: { findFirst: vi.fn() },
    carrierPay: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { raiseTonuCarrierPayable } from "../../../src/services/integrationService";
import { TONU_AMOUNT } from "../../../src/lib/accessorialPolicy";

const CARRIER_LOAD = {
  id: "load-1",
  status: "TONU",
  referenceNumber: "SRL-121485",
  carrierId: "carrier-user-1",
  tonuFaultSide: "CUSTOMER",
  carrier: { carrierProfile: { id: "profile-1", cppTier: "SILVER", tier: "SILVER" } },
};

function armHappyPath() {
  mockPrisma.load.findUnique.mockResolvedValue(CARRIER_LOAD);
  mockPrisma.loadAccessorial.findFirst.mockResolvedValue({ id: "acc-1", amount: TONU_AMOUNT });
  mockPrisma.carrierPay.findFirst.mockResolvedValue(null);
  mockPrisma.carrierPay.count.mockResolvedValue(0);
  mockPrisma.carrierPay.create.mockResolvedValue({ id: "pay-1", paymentNumber: "CP-20260819-0001" });
}

describe("raiseTonuCarrierPayable", () => {
  beforeEach(() => vi.resetAllMocks());

  it("pays the carrier the ledger amount when the customer was at fault", async () => {
    armHappyPath();
    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(true);
    const data = mockPrisma.carrierPay.create.mock.calls[0][0].data;
    expect(data.amount).toBe(TONU_AMOUNT);
    expect(data.grossAmount).toBe(TONU_AMOUNT);
    expect(data.netAmount).toBe(TONU_AMOUNT);
  });

  it("takes the amount from the ledger row, never from a literal", async () => {
    // If the policy figure moves, the payable moves with it. A hardcoded 200
    // here would silently disagree with what the customer was billed.
    armHappyPath();
    mockPrisma.loadAccessorial.findFirst.mockResolvedValue({ id: "acc-1", amount: 275 });

    await raiseTonuCarrierPayable("load-1");

    expect(mockPrisma.carrierPay.create.mock.calls[0][0].data.amount).toBe(275);
  });

  it("charges no Quick Pay fee", async () => {
    // Quick Pay is elected per load on the rate confirmation. A load that never
    // ran has no election, and §8 makes standard tier pay free — so taking a fee
    // here would charge a carrier for a truck that never moved.
    armHappyPath();
    await raiseTonuCarrierPayable("load-1");

    const data = mockPrisma.carrierPay.create.mock.calls[0][0].data;
    expect(data.quickPayFeePercent).toBeNull();
    expect(data.quickPayFeeAmount).toBeNull();
    expect(data.quickPayDiscount).toBeNull();
    expect(data.netAmount).toBe(data.grossAmount);
  });

  it("starts the payment clock, rather than leaving it null forever", async () => {
    // createCarrierPayOnDelivery leaves dueDate null until a POD arrives. A
    // truck that never loaded will never produce one, so that rule inverted here
    // would mean money owed with a clock that never starts.
    armHappyPath();
    await raiseTonuCarrierPayable("load-1");

    expect(mockPrisma.carrierPay.create.mock.calls[0][0].data.dueDate).toBeInstanceOf(Date);
  });

  it("pays nothing when the CARRIER was at fault", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...CARRIER_LOAD, tonuFaultSide: "CARRIER" });

    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("pays the carrier when the BROKER was at fault — out of margin", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...CARRIER_LOAD, tonuFaultSide: "BROKER" });

    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(true);
  });

  it("is idempotent — a re-flip cannot raise a second payable", async () => {
    armHappyPath();
    mockPrisma.carrierPay.findFirst.mockResolvedValue({ id: "existing-pay" });

    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(false);
    expect(result.reason).toContain("already raised");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("ignores a VOID settlement when checking idempotency", async () => {
    // The reversal voids the old delivery settlement moments earlier. If that
    // counted as "already raised", the TONU payable would never be created on
    // exactly the loads that need it.
    armHappyPath();
    await raiseTonuCarrierPayable("load-1");

    const where = mockPrisma.carrierPay.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "VOID" });
  });

  it("does nothing when the ledger row is missing", async () => {
    // recordTonuObligation is the source of the figure. Without it there is no
    // amount to pay, and inventing one would put money on a load with no
    // corresponding obligation.
    armHappyPath();
    mockPrisma.loadAccessorial.findFirst.mockResolvedValue(null);

    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("does nothing on a load that is not a TONU", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...CARRIER_LOAD, status: "CANCELLED" });

    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("does nothing when no carrier was ever assigned", async () => {
    armHappyPath();
    mockPrisma.load.findUnique.mockResolvedValue({ ...CARRIER_LOAD, carrierId: null, carrier: null });

    const result = await raiseTonuCarrierPayable("load-1");

    expect(result.created).toBe(false);
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });
});

describe("ordering against the reversal", () => {
  it("is invoked after the void loop, not from the flip site", async () => {
    // Read as a statement of intent that a future edit has to break knowingly:
    // onLoadCancelledOrTONU voids every non-PAID CarrierPay, so a payable
    // created before that runs is voided by it. The call therefore lives at the
    // END of that function, and loadController does not call it directly.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/services/integrationService.ts"),
      "utf8",
    );

    const voidLoop = src.indexOf("// 3. Void any carrier pay records");
    const call = src.indexOf("await raiseTonuCarrierPayable(loadId)");
    expect(voidLoop).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(voidLoop);

    const controller = fs.readFileSync(
      path.join(__dirname, "../../../src/controllers/loadController.ts"),
      "utf8",
    );
    expect(controller).not.toContain("raiseTonuCarrierPayable");
  });
});
