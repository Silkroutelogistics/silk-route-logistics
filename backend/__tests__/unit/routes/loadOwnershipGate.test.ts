/**
 * carrier-portal-upgrade G5/G6 — load accessorials and load stops are owner-gated.
 *
 * POST /load-accessorials/:loadId, PUT /load-stops/:loadId/:stopId and
 * PATCH /load-stops/stop/:stopId all admitted any CARRIER with no check that the
 * load was theirs: a carrier could add a charge to, or rewrite the detention and
 * dwell of, a load it does not haul. The GETs had no role gate at all.
 *
 * Real routers over HTTP, prisma mocked. The property is that a refused caller
 * never reaches a write.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
// The shared mock (__tests__/setup.ts) has neither model; these routers use both.
mockPrisma.loadStop ??= {};
for (const m of ["findUnique", "findMany", "update", "create"]) mockPrisma.loadStop[m] ??= vi.fn();
mockPrisma.loadAccessorial ??= {};
for (const m of ["findMany", "create"]) mockPrisma.loadAccessorial[m] ??= vi.fn();

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

let theApp: express.Express;
beforeAll(async () => {
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/load-accessorials", (await import("../../../src/routes/loadAccessorials")).default);
  theApp.use("/api/load-stops", (await import("../../../src/routes/loadStops")).default);
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  who = { id: "u-carrier", role: "CARRIER" };
  mockPrisma.load.findUnique.mockResolvedValue({ id: "l-1", carrierId: "u-owner" });
  mockPrisma.loadStop.findUnique.mockResolvedValue({ id: "s-1", loadId: "l-1", load: { carrierId: "u-owner" } });
  mockPrisma.loadStop.findMany.mockResolvedValue([]);
  mockPrisma.loadAccessorial.findMany.mockResolvedValue([]);
});

describe("a carrier that does not own the load", () => {
  it("cannot add an accessorial", async () => {
    const res = await request(theApp).post("/api/load-accessorials/l-1").send({ type: "LUMPER", amount: 900 });
    expect(res.status).toBe(403);
    expect(mockPrisma.loadAccessorial.create).not.toHaveBeenCalled();
  });

  it("cannot read the load's accessorials", async () => {
    const res = await request(theApp).get("/api/load-accessorials/l-1");
    expect(res.status).toBe(403);
    expect(mockPrisma.loadAccessorial.findMany).not.toHaveBeenCalled();
  });

  it("cannot rewrite a stop by load and stop id", async () => {
    const res = await request(theApp).put("/api/load-stops/l-1/s-1").send({ detentionMinutes: 600 });
    expect(res.status).toBe(403);
    expect(mockPrisma.loadStop.update).not.toHaveBeenCalled();
  });

  it("cannot rewrite a stop by stop id alone", async () => {
    const res = await request(theApp).patch("/api/load-stops/stop/s-1").send({ detentionMinutes: 600 });
    expect(res.status).toBe(403);
    expect(mockPrisma.loadStop.update).not.toHaveBeenCalled();
  });

  it("cannot read the load's stops", async () => {
    const res = await request(theApp).get("/api/load-stops/l-1");
    expect(res.status).toBe(403);
    expect(mockPrisma.loadStop.findMany).not.toHaveBeenCalled();
  });
});

describe("who still passes", () => {
  it("the owning carrier reads its load's accessorials", async () => {
    who = { id: "u-owner", role: "CARRIER" };
    const res = await request(theApp).get("/api/load-accessorials/l-1");
    expect(res.status).toBe(200);
  });

  it("staff read any load's stops", async () => {
    who = { id: "u-ae", role: "OPERATIONS" };
    const res = await request(theApp).get("/api/load-stops/l-1");
    expect(res.status).toBe(200);
  });

  it("a shipper is refused", async () => {
    who = { id: "u-shipper", role: "SHIPPER" };
    const res = await request(theApp).get("/api/load-accessorials/l-1");
    expect(res.status).toBe(403);
  });

  it("an unknown stop is a 404 for a carrier", async () => {
    mockPrisma.loadStop.findUnique.mockResolvedValue(null);
    const res = await request(theApp).patch("/api/load-stops/stop/s-missing").send({});
    expect(res.status).toBe(404);
  });
});
