import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

import {
  getShipperDashboard,
  getShipperShipments,
  getShipperInvoices,
  getShipperDocuments,
  createQuoteRequest,
  getShipperTracking,
} from "../../../src/controllers/shipperPortalController";

const mockPrisma = vi.mocked(prisma);

// The shared setup mock has no loadTrackingEvent model. It is augmented here,
// in this file only, rather than by editing the shared setup: a model added
// there is a contract every test inherits, and the only consumer is the
// tracking case below.
(prisma as any).loadTrackingEvent = { findMany: vi.fn() };
const trackingEvents = (prisma as any).loadTrackingEvent.findMany as ReturnType<typeof vi.fn>;

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

  it("getShipperShipments — an unpriced load sends null, not $0", async () => {
    // 6.5. This serializer read `load.customerRate ?? 0`, so a shipment SRL
    // had not priced yet arrived at the portal as a rate of zero — which
    // renders as a real, free shipment rather than as one without a price.
    // The portal's money() turns null into an em-dash; it cannot turn 0 into
    // one, because 0 is a legitimate figure.
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "unpriced", referenceNumber: "SRL-200", status: "POSTED",
        originCity: "Reno", originState: "NV", destCity: "Boise", destState: "ID",
        customerRate: null, checkCalls: [] },
      { id: "priced", referenceNumber: "SRL-201", status: "POSTED",
        originCity: "Reno", originState: "NV", destCity: "Boise", destState: "ID",
        customerRate: 5100, checkCalls: [] },
    ] as any);
    mockPrisma.load.count.mockResolvedValue(2);

    const { req, res } = mockReqRes(
      {}, { id: "shipper-1", role: "SHIPPER" }, {}, { page: "1", limit: "50" },
    );
    await getShipperShipments(req, res);

    const body = (res.json as any).mock.calls[0][0];
    const unpriced = body.shipments.find((x: any) => x.id === "SRL-200");
    const priced = body.shipments.find((x: any) => x.id === "SRL-201");

    expect(unpriced.rate, "an unpriced load must send null so the portal can dash it").toBeNull();
    // Pins that the field is not simply always null — without this the fix
    // could be `rate: null` and this test would still pass.
    expect(priced.rate).toBe(5100);
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
  // Numbering changed here: this creator used to stamp `RFQ-<base36 timestamp>`
  // and leave loadNumber null, so a shipper-portal quote had no SRL stem and
  // none of its documents could be numbered. It now draws from the same
  // load_number_seq as every other creator, which is why the sequence read has
  // to be mocked.
  it("createQuoteRequest — numbers the load off the shared sequence and returns 201", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1" } as any);
    (mockPrisma.$executeRaw as any).mockResolvedValue(1);
    (mockPrisma.$queryRaw as any).mockResolvedValue([{ nextval: 121500n }]);
    mockPrisma.load.create.mockResolvedValue({
      id: "load-new",
      referenceNumber: "SRL-121500",
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

    // The load carries the SRL stem on BOTH columns, and its BOL number is
    // stamped at creation so the renderer stays a pure read. A regression to
    // RFQ- numbering would leave every document on this load unnumberable.
    const created = (mockPrisma.load.create as any).mock.calls[0][0].data;
    expect(created.referenceNumber).toBe("SRL-121500");
    expect(created.loadNumber).toBe("SRL-121500");
    expect(created.srlBolNumber).toBe("SRL-121500B");
  });

  // ── getShipperTracking ──────────────────────────────────
  // "Last Known Position via ELD" used to be built from Load.driverId (never
  // written) and a simulated position service. It now exists only when a
  // LoadTrackingEvent with locationSource ELD exists for the load.
  const ACTIVE_LOAD = {
    id: "load-1",
    referenceNumber: "SRL-100",
    status: "IN_TRANSIT",
    originCity: "Chicago", originState: "IL",
    destCity: "Dallas", destState: "TX",
    equipmentType: "Dry Van",
    pickupDate: new Date(), deliveryDate: new Date(),
    carrier: { company: "Fast Trucking" },
    checkCalls: [],
  };

  it("getShipperTracking — no ELD event, no position card", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.load.findMany.mockResolvedValue([ACTIVE_LOAD] as any);
    (mockPrisma.riskLog.findMany as any).mockResolvedValue([]);
    trackingEvents.mockResolvedValue([]);

    const { req, res } = mockReqRes({}, { id: "shipper-1", role: "SHIPPER" });
    await getShipperTracking(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.shipments[0].eldPosition).toBeNull();
    // The query asks for ELD-sourced events only: a carrier-portal ping or an
    // AE manual entry must not light a card that says "via ELD".
    const where = trackingEvents.mock.calls[0][0].where;
    expect(where.locationSource).toBe("ELD");
    expect(where.loadId).toEqual({ in: ["load-1"] });
  });

  it("getShipperTracking — an ELD event yields the recorded position, with no invented speed", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.load.findMany.mockResolvedValue([ACTIVE_LOAD] as any);
    (mockPrisma.riskLog.findMany as any).mockResolvedValue([]);
    trackingEvents.mockResolvedValue([
      { loadId: "load-1", latitude: "41.6", longitude: "-87.3", locationCity: "Gary", locationState: "IN", createdAt: new Date("2026-09-07T10:00:00Z") },
    ]);

    const { req, res } = mockReqRes({}, { id: "shipper-1", role: "SHIPPER" });
    await getShipperTracking(req, res);

    const pos = (res.json as any).mock.calls[0][0].shipments[0].eldPosition;
    expect(pos).toEqual({ lat: 41.6, lng: -87.3, address: "Gary, IN", recordedAt: "2026-09-07T10:00:00.000Z" });
    expect(pos).not.toHaveProperty("speed");
  });

  it("getShipperTracking — no active loads, no tracking query at all", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.load.findMany.mockResolvedValue([]);
    trackingEvents.mockClear();

    const { req, res } = mockReqRes({}, { id: "shipper-1", role: "SHIPPER" });
    await getShipperTracking(req, res);

    expect(trackingEvents).not.toHaveBeenCalled();
    expect((res.json as any).mock.calls[0][0].shipments).toEqual([]);
  });
});
