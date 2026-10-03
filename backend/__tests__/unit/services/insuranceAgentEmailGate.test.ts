import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The service reads the key at import. Without it every send returns early,
// and the cron test below passed with the hold deleted (first injection, C1a).
const priorKey = vi.hoisted(() => {
  const prior = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  return prior;
});

import { prisma } from "../../../src/config/database";
import {
  agentEmailBlock,
  sendInsuranceVerificationEmail,
  checkExpiringInsurance,
} from "../../../src/services/insuranceVerificationService";

// The service has captured the key; give the worker its environment back.
if (priorKey === undefined) delete process.env.RESEND_API_KEY;
else process.env.RESEND_API_KEY = priorKey;

// coi-verify-email-fix C1 + C2c: every agent email passes a hold
// (agentEmailHoldUntil), a stale-record check (insuranceReviewedAt vs the
// newest COI) and a 14-day cooldown, whichever path asks for it.

const p = prisma as any;
const fetchSpy = vi.fn().mockResolvedValue({ ok: false, text: async () => "stubbed" });
const DAY = 86_400_000;
const now = Date.now();
const FRESH = { id: "c1", insuranceAgentEmail: "agent@broker.test", agentEmailHoldUntil: null, insuranceReviewedAt: new Date(now - DAY) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchSpy);
  p.communication = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() };
  p.document = { findFirst: vi.fn().mockResolvedValue({ createdAt: new Date(now - 2 * DAY) }) };
  p.carrierProfile.findUnique = vi.fn().mockResolvedValue({ ...FRESH, companyName: "Acme", user: { firstName: "A", lastName: "B", email: "c@acme.test" } });
});

describe("hold (agentEmailHoldUntil)", () => {
  it("a hold in the future blocks, before anything is sent", async () => {
    p.carrierProfile.findUnique.mockResolvedValue({ ...FRESH, agentEmailHoldUntil: new Date(now + DAY), user: {} });
    const out = await sendInsuranceVerificationEmail("c1");
    expect(out).toMatchObject({ sent: false });
    expect(String((out as any).reason)).toMatch(/on hold until 20/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the far-future hold (JetEx) reads 'until lifted' and has no clear date", async () => {
    const b = await agentEmailBlock({ ...FRESH, agentEmailHoldUntil: new Date("9999-12-31T00:00:00Z") });
    expect(b).toEqual({ reason: "agent email on hold until lifted", clearsAt: null });
  });

  it("a hold in the past does not block", async () => {
    expect(await agentEmailBlock({ ...FRESH, agentEmailHoldUntil: new Date(now - DAY) })).toBeNull();
  });
});

describe("stale record (insuranceReviewedAt vs the newest COI)", () => {
  it("a record no AE has reviewed is stale", async () => {
    const b = await agentEmailBlock({ ...FRESH, insuranceReviewedAt: null });
    expect(b?.reason).toMatch(/not reviewed by an AE/);
  });

  it("a review older than the newest COI upload is stale, and nothing is sent", async () => {
    p.document.findFirst.mockResolvedValue({ createdAt: new Date(now) });
    p.carrierProfile.findUnique.mockResolvedValue({ ...FRESH, user: {} });
    const out = await sendInsuranceVerificationEmail("c1");
    expect(String((out as any).reason)).toMatch(/predates the latest COI/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a review newer than the newest COI passes, and the COI looked up is this carrier's COI", async () => {
    expect(await agentEmailBlock(FRESH)).toBeNull();
    expect(p.document.findFirst.mock.calls[0][0].where).toEqual({ entityType: "CARRIER", entityId: "c1", docType: "COI" });
  });
});

describe("14-day cooldown", () => {
  it("an agent email inside 14 days blocks the next one", async () => {
    p.communication.findFirst.mockResolvedValue({ createdAt: new Date() });
    const out = await sendInsuranceVerificationEmail("c1");
    expect(String((out as any).reason)).toMatch(/14-day cooldown/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("looks back 14 days, by source tag or by agent address", async () => {
    expect(await agentEmailBlock(FRESH)).toBeNull();
    const where = p.communication.findFirst.mock.calls[0][0].where;
    expect(Math.round((now - where.createdAt.gte.getTime()) / DAY)).toBe(14);
    expect(where.entityId).toBe("c1");
    expect(where.OR).toEqual([
      { metadata: { path: ["source"], equals: "InsuranceVerification" } },
      { to: { equals: "agent@broker.test", mode: "insensitive" } },
    ]);
  });
});

describe("the expiry cron honours the gate", () => {
  it("a held carrier at 7 days sends nothing and counts nothing", async () => {
    const held = { ...FRESH, id: "cmublocyz00flh02dhyvwqwky", agentEmailHoldUntil: new Date("9999-12-31T00:00:00Z"), user: {} };
    p.carrierProfile.findMany = vi.fn().mockResolvedValue([{ ...held, companyName: "JETEX FREIGHT LLC", cargoInsuranceExpiry: new Date(now + 6.5 * DAY) }]);
    p.carrierProfile.findUnique.mockResolvedValue(held);
    p.user.findMany = vi.fn().mockResolvedValue([]);
    const out = await checkExpiringInsurance();
    expect(out.remindersSent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("D4 copy", () => {
  it("the email does not claim the carrier operates under SRL's authority", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/services/insuranceVerificationService.ts"), "utf8");
    expect(/brokerage authority/i.test(src)).toBe(false);
  });
});
