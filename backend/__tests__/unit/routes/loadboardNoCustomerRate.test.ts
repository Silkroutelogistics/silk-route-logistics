/**
 * carrier-portal-upgrade G37 — the carrier load board does not ask for Load.rate.
 *
 * GET /loadboard goes to every approved carrier and selected `rate`, which holds
 * the CUSTOMER rate on some creation paths (lib/carrierLoadView). The select is
 * the boundary, so the assertion is on the query: neither `rate` nor any other
 * customer-side column is requested.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { CARRIER_HIDDEN_LOAD_FIELDS } from "../../../src/lib/carrierLoadView";

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

let theApp: express.Express;
beforeAll(async () => {
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api", (await import("../../../src/routes/loadBids")).default);
}, 60_000);

describe("GET /loadboard", () => {
  it("selects the carrier rate and no customer-side column", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", onboardingStatus: "APPROVED" });
    mockPrisma.load.findMany.mockResolvedValue([]);
    const res = await request(theApp).get("/api/loadboard");
    expect(res.status).toBe(200);
    const select = mockPrisma.load.findMany.mock.calls[0][0].select;
    expect(select.carrierRate).toBe(true);
    for (const k of CARRIER_HIDDEN_LOAD_FIELDS) expect(select).not.toHaveProperty(k);
  });
});
