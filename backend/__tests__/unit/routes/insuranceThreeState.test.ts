/**
 * coi-verify-email-fix C2b — endorsements are three-state end to end, the new
 * insurer / NAIC / workers' comp fields save through the strict schema, and the
 * agent email shows the insurer, the three states and WC as statutory + EL.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import "express-async-errors";
import request from "supertest";

const priorKey = vi.hoisted(() => {
  const prior = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  return prior;
});

import { prisma } from "../../../src/config/database";
import { errorHandler } from "../../../src/middleware/errorHandler";
import { sendInsuranceVerificationEmail } from "../../../src/services/insuranceVerificationService";

if (priorKey === undefined) delete process.env.RESEND_API_KEY;
else process.env.RESEND_API_KEY = priorKey;

const p = prisma as any;
vi.setConfig({ testTimeout: 30_000 });
vi.mock("../../../src/middleware/auth", async (orig) => ({
  ...((await orig()) as any),
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: "u-admin", email: "a@srl.invalid", role: "ADMIN" }; next(); },
}));

let a: express.Express;
beforeAll(async () => {
  a = express();
  a.use(express.json());
  a.use("/api/carrier", (await import("../../../src/routes/carrier")).default);
  a.use(errorHandler as any);
}, 60_000);

const fetchSpy = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  p.$transaction.mockImplementation(async (cb: any) => cb(p));
  p.carrierProfile.update.mockImplementation(async ({ data }: any) => ({ id: "cp-1", ...data }));
  p.auditLog.create = vi.fn().mockResolvedValue({});
  p.errorLog = { create: vi.fn().mockResolvedValue({}) };
  p.communication = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) };
  p.notification.create = vi.fn().mockResolvedValue({});
  p.user.findFirst.mockResolvedValue({ id: "admin-1" });
  p.user.findMany.mockResolvedValue([]);
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: "em_1" }) });
  vi.stubGlobal("fetch", fetchSpy);
});

const written = () => p.carrierProfile.update.mock.calls[0]?.[0].data;
// What the save wrote, minus the record stamp (C2c), which the next block asserts on its own.
const fields = () => { const { insuranceReviewedAt: _stamp, ...rest } = written(); return rest; };
const patch = (body: object) => request(a).patch("/api/carrier/cp-1").send(body);

describe("AE save: endorsements are three-state", () => {
  it("null stays null — it is not collapsed to false", async () => {
    const r = await patch({ additionalInsuredSRL: null, waiverOfSubrogation: null, thirtyDayCancellationNotice: null });
    expect(r.status).toBe(200);
    expect(fields()).toEqual({ additionalInsuredSRL: null, waiverOfSubrogation: null, thirtyDayCancellationNotice: null });
  });

  it("true and false are kept as given; anything else is a 400", async () => {
    expect((await patch({ additionalInsuredSRL: true, waiverOfSubrogation: false })).status).toBe(200);
    expect(fields()).toEqual({ additionalInsuredSRL: true, waiverOfSubrogation: false });
    expect((await patch({ thirtyDayCancellationNotice: "maybe" })).status).toBe(400);
  });
});

describe("AE save: the new fields go through the strict schema", () => {
  const NEW = {
    autoLiabilityInsurerName: "MS Transverse", autoLiabilityInsurerNaic: "21075",
    generalLiabilityInsurerName: "Covington Specialty", generalLiabilityInsurerNaic: "13027",
    cargoInsuranceInsurerName: "Continental Casualty", cargoInsuranceInsurerNaic: "20443",
    workersCompInsurerName: "Texas Mutual", workersCompInsurerNaic: "22945",
    workersCompStatutory: true, workersCompElEachAccident: "1000000",
    workersCompElDiseaseEachEmployee: "1000000", workersCompElDiseasePolicyLimit: "1000000",
  };

  it("all twelve save, EL limits as numbers", async () => {
    const r = await patch(NEW);
    expect(r.status).toBe(200);
    expect(fields()).toEqual({ ...NEW, workersCompElEachAccident: 1000000, workersCompElDiseaseEachEmployee: 1000000, workersCompElDiseasePolicyLimit: 1000000 });
  });

  it("an EL limit that is not a number is a 400 naming it", async () => {
    const r = await patch({ workersCompElEachAccident: "a million" });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("workersCompElEachAccident");
  });
});

describe("carrier save: confirms, never records 'not provided'", () => {
  it("true writes true; false writes nothing", async () => {
    const router = (await import("../../../src/routes/carrierCompliance")).default as any;
    const layer = router.stack.find((l: any) => l.route?.path === "/insurance" && l.route.methods.patch);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    p.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await handler({ body: { additionalInsuredSRL: true, waiverOfSubrogation: false, autoLiabilityPolicy: "X" }, user: { id: "u-1", role: "CARRIER" } }, res, () => {});
    expect(written()).toMatchObject({ additionalInsuredSRL: true, autoLiabilityPolicy: "X" });
    expect(written()).not.toHaveProperty("waiverOfSubrogation");
  });
});

describe("agent email", () => {
  async function render(over: Record<string, unknown>) {
    p.carrierProfile.findUnique.mockResolvedValue({
      id: "cp-1", companyName: "Acme", mcNumber: "1", insuranceAgentEmail: "agent@broker.test", insuranceAgencyName: "Agency",
      insuranceReviewedAt: new Date(), user: { firstName: "A", lastName: "B", email: "c@acme.test" },
      autoLiabilityInsurerName: "MS Transverse", autoLiabilityInsurerNaic: "21075", autoLiabilityAmount: 1000000,
      workersCompAmount: 1000000, workersCompStatutory: true,
      workersCompElEachAccident: 1000000, workersCompElDiseaseEachEmployee: 1000000, workersCompElDiseasePolicyLimit: 1000000,
      additionalInsuredSRL: true, waiverOfSubrogation: false, thirtyDayCancellationNotice: null,
      ...over,
    });
    p.document = { findFirst: vi.fn().mockResolvedValue(null) };
    await sendInsuranceVerificationEmail("cp-1");
    return JSON.parse(fetchSpy.mock.calls[0][1].body).html as string;
  }

  it("names the insurer and NAIC per policy, under an Insurer column", async () => {
    const html = await render({});
    expect(html).toContain("MS Transverse (NAIC 21075)");
    expect(html).toContain(">Insurer</th>");
    expect(html).not.toContain(">Provider</th>");
  });

  it("shows the three states as words", async () => {
    const html = await render({});
    expect(html).toContain("SRL as Additional Insured: Confirmed");
    expect(html).toContain("Waiver of Subrogation: Not provided");
    expect(html).toContain("30-day Cancellation Notice: Not stated");
  });

  it("shows workers' comp as statutory with its EL limits, not as a dollar limit", async () => {
    const html = await render({});
    expect(html).toContain("Statutory · EL $1,000,000 / $1,000,000 / $1,000,000");
  });
});

// coi-verify-email-fix C2c + O3: an AE insurance save is the review (insuranceReviewedAt),
// and a carrier save that changes the record un-reviews it.
describe("insuranceReviewedAt", () => {
  it("an AE insurance save stamps it", async () => {
    const before = Date.now();
    expect((await patch({ autoLiabilityPolicy: "TINCA2743700-26" })).status).toBe(200);
    expect(written().insuranceReviewedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("a profile-only AE save does not", async () => {
    expect((await patch({ tier: "GOLD" })).status).toBe(200);
    expect(written()).not.toHaveProperty("insuranceReviewedAt");
  });

  async function carrierSave(stored: Record<string, unknown>, body: Record<string, unknown>) {
    const router = (await import("../../../src/routes/carrierCompliance")).default as any;
    const layer = router.stack.find((l: any) => l.route?.path === "/insurance" && l.route.methods.patch);
    p.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1", ...stored });
    await layer.route.stack[layer.route.stack.length - 1].handle(
      { body, user: { id: "u-1", role: "CARRIER" } },
      { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, () => {});
  }

  it("a carrier save that changes the record clears it (null), never stamps it", async () => {
    await carrierSave({ cargoInsurancePolicy: "OLD-1" }, { cargoInsurancePolicy: "IM6079611149" });
    expect(written().insuranceReviewedAt).toBeNull();
  });

  it("a carrier re-save of identical values leaves the review alone", async () => {
    await carrierSave({ cargoInsurancePolicy: "IM6079611149" }, { cargoInsurancePolicy: "IM6079611149" });
    expect(written()).not.toHaveProperty("insuranceReviewedAt");
  });
});
