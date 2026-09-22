/**
 * E3 (ruling 3, 2026-09-21) — the carrier signs from the portal, and asks for
 * a new link from the portal, through ONE mint.
 *
 * POST /carrier-loads/:id/rc-sign-link mints a fresh single-use token through
 * rotateRcSignToken (the function the AE's RESEND_RC path uses) and 303s to
 * the token page. POST /carrier-loads/:id/rc-sign-link/email mints the same
 * way and emails the link to the address ON FILE, never one from the body.
 * Both refuse unless the caller owns the load and their tender is RC_SENT,
 * both are limited to 3 mints per RC per hour, and every mint is an audit row
 * — which is also the counter the limit reads.
 *
 * Real router over HTTP, prisma mocked. The load-bearing assertions are about
 * what left the server and what was stored: the token in the Location header
 * is the one whose HASH the row was given (so the redirect carries the fresh
 * secret and nothing stored), and the token itself appears in no audit row.
 *
 * Adversarially verified at authoring: skipping the rotation and redirecting
 * to a fixed path turns the hash-matches case red; reading `req.body.email`
 * for the address turns the on-file case red; dropping the limit check turns
 * both 429 cases red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-carrier", email: "login@carrier.test", role: "CARRIER" };
      next();
    },
  };
});
vi.mock("../../../src/middleware/rateLimiters", () => ({
  uploadLimiter: (_r: any, _s: any, n: any) => n(),
  staffUploadLimiter: (_r: any, _s: any, n: any) => n(),
}));
const email = vi.hoisted(() => ({ sendEmail: vi.fn(async () => "msg-1") }));
vi.mock("../../../src/services/emailService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, sendEmail: email.sendEmail };
});

async function app() {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carrier-loads", carrierLoads);
  return a;
}

const sha = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

function arm(opts: { tender?: string | null; owner?: string; rcStatus?: string; mints?: number; contactEmail?: string | null; dead?: boolean } = {}) {
  const { tender = "RC_SENT", owner = "u-carrier", rcStatus = "SENT", mints = 0, contactEmail = "dispatch@carrier.test", dead = false } = opts;
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-1", referenceNumber: "R-1", loadNumber: "SRL-1", carrierId: owner,
    status: dead ? "CANCELLED" : "BOOKED", deletedAt: null,
  });
  mockPrisma.loadTender.findFirst.mockResolvedValue(tender ? { status: tender } : null);
  mockPrisma.rateConfirmation.findFirst.mockResolvedValue({ id: "rc-1", status: rcStatus, contentHash: "h" });
  mockPrisma.rateConfirmation.update.mockResolvedValue({});
  mockPrisma.auditLog.count.mockResolvedValue(mints);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.user.findUnique.mockResolvedValue({ email: "login@carrier.test", carrierProfile: { contactEmail } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /carrier-loads/:id/rc-sign-link — sign it here", () => {
  it("mints, stores the HASH, and 303s to the token page carrying the fresh secret", async () => {
    arm();
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link");
    expect(r.status).toBe(303);
    const loc = r.headers.location as string;
    expect(loc).toMatch(/^\/api\/rc-sign\/[0-9a-f]{64}$/);
    const token = loc.slice("/api/rc-sign/".length);

    const upd = mockPrisma.rateConfirmation.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "rc-1" });
    expect(upd.data.signTokenHash).toBe(sha(token));
    expect(upd.data.signTokenUsedAt).toBeNull();
    expect(upd.data.signTokenExpiresAt).toBeInstanceOf(Date);

    // One audit row per mint, naming the token ID and never the token.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ userId: "u-carrier", action: "RC_SIGN_LINK_MINTED", entity: "RateConfirmation", entityId: "rc-1" });
    expect(row.details).toMatchObject({ channel: "portal", signTokenId: upd.data.signTokenId, loadId: "load-1" });
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("not my load → 403 as a page, nothing minted", async () => {
    arm({ owner: "someone-else" });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link");
    expect(r.status).toBe(403);
    expect(r.type).toBe("text/html");
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
  });

  it("tender still ACCEPTED (nothing sent yet) → 409 'Nothing to sign yet', nothing minted", async () => {
    arm({ tender: "ACCEPTED" });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link");
    expect(r.status).toBe(409);
    expect(r.text).toMatch(/Nothing to sign yet/);
    expect(r.text).toMatch(/carrier\/dashboard\/my-loads\?load=load-1/);
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("tender CONFIRMED → 409 'already signed', nothing minted", async () => {
    arm({ tender: "CONFIRMED" });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link");
    expect(r.status).toBe(409);
    expect(r.text).toMatch(/already signed|is signed/i);
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
  });

  it("a cancelled load → 409, nothing minted", async () => {
    arm({ dead: true });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link");
    expect(r.status).toBe(409);
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
  });

  it("the 4th mint in an hour is 429, nothing minted, nothing recorded", async () => {
    arm({ mints: 3 });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link");
    expect(r.status).toBe(429);
    expect(r.text).toMatch(/Too many signing links/);
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    // The counter is the audit table, scoped to THIS rc and the last hour.
    const where = mockPrisma.auditLog.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ entity: "RateConfirmation", entityId: "rc-1", action: "RC_SIGN_LINK_MINTED" });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});

describe("POST /carrier-loads/:id/rc-sign-link/email — email me a new link", () => {
  it("mints and sends to the address ON FILE — never to one in the body", async () => {
    arm();
    const r = await request(await app())
      .post("/api/carrier-loads/load-1/rc-sign-link/email")
      .send({ email: "attacker@evil.test", to: "attacker@evil.test" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, sentTo: "dispatch@carrier.test" });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = email.sendEmail.mock.calls[0] as any[];
    expect(to).toBe("dispatch@carrier.test");
    expect(subject).toMatch(/SRL-1/);
    // The link in the email is the one whose hash was stored.
    const m = html.match(/\/api\/rc-sign\/([0-9a-f]{64})/);
    expect(m).toBeTruthy();
    expect(mockPrisma.rateConfirmation.update.mock.calls[0][0].data.signTokenHash).toBe(sha(m![1]));
    // Audit row: channel email, sentTo on file, no token.
    const row = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(row.details).toMatchObject({ channel: "email", sentTo: "dispatch@carrier.test" });
    expect(JSON.stringify(row)).not.toContain(m![1]);
    expect(JSON.stringify(email.sendEmail.mock.calls)).not.toContain("attacker");
  });

  it("falls back to the login email when no contact email is on file", async () => {
    arm({ contactEmail: null });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link/email").send({});
    expect(r.status).toBe(200);
    expect(r.body.sentTo).toBe("login@carrier.test");
  });

  it("a send failure is 502 and the mint is NOT counted (no audit row)", async () => {
    arm();
    email.sendEmail.mockRejectedValueOnce(new Error("resend down"));
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link/email").send({});
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("EMAIL_SEND_FAILED");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("the 4th mint in an hour is 429 JSON, nothing sent", async () => {
    arm({ mints: 3 });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link/email").send({});
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("SIGN_LINK_RATE_LIMITED");
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
  });

  it("refuses like the portal route when the RC is not out yet", async () => {
    arm({ tender: "ACCEPTED" });
    const r = await request(await app()).post("/api/carrier-loads/load-1/rc-sign-link/email").send({});
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("RC_NOT_SENT");
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

describe("the AE send path mints through the same function", () => {
  it("sendRateConfirmation calls rotateRcSignToken and no longer writes token fields itself", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/controllers/rateConfirmationController.ts"), "utf8");
    expect(src).toContain("await rotateRcSignToken(rc.id)");
    expect(src).not.toMatch(/signTokenHash\s*:/);
    expect(src).not.toContain("mintRcSignToken(");
  });
});
