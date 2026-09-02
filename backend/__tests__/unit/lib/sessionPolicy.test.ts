/**
 * Staff session ceilings + idle.
 *
 * The point of this leg is that expiry SURVIVES A PROCESS RESTART. The old idle
 * check lived in an in-memory Map that Render empties on every deploy, silently
 * refreshing everyone's clock. resolveStaffSessionPolicy is pure and takes
 * `now` plus the persisted row, so "simulated restart" here means exactly what
 * it means in production: no in-memory state exists, and the verdict still has
 * to come out right from `iat` and the persisted lastSeenAt alone.
 */
import { describe, it, expect } from "vitest";
import {
  resolveSessionPolicy,
  resolveStaffSessionPolicy,
  isStaffRole,
  REMEMBER_IDLE_MS,
  REMEMBER_CEILING_MS,
  DEFAULT_CEILING_MS,
  TOUCH_THROTTLE_MS,
} from "../../../src/lib/sessionPolicy";

const NOW = Date.parse("2026-08-22T12:00:00.000Z");
const MIN = 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms);

const remember = (lastSeenMsAgo: number) => ({ rememberMe: true, lastSeenAt: ago(lastSeenMsAgo) });
const plain = (lastSeenMsAgo: number) => ({ rememberMe: false, lastSeenAt: ago(lastSeenMsAgo) });

describe("30-day ceiling, remember-me", () => {
  it("passes at 30d minus a minute", () => {
    const v = resolveStaffSessionPolicy({
      role: "ADMIN",
      iatMs: NOW - (REMEMBER_CEILING_MS - MIN),
      now: NOW,
      session: remember(MIN),
    });
    expect(v.ok).toBe(true);
  });

  it("BREACHES at 30d plus a minute — under a simulated fresh-process restart", () => {
    // No in-memory state is consulted by this function at all, which IS the
    // restart simulation: a rebooted process has an empty lastActivity map and
    // must still refuse this session.
    const v = resolveStaffSessionPolicy({
      role: "ADMIN",
      iatMs: NOW - (REMEMBER_CEILING_MS + MIN),
      now: NOW,
      session: remember(MIN), // recently active — only the ceiling should bite
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("ceiling");
      expect(v.code).toBe("SESSION_CEILING");
    }
  });

  it("ceiling is not extendable by activity — recent lastSeenAt does not rescue an old iat", () => {
    const v = resolveStaffSessionPolicy({
      role: "ADMIN",
      iatMs: NOW - (REMEMBER_CEILING_MS + MIN),
      now: NOW,
      session: remember(0), // active this instant
    });
    expect(v.ok).toBe(false);
  });
});

describe("7-day rolling idle, remember-me", () => {
  it("passes at 7d minus a minute", () => {
    const v = resolveStaffSessionPolicy({
      role: "ADMIN",
      iatMs: NOW - 8 * 24 * 60 * MIN,
      now: NOW,
      session: remember(REMEMBER_IDLE_MS - MIN),
    });
    expect(v.ok).toBe(true);
  });

  it("BREACHES at 7d plus a minute — restart-simulated, from the PERSISTED column", () => {
    const v = resolveStaffSessionPolicy({
      role: "ADMIN",
      iatMs: NOW - 8 * 24 * 60 * MIN, // well inside the 30d ceiling
      now: NOW,
      session: remember(REMEMBER_IDLE_MS + MIN),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("idle");
      expect(v.code).toBe("SESSION_IDLE");
    }
  });

  it("distinguishes idle from ceiling — the two produce different codes", () => {
    const idle = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - 8 * 24 * 60 * MIN, now: NOW, session: remember(REMEMBER_IDLE_MS + MIN) });
    const ceiling = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - (REMEMBER_CEILING_MS + MIN), now: NOW, session: remember(MIN) });
    expect(idle.ok).toBe(false);
    expect(ceiling.ok).toBe(false);
    if (!idle.ok && !ceiling.ok) expect(idle.code).not.toBe(ceiling.code);
  });

  it("remember-me staff survive a 31-minute gap that would kill a legacy session", () => {
    const v = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - 60 * MIN, now: NOW, session: remember(31 * MIN) });
    expect(v.ok).toBe(true);
    // And they bypass the legacy 30-minute in-memory idle entirely.
    if (v.ok) expect(v.bypassLegacyIdle).toBe(true);
  });
});

describe("no remember-me: 24h ceiling, legacy idle still applies", () => {
  it("passes inside 24h", () => {
    const v = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - (DEFAULT_CEILING_MS - MIN), now: NOW, session: plain(MIN) });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.bypassLegacyIdle).toBe(false); // legacy idle still governs
  });

  it("BREACHES past 24h", () => {
    const v = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - (DEFAULT_CEILING_MS + MIN), now: NOW, session: plain(MIN) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("ceiling");
  });
});

describe("FAIL CLOSED when the session row is absent", () => {
  it("a staff token with NO persisted row falls back to 24h, not unlimited", () => {
    const inside = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - (DEFAULT_CEILING_MS - MIN), now: NOW, session: null });
    const outside = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - (DEFAULT_CEILING_MS + MIN), now: NOW, session: null });
    expect(inside.ok).toBe(true);
    // This is the assertion that matters: wrapping the whole check in
    // `if (session)` would have made a missing row mean UNLIMITED.
    expect(outside.ok).toBe(false);
  });

  it("a token with no readable iat is refused — age cannot be established", () => {
    expect(resolveStaffSessionPolicy({ role: "ADMIN", iatMs: null, now: NOW, session: remember(0) }).ok).toBe(false);
    expect(resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NaN, now: NOW, session: remember(0) }).ok).toBe(false);
  });

  it("a remember-me row with no lastSeenAt is treated as idle, not as fresh", () => {
    const v = resolveStaffSessionPolicy({
      role: "ADMIN",
      iatMs: NOW - MIN,
      now: NOW,
      session: { rememberMe: true, lastSeenAt: undefined as unknown as Date },
    });
    expect(v.ok).toBe(false);
  });
});

describe("lastSeenAt write throttle", () => {
  it("does NOT write when the row was touched recently", () => {
    const v = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - MIN, now: NOW, session: remember(TOUCH_THROTTLE_MS - 1000) });
    expect(v.ok && v.shouldTouch).toBe(false);
  });

  it("DOES write once stale past the throttle", () => {
    const v = resolveStaffSessionPolicy({ role: "ADMIN", iatMs: NOW - MIN, now: NOW, session: remember(TOUCH_THROTTLE_MS + 1000) });
    expect(v.ok && v.shouldTouch).toBe(true);
  });
});

describe("scope: portal roles are untouched", () => {
  for (const role of ["CARRIER", "SHIPPER", "FACTOR"]) {
    it(`${role} is not staff and passes regardless of a wildly old iat`, () => {
      const v = resolveStaffSessionPolicy({ role, iatMs: NOW - 400 * 24 * 60 * MIN, now: NOW, session: null });
      expect(isStaffRole(role)).toBe(false);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.bypassLegacyIdle).toBe(false);
    });
  }

  for (const role of ["ADMIN", "CEO", "ACCOUNT_EXECUTIVE", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"]) {
    it(`${role} IS governed by the policy`, () => {
      expect(isStaffRole(role)).toBe(true);
      expect(resolveStaffSessionPolicy({ role, iatMs: NOW - (DEFAULT_CEILING_MS + MIN), now: NOW, session: null }).ok).toBe(false);
    });
  }
});

/**
 * Arc 34 — the uniform policy, asserted against an INJECTED clock.
 *
 * These live here rather than in the middleware suite because `now` is a
 * parameter of `resolveSessionPolicy` and wall-clock time is not. The middleware
 * version of the rollout assertion expired 12.8 hours after the merge — the
 * rollout branch is reachable only in the window (rollout, rollout + 12h), which
 * is by design: once everyone minted before the cutoff is past the ceiling, the
 * friendlier message has nothing left to explain.
 */
describe("uniform policy — rollout message, clock injected", () => {
  const ROLLOUT = Date.parse("2026-08-26T00:30:00Z");

  it("inside the window, a row-less pre-rollout session is told a policy changed", () => {
    const v = resolveSessionPolicy({
      iatMs: ROLLOUT - 60 * 60 * 1000,
      now: ROLLOUT + 60 * 60 * 1000, // 1h after the cutoff — inside the 12h cap
      lastActivityAt: null,
      sessionMissing: true,
      policyRolloutAtMs: ROLLOUT,
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("SESSION_REVOKED_POLICY_ROLLOUT");
  });

  it("past the window the ceiling answers first — the courtesy has expired, as designed", () => {
    const v = resolveSessionPolicy({
      iatMs: ROLLOUT - 60 * 60 * 1000,
      now: ROLLOUT + 13 * 60 * 60 * 1000, // past the 12h cap
      lastActivityAt: null,
      sessionMissing: true,
      policyRolloutAtMs: ROLLOUT,
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("SESSION_ABSOLUTE_EXPIRED");
  });

  it("a POST-rollout row-less session is told it went idle, never that a policy changed", () => {
    // The distinction the rollout code exists for: only sessions that predate
    // the cutoff get the policy message. A newer one lost its row some other way.
    const v = resolveSessionPolicy({
      iatMs: ROLLOUT + 60 * 60 * 1000,
      now: ROLLOUT + 2 * 60 * 60 * 1000,
      lastActivityAt: null,
      sessionMissing: true,
      policyRolloutAtMs: ROLLOUT,
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("SESSION_IDLE_EXPIRED");
  });
});

/**
 * The grace window on a missing row.
 *
 * registerSession persists fire-and-forget, so a login answered fast enough
 * leaves an upsert in flight and the next request reads no row. Calling that
 * "idle expired" is false on its face for a token seconds old, and these cases
 * pin both halves: the grace is narrow, and it applies to a MISSING row only.
 */
describe("resolveSessionPolicy — grace for a row that has not landed", () => {
  const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

  it("a fresh token with a missing row is allowed", () => {
    const v = resolveSessionPolicy({
      iatMs: NOW - 2_000,
      now: NOW,
      lastActivityAt: null,
      sessionMissing: true,
    });
    expect(v.ok, "a two-second-old token has not been idle for thirty minutes").toBe(true);
  });

  it("a token past the window with a missing row is refused", () => {
    const v = resolveSessionPolicy({
      iatMs: NOW - 31_000,
      now: NOW,
      lastActivityAt: null,
      sessionMissing: true,
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("SESSION_IDLE_EXPIRED");
  });

  it("a fresh token with a PRESENT but stale row is still refused by the idle rule", () => {
    // The grace must not leak into the branch it was never for. A row that
    // exists and has gone stale is a genuinely idle session, whatever the
    // token's age -- and a long-lived token refreshed by a remember-me flow
    // would otherwise be granted an unbounded session by freshness alone.
    const v = resolveSessionPolicy({
      iatMs: NOW - 2_000,
      now: NOW,
      lastActivityAt: new Date(NOW - 40 * 60 * 1000),
      sessionMissing: false,
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("SESSION_IDLE_EXPIRED");
  });

  it("a malformed iat gets no grace (fail closed)", () => {
    // No provable age means no provable freshness. This is refused above the
    // branch entirely, which is why the grace can read iatMs unguarded.
    for (const bad of [null, NaN, Infinity]) {
      const v = resolveSessionPolicy({
        iatMs: bad as number | null,
        now: NOW,
        lastActivityAt: null,
        sessionMissing: true,
      });
      expect(v.ok, "iatMs=" + String(bad) + " must not be granted grace").toBe(false);
    }
  });

  it("the grace does not override the absolute ceiling", () => {
    // Ordering matters: absolute expiry is checked first and derives from the
    // token's own iat, so a very old token whose row was swept must not be
    // rescued by any later branch.
    const v = resolveSessionPolicy({
      iatMs: NOW - 13 * 60 * 60 * 1000,
      now: NOW,
      lastActivityAt: null,
      sessionMissing: true,
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("SESSION_ABSOLUTE_EXPIRED");
  });

  it("SESSION_GRACE_SECONDS is bounded, and 0 disables it", () => {
    const prev = process.env.SESSION_GRACE_SECONDS;
    try {
      process.env.SESSION_GRACE_SECONDS = "0";
      expect(
        resolveSessionPolicy({ iatMs: NOW - 500, now: NOW, lastActivityAt: null, sessionMissing: true }).ok,
        "0 must switch the grace off entirely, not fall back to the default",
      ).toBe(false);

      process.env.SESSION_GRACE_SECONDS = "99999";
      expect(
        resolveSessionPolicy({ iatMs: NOW - 400_000, now: NOW, lastActivityAt: null, sessionMissing: true }).ok,
        "an unbounded env value would turn a grace into an unbounded session",
      ).toBe(false);

      process.env.SESSION_GRACE_SECONDS = "not-a-number";
      expect(
        resolveSessionPolicy({ iatMs: NOW - 2_000, now: NOW, lastActivityAt: null, sessionMissing: true }).ok,
        "a garbage value falls back to the default rather than to zero or infinity",
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.SESSION_GRACE_SECONDS;
      else process.env.SESSION_GRACE_SECONDS = prev;
    }
  });
});
