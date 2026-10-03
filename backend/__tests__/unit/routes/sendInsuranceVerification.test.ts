/**
 * coi-verify-email-fix C1c — POST /api/carriers/:id/send-insurance-verification,
 * the AE's explicit Send verification. Real router, real service. Only prisma,
 * auth and fetch are stubbed.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const priorKey = vi.hoisted(() => {
  const prior = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  return prior;
});

import { prisma } from "../../../src/config/database";

const p = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      const role = String(req.headers["x-test-role"]);
      req.user = { id: `u-${role.toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});

const JETEX = "cmublocyz00flh02dhyvwqwky";
const fetchSpy = vi.fn();
let a: express.Express;

// The full carriers router is slow to import; build the app once.
beforeAll(async () => {
  const carriers = (await import("../../../src/routes/carriers")).default;
  if (priorKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = priorKey;
  a = express();
  a.use(express.json());
  a.use("/api/carriers", carriers);
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: "em_1" }) });
  vi.stubGlobal("fetch", fetchSpy);
  p.auditLog.create = vi.fn().mockResolvedValue({});
  p.communication = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) };
  p.notification.create = vi.fn().mockResolvedValue({});
  p.user.findFirst.mockResolvedValue({ id: "admin-1" });
  p.user.findMany.mockResolvedValue([]);
  // C2c: the hold is a column (JetEx carries it from the migration), and the record
  // review must postdate the newest COI, so the fixture was reviewed after a day-old COI.
  p.document = { findFirst: vi.fn().mockResolvedValue({ createdAt: new Date(Date.now() - 86_400_000) }) };
  p.carrierProfile.findUnique.mockImplementation(async ({ where }: any) => ({
    id: where.id, companyName: "Acme Freight", mcNumber: "123456",
    insuranceReviewedAt: new Date(), agentEmailHoldUntil: where.id === JETEX ? new Date("9999-12-31T00:00:00Z") : null,
    insuranceAgentEmail: "agent@broker.test", insuranceAgencyName: "Agency",
    user: { firstName: "A", lastName: "B", email: "c@acme.test" },
  }));
});

const send = (id: string, role: string) =>
  request(a).post(`/api/carriers/${id}/send-insurance-verification`).set("x-test-role", role).send();
const auditRows = () => p.auditLog.create.mock.calls.map((c: any) => c[0].data)
  .filter((d: any) => d.action === "SEND_INSURANCE_VERIFICATION");

describe("Send verification", () => {
  it("an AE sends, and the audit row names actor, carrier and result", async () => {
    const r = await send("cp-1", "BROKER");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, emailId: "em_1" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(auditRows()).toEqual([expect.objectContaining({
      userId: "u-broker", entity: "Carrier", entityId: "cp-1",
      details: expect.objectContaining({ result: "SENT", status: 200 }),
    })]);
  });

  it("a carrier is refused and nothing is sent", async () => {
    const r = await send("cp-1", "CARRIER");
    expect(r.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a held carrier is refused with the reason and no clear date, and audited", async () => {
    const r = await send(JETEX, "ADMIN");
    expect(r.status).toBe(409);
    expect(r.body.reason).toMatch(/on hold/);
    expect(r.body.cooldownClearsAt).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auditRows()[0]).toMatchObject({ userId: "u-admin", entityId: JETEX, details: { result: "BLOCKED", status: 409 } });
  });

  it("inside the cooldown it is refused with the date the cooldown clears", async () => {
    const last = new Date("2026-10-02T11:30:00.000Z");
    p.communication.findFirst.mockResolvedValue({ createdAt: last });
    const r = await send("cp-1", "OPERATIONS");
    expect(r.status).toBe(409);
    expect(r.body.reason).toMatch(/14-day cooldown/);
    expect(r.body.cooldownClearsAt).toBe("2026-10-16T11:30:00.000Z");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
