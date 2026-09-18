/**
 * B6b (2026-09-17) — /carriers/:id/security-signals reports sign-in security,
 * and scopes its SystemLog rows on exact prefixes.
 *
 * Two things. The response gains `security` — enrollment state (with the
 * MFA_ENROLLED row as the source and the global audit trail's /totp/confirm
 * entry as the fallback for carriers enrolled before bci) and the last LOGIN
 * row's place and flags. And the timeline's SystemLog filter stops matching
 * `contains: email`: a@x.com is inside ba@x.com, so one carrier's panel could
 * show another carrier's unusual logins (Phase A finding #6).
 *
 * Adversarially verified at authoring: reverting the unusual-activity clause
 * to `contains: email` turns the scoping case red; dropping `security` from
 * the response turns the shape case red; ignoring totpEnabled for enrolledAt
 * turns the not-enrolled case red.
 *
 * bct (2026-09-18) — the fallback's WHERE was wrong and this file could not
 * see it: the mock returned a row for ANY where, so it proved the query
 * matched the author's assumption. The audit middleware records req.path at
 * `finish`, after Express has trimmed it to the mounted router, so a carrier
 * enrollment is TOTP / confirm / "/totp/confirm", never the CARRIER_AUTH /
 * totp / full-path shape bcq queried. TRAIL_ROWS below are copied verbatim
 * from a read-only production SELECT (2026-09-18: two shapes exist, both
 * CARRIER, both mount-relative) and the mock applies the route's WHERE to
 * them. Injection: reverting the WHERE to bcq's shape turns the fallback case
 * red against these rows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) { res.status(401).json({ error: "No token provided" }); return; }
      req.user = { id: `u-${String(role).toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});

const EMAIL = "a@x.example";
const carrier = (totpEnabled: boolean) => ({
  id: "cp-1",
  registrationCountry: "US",
  geoMismatchOverriddenAt: null,
  geoMismatchOverrideNote: null,
  user: { id: "u-carrier-1", email: EMAIL, totpEnabled, emailVerifiedAt: null, emailVerifiedFromIp: null, emailVerifiedFromCountry: null, lastLoginIp: null, lastLoginCountry: null, lastLogin: null },
});
const LOGIN_ROW = {
  createdAt: new Date("2026-09-17T12:00:00Z"),
  ipAddress: "203.0.113.9",
  details: { device: "Chrome on Windows", geo: { city: "Detroit", region: "MI", country: "US", lat: 42.3, lon: -83.0 }, flags: ["NEW_DEVICE"] },
};

// Copied verbatim from production audit_trails (read-only SELECT, 2026-09-18).
// The setup row is deliberately present: a WHERE that forgets entityId would
// pick it (it is earlier) and the fallback case asserts the confirm time.
const TRAIL_ROWS = [
  { performedById: "u-carrier-1", entityType: "TOTP", entityId: "setup",   changedFields: { method: "POST", path: "/totp/setup",   statusCode: 200, duration: 31 }, performedAt: new Date("2026-09-17T12:58:18.785Z") },
  { performedById: "u-carrier-1", entityType: "TOTP", entityId: "confirm", changedFields: { method: "POST", path: "/totp/confirm", statusCode: 200, duration: 44 }, performedAt: new Date("2026-09-17T13:05:55.902Z") },
];
/** Evaluates the WHERE the route sends against TRAIL_ROWS — a mock that ignores it proves nothing. */
function trailFindFirst({ where, orderBy }: any) {
  const jsonMatch = (row: any) => {
    const cf = where.changedFields;
    if (!cf) return true;
    const v = (cf.path as string[]).reduce((o: any, k: string) => o?.[k], row.changedFields);
    return "equals" in cf ? v === cf.equals : true;
  };
  const hits = TRAIL_ROWS.filter(
    (r) =>
      (where.performedById === undefined || r.performedById === where.performedById) &&
      (where.entityType === undefined || r.entityType === where.entityType) &&
      (where.entityId === undefined || r.entityId === where.entityId) &&
      jsonMatch(r),
  );
  const dir = orderBy?.performedAt === "desc" ? -1 : 1;
  hits.sort((a, b) => dir * (a.performedAt.getTime() - b.performedAt.getTime()));
  return Promise.resolve(hits[0] ? { performedAt: hits[0].performedAt } : null);
}

async function app() {
  const carriers = (await import("../../../src/routes/carriers")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carriers", carriers);
  return a;
}
const get = async (a: express.Express) => request(a).get("/api/carriers/cp-1/security-signals").set("x-test-role", "ADMIN");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier(true));
  mockPrisma.systemLog.findMany = vi.fn().mockResolvedValue([]);
  mockPrisma.document.findMany.mockResolvedValue([]);
  mockPrisma.otpCode.findMany = vi.fn().mockResolvedValue([]);
  mockPrisma.chameleonMatch = { findMany: vi.fn().mockResolvedValue([]) };
  mockPrisma.complianceOverride = { ...(mockPrisma.complianceOverride ?? {}), findFirst: vi.fn().mockResolvedValue(null) };
  mockPrisma.authEvent = { ...(mockPrisma.authEvent ?? {}), findMany: vi.fn().mockResolvedValue([]) };
  mockPrisma.staffSession.findMany = vi.fn().mockResolvedValue([]);
  mockPrisma.auditLog.findFirst = vi.fn().mockImplementation(({ where }: any) =>
    Promise.resolve(where.action === "MFA_ENROLLED" ? { createdAt: new Date("2026-09-10T15:00:00Z") } : where.action === "LOGIN" ? LOGIN_ROW : null),
  );
  mockPrisma.auditTrail.findFirst = vi.fn().mockImplementation(trailFindFirst);
});

describe("security on the response", () => {
  it("enrolled: enrolledAt from the MFA_ENROLLED row; lastLogin carries the place and the flags, and no coordinates", async () => {
    const r = await get(await app());
    expect(r.status).toBe(200);
    expect(r.body.security).toEqual({
      totpEnabled: true,
      enrolledAt: "2026-09-10T15:00:00.000Z",
      lastLogin: { at: "2026-09-17T12:00:00.000Z", ip: "203.0.113.9", city: "Detroit", region: "MI", country: "US", flags: ["NEW_DEVICE"] },
    });
  });

  it("enrolled before bci: falls back to the global audit trail's /totp/confirm entry", async () => {
    mockPrisma.auditLog.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.action === "LOGIN" ? LOGIN_ROW : null));
    const r = await get(await app());
    // The confirm row, not the earlier setup row: the WHERE must carry entityId.
    expect(r.body.security.enrolledAt).toBe("2026-09-17T13:05:55.902Z");
    const trailWhere = mockPrisma.auditTrail.findFirst.mock.calls[0][0].where;
    expect(trailWhere).toMatchObject({ performedById: "u-carrier-1", entityType: "TOTP", entityId: "confirm", changedFields: { path: ["path"], equals: "/totp/confirm" } });
  });

  it("not enrolled now: enrolledAt is null even when an old enrollment row exists, and no sign-in reads as null", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier(false));
    mockPrisma.auditLog.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.action === "MFA_ENROLLED" ? { createdAt: new Date("2026-09-10T15:00:00Z") } : null),
    );
    const r = await get(await app());
    expect(r.body.security).toEqual({ totpEnabled: false, enrolledAt: null, lastLogin: null });
  });
});

describe("the SystemLog timeline is scoped on exact prefixes (finding #6)", () => {
  it("unusual-activity rows match the exact prefix, never a substring of the email; login-risk and lockouts are included", async () => {
    await get(await app());
    const where = mockPrisma.systemLog.findMany.mock.calls[0][0].where;
    const or = where.OR as Array<{ source: string; message: Record<string, string> }>;
    const bySource = Object.fromEntries(or.map((c) => [c.source, c.message]));
    expect(bySource["carrierAuth-unusual-activity"]).toEqual({ startsWith: `Unusual login attempt for ${EMAIL}:` });
    expect(bySource["carrierAuth-unusual-activity-override"]).toEqual({ startsWith: `Unusual login for ${EMAIL} ` });
    expect(bySource["carrierAuth"]).toEqual({ contains: ` for ${EMAIL} ` });
    expect(bySource["carrierAuth-login-risk"]).toEqual({ contains: "[uid:u-carrier-1]" });
    expect(bySource["emailVerification"]).toEqual({ contains: "u-carrier-1" });
    // The defect: a bare substring of the email anywhere in the filter.
    for (const c of or) expect(c.message, c.source).not.toEqual({ contains: EMAIL });
  });
});
