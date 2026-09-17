/**
 * B1c-1 (2026-09-17) — an admin can unenroll a carrier's authenticator, and
 * only through the loud door.
 *
 * Self-service disable is refused for carriers (bce), so a lost phone needs a
 * human exit. This is it: ADMIN/CEO, a fresh step-up minted from the admin's
 * OWN authenticator, a reason that becomes the audit note, one update that
 * clears all three TOTP columns, and an MFA_RESET row the Audit Log reads.
 *
 * Both routers are the real ones. The step-up token is minted through the
 * real POST /api/auth/step-up rather than the lib, so the chain that matters
 * — mint for user A + action X, spend on route Y as user A — is what runs.
 *
 * Adversarially verified at authoring: removing requireStepUp from the route
 * turns the no-token case red; pointing disableTotp at req.user!.id turns the
 * "clears the CARRIER, not the admin" case red; dropping the recordSecurityEvent
 * call turns the audit-row case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { mintStepUpToken } from "../../../src/lib/stepUpToken";

const mockPrisma = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) {
        res.status(401).json({ error: "No token provided" });
        return;
      }
      req.user = { id: `u-${String(role).toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});
const totp = {
  generateTotpSetup: vi.fn(),
  verifyTotpCode: vi.fn(),
  enableTotp: vi.fn(),
  disableTotp: vi.fn(),
  issueBackupCodes: vi.fn(),
  isTotpEnabled: vi.fn(),
};
vi.mock("../../../src/services/totpService", () => totp);

const CARRIER_PROFILE = "cp-1";
const CARRIER_USER = "u-carrier-1";

async function app() {
  const auth = (await import("../../../src/routes/auth")).default;
  const carriers = (await import("../../../src/routes/carriers")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/auth", auth);
  a.use("/api/carriers", carriers);
  return a;
}
const securityRows = () =>
  mockPrisma.auditLog.create.mock.calls.map((c: any) => c[0].data).filter((d: any) => d.entity === "Security");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create = vi.fn().mockResolvedValue({});
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: CARRIER_PROFILE, user: { id: CARRIER_USER, totpEnabled: true } });
  totp.verifyTotpCode.mockResolvedValue(true);
  totp.disableTotp.mockResolvedValue(undefined);
});

async function mintAsAdmin(a: express.Express, action = "mfa-reset") {
  const r = await request(a).post("/api/auth/step-up").set("x-test-role", "ADMIN").send({ code: "123456", action });
  expect(r.status).toBe(200);
  return r.body.stepUpToken as string;
}
const reset = (a: express.Express, role: string, token?: string, body: object = { reason: "Carrier lost the phone; identity confirmed by phone call" }) => {
  const q = request(a).post(`/api/carriers/${CARRIER_PROFILE}/mfa-reset`).set("x-test-role", role);
  return (token ? q.set("x-step-up-token", token) : q).send(body);
};

describe("the loud door", () => {
  it("without a step-up token the reset is refused, names the remedy, and clears nothing", async () => {
    const a = await app();
    const r = await reset(a, "ADMIN");
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "STEP_UP_REQUIRED", action: "mfa-reset" });
    expect(totp.disableTotp).not.toHaveBeenCalled();
    expect(securityRows()).toHaveLength(0);
  });

  it("with a step-up minted through the real /auth/step-up it clears the CARRIER, not the admin, and writes MFA_RESET", async () => {
    const a = await app();
    const token = await mintAsAdmin(a);
    const r = await reset(a, "ADMIN", token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, userId: CARRIER_USER });
    expect(totp.disableTotp).toHaveBeenCalledTimes(1);
    expect(totp.disableTotp).toHaveBeenCalledWith(CARRIER_USER);
    const rows = securityRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: CARRIER_USER,
      action: "MFA_RESET",
      changes: "Carrier lost the phone; identity confirmed by phone call",
      details: { by: "u-admin", carrierProfileId: CARRIER_PROFILE },
    });
  });

  it("CEO may; CARRIER, BROKER and OPERATIONS may not, even holding a token", async () => {
    const a = await app();
    for (const role of ["CARRIER", "BROKER", "OPERATIONS"]) {
      const r = await reset(a, role, mintStepUpToken(`u-${role.toLowerCase()}`, "mfa-reset"));
      expect(r.status, role).toBe(403);
    }
    expect(totp.disableTotp).not.toHaveBeenCalled();
    const ceo = await reset(a, "CEO", mintStepUpToken("u-ceo", "mfa-reset"));
    expect(ceo.status).toBe(200);
  });

  it("a token minted for another action, or for another user, opens nothing", async () => {
    const a = await app();
    const wrongAction = await reset(a, "ADMIN", mintStepUpToken("u-admin", "quickpay-election"));
    expect(wrongAction.status).toBe(403);
    const wrongUser = await reset(a, "ADMIN", mintStepUpToken("u-ceo", "mfa-reset"));
    expect(wrongUser.status).toBe(403);
    expect(totp.disableTotp).not.toHaveBeenCalled();
  });

  it("a carrier with no authenticator is a 409, not a silent no-op", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: CARRIER_PROFILE, user: { id: CARRIER_USER, totpEnabled: false } });
    const a = await app();
    const r = await reset(a, "ADMIN", await mintAsAdmin(a));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("TOTP_NOT_ENABLED");
    expect(totp.disableTotp).not.toHaveBeenCalled();
    expect(securityRows()).toHaveLength(0);
  });

  it("a reason under 10 characters is refused before anything is touched", async () => {
    const a = await app();
    const r = await reset(a, "ADMIN", await mintAsAdmin(a), { reason: "lost it" });
    expect(r.status).toBe(400);
    expect(totp.disableTotp).not.toHaveBeenCalled();
    expect(securityRows()).toHaveLength(0);
  });
});

describe("the staff step-up mint", () => {
  it("refuses a wrong code and refuses a carrier", async () => {
    const a = await app();
    totp.verifyTotpCode.mockResolvedValue(false);
    const bad = await request(a).post("/api/auth/step-up").set("x-test-role", "ADMIN").send({ code: "000000", action: "mfa-reset" });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe("TOTP_CODE_INVALID");
    totp.verifyTotpCode.mockResolvedValue(true);
    const carrier = await request(a).post("/api/auth/step-up").set("x-test-role", "CARRIER").send({ code: "123456", action: "mfa-reset" });
    expect(carrier.status).toBe(403);
  });
});

describe("MFA_RESET has exactly one writer", () => {
  it("only /carriers/:id/mfa-reset records it — the retired carrier self-disable must not come back", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) ? [path.join(d, e.name)] : [],
      );
    const root = path.join(__dirname, "../../../src");
    const files = walk(root);
    expect(files.length).toBeGreaterThan(100);
    const writers = files.filter((f) => fs.readFileSync(f, "utf8").includes('action: "MFA_RESET"'));
    expect(writers.map((f) => path.relative(root, f).replace(/\\/g, "/"))).toEqual(["routes/carriers.ts"]);
  });
});
