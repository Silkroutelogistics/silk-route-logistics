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
import { authenticate, getTokenHash, POLICY_ROLLOUT_AT_MS } from "../../../src/middleware/auth";
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

/**
 * SUPERSEDED 2026-08-25 — this block asserted the STAFF-ONLY session policy.
 *
 * WHAT IT ASSERTED, and when that was right. Until Arc 34 a staff-role branch
 * ran ahead of the uniform policy in `tryAuthenticateToken`: 24h ceiling from
 * iat, 30d ceiling plus a 7-day rolling idle for remember-me, and an early
 * return that let a remembered session skip the idle check entirely. These
 * cases pinned that behavior over real HTTP and they were correct about it.
 *
 * WHAT CHANGED. Arc 34 ratified ONE policy for all four portals on 2026-08-25:
 * 30-minute idle, 12-hour absolute, measured off the persisted `lastSeenAt`.
 * The staff branch is gone from the request path (`resolveStaffSessionPolicy`
 * still exists and its 24 pure-function cases in lib/sessionPolicy.test.ts all
 * still pass — it simply no longer decides anything).
 *
 * WHY THESE WERE REWRITTEN RATHER THAN DELETED. Five of them went red on the
 * removal and two kept passing FOR THE WRONG REASON — "dies at the 30-day
 * ceiling" now dies at 12 hours, and "dies after 8 idle days" now dies after 30
 * minutes. Both would have stayed green while asserting a rule that no longer
 * exists, which is the vacuous-pass class (§19 Sub-pattern 16) and is worse
 * than a red test. Deleting them to go green would have destroyed the only
 * middleware-level evidence that the policy is REACHED rather than merely
 * computed — the whole point of this file per its header.
 */
describe("the uniform session policy is enforced by the middleware, not just computed", () => {
  // The rollout cutoff is a real instant, so a token minted at `now - 2h` is
  // pre-cutoff today and post-cutoff tomorrow. Anchoring to the exported
  // constant keeps these deterministic instead of quietly changing meaning as
  // wall-clock time passes it.
  const afterRollout = (ageMs: number) =>
    tokenIssuedAt(Math.max(POLICY_ROLLOUT_AT_MS + MIN, Date.now() - ageMs));

  it("no persisted row -> fail-closed, not an open session", async () => {
    // Unchanged in spirit: an absent row must mean the shortest life, not the
    // longest. Only the number moved — 24h became 12h, and a row-less session
    // is now refused outright because idle cannot be established without one.
    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    expect((await asAe(afterRollout(13 * HOUR))).status).toBe(401);
    expect((await asAe(afterRollout(2 * HOUR))).status).toBe(401);
  });

  it("a session predating the rollout is refused (its MESSAGE is asserted at the unit level)", async () => {
    // THE ROLLOUT BRANCH HAS A 12-HOUR LIFETIME BY CONSTRUCTION, and asserting
    // its message HERE made this test expire with it.
    //
    // The branch is reachable only in the window (rollout, rollout + 12h): older
    // than the cutoff, younger than the absolute cap. Outside that window the
    // ceiling answers first and the code is SESSION_ABSOLUTE_EXPIRED. This test
    // asserted the rollout code against real wall-clock time and duly went red
    // 12.8 hours after the merge — correctly reporting that the branch had
    // become unreachable.
    //
    // THAT EXPIRY IS THE DESIGN, NOT A DEFECT, and the distinction is worth
    // keeping. A rollout courtesy SHOULD stop mattering: once everyone minted
    // before the cutoff is past the 12h ceiling they would be signed out by the
    // ceiling anyway, so the friendlier message has nothing left to explain.
    // What was wrong earlier in Arc 34 was different — the constant expired
    // BEFORE the merge, so the branch never got its window at all.
    //
    // The message is still asserted, against an INJECTED clock, in
    // lib/sessionPolicy.test.ts where `now` is a parameter. Here we assert only
    // what is true at any time: a pre-rollout session with no row is refused.
    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    const res = await asAe(tokenIssuedAt(POLICY_ROLLOUT_AT_MS - HOUR));
    expect(res.status).toBe(401);
    expect(["SESSION_REVOKED_POLICY_ROLLOUT", "SESSION_ABSOLUTE_EXPIRED"]).toContain(res.body.code);
  });

  it("deleting the row mid-session refuses the very next request", async () => {
    // SUPERSEDED: previously "drops an old remember-me session to 24h" — a 10d
    // token stayed alive while the row existed. Under one policy a 10d token is
    // past the 12h ceiling regardless, so the age is brought inside the cap to
    // keep this testing REVOCATION rather than the ceiling.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - MIN),
    });
    expect((await asAe(afterRollout(2 * HOUR))).status).toBe(200);

    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    expect((await asAe(afterRollout(2 * HOUR))).status).toBe(401);
  });

  it("remember-me does NOT survive a 31-minute gap — it shortens re-auth, never idle", async () => {
    // SUPERSEDED, and this is the reversal itself. It used to assert 200: the
    // remembered session bypassed the idle check via an early return. Arc 34
    // ratified that remember-me buys you not retyping a password, not an
    // unattended session — so the same fixture must now be refused.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - 31 * MIN),
    });
    const res = await asAe(afterRollout(2 * HOUR));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_IDLE_EXPIRED");
  });

  it("the absolute ceiling fires however recently the session was seen", async () => {
    // SUPERSEDED: was "dies at the 30-day ceiling". The principle is identical
    // and is why this case must not be deleted — a rolling idle window must
    // never extend a session forever. Only the ceiling moved, 30d -> 12h.
    // Asserting the CODE is what stops this passing for the wrong reason.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - MIN),
    });
    const res = await asAe(tokenIssuedAt(Date.now() - 13 * HOUR));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_ABSOLUTE_EXPIRED");
    expect(mockPrisma.staffSession.delete).toHaveBeenCalled();
  });

  it("idle and ceiling are distinguishable — they do not collapse into one refusal", async () => {
    // SUPERSEDED: was "dies after 8 idle days, inside the ceiling". That case
    // would now pass for the wrong reason, because 10 days is past the 12h
    // ceiling and never reaches the idle branch at all. Rewritten with an age
    // INSIDE the ceiling so it genuinely exercises idle, and asserting the code
    // so the two refusals can never be confused again.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - 45 * MIN),
    });
    const res = await asAe(afterRollout(3 * HOUR));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_IDLE_EXPIRED");
  });

  it("touches lastSeenAt when stale, and does not write on every request", async () => {
    // Still real, and still the only proof the throttle exists. Ages brought
    // inside the 12h ceiling: previously a 1-DAY-old token reached the touch
    // because the staff ceiling was 24h, and it now would not.
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - 10 * MIN), // past the 5m throttle
    });
    await asAe(afterRollout(2 * HOUR));
    expect(mockPrisma.staffSession.update).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(STAFF);
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: true,
      lastSeenAt: new Date(Date.now() - MIN), // seen a minute ago
    });
    await asAe(afterRollout(2 * HOUR));
    expect(mockPrisma.staffSession.update).not.toHaveBeenCalled();
  });
});

/**
 * SUPERSEDED 2026-08-25 — this block asserted that portal roles FELL THROUGH
 * the staff policy untouched. That was true and was the correct scope for a
 * staff-only rule.
 *
 * Arc 34's entire purpose is that they no longer fall through. Carrier, shipper
 * and driver had no enforced idle at all in practice — the only idle store was
 * a per-process Map that emptied on every deploy. The case is inverted rather
 * than removed, because "which roles the policy governs" is exactly the fact
 * this file should keep pinning; only the answer changed.
 */
describe("portal roles are governed by the same policy as staff", () => {
  const asCarrier = (iatMs: number) =>
    request(app())
      .get("/protected")
      .set(
        "Cookie",
        `srl_token_carrier=${jwt.sign({ userId: "u-carrier", iat: Math.floor(iatMs / 1000) }, SECRET)}`,
      );

  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...STAFF,
      id: "u-carrier",
      role: "CARRIER",
      email: "carrier@example.com",
    });
  });

  it("a CARRIER with no row is refused — it no longer falls through", async () => {
    mockPrisma.staffSession.findUnique.mockResolvedValue(null);
    expect((await asCarrier(POLICY_ROLLOUT_AT_MS + MIN)).status).toBe(401);
  });

  it("a CARRIER idles out at the same 30 minutes as staff", async () => {
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: false,
      lastSeenAt: new Date(Date.now() - 31 * MIN),
    });
    const res = await asCarrier(Math.max(POLICY_ROLLOUT_AT_MS + MIN, Date.now() - 2 * HOUR));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_IDLE_EXPIRED");
  });

  it("a CARRIER inside both windows still authenticates", async () => {
    mockPrisma.staffSession.findUnique.mockResolvedValue({
      rememberMe: false,
      lastSeenAt: new Date(Date.now() - MIN),
    });
    const res = await asCarrier(Math.max(POLICY_ROLLOUT_AT_MS + MIN, Date.now() - 2 * HOUR));
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
