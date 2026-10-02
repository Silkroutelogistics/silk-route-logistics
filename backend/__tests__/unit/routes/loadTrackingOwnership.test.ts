/**
 * carrier-portal-upgrade G2/G7 — /load-tracking/:loadId/* is scoped to the load.
 *
 * confirm-loaded and confirm-delivered admitted any CARRIER without comparing
 * load.carrierId, so one carrier could mark another carrier's load LOADED or
 * DELIVERED and write its detention. The GETs had no role gate at all. The
 * router now runs one param gate: staff pass, a carrier passes only for its own
 * load, every other role is refused.
 *
 * Real router over HTTP, prisma mocked. The property is that a refused caller
 * never reaches a write.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
// The shared mock (__tests__/setup.ts) has neither model; this router reads both.
mockPrisma.loadTrackingEvent ??= { findMany: vi.fn(), create: vi.fn() };
mockPrisma.loadStop ??= { update: vi.fn(), findMany: vi.fn() };
let who: { id: string; role: string } = { id: "u-carrier", role: "CARRIER" };

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { ...who, email: "x@srl.invalid" };
      next();
    },
  };
});
vi.mock("../../../src/middleware/audit", () => ({
  auditLog: () => (_r: any, _s: any, n: any) => n(),
}));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));

let theApp: express.Express;
beforeAll(async () => {
  const loadTracking = (await import("../../../src/routes/loadTracking")).default;
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/load-tracking", loadTracking);
}, 60_000);

const OTHER_CARRIERS_LOAD = { id: "l-1", carrierId: "u-owner", status: "AT_PICKUP", referenceNumber: "SRL-1", loadStops: [] };

beforeEach(() => {
  vi.clearAllMocks();
  who = { id: "u-carrier", role: "CARRIER" };
  mockPrisma.load.findUnique.mockResolvedValue(OTHER_CARRIERS_LOAD);
  mockPrisma.loadTrackingEvent.findMany.mockResolvedValue([]);
});

describe("a carrier that does not own the load", () => {
  it.each([
    ["post", "/api/load-tracking/l-1/confirm-loaded", { timestamp: "2026-10-01T12:00:00Z", trailerNumber: "T1" }],
    ["post", "/api/load-tracking/l-1/confirm-delivered", { timestamp: "2026-10-01T12:00:00Z" }],
  ] as const)("%s %s is refused and writes nothing", async (_m, path, body) => {
    const res = await request(theApp).post(path).send(body);
    expect(res.status).toBe(403);
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
    expect(mockPrisma.loadStop.update).not.toHaveBeenCalled();
  });

  it.each(["events", "playback", "detention"])("GET %s is refused", async (leaf) => {
    const res = await request(theApp).get(`/api/load-tracking/l-1/${leaf}`);
    expect(res.status).toBe(403);
    expect(mockPrisma.loadTrackingEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("who still passes", () => {
  it("the owning carrier reaches the handler", async () => {
    who = { id: "u-owner", role: "CARRIER" };
    const res = await request(theApp).get("/api/load-tracking/l-1/events");
    expect(res.status).toBe(200);
    expect(mockPrisma.loadTrackingEvent.findMany).toHaveBeenCalled();
  });

  it("staff reach the handler without owning the load", async () => {
    who = { id: "u-ae", role: "BROKER" };
    const res = await request(theApp).get("/api/load-tracking/l-1/events");
    expect(res.status).toBe(200);
  });

  it("a shipper is refused", async () => {
    who = { id: "u-shipper", role: "SHIPPER" };
    const res = await request(theApp).get("/api/load-tracking/l-1/events");
    expect(res.status).toBe(403);
  });

  it("an unknown load is a 404 for a carrier", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);
    const res = await request(theApp).get("/api/load-tracking/l-missing/events");
    expect(res.status).toBe(404);
  });
});
