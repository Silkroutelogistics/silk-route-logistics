/**
 * carrier-portal-upgrade G33 — GET /carrier-loads/available looks up each
 * facility once per request, not twice per load.
 *
 * The handler enriched every load with a pickup and a delivery detention
 * warning, each a database read, inside a per-load loop: a page of 20 cost 40
 * extra queries. Loads on one page share places, so the lookups are now shared
 * by city and state. The service is mocked so the assertion counts calls.
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
  warn.mockImplementation(async (_n: string, city: string) => ({ city }));
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", onboardingStatus: "APPROVED", equipmentTypes: [] });
  mockPrisma.load.count.mockResolvedValue(4);
});

describe("GET /carrier-loads/available", () => {
  it("looks each place up once, however many loads share it", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      lane("l1", "Kalamazoo", "Dallas"), lane("l2", "Kalamazoo", "Dallas"),
      lane("l3", "Kalamazoo", "Houston"), lane("l4", "Kalamazoo", "Dallas"),
    ]);
    const res = await request(theApp).get("/api/carrier-loads/available");
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(3); // Kalamazoo, Dallas, Houston (was 8)
    expect(res.body.loads).toHaveLength(4);
    expect(res.body.loads[3].detentionWarnings).toEqual({ pickup: { city: "Kalamazoo" }, delivery: { city: "Dallas" } });
  });
});
