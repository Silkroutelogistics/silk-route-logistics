/**
 * Leg 8 — adversarial sweep of the staff session surface, over real HTTP.
 *
 * Every assertion here drives supertest through the REAL `authenticate`
 * middleware and the REAL route stack. That is the point: the session policy
 * has unit tests already (lib/sessionPolicy.test.ts, 24 cases) and they prove
 * the arithmetic, not that anything calls it. §19 Sub-pattern 16 — a guard has
 * to exercise the boundary, and a guard that only reads the pure function is
 * green whether or not the middleware ever invokes it.
 *
 * The reachability of the policy call is proved by injection, recorded in the
 * commit message: the call was removed, the removal confirmed applied, these
 * tests were watched to fail, and the call restored.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { authenticate, getTokenHash } from "../../../src/middleware/auth";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const SECRET = "test-secret-key-for-vitest";

const STAFF = {
  id: "u-ops",
  email: "operations@silkroutelogistics.ai",
  role: "ACCOUNT_EXECUTIVE",
  isActive: true,
  firstName: "Ops",
  lastName: "User",
};

/** A token whose `iat` we control, so ceilings are testable without waiting. */
function tokenIssuedAt(iatMs: number, sub = STAFF.id) {
  return jwt.sign({ userId: sub, iat: Math.floor(iatMs / 1000) }, SECRET);
}

function app() {
  const a = express();
  a.use(cookieParser());
  a.get("/protected", authenticate as any, (req: any, res) =>
    res.json({ ok: true, userId: req.user?.id }),
  );
  return a;
}

/** Present the token the way a browser does: the AE portal cookie. */
function asAe(token: string) {
  return request(app()).get("/protected").set("Cookie", `srl_token_ae=${token}`);
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(STAFF);
  mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
  mockPrisma.staffSession.findUnique.mockResolvedValue(null);
  mockPrisma.staffSession.update.mockResolvedValue({});
  mockPrisma.staffSession.delete.mockResolvedValue({});
  mockPrisma.authEvent.create.mockResolvedValue({});
});

describe("forged and malformed tokens are refused", () => {
  it("wrong signing secret", async () => {
    const forged = jwt.sign({ userId: STAFF.id }, "not-the-real-secret");
    const res = await asAe(forged);
    expect(res.status).toBe(401);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("alg none — an unsigned token must never authenticate", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ userId: STAFF.id })).toString("base64url");
    const res = await asAe(`${header}.${body}.`);
    expect(res.status).toBe(401);
  });

  it("a purpose-bearing token is refused even though it is validly signed", async () => {
    // Driver-invite and tender-action tokens are signed with the SAME secret.
    // Without this rejection, any of them would be a staff session.
    const purposed = jwt.sign({ userId: STAFF.id, purpose: "driver-training" }, SECRET);
    const res = await asAe(purposed);
    expect(res.status).toBe(401);
  });

  it("garbage and empty are refused without reaching the database", async () => {
    expect((await asAe("not-a-jwt")).status).toBe(401);
    expect((await asAe("")).status).toBe(401);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("blacklisted tokens are refused", () => {
  it("a revoked token does not authenticate", async () => {
    const token = tokenIssuedAt(Date.now() - MIN);
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue({
      token: getTokenHash(token),
      expiresAt: new Date(Date.now() + DAY),
    });
    const res = await asAe(token);
    expect(res.status).toBe(401);
  });
});

describe("staff session policy is enforced by the middleware, not just computed", () => {
  it("no persisted row -> fail-closed at 24h, not an open session", async () => {
    // The row is absent, so the policy cannot know this was a remember-me
    // session. It must assume the shortest life, not the longest.
    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    const stale = await asAe(tokenIssuedAt(Date.now() - 25 * HOUR));
    expect(stale.status).toBe(401);

    const fresh = await asAe(tokenIssuedAt(Date.now() - 2 * HOUR));
    expect(fresh.status).toBe(200);
  });

  it("deleting the row mid-session drops an old remember-me session to 24h", async () => {
    const iat = Date.now() - 10 * DAY;
    // With the row: alive, because 10d is inside the 30d ceiling and the
    // session was seen recently.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - MIN),
    });
    expect((await asAe(tokenIssuedAt(iat))).status).toBe(200);

    // Row deleted (revoked server-side). Same token, now refused.
    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    expect((await asAe(tokenIssuedAt(iat))).status).toBe(401);
  });

  it("remember-me survives a 31-minute gap that kills a non-remembered session", async () => {
    // 31 minutes is past the legacy 30-minute employee idle timeout. The
    // remember-me path must bypass that in-memory check entirely — it empties
    // on every process restart, so on Render a deploy silently refreshed
    // everyone's idle clock.
    const iat = Date.now() - 3 * DAY;
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - 31 * MIN),
    });
    expect((await asAe(tokenIssuedAt(iat))).status).toBe(200);
  });

  it("remember-me dies at the 30-day ceiling however recently it was seen", async () => {
    // Active one minute ago, but issued 31 days back. The ceiling is absolute:
    // a rolling idle window must never be able to extend a session forever.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - MIN),
    });
    const res = await asAe(tokenIssuedAt(Date.now() - 31 * DAY));
    expect(res.status).toBe(401);
    expect(mockPrisma.staffSession.delete).toHaveBeenCalled();
  });

  it("remember-me dies after 8 idle days, inside the ceiling", async () => {
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - 8 * DAY),
    });
    expect((await asAe(tokenIssuedAt(Date.now() - 10 * DAY))).status).toBe(401);
  });

  it("touches lastSeenAt when stale, and does not write on every request", async () => {
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - HOUR),
    });
    await asAe(tokenIssuedAt(Date.now() - DAY));
    expect(mockPrisma.staffSession.update).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(STAFF);
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - MIN), // seen a minute ago
    });
    await asAe(tokenIssuedAt(Date.now() - DAY));
    expect(mockPrisma.staffSession.update).not.toHaveBeenCalled();
  });
});

describe("portal roles are untouched by the staff policy", () => {
  it("a CARRIER with no staff_sessions row is not held to the staff ceiling", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...STAFF,
      id: "u-carrier",
      role: "CARRIER",
      email: "carrier@example.com",
    });
    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    const token = jwt.sign(
      { userId: "u-carrier", iat: Math.floor((Date.now() - 25 * HOUR) / 1000) },
      SECRET,
    );
    const res = await request(app())
      .get("/protected")
      .set("Cookie", `srl_token_carrier=${token}`);
    // 25h old with no row would be a 401 for staff. Carriers fall through.
    expect(res.status).toBe(200);
  });
});

describe("deactivated accounts", () => {
  it("an inactive staff user is refused even with a valid fresh token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...STAFF, isActive: false });
    const res = await asAe(tokenIssuedAt(Date.now() - MIN));
    expect(res.status).toBe(403);
  });
});
