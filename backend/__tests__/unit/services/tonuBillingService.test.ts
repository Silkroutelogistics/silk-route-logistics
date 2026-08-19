// Arc 3 Phase 2 — recording the TONU obligation on the accessorial ledger.
//
// Money path. Every mock is set explicitly per test, including the ones that
// should return null: vi.clearAllMocks() clears call history but NOT
// mockResolvedValue, so a truthy leftover from an earlier test silently changes
// a later branch (the exact leak that cost a cycle in v3.8.alh).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/invoiceService", () => ({
  syncInvoiceAccessorials: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../src/services/integrationService", () => ({
  syncCarrierPayAccessorials: vi.fn().mockResolvedValue(undefined),
}));

import { recordTonuObligation } from "../../../src/services/tonuBillingService";
import { prisma } from "../../../src/config/database";
import { TONU_AMOUNT } from "../../../src/lib/accessorialPolicy";
import { syncInvoiceAccessorials } from "../../../src/services/invoiceService";
import { syncCarrierPayAccessorials } from "../../../src/services/integrationService";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Explicit: no pre-existing TONU row unless a test says otherwise.
  mockPrisma.loadAccessorial.findFirst.mockResolvedValue(null);
  mockPrisma.loadAccessorial.create.mockResolvedValue({ id: "acc_new" });
});

describe("recordTonuObligation — customer fault", () => {
  it("writes one ledger row the customer reader will bill and the carrier reader will pay", async () => {
    const r = await recordTonuObligation("load_1", "CUSTOMER", "user_ae");

    expect(r.created).toBe(true);
    expect(r.amount).toBe(TONU_AMOUNT);

    const data = mockPrisma.loadAccessorial.create.mock.calls[0][0].data;
    expect(data.type).toBe("TONU");
    expect(data.amount).toBe(TONU_AMOUNT);
    expect(data.status).toBe("APPROVED");
    // NULL, not the amount: lets the customer's negotiated rate apply and fall
    // back to cost, the same resolution every other accessorial gets.
    expect(data.customerAmount).toBeNull();
    // SHIPPER is what keeps it on the customer's invoice — the customer reader
    // drops any row billed to somebody else.
    expect(data.billedTo).toBe("SHIPPER");
    expect(data.approvedBy).toBe("user_ae");
  });

  it("pushes both money paths after writing", async () => {
    await recordTonuObligation("load_1", "CUSTOMER", "user_ae");
    expect(syncInvoiceAccessorials).toHaveBeenCalledWith("load_1");
    expect(syncCarrierPayAccessorials).toHaveBeenCalledWith("load_1");
  });
});

describe("recordTonuObligation — broker fault", () => {
  it("pays the carrier but keeps the charge off the customer's invoice", async () => {
    const r = await recordTonuObligation("load_2", "BROKER", "user_ae");

    expect(r.created).toBe(true);
    const data = mockPrisma.loadAccessorial.create.mock.calls[0][0].data;
    // The carrier is still owed the full ratified amount — SRL eats it.
    expect(data.amount).toBe(TONU_AMOUNT);
    // Two independent guards, because billing a customer for SRL's own mistake
    // is the worst failure this function has: billedTo excludes it from the
    // customer reader, and a zero price would be dropped by its amount>0 filter
    // even if billedTo were ignored.
    expect(data.billedTo).toBe("BROKER");
    expect(data.customerAmount).toBe(0);
  });
});

describe("recordTonuObligation — carrier fault", () => {
  it("writes nothing at all", async () => {
    const r = await recordTonuObligation("load_3", "CARRIER", "user_ae");
    expect(r.created).toBe(false);
    expect(mockPrisma.loadAccessorial.create).not.toHaveBeenCalled();
  });

  it("does not disturb the money paths", async () => {
    await recordTonuObligation("load_3", "CARRIER", "user_ae");
    expect(syncInvoiceAccessorials).not.toHaveBeenCalled();
    expect(syncCarrierPayAccessorials).not.toHaveBeenCalled();
  });
});

describe("recordTonuObligation — idempotency", () => {
  it("does not create a second row when one already exists", async () => {
    // An AE re-flipping to correct a fault side, or a retry, must not bill the
    // customer twice for one wasted truck.
    mockPrisma.loadAccessorial.findFirst.mockResolvedValue({ id: "acc_existing" });

    const r = await recordTonuObligation("load_4", "CUSTOMER", "user_ae");

    expect(r.created).toBe(false);
    expect(r.accessorialId).toBe("acc_existing");
    expect(mockPrisma.loadAccessorial.create).not.toHaveBeenCalled();
  });

  it("looks past a REJECTED row, so a thrown-out charge can be re-recorded", async () => {
    await recordTonuObligation("load_5", "CUSTOMER", "user_ae");
    const where = mockPrisma.loadAccessorial.findFirst.mock.calls[0][0].where;
    expect(where.type).toBe("TONU");
    expect(where.status).toEqual({ not: "REJECTED" });
  });
});

describe("recordTonuObligation — interaction with the cancellation reversal", () => {
  it("writes only to the ledger, which onLoadCancelledOrTONU never touches", async () => {
    // The reversal cancels tenders, reverses shipper credit, VOIDS CarrierPay,
    // cancels approval-queue rows and reverses factoring funds. It is
    // fire-and-forget from loadController, so anything this function wrote to
    // those tables could be voided or not depending on which finished first.
    // LoadAccessorial is outside that set, so the ordering cannot race.
    await recordTonuObligation("load_6", "CUSTOMER", "user_ae");

    expect(mockPrisma.loadAccessorial.create).toHaveBeenCalled();
    expect(mockPrisma.carrierPay?.create).not.toHaveBeenCalled();
    expect(mockPrisma.carrierPay?.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice?.create).not.toHaveBeenCalled();
  });

  it("never pays a carrier-fault TONU, so the reversal stays the whole story", async () => {
    await recordTonuObligation("load_7", "CARRIER", "user_ae");
    expect(mockPrisma.loadAccessorial.create).not.toHaveBeenCalled();
  });
});
