/**
 * carrier-portal-upgrade G1 — POST /carrier-loads/:id/decline stays gone.
 *
 * The route settled the newest tender on ANY load because its lookup filtered on
 * `carrierId: { not: undefined }`, which matches every row. A carrier holding
 * nothing but a load id (the open board hands those out) could decline a
 * competitor's live offer. Nothing in the portal called it; declines go through
 * POST /tenders/:id/decline, which checks the tender is the caller's own.
 *
 * Real router over HTTP, prisma mocked. The property is that the request reaches
 * no handler at all, so no tender is ever looked up or settled.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-other-carrier", email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
  };
});
vi.mock("../../../src/middleware/rateLimiters", () => ({
  uploadLimiter: (_r: any, _s: any, n: any) => n(),
  staffUploadLimiter: (_r: any, _s: any, n: any) => n(),
}));

let theApp: express.Express;
beforeAll(async () => {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/carrier-loads", carrierLoads);
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  // A victim load with a live tender that belongs to somebody else.
  mockPrisma.load.findUnique.mockResolvedValue({ id: "l-victim", carrierId: "u-victim", referenceNumber: "SRL-1", posterId: "u-ae" });
  mockPrisma.loadTender.findFirst.mockResolvedValue({ id: "t-victim", status: "OFFERED" });
});

describe("POST /carrier-loads/:id/decline", () => {
  it("is not a route: 404, and no tender is looked up or touched", async () => {
    const res = await request(theApp).post("/api/carrier-loads/l-victim/decline").send({});
    expect(res.status).toBe(404);
    expect(mockPrisma.loadTender.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.loadTender.update).not.toHaveBeenCalled();
    expect(mockPrisma.loadTender.updateMany).not.toHaveBeenCalled();
  });
});
