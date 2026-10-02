/**
 * coi-verify-email-fix C3 — the AE carrier save returned 500 on the owner's
 * payload: insuranceExpiry "" became new Date("") and Prisma refused it, while
 * safetyScore "" became NaN and was written. Real router for the route checks;
 * the handler is also called bare, so the coercion holds without the schema.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
// server.ts loads this; without it an async throw never reaches errorHandler and the request hangs.
import "express-async-errors";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { updateCarrier } from "../../../src/controllers/carrierController";
import { errorHandler } from "../../../src/middleware/errorHandler";
import { FieldError } from "../../../src/lib/formCoerce";

const p = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-admin", email: "a@srl.invalid", role: String(req.headers["x-test-role"] || "ADMIN") };
      next();
    },
  };
});

// The payload the AE page sent at 17:33:03Z, verbatim.
const OWNER = {
  additionalInsuredSRL: true, autoLiabilityAmount: "1000000", autoLiabilityExpiry: "2027-09-01", autoLiabilityPolicy: "VBB188673",
  autoLiabilityProvider: "McGriff", cargoInsuranceAmount: "100000", cargoInsuranceExpiry: "2026-11-01", cargoInsurancePolicy: "IM6079611149",
  cargoInsuranceProvider: "McGriff", generalLiabilityAmount: "1000000", generalLiabilityExpiry: "2027-08-29", generalLiabilityPolicy: "VBB188673",
  generalLiabilityProvider: "McGriff", insuranceAgencyName: "", insuranceAgentEmail: "", insuranceAgentName: "", insuranceAgentPhone: "",
  insuranceExpiry: "", numberOfTrucks: "79", safetyScore: "", thirtyDayCancellationNotice: true, tier: "GUEST", waiverOfSubrogation: true,
  workersCompAmount: "1000000", workersCompExpiry: "2027-09-01", workersCompPolicy: "0002116633", workersCompProvider: "McGriff",
};

let a: express.Express;
beforeAll(async () => {
  const carrier = (await import("../../../src/routes/carrier")).default;
  a = express();
  a.use(express.json());
  a.use("/api/carrier", carrier);
  a.use(errorHandler as any);
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  p.$transaction.mockImplementation(async (cb: any) => cb(p));
  p.carrierProfile.update.mockImplementation(async ({ data }: any) => ({ id: "cp-1", ...data }));
  p.auditLog.create = vi.fn().mockResolvedValue({});
  p.errorLog = { create: vi.fn().mockResolvedValue({}) };
});

const written = () => p.carrierProfile.update.mock.calls[0]?.[0].data;
const patch = (body: object) => request(a).patch("/api/carrier/cp-1").send(body);

describe("PATCH /api/carrier/:id", () => {
  it("the owner's payload saves: insuranceExpiry \"\" is null, safetyScore \"\" is null, never NaN", async () => {
    const r = await patch(OWNER);
    expect(r.status).toBe(200);
    expect(written().insuranceExpiry).toBeNull();
    expect(written().safetyScore).toBeNull();
    expect(written().numberOfTrucks).toBe(79);
    expect(written().autoLiabilityExpiry).toEqual(new Date("2027-09-01"));
    expect(Object.values(written()).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });

  it("a non-number is a 400 naming the field, and nothing is written", async () => {
    const r = await patch({ safetyScore: "abc" });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("safetyScore");
    expect(p.carrierProfile.update).not.toHaveBeenCalled();
  });

  it("an invalid date is a 400 naming the field", async () => {
    const r = await patch({ insuranceExpiry: "not-a-date" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("insuranceExpiry");
    expect(p.carrierProfile.update).not.toHaveBeenCalled();
  });

  it("an unknown field is a 400", async () => {
    const r = await patch({ autoLiabilityPolicy: "X", favouriteColour: "gold" });
    expect(r.status).toBe(400);
    expect(p.carrierProfile.update).not.toHaveBeenCalled();
  });

  it("an insurance-only save leaves the agent fields untouched", async () => {
    const r = await patch({ autoLiabilityPolicy: "TINCA2743700-26" });
    expect(r.status).toBe(200);
    expect(Object.keys(written())).toEqual(["autoLiabilityPolicy"]);
  });
});

describe("the handler coerces without the schema in front of it", () => {
  const call = (body: object) => updateCarrier(
    { body, params: { id: "cp-1" }, user: { id: "u-admin", role: "ADMIN" }, query: {}, headers: {} } as any,
    { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any);

  it("\"\" becomes null for safetyScore, numberOfTrucks and insuranceExpiry", async () => {
    await call({ safetyScore: "", numberOfTrucks: "", insuranceExpiry: "" });
    expect(written()).toMatchObject({ safetyScore: null, numberOfTrucks: null, insuranceExpiry: null });
  });

  it("NaN and an invalid date throw a FieldError before any write", async () => {
    await expect(call({ workersCompAmount: "1,000,000" })).rejects.toBeInstanceOf(FieldError);
    await expect(call({ cargoInsuranceExpiry: "31/31/2026" })).rejects.toBeInstanceOf(FieldError);
    expect(p.carrierProfile.update).not.toHaveBeenCalled();
  });
});

describe("the carrier-side insurance save (PATCH /carrier-compliance/insurance)", () => {
  it("a non-number amount is refused, not written as NaN", async () => {
    const router = (await import("../../../src/routes/carrierCompliance")).default as any;
    const layer = router.stack.find((l: any) => l.route?.path === "/insurance" && l.route.methods.patch);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    p.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1" });
    // Called bare, the error arrives as a rejection or via next(), depending on
    // whether express-async-errors wrapped this layer. Either is a FieldError.
    let caught: unknown;
    try {
      await handler({ body: { cargoInsuranceAmount: "abc" }, user: { id: "u-1", role: "CARRIER" } },
        { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, (e: unknown) => { caught = e; });
    } catch (e) { caught = e; }
    await new Promise((d) => setImmediate(d));
    expect(caught).toBeInstanceOf(FieldError);
    expect(p.carrierProfile.update).not.toHaveBeenCalled();
  });
});
