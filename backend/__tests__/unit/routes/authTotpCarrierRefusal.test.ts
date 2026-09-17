/**
 * B1b (2026-09-17) — carriers cannot manage 2FA through the AE-side routes.
 *
 * WHAT WAS WRONG
 *
 * /api/auth/totp/{setup,verify,disable} refused only ADMIN and CEO. /api/auth is
 * not a carrier-portal mount, so the cookie resolver fell through to the
 * carrier cookie, and the carrier Settings page pointed straight at these
 * routes. Two consequences, both unrecorded:
 *
 *   · /totp/setup persisted a NEW secret and backup codes at setup time, before
 *     the pairing was proven, with no already-enabled guard. The Settings page
 *     always rendered "not enabled" (its /me never returned totpEnabled), so an
 *     enrolled carrier who clicked Enable invalidated the authenticator they
 *     were relying on — and their backup codes — and could not log in again.
 *   · /totp/disable switched the mandatory factor off for a carrier.
 *
 * WHAT THIS PROVES
 *
 * The real /api/auth router behind a role-injecting authenticate stub, with
 * totpService replaced so the observable is whether the service was reached.
 * CARRIER is refused on all three routes and the service is never called; an
 * already-enrolled AE is refused re-setup with 409 and the secret is never
 * rotated; an AE or shipper still enrols and a shipper still self-disables,
 * because for them the factor is optional. Two structural checks close the
 * loop on the surfaces this test cannot mount: the carrier Settings page no
 * longer names the AE routes, and /carrier-auth/me now selects totpEnabled.
 *
 * Adversarially verified at authoring: dropping `notCarrier` from the disable
 * route turns exactly the disable refusal red; dropping the 409 guard turns
 * exactly the re-setup case red; restoring an /auth/totp/ call to the Settings
 * page turns exactly the structural case red.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

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

// The service IS the observable. A refusal that still reached it would have
// already rotated the secret by the time the 403 went out.
const totp = {
  generateTotpSetup: vi.fn(),
  verifyTotpCode: vi.fn(),
  enableTotp: vi.fn(),
  disableTotp: vi.fn(),
  issueBackupCodes: vi.fn(),
  isTotpEnabled: vi.fn(),
};
vi.mock("../../../src/services/totpService", () => totp);

async function app() {
  const auth = (await import("../../../src/routes/auth")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/auth", auth);
  return a;
}

const post = async (a: express.Express, p: string, role: string, body: object = {}) =>
  request(a).post(p).set("x-test-role", role).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  totp.generateTotpSetup.mockResolvedValue({ qrCodeDataUrl: "data:qr", secret: "S", backupCodes: [] });
  totp.verifyTotpCode.mockResolvedValue(true);
  mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: false });
});

describe("a carrier is refused on every AE-side TOTP route, before the service is reached", () => {
  const cases: Array<[string, keyof typeof totp]> = [
    ["/api/auth/totp/setup", "generateTotpSetup"],
    ["/api/auth/totp/verify", "verifyTotpCode"],
    ["/api/auth/totp/disable", "disableTotp"],
  ];
  for (const [p, svc] of cases) {
    it(`POST ${p} → 403 USE_CARRIER_PORTAL, ${svc} never called`, async () => {
      const a = await app();
      const res = await post(a, p, "CARRIER", { code: "123456" });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("USE_CARRIER_PORTAL");
      expect(res.body.action?.href).toBe("/carrier/dashboard/security");
      expect(totp[svc]).not.toHaveBeenCalled();
    });
  }
});

describe("re-running setup does not rotate an armed authenticator", () => {
  it("an already-enrolled AE gets 409 and generateTotpSetup is not called", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: true });
    const a = await app();
    const res = await post(a, "/api/auth/totp/setup", "ADMIN");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TOTP_ALREADY_ENABLED");
    expect(totp.generateTotpSetup).not.toHaveBeenCalled();
  });

  it("an unenrolled AE still enrols here", async () => {
    const a = await app();
    const res = await post(a, "/api/auth/totp/setup", "BROKER");
    expect(res.status).toBe(200);
    expect(totp.generateTotpSetup).toHaveBeenCalledTimes(1);
  });
});

describe("the optional-2FA roles keep self-service", () => {
  it("a shipper can still disable with a valid code", async () => {
    const a = await app();
    const res = await post(a, "/api/auth/totp/disable", "SHIPPER", { code: "123456" });
    expect(res.status).toBe(200);
    expect(totp.disableTotp).toHaveBeenCalledWith("u-shipper");
  });

  it("an admin still cannot disable — mandatory for that role, unchanged", async () => {
    const a = await app();
    const res = await post(a, "/api/auth/totp/disable", "ADMIN", { code: "123456" });
    expect(res.status).toBe(403);
    expect(totp.disableTotp).not.toHaveBeenCalled();
  });
});

describe("the two surfaces this test cannot mount", () => {
  const REPO = path.join(__dirname, "../../../..");
  // Line comments FIRST. A line comment can name "/auth/totp/*" as prose, and
  // block-first stripping reads that as an opener and eats everything up to
  // the next JSX comment. It did, at authoring, on this very file.
  const strip = (s: string) => s.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

  it("the carrier Settings page no longer calls the AE routes and points at the Security page", () => {
    // Structural, and says so: the page is a React component this backend
    // suite cannot render. The backend refusal above is the enforcement; this
    // keeps the page from offering a control the API will refuse.
    const src = strip(fs.readFileSync(path.join(REPO, "frontend/src/app/carrier/dashboard/settings/page.tsx"), "utf8"));
    expect(src).not.toContain("/auth/totp/");
    expect(src).toContain("/carrier/dashboard/security");
    expect(src).toContain("/carrier-auth/totp/status");
  });

  it("/carrier-auth/me selects totpEnabled, so a carrier surface can render enrollment state", () => {
    const src = strip(fs.readFileSync(path.join(REPO, "backend/src/routes/carrierAuth.ts"), "utf8"));
    const start = src.indexOf('router.get("/me"');
    expect(start).toBeGreaterThan(0);
    const handler = src.slice(start, src.indexOf("router.get(", start + 1));
    expect(handler).toMatch(/totpEnabled:\s*true/);
  });
});
