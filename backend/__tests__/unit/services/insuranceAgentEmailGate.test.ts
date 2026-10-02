import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The service reads the key at import. Without it every send returns early,
// and the cron test below passed with the hold deleted (first injection).
const priorKey = vi.hoisted(() => {
  const prior = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  return prior;
});

import { prisma } from "../../../src/config/database";
import {
  AGENT_EMAIL_HOLD,
  agentEmailBlock,
  sendInsuranceVerificationEmail,
  checkExpiringInsurance,
} from "../../../src/services/insuranceVerificationService";

// The service has captured the key; give the worker its environment back.
if (priorKey === undefined) delete process.env.RESEND_API_KEY;
else process.env.RESEND_API_KEY = priorKey;

// coi-verify-email-fix C1: every agent email passes a per-carrier hold and a
// 14-day cooldown, whichever path asks for it.

const JETEX = "cmublocyz00flh02dhyvwqwky";
const p = prisma as any;
const fetchSpy = vi.fn().mockResolvedValue({ ok: false, text: async () => "stubbed" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchSpy);
  p.communication = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() };
  p.carrierProfile.findUnique = vi.fn().mockResolvedValue({
    id: "c1", companyName: "Acme", insuranceAgentEmail: "agent@broker.test",
    user: { firstName: "A", lastName: "B", email: "c@acme.test" },
  });
});

describe("agent-email hold", () => {
  it("JetEx is held", () => {
    expect(AGENT_EMAIL_HOLD.has(JETEX)).toBe(true);
  });

  it("a held carrier is refused before any send", async () => {
    p.carrierProfile.findUnique.mockResolvedValue({
      id: JETEX, insuranceAgentEmail: "Texarkana@mcgriff.com", user: {},
    });
    const out = await sendInsuranceVerificationEmail(JETEX);
    expect(out).toMatchObject({ sent: false });
    expect(String((out as any).reason)).toMatch(/on hold/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("14-day cooldown", () => {
  it("an agent email inside 14 days blocks the next one", async () => {
    p.communication.findFirst.mockResolvedValue({ createdAt: new Date() });
    const out = await sendInsuranceVerificationEmail("c1");
    expect(out).toMatchObject({ sent: false });
    expect(String((out as any).reason)).toMatch(/14-day cooldown/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("looks back 14 days, by source tag or by agent address", async () => {
    expect(await agentEmailBlock("c1", "agent@broker.test")).toBeNull();
    const where = p.communication.findFirst.mock.calls[0][0].where;
    const days = (Date.now() - where.createdAt.gte.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(14);
    expect(where.entityId).toBe("c1");
    expect(where.OR).toEqual([
      { metadata: { path: ["source"], equals: "InsuranceVerification" } },
      { to: { equals: "agent@broker.test", mode: "insensitive" } },
    ]);
  });
});

describe("the expiry cron honours the gate", () => {
  it("a held carrier at 7 days sends nothing and counts nothing", async () => {
    const expiry = new Date(Date.now() + 6.5 * 86_400_000);
    p.carrierProfile.findMany = vi.fn().mockResolvedValue([{
      id: JETEX, companyName: "JETEX FREIGHT LLC", insuranceAgentEmail: "Texarkana@mcgriff.com",
      cargoInsuranceExpiry: expiry, user: {},
    }]);
    p.carrierProfile.findUnique.mockResolvedValue({ id: JETEX, insuranceAgentEmail: "Texarkana@mcgriff.com", user: {} });
    p.user.findMany = vi.fn().mockResolvedValue([]);
    const out = await checkExpiringInsurance();
    expect(out.remindersSent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("D4 copy", () => {
  it("the email does not claim the carrier operates under SRL's authority", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/services/insuranceVerificationService.ts"), "utf8");
    expect(/brokerage authority/i.test(src)).toBe(false);
  });
});
