/**
 * carrier-portal-upgrade G10/G11.
 *
 * G10: a SUSPENDED carrier was refused every write on /carrier-loads (v3.8.ajx C4)
 * except two: POST /post-capacity and POST /gps-update. A GPS ping can move a
 * load's status. Both now run the same gate.
 *
 * G11: the 2FA wall told carriers it "protects the bank details" on their
 * account. SRL stores no bank or routing data for a carrier.
 *
 * Real router over HTTP, prisma mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
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

let theApp: express.Express;
beforeAll(async () => {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/carrier-loads", carrierLoads);
}, 60_000);

beforeEach(() => vi.clearAllMocks());

describe("G10: the two writes a suspended carrier could still make", () => {
  it.each(["/api/carrier-loads/post-capacity", "/api/carrier-loads/gps-update"])("%s refuses a SUSPENDED carrier", async (url) => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ onboardingStatus: "SUSPENDED" });
    const res = await request(theApp).post(url).send({ currentCity: "X", currentState: "MI", availableDate: "2026-10-05", latitude: 42.2, longitude: -85.5 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CARRIER_SUSPENDED");
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
  });

  it.each(["/api/carrier-loads/post-capacity", "/api/carrier-loads/gps-update"])("%s lets an APPROVED carrier through the gate", async (url) => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ onboardingStatus: "APPROVED" });
    const res = await request(theApp).post(url).send({}); // empty body: the handler's own 400, past the gate
    expect(res.status).toBe(400);
  });
});

describe("G11: the 2FA wall's words", () => {
  it("claims no bank details SRL does not hold", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../../src/middleware/requireTotpEnrolled.ts"), "utf8");
    const strings = src.match(/"[^"\n]*authenticator[^"\n]*"/g) ?? [];
    expect(strings.length).toBeGreaterThan(0); // found the message, so the check below is not vacuous
    for (const s of strings) expect(s.toLowerCase()).not.toMatch(/bank|routing/);
  });
});
