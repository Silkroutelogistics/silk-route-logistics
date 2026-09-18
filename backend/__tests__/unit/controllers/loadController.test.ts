import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Mock dependent services as no-ops
vi.mock("../../../src/services/invoiceService", () => ({
  autoGenerateInvoice: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/mileageService", () => ({
  calculateMileage: vi.fn().mockResolvedValue({ practical_miles: 500, drive_time_hours: 8 }),
}));
vi.mock("../../../src/services/shipperNotificationService", () => ({
  sendShipperPickupEmail: vi.fn().mockResolvedValue(undefined),
  sendShipperDeliveryEmail: vi.fn().mockResolvedValue(undefined),
  sendShipperMilestoneEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onLoadDelivered: vi.fn().mockResolvedValue(undefined),
  onLoadDispatched: vi.fn().mockResolvedValue(undefined),
  onLoadCancelledOrTONU: vi.fn().mockResolvedValue(undefined),
  enforceShipperCredit: vi.fn().mockResolvedValue({ allowed: true }),
}));
// The cascade is mocked so the test can assert it RAN and with what client —
// the prior deleteLoad test asserted only the 200 body and passed with the
// cascade deleted (lifecycle-gaps audit A8).
vi.mock("../../../src/services/cancelCascade", () => ({
  cascadeLoadCancellation: vi.fn().mockResolvedValue({ shipmentsCancelled: 0 }),
}));
import { cascadeLoadCancellation } from "../../../src/services/cancelCascade";
vi.mock("../../../src/services/tonuBillingService", () => ({
  recordTonuObligation: vi.fn().mockResolvedValue(undefined),
}));
// Mock validators to passthrough
vi.mock("../../../src/validators/load", () => ({
  createLoadSchema: { parse: (v: any) => v },
  updateLoadStatusSchema: { parse: (v: any) => v },
  loadQuerySchema: { parse: (v: any) => ({ page: 1, limit: 50, ...v }) },
}));

import {
  createLoad,
  getLoads,
  getLoadById,
  updateLoadStatus,
  deleteLoad,
  restoreLoad,
} from "../../../src/controllers/loadController";
// v3.8.akc Item 158 — carrierUpdateStatus DELETED (dead AE-side route).
// Side effects migrated to canonical POST /api/carrier-loads/:id/status.

const mockPrisma = vi.mocked(prisma);

function mockReqRes(body: Record<string, any> = {}, user?: any, params?: any, query?: any) {
  return {
    req: { body, user, params: params || {}, query: query || {}, headers: {} } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

describe("loadController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createLoad ──────────────────────────────────────────
  it("createLoad — creates a new load and returns 201", async () => {
    (mockPrisma as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
    (mockPrisma as any).$queryRaw = vi.fn().mockResolvedValue([{ nextval: BigInt(121472) }]);
    mockPrisma.load.create.mockResolvedValue({
      id: "load-1",
      referenceNumber: "SRL-121472",
      status: "POSTED",
      originCity: "Chicago",
      originState: "IL",
    } as any);

    const { req, res } = mockReqRes(
      { originCity: "Chicago", originState: "IL", destCity: "Dallas", destState: "TX", pickupDate: "2026-03-01", deliveryDate: "2026-03-03", equipmentType: "Dry Van" },
      { id: "user-1", role: "BROKER" }
    );

    await createLoad(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "load-1" }));
    expect(mockPrisma.load.create).toHaveBeenCalled();
  });

  // ── getLoads ────────────────────────────────────────────
  it("getLoads — returns paginated loads", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "load-1", referenceNumber: "SRL-100", status: "POSTED" },
    ] as any);
    mockPrisma.load.count.mockResolvedValue(1);
    mockPrisma.invoice.findMany.mockResolvedValue([] as any);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, {}, {});

    await getLoads(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ loads: expect.any(Array), total: 1, page: 1 })
    );
  });

  it("getLoads — an un-invoiced load reports null, never 0", async () => {
    // `customerBilled()` on the frontend prefers invoicedTotal whenever it is
    // not null, and 0 satisfies that — so a 0 here would replace the customer
    // rate with $0 on every row of the board that has no invoice yet, which is
    // most of them. Absent must stay absent.
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "load-1", referenceNumber: "SRL-100", status: "POSTED" },
    ] as any);
    mockPrisma.load.count.mockResolvedValue(1);
    mockPrisma.invoice.findMany.mockResolvedValue([] as any);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, {}, {});
    await getLoads(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.loads[0].invoicedTotal).toBeNull();
  });

  it("getLoads — sums issued invoices onto the right load", async () => {
    // A load can hold several invoices: a base plus a SUPPLEMENTAL carrying
    // only the accessorial delta. The billed total is their sum.
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "load-1", referenceNumber: "SRL-100", status: "INVOICED" },
      { id: "load-2", referenceNumber: "SRL-101", status: "POSTED" },
    ] as any);
    mockPrisma.load.count.mockResolvedValue(2);
    mockPrisma.invoice.findMany.mockResolvedValue([
      { loadId: "load-1", amount: 4100, totalAmount: null },
      { loadId: "load-1", amount: 250, totalAmount: null },
    ] as any);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, {}, {});
    await getLoads(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.loads[0].invoicedTotal).toBe(4350);
    expect(body.loads[1].invoicedTotal, "a load with no invoice is untouched").toBeNull();
  });

  // ── getLoadById ─────────────────────────────────────────
  it("getLoadById — returns load when found", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      referenceNumber: "SRL-100",
      status: "POSTED",
    } as any);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await getLoadById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "load-1" }));
  });

  it("getLoadById — returns 404 when not found", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, { id: "nonexistent" });

    await getLoadById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Load not found" });
  });

  // ── updateLoadStatus ───────────────────────────────────
  it("updateLoadStatus — valid transition with assigned carrier succeeds", async () => {
    // v3.8.j Layer 2 — transitions to TENDERED/CONFIRMED/BOOKED require
    // an assigned carrier. This happy-path test now provides carrierId
    // so the gate passes; the gate's rejection-when-null is covered in
    // a separate test below.
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      status: "POSTED",
      posterId: "user-1",
      carrierId: "carrier-user-1",
    } as any);
    mockPrisma.load.update.mockResolvedValue({
      id: "load-1",
      status: "BOOKED",
      posterId: "user-1",
      carrierId: "carrier-user-1",
    } as any);
    mockPrisma.shipment.findFirst.mockResolvedValue(null);

    const { req, res } = mockReqRes(
      { status: "BOOKED" },
      { id: "user-1", role: "BROKER" },
      { id: "load-1" }
    );

    await updateLoadStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "BOOKED" }));
  });

  it("updateLoadStatus — v3.8.j gate: BOOKED transition without carrier returns 400", async () => {
    // Regression guard for v3.8.j Layer 2 carrier-required state-machine
    // gate. Pre-v3.8.j, this transition succeeded AND silently auto-
    // assigned the calling user as carrier (loadController.ts:477) —
    // which produced the L6894191249 incident where SRL employees ended
    // up listed as carriers on bookings. The gate now rejects with a
    // friendly 400 directing AE to use the Tender modal instead.
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      status: "POSTED",
      posterId: "user-1",
      carrierId: null,
    } as any);

    const { req, res } = mockReqRes(
      { status: "BOOKED" },
      { id: "user-1", role: "BROKER" },
      { id: "load-1" }
    );

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("without an assigned carrier"),
      })
    );
    // Layer 1 verification: load.update must NOT be called when the gate fires
    // (the auto-assign clause that pre-v3.8.j would have written carrierId
    // on this transition has been removed).
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
  });

  it("updateLoadStatus — invalid transition returns 400", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      status: "POSTED",
      posterId: "user-1",
    } as any);

    const { req, res } = mockReqRes(
      { status: "DELIVERED" },
      { id: "user-1", role: "BROKER" },
      { id: "load-1" }
    );

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    // v3.8.akb — error message changed from inline "Invalid status
    // transition: POSTED → DELIVERED" to canonical validator output
    // "Cannot transition from POSTED to DELIVERED. Next allowed: ...".
    // Test asserts on the meaningful semantic — "POSTED" + "DELIVERED"
    // appear in the message — and the new code field is present.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/POSTED.*DELIVERED/),
        code: "SKIP_NOT_ALLOWED",
        allowed: expect.arrayContaining(["TENDERED", "BOOKED", "CANCELLED"]),
      })
    );
  });

  it("updateLoadStatus — unauthorized user gets 403", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      status: "POSTED",
      posterId: "user-1",
      carrierId: "carrier-1",
    } as any);

    const { req, res } = mockReqRes(
      { status: "BOOKED" },
      { id: "random-user", role: "SHIPPER" },
      { id: "load-1" }
    );

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ── carrierUpdateStatus block DELETED in v3.8.akc Item 158.
  // The controller function it exercised (carrierUpdateStatus) was the
  // handler for the dead PATCH /api/loads/:id/carrier-status route.
  // Side effects (Shipment sync + auto-invoice + shipper email cascade
  // + onLoadDelivered integration) migrated to the canonical carrier-
  // portal endpoint POST /api/carrier-loads/:id/status. Equivalent
  // integration coverage now belongs in a routes/carrierLoads.ts test
  // (banked as small follow-up since the file currently has no test
  // coverage — Sub-pattern 11 second-class fire would benefit from
  // explicit coverage of the migrated side effects).

  // ── deleteLoad ──────────────────────────────────────────
  // $transaction is a bare vi.fn() in setup.ts, so the callback never ran and
  // nothing inside it was observable. Run it against the same mock client.
  function runTransactions() {
    // Both $transaction forms: the interactive callback (deleteLoad) and the
    // array form (loadAuditService). mockImplementation survives clearAllMocks,
    // so a callback-only shape leaked into later tests as "fn is not a function".
    (mockPrisma as any).$transaction.mockImplementation(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma)));
    mockPrisma.load.update.mockResolvedValue({} as any);
    mockPrisma.loadTender.updateMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.checkCall.updateMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 } as any);
  }

  it("deleteLoad — cancels + archives a BOOKED load and runs the cascade INSIDE the transaction", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "BOOKED", podUrl: null, deletedAt: null } as any);
    const { req, res } = mockReqRes({ cancellationReasonCode: "DUPLICATE_ENTRY", reason: "Duplicate" }, { id: "user-1", role: "ADMIN", email: "admin@test.com" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Load archived" });
    const data = mockPrisma.load.update.mock.calls[0][0].data as any;
    expect(data.status).toBe("CANCELLED");
    expect(data.cancellationReason).toBe("Duplicate");
    expect(data.cancellationReasonCode).toBe("DUPLICATE_ENTRY");
    expect(data.cancellationFaultParty).toBe("NONE");
    expect(data.cancelledById).toBe("user-1");
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(cascadeLoadCancellation).toHaveBeenCalledWith("load-1", mockPrisma, expect.objectContaining({ reason: "Duplicate", actorId: "user-1" }));
  });

  it("deleteLoad — refuses a COMPLETED load with 409 and touches no row", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "COMPLETED", podUrl: null, deletedAt: null } as any);
    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "NOT_CANCELLABLE_STATUS" }));
    expect((mockPrisma as any).$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
  });

  it("deleteLoad — refuses when a POD is on file even at a cancellable status", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "DISPATCHED", podUrl: "s3://pod.pdf", deletedAt: null } as any);
    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "POD_ON_FILE" }));
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
  });

  it("deleteLoad — archives a TONU load WITHOUT rewriting its status to CANCELLED", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "TONU", podUrl: null, deletedAt: null } as any);
    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Load archived" });
    const data = mockPrisma.load.update.mock.calls[0][0].data as any;
    expect(data).not.toHaveProperty("status");
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it("deleteLoad — an OPERATIONS user who did not post the load may archive it (authz matches the route)", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "someone-else", status: "POSTED", podUrl: null, deletedAt: null } as any);
    const { req, res } = mockReqRes({ cancellationReasonCode: "SHIPPER_CANCELLED" }, { id: "ops-1", role: "OPERATIONS" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Load archived" });
  });

  it("deleteLoad — a CARRIER who did not post the load is still refused", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "someone-else", status: "POSTED", podUrl: null, deletedAt: null } as any);
    const { req, res } = mockReqRes({}, { id: "c-1", role: "CARRIER" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
  });

  it("deleteLoad — a live load with no reason code is refused 422 and nothing is written", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "POSTED", podUrl: null, deletedAt: null } as any);
    const { req, res } = mockReqRes({ reason: "Duplicate" }, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "REASON_CODE_REQUIRED" }));
    expect((mockPrisma as any).$transaction).not.toHaveBeenCalled();
  });

  it("updateLoadStatus — the trigger case: TENDERED → CANCELLED with SHIPPER_FREIGHT_NOT_READY writes code, fault party, actor and time in ONE update", async () => {
    runTransactions();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "TENDERED", carrierId: null, podUrl: null, referenceNumber: "SRL-121492" } as any);
    mockPrisma.load.update.mockResolvedValue({ id: "load-1", status: "CANCELLED", carrierId: null, referenceNumber: "SRL-121492" } as any);
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    const { req, res } = mockReqRes({ status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" }, { id: "ae-1", role: "OPERATIONS" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(422);
    const writes = mockPrisma.load.update.mock.calls.map((c) => c[0].data as any);
    expect(writes.length).toBe(1);
    expect(writes[0]).toEqual(expect.objectContaining({
      status: "CANCELLED",
      cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY",
      cancellationFaultParty: "SHIPPER",
      cancelledById: "ae-1",
    }));
    expect(writes[0].cancelledAt).toBeInstanceOf(Date);
    expect(cascadeLoadCancellation).toHaveBeenCalledWith("load-1", mockPrisma, expect.objectContaining({ actorId: "ae-1" }));
  });

  it("updateLoadStatus — CANCELLED without a reason code is refused 422 before any write (controller-level, independent of Zod)", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "TENDERED", carrierId: null, podUrl: null } as any);
    const { req, res } = mockReqRes({ status: "CANCELLED", reason: "freight not ready" }, { id: "ae-1", role: "OPERATIONS" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "REASON_CODE_REQUIRED" }));
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
    expect(cascadeLoadCancellation).not.toHaveBeenCalled();
  });

  it("updateLoadStatus — OTHER without a note is refused 422 NOTE_REQUIRED before any write (B7a: the modal blocks it client-side; this is the server half)", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "TENDERED", carrierId: null, podUrl: null } as any);
    const { req, res } = mockReqRes({ status: "CANCELLED", cancellationReasonCode: "OTHER", cancellationReason: "short" }, { id: "ae-1", role: "OPERATIONS" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "NOTE_REQUIRED" }));
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
    expect(cascadeLoadCancellation).not.toHaveBeenCalled();
  });

  it("updateLoadStatus — a repeat cancel answers 200 with the existing row and writes NOTHING (the first record stands)", async () => {
    const existing = { id: "load-1", posterId: "user-1", status: "CANCELLED", carrierId: null, podUrl: null,
      cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY", cancelledById: "ae-1" };
    mockPrisma.load.findUnique.mockResolvedValue(existing as any);
    const { req, res } = mockReqRes({ status: "CANCELLED", cancellationReasonCode: "SHIPPER_CANCELLED" }, { id: "ae-2", role: "OPERATIONS" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(existing);
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
    expect(cascadeLoadCancellation).not.toHaveBeenCalled();
  });

  // ── updateLoadStatus: validate-then-write ──────────────
  it("updateLoadStatus — a TONU without a fault side is refused BEFORE any write", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "BOOKED", carrierId: "c-1", podUrl: null } as any);
    const { req, res } = mockReqRes({ status: "TONU" }, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "TONU_FAULT_SIDE_REQUIRED" }));
    expect(mockPrisma.load.update, "the status must not have moved").not.toHaveBeenCalled();
  });

  it("updateLoadStatus — a TONU with a fault side writes it in the SAME update as the status", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "BOOKED", carrierId: "c-1", podUrl: null } as any);
    mockPrisma.load.update.mockResolvedValue({ id: "load-1", status: "TONU", carrierId: "c-1", referenceNumber: "SRL-1" } as any);
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({} as any);
    runTransactions();
    const { req, res } = mockReqRes({ status: "TONU", tonuFaultSide: "CUSTOMER" }, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).not.toHaveBeenCalledWith(422);
    const writes = mockPrisma.load.update.mock.calls.map((c) => c[0].data as any);
    expect(writes.length, "one write, not a status write followed by a fault-side write").toBe(1);
    expect(writes[0]).toEqual(expect.objectContaining({ status: "TONU", tonuFaultSide: "CUSTOMER" }));
  });

  it("updateLoadStatus — CANCELLED is refused with 409 when a POD is on file, and nothing is written", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "user-1", status: "DISPATCHED", carrierId: "c-1", podUrl: "s3://pod.pdf" } as any);
    const { req, res } = mockReqRes({ status: "CANCELLED" }, { id: "user-1", role: "ADMIN" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "POD_ON_FILE" }));
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
    expect(cascadeLoadCancellation).not.toHaveBeenCalled();
  });

  // ── restoreLoad ─────────────────────────────────────────
  it("restoreLoad — restores archived load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      deletedAt: new Date(),
    } as any);
    mockPrisma.load.update.mockResolvedValue({} as any);
    mockPrisma.loadTender.updateMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.checkCall.updateMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 } as any);

    const { req, res } = mockReqRes(
      {},
      { id: "user-1", role: "ADMIN" },
      { id: "load-1" }
    );

    await restoreLoad(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Load restored" });
  });
});
