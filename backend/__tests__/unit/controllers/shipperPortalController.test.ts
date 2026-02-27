import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Mock dependent services
vi.mock("../../../src/services/eldService", () => ({
  getVehicleLocation: vi.fn().mockReturnValue(null),
}));

import {
  getShipperDashboard,
  getShipperShipments,
  getShipperInvoices,
  getShipperDocuments,
  createQuoteRequest,
} from "../../../src/controllers/shipperPortalController";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(body: Record<string, any> = {}, user?: any, params?: any, query?: any) {
  return {
    req: { body, user, params: params || {}, query: query || {}, headers: {} } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

describe("shipperPortalController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getShipperDashboard ─────────────────────────────────
  it("getShipperDashboard — returns dashboard KPIs for linked customer", async () => {
    // resolveShipperLoadWhere: customer found
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", userId: "shipper-1" } as any);

    // Dashboard queries
    mockPrisma.load.count.mockResolvedValue(3);
    mockPrisma.load.findMany.mockResolvedValue([]);
    mockPrisma.loadTender.count.mockResolvedValue(2);
    mockPrisma.loadTender.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes({}, { id: "shipper-1", role: "SHIPPER" });

    await getShipperDashboard(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        kpis: expect.objectContaining({ activeShipments: 3 }),
      })
    );
  });

  // ── getShipperShipments ─────────────────────────────────
  it("getShipperShipments — returns paginated shipments for shipper", async () => {
    // resolveShipperLoadWhere: no customer linked, fallback to posterId
    mockPrisma.customer.findUnique.mockResolvedValue(null);

    mockPrisma.load.findMany.mockResolvedValue([
      {
        id: "load-1",
        referenceNumber: "SRL-100",
        status: "IN_TRANSIT",
        originCity: "Chicago",
        originState: "IL",
        destCity: "Dallas",
        destState: "TX",
        equipmentType: "Dry Van",
        pickupDate: new Date(),
        deliveryDate: new Date(),
        weight: 40000,
        distance: 920,
        carrier: { company: "Fast Trucking" },
        checkCalls: [],
      },
    ] as any);
    mockPrisma.load.count.mockResolvedValue(1);

    const { req, res } = mockReqRes(
      {},
      { id: "shipper-1", role: "SHIPPER" },
      {},
      { page: "1", limit: "50" }
    );

    await getShipperShipments(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        shipments: expect.arrayContaining([
          expect.objectContaining({ status: "In Transit" }),
        ]),
        total: 1,
      })
    );
  });

  // ── getShipperInvoices ──────────────────────────────────
  it("getShipperInvoices — returns empty when no loads", async () => {
    // resolveShipperLoadWhere: no customer
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    // getShipperLoadIds: no loads
    mockPrisma.load.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes(
      {},
      { id: "shipper-1", role: "SHIPPER" },
      {},
      { page: "1", limit: "50" }
    );

    await getShipperInvoices(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        invoices: [],
        total: 0,
        billing: expect.objectContaining({ outstandingBalance: 0 }),
      })
    );
  });

  // ── getShipperDocuments ─────────────────────────────────
  it("getShipperDocuments — returns empty when no loads", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.load.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes({}, { id: "shipper-1", role: "SHIPPER" });

    await getShipperDocuments(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ typeCounts: [], documents: [] })
    );
  });

  // ── createQuoteRequest ──────────────────────────────────
  it("createQuoteRequest — creates load as RFQ and returns 201", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1" } as any);
    mockPrisma.load.create.mockResolvedValue({
      id: "load-new",
      referenceNumber: "RFQ-ABC123",
      status: "POSTED",
    } as any);

    const { req, res } = mockReqRes(
      {
        originCity: "Chicago",
        originState: "IL",
        destCity: "Atlanta",
        destState: "GA",
        pickupDate: "2026-03-10",
        equipmentType: "Dry Van",
        weight: 42000,
        commodity: "Electronics",
      },
      { id: "shipper-1", role: "SHIPPER" }
    );

    await createQuoteRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Quote request submitted successfully" })
    );
  });
});
