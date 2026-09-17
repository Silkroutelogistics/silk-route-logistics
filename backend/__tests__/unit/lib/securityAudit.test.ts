/**
 * B2 (2026-09-17) — MFA events reach the Audit Log.
 *
 * Three properties. The recorder writes the row the Audit Log page reads
 * (audit_logs, entity "Security") and never throws. The AE enrollment route
 * actually calls it — proven by mounting the real /api/auth router. And the
 * carrier routes are wired at the right sites with the right actions, read
 * from source because that router drags Resend and OpenPhone into a mount.
 *
 * Adversarially verified at authoring: making the recorder rethrow turns the
 * never-throws case red; removing the call from /auth/totp/verify turns the
 * behavioural case red; dropping `email:` from one authenticated carrier
 * logAuthEvent call turns the auth_events case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { recordSecurityEvent, SECURITY_ENTITY } from "../../../src/lib/securityAudit";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create = vi.fn().mockResolvedValue({});
  totp.verifyTotpCode.mockResolvedValue(true);
});

describe("the recorder", () => {
  it("writes the row the Audit Log page reads", async () => {
    await recordSecurityEvent({
      userId: "u-1",
      action: "MFA_ENROLLED",
      note: "Authenticator app enrolled",
      req: { ip: "203.0.113.9", headers: { "user-agent": "Chrome/129" } },
      details: { method: "TOTP", path: "carrier" },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: "u-1",
      action: "MFA_ENROLLED",
      entity: SECURITY_ENTITY,
      changes: "Authenticator app enrolled",
      ipAddress: "203.0.113.9",
      userAgent: "Chrome/129",
      details: { method: "TOTP", path: "carrier" },
    });
  });

  it("never throws — recording an act must not be able to prevent it", async () => {
    mockPrisma.auditLog.create = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(recordSecurityEvent({ userId: "u-1", action: "MFA_RESET", note: "x" })).resolves.toBeUndefined();
  });
});

describe("the AE enrollment route records MFA_ENROLLED (real router)", () => {
  it("POST /api/auth/totp/verify with a valid code writes exactly one Security row", async () => {
    const auth = (await import("../../../src/routes/auth")).default;
    const a = express();
    a.use(express.json());
    a.use("/api/auth", auth);
    const res = await request(a).post("/api/auth/totp/verify").set("x-test-role", "BROKER").send({ code: "123456" });
    expect(res.status).toBe(200);
    const rows = mockPrisma.auditLog.create.mock.calls.map((c: any) => c[0].data).filter((d: any) => d.entity === SECURITY_ENTITY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u-broker", action: "MFA_ENROLLED", details: { path: "staff" } });
  });

  it("a rejected code writes no Security row", async () => {
    totp.verifyTotpCode.mockResolvedValue(false);
    const auth = (await import("../../../src/routes/auth")).default;
    const a = express();
    a.use(express.json());
    a.use("/api/auth", auth);
    const res = await request(a).post("/api/auth/totp/verify").set("x-test-role", "BROKER").send({ code: "000000" });
    expect(res.status).toBe(400);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("the carrier routes are wired (read from source)", () => {
  // Line-first comment stripping: a "//" inside a block comment must not
  // swallow the rest of the file, so line comments go before block comments.
  const strip = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
  const src = strip(fs.readFileSync(path.join(__dirname, "../../../src/routes/carrierAuth.ts"), "utf8"));
  const between = (from: string, to: string) => {
    const a = src.indexOf(from);
    expect(a, `anchor ${from}`).toBeGreaterThan(0);
    const b = src.indexOf(to, a + 1);
    expect(b, `anchor ${to}`).toBeGreaterThan(a);
    return src.slice(a, b);
  };

  it("enrollment success at /totp/confirm records MFA_ENROLLED, and failure records MFA_CHALLENGE_FAILED", () => {
    const block = between('"/totp/confirm"', "router.post(");
    expect(block).toContain('action: "MFA_ENROLLED"');
    expect(block).toContain('action: "MFA_CHALLENGE_FAILED"');
  });
  it("a rejected authenticator code at login records MFA_CHALLENGE_FAILED, keyed on the temp token user", () => {
    const block = between('router.post("/totp-verify"', 'router.post("/resend-otp"');
    expect(block).toContain('action: "MFA_CHALLENGE_FAILED"');
    expect(block).toContain("userId: payload.userId");
  });
  it("a rejected step-up code records MFA_CHALLENGE_FAILED too", () => {
    const block = between('"/step-up"', 'router.get("/totp/status"');
    expect(block).toContain('action: "MFA_CHALLENGE_FAILED"');
  });
  it("every AUTHENTICATED carrier logAuthEvent call passes email, so auth_events gets a row", () => {
    // logAuthEvent persists only when fields.email is present. Five carrier
    // sites passed { userId, req } and left nothing in the table. The login
    // challenge (public route, temp token) has no email in scope and is
    // exempt — it mirrors authController's own totp.challenge_failed.
    const calls = src.match(/logAuthEvent\("[a-z_.]+",\s*\{[^}]*\}/g) ?? [];
    const authed = calls.filter((c) => c.includes("req.user!.id"));
    expect(authed.length).toBeGreaterThanOrEqual(5);
    for (const c of authed) expect(c, c).toContain("email:");
    expect(calls.some((c) => c.includes('"totp.challenge_failed"'))).toBe(true);
  });
  it("MFA_CHALLENGE_SUCCESS is not an action anywhere — a passed challenge IS the LOGIN row (D2)", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) ? [path.join(d, e.name)] : [],
      );
    const root = path.join(__dirname, "../../../src");
    const files = walk(root);
    expect(files.length).toBeGreaterThan(100); // vacuity tripwire
    const offenders = files.filter((f) => strip(fs.readFileSync(f, "utf8")).includes("MFA_CHALLENGE_SUCCESS"));
    expect(offenders).toEqual([]);
  });
});
