/**
 * carrier-portal-upgrade R3 — GET /carrier-loads/available carries no
 * `detentionWarnings`.
 *
 * Every load on the board was enriched with a pickup and a delivery facility
 * detention warning, a database lookup per distinct place on every page. No
 * client in the repo ever read the field (owner ruling, OPEN 13), so the
 * enrichment and its service function were deleted. This holds the deletion:
 * the loads come back as queried, and no facility lookup is made.
 *
 * The service is mocked with a spy under the old export name, so restoring the
 * enrichment would both call it and put the field back, and fail here twice.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("../../../src/services/detentionTrackingService", () => ({ getFacilityDetentionWarning: warn }));
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

let theApp: express.Express;
beforeAll(async () => {
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/carrier-loads", (await import("../../../src/routes/carrierLoads")).default);
}, 60_000);

const lane = (id: string, o: string, d: string) => ({ id, originCity: o, originState: "MI", destCity: d, destState: "TX" });

beforeEach(() => {
  vi.clearAllMocks();
  warn.mockResolvedValue({ avgWaitMinutes: 300, detentionRisk: "HIGH", warning: "x" });
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", onboardingStatus: "APPROVED", equipmentTypes: [] });
  mockPrisma.load.findMany.mockResolvedValue([lane("l1", "Kalamazoo", "Dallas"), lane("l2", "Grand Rapids", "Houston")]);
  mockPrisma.load.count.mockResolvedValue(2);
});

describe("GET /carrier-loads/available", () => {
  it("returns the loads without detentionWarnings", async () => {
    const res = await request(theApp).get("/api/carrier-loads/available");
    expect(res.status).toBe(200);
    expect(res.body.loads).toHaveLength(2);
    for (const load of res.body.loads) expect(load).not.toHaveProperty("detentionWarnings");
    expect(res.body).toMatchObject({ total: 2, page: 1, totalPages: 1 });
  });

  it("makes no facility detention lookup", async () => {
    await request(theApp).get("/api/carrier-loads/available");
    expect(warn).not.toHaveBeenCalled();
  });
});
