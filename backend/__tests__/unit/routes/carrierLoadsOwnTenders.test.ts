/**
 * E2 (2026-09-21) — the carrier's load reads carry the carrier's OWN tender
 * rows, and only those.
 *
 * The next-step strip and the BOL button state on My Loads are decided from
 * the tender (lib/loadDerivedStatus, the AE board's selector projected for a
 * carrier), so GET /carrier-loads/my-loads and GET /carrier-loads/:id now
 * include `tenders`. The property this guard holds is the SCOPE of that
 * include: it is the relation `carrier: { userId }` (LoadTender.carrierId is a
 * CarrierProfile.id and the session holds a User.id — §13.3 Items 57, 222.4)
 * with deleted rows excluded. A load carries every carrier's tender — the
 * winner's and the withdrawn siblings' — and a sibling's row leaving the
 * server to this carrier would tell them who else was offered their load.
 *
 * Real router over HTTP, prisma mocked; the assertion is the query the route
 * sends. The end-to-end half (Postgres actually returning only this carrier's
 * row) is scripts/_arc-e2-tender-scope-proof.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
  };
});
vi.mock("../../../src/middleware/rateLimiters", () => ({
  uploadLimiter: (_r: any, _s: any, n: any) => n(),
  staffUploadLimiter: (_r: any, _s: any, n: any) => n(),
}));

async function app() {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carrier-loads", carrierLoads);
  return a;
}

const OWN_SCOPE = { carrier: { userId: "u-carrier" }, deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /carrier-loads/my-loads", () => {
  it("asks for the carrier's own tenders through the relation, and returns them on each load", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "l1", referenceNumber: "SRL-1", status: "BOOKED", tenders: [{ id: "t1", status: "RC_SENT", statusReason: null, statusChangedAt: new Date() }] },
    ]);
    mockPrisma.load.count.mockResolvedValue(1);
    const res = await request(await app()).get("/api/carrier-loads/my-loads");
    expect(res.status).toBe(200);
    const args = mockPrisma.load.findMany.mock.calls[0][0];
    expect(args.select.tenders.where).toEqual(OWN_SCOPE);
    expect(args.select.tenders.select).toMatchObject({ status: true, statusReason: true });
    expect(res.body.loads[0].tenders).toEqual([expect.objectContaining({ status: "RC_SENT" })]);
  });
});

describe("GET /carrier-loads/:id", () => {
  it("includes the same own-tender scope on the detail read", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "l1", carrierId: "u-carrier", status: "BOOKED", referenceNumber: "SRL-1",
      poster: null, carrier: null, customer: null, documents: [],
      tenders: [{ id: "t1", status: "CONFIRMED", statusReason: null, statusChangedAt: new Date() }],
    });
    const res = await request(await app()).get("/api/carrier-loads/l1");
    expect(res.status).toBe(200);
    const args = mockPrisma.load.findUnique.mock.calls[0][0];
    expect(args.include.tenders.where).toEqual(OWN_SCOPE);
    expect(res.body.tenders[0].status).toBe("CONFIRMED");
  });
});

describe("the scope is the relation, never a bare carrierId (vacuity tripwire)", () => {
  it("neither read scopes tenders by a User.id in the carrierId column", async () => {
    // LoadTender.carrierId holds a CarrierProfile.id. Filtering it by the
    // session's User.id would match nothing and read as "no tender" —
    // silently, on every load. The relation is the only correct scope.
    mockPrisma.load.findMany.mockResolvedValue([]);
    mockPrisma.load.count.mockResolvedValue(0);
    await request(await app()).get("/api/carrier-loads/my-loads");
    const where = mockPrisma.load.findMany.mock.calls[0][0].select.tenders.where;
    expect(where.carrierId).toBeUndefined();
    expect(where.carrier?.userId).toBe("u-carrier");
  });
});

describe("E6 — ?status= is a set", () => {
  it("a comma list becomes { in: [...] }; a single value stays a string; ALL means no filter", async () => {
    mockPrisma.load.findMany.mockResolvedValue([]);
    mockPrisma.load.count.mockResolvedValue(0);
    const a = await app();
    await request(a).get("/api/carrier-loads/my-loads?status=POD_RECEIVED,INVOICED,COMPLETED");
    expect(mockPrisma.load.findMany.mock.calls[0][0].where.status).toEqual({ in: ["POD_RECEIVED", "INVOICED", "COMPLETED"] });
    await request(a).get("/api/carrier-loads/my-loads?status=BOOKED");
    expect(mockPrisma.load.findMany.mock.calls[1][0].where.status).toBe("BOOKED");
    await request(a).get("/api/carrier-loads/my-loads?status=ALL");
    expect(mockPrisma.load.findMany.mock.calls[2][0].where.status).toBeUndefined();
  });
});
