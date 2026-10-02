import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// coi-verify-email-fix C1b: saving insurance fields sends no agent email, from
// either portal. Agent email goes out at registration, from the expiry cron,
// or from the AE's explicit Send verification.

const sends = vi.hoisted(() => ({
  maybe: vi.fn().mockResolvedValue({ sent: true }),
  direct: vi.fn().mockResolvedValue({ sent: true }),
}));
vi.mock("../../../src/services/insuranceVerificationService", async (orig) => ({
  ...(await orig<typeof import("../../../src/services/insuranceVerificationService")>()),
  maybeSendInsuranceVerificationEmail: sends.maybe,
  sendInsuranceVerificationEmail: sends.direct,
}));
vi.mock("../../../src/lib/loginFlags", () => ({ flagSensitiveActionAfterNewLogin: vi.fn() }));
vi.mock("../../../src/services/tierService", () => ({
  calculateTier: vi.fn().mockReturnValue("SILVER"),
  getBonusPercentage: vi.fn().mockReturnValue(2),
}));
vi.mock("../../../src/services/integrationService", () => ({ onCarrierApproved: vi.fn() }));
vi.mock("../../../src/services/storageService", () => ({ uploadFile: vi.fn() }));

import { updateCarrier } from "../../../src/controllers/carrierController";
import carrierComplianceRouter from "../../../src/routes/carrierCompliance";

const p = prisma as any;
const fetchSpy = vi.fn();

// The insurance and agent fields an AE or carrier would save from a COI.
const INSURANCE_SAVE = {
  autoLiabilityProvider: "MS Transverse", autoLiabilityPolicy: "TINCA2743700-26", autoLiabilityAmount: 1000000,
  generalLiabilityPolicy: "VBB249734", insuranceAgentEmail: "agent@broker.test",
  insuranceAgentName: "Agent", insuranceAgentPhone: "555", insuranceAgencyName: "Agency",
};
const SAVED = { id: "cp-1", companyName: "Acme", ...INSURANCE_SAVE };

function res() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}
function expectNoSend() {
  expect(sends.maybe).not.toHaveBeenCalled();
  expect(sends.direct).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchSpy);
  p.$transaction.mockImplementation(async (cb: any) => cb(p));
  p.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1" });
  p.carrierProfile.update.mockResolvedValue(SAVED);
});

describe("saving insurance sends no agent email", () => {
  it("AE save (PUT /carriers/:id → updateCarrier)", async () => {
    const r = res();
    await updateCarrier({ body: { ...INSURANCE_SAVE }, params: { id: "cp-1" }, user: { id: "a-1", role: "ADMIN" }, query: {}, headers: {} } as any, r);
    expect(p.carrierProfile.update).toHaveBeenCalled();
    await new Promise((d) => setImmediate(d));
    expectNoSend();
  });

  it("carrier save (PATCH /carrier-compliance/insurance)", async () => {
    const layer = (carrierComplianceRouter as any).stack.find(
      (l: any) => l.route?.path === "/insurance" && l.route.methods.patch);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    const r = res();
    await handler({ body: { ...INSURANCE_SAVE }, user: { id: "u-1", role: "CARRIER" } } as any, r);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Insurance details updated" }));
    await new Promise((d) => setImmediate(d));
    expectNoSend();
  });
});
