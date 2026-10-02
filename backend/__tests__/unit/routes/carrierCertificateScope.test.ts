/**
 * carrier-portal-upgrade F2 (owner check 2) — a training certificate is carrier-scoped.
 *
 * GET /carrier-drivers/:id/certificate/:slug serves a driver's completion
 * certificate. The driver must be on THIS carrier's roster: the route looks it up
 * by id AND the caller's CarrierProfile.id (getOwnedDriver), and answers 404
 * otherwise, so another carrier's driver cannot be fetched, or even confirmed
 * to exist, by guessing ids. Real router over HTTP, prisma and the PDF
 * service mocked; the property is that a refused caller never reaches the
 * certificate builder.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
mockPrisma.driver ??= {};
mockPrisma.driver.findFirst ??= vi.fn();

const { build, generate } = vi.hoisted(() => ({ build: vi.fn(), generate: vi.fn() }));
vi.mock("../../../src/services/certificatePdfService", () => ({ buildCertificateData: build, generateTrainingCertificate: generate }));

let who = "u-carrier-a";
vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: who, email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
  };
});

let theApp: express.Express;
beforeAll(async () => {
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/carrier-drivers", (await import("../../../src/routes/carrierDrivers")).default);
}, 60_000);

const PROFILE = { "u-carrier-a": "cp-a", "u-carrier-b": "cp-b" } as Record<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  who = "u-carrier-a";
  mockPrisma.carrierProfile.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve({ id: PROFILE[where.userId], onboardingStatus: "APPROVED" }),
  );
  // The roster: driver d-b belongs to carrier B only. Filtered the way a
  // database filters: a where without carrierProfileId FINDS d-b, so an
  // unscoped query in the route shows up as a leak, not as a 404.
  mockPrisma.driver.findFirst.mockImplementation(({ where }: any) =>
    Promise.resolve(where.id === "d-b" && (where.carrierProfileId === undefined || where.carrierProfileId === "cp-b") ? { id: "d-b" } : null),
  );
  build.mockResolvedValue({ driverName: "X", courseTitle: "HOS" });
  generate.mockReturnValue({ pipe: (res: any) => res.end("%PDF-1.4") });
});

describe("GET /carrier-drivers/:id/certificate/:slug", () => {
  it("carrier A cannot fetch carrier B's driver's certificate: 404, and nothing is built", async () => {
    const res = await request(theApp).get("/api/carrier-drivers/d-b/certificate/hos-basics");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"] ?? "").not.toContain("application/pdf");
    expect(build).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("carrier B gets its own driver's certificate", async () => {
    who = "u-carrier-b";
    const res = await request(theApp).get("/api/carrier-drivers/d-b/certificate/hos-basics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(build).toHaveBeenCalledWith("d-b", "hos-basics");
  });

  it("an id that exists nowhere looks the same as another carrier's: 404", async () => {
    const res = await request(theApp).get("/api/carrier-drivers/d-nobody/certificate/hos-basics");
    expect(res.status).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });
});
