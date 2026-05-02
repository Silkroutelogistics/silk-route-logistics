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
  carrierUpdateStatus,
  deleteLoad,
  restoreLoad,
} from "../../../src/controllers/loadController";

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

    const { req, res } = mockReqRes({}, { id: "user-1", role: "ADMIN" }, {}, {});

    await getLoads(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ loads: expect.any(Array), total: 1, page: 1 })
    );
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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Invalid status transition") })
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

  // ── carrierUpdateStatus ─────────────────────────────────
  it("carrierUpdateStatus — carrier updates assigned load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      status: "DISPATCHED",
      carrierId: "carrier-1",
      posterId: "broker-1",
      referenceNumber: "SRL-100",
    } as any);
    mockPrisma.load.update.mockResolvedValue({
      id: "load-1",
      status: "AT_PICKUP",
    } as any);
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({} as any);

    const { req, res } = mockReqRes(
      { status: "AT_PICKUP" },
      { id: "carrier-1", role: "CARRIER" },
      { id: "load-1" }
    );

    await carrierUpdateStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "AT_PICKUP" }));
  });

  // ── deleteLoad ──────────────────────────────────────────
  it("deleteLoad — soft-deletes load and related records", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      posterId: "user-1",
      deletedAt: null,
    } as any);
    mockPrisma.load.update.mockResolvedValue({} as any);
    mockPrisma.loadTender.updateMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.checkCall.updateMany.mockResolvedValue({ count: 0 } as any);
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 } as any);

    const { req, res } = mockReqRes(
      { reason: "Duplicate" },
      { id: "user-1", role: "ADMIN", email: "admin@test.com" },
      { id: "load-1" }
    );

    await deleteLoad(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Load archived" });
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
