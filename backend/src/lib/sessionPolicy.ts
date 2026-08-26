/**
 * Staff session policy — ceilings and idle, resolved as a PURE function.
 *
 * Pure on purpose: the whole point of this leg is that expiry must survive a
 * process restart, and a rule tangled into middleware is a rule you can only
 * test by standing up middleware. Everything here takes `now` and the persisted
 * row as arguments, so the clock-mocked and restart-simulated cases are
 * ordinary unit tests.
 *
 * WHY IT EXISTS. Idle timeout lived in an in-memory Map (middleware/auth.ts
 * `lastActivity`). On Render every deploy or cold start empties it, which
 * silently refreshed everyone's idle clock — a 30-minute idle rule that any
 * restart quietly reset. A 7-day rolling idle cannot live there.
 *
 * SPLIT OF RESPONSIBILITY:
 *   ceiling — derived from the JWT `iat` claim, so it is STATELESS and holds
 *             even when the staff_sessions row is missing entirely.
 *   idle    — derived from the PERSISTED lastSeenAt, never the in-memory map.
 *
 * Remember-me is not in the token. tryAuthenticateToken rejects any token
 * carrying extra claims of the `purpose` kind, and widening the payload for
 * policy data invites exactly that mistake, so it is persisted per session.
 */

export const REMEMBER_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // 7d rolling
export const REMEMBER_CEILING_MS = 30 * 24 * 60 * 60 * 1000; // 30d hard, from iat
export const DEFAULT_CEILING_MS = 24 * 60 * 60 * 1000; // 24h, no remember-me
/** Only write lastSeenAt when it is this stale. At 7-day granularity the
 *  precision loss is nil, and it avoids an UPDATE on every request. */
export const TOUCH_THROTTLE_MS = 5 * 60 * 1000;

/** Roles governed by this policy. Portal roles keep their existing behaviour. */
const STAFF_ROLES = new Set([
  "ADMIN",
  "CEO",
  "BROKER",
  "DISPATCH",
  "OPERATIONS",
  "ACCOUNTING",
  "ACCOUNT_EXECUTIVE",
  "AE",
]);

export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.has(role);
}

export type PersistedSession = { rememberMe: boolean; lastSeenAt: Date } | null;

export type PolicyOk = {
  ok: true;
  /**
   * Remember-me staff skip the legacy 30-minute in-memory idle entirely.
   *
   * SUPERSEDED 2026-08-25 (Arc 34) — NOTHING IN THE REQUEST PATH READS THIS.
   * Its only production consumer was the early return in the staff branch of
   * `tryAuthenticateToken`, and that branch is gone: skipping the idle check is
   * exactly the behavior Arc 34 reversed, since a remembered session now idles
   * out at 30 minutes like every other. The flag is retained because it is a
   * required field on this type, returned at three sites and asserted by three
   * live tests — but read it as "what the superseded policy WOULD have done",
   * never as a live instruction.
   */
  bypassLegacyIdle: boolean;
  /** Whether lastSeenAt is stale enough to be worth writing. */
  shouldTouch: boolean;
};

export type PolicyDenied = {
  ok: false;
  reason: "ceiling" | "idle";
  code: "SESSION_CEILING" | "SESSION_IDLE";
  message: string;
};

export type PolicyResult = PolicyOk | PolicyDenied;

const DENY_CEILING: PolicyDenied = {
  ok: false,
  reason: "ceiling",
  code: "SESSION_CEILING",
  message: "Session reached its maximum age — please sign in again",
};

const DENY_IDLE: PolicyDenied = {
  ok: false,
  reason: "idle",
  code: "SESSION_IDLE",
  message: "Session expired due to inactivity — please sign in again",
};

/**
 * Resolve policy for one presented token.
 *
 * FAIL CLOSED is the rule that matters. A staff token whose staff_sessions row
 * is missing — revoked, pruned, or minted before this leg existed — falls back
 * to the 24h cap from `iat`. It never falls back to unlimited, which is what an
 * "if (session)" guard around the whole check would have produced.
 *
 * A token with no readable `iat` is refused outright: age cannot be established,
 * so it cannot be shown to be within any ceiling.
 */
export function resolveStaffSessionPolicy(args: {
  role: string;
  iatMs: number | null;
  now: number;
  session: PersistedSession;
}): PolicyResult {
  const { role, iatMs, now, session } = args;

  // Portal roles are untouched by this policy.
  if (!isStaffRole(role)) return { ok: true, bypassLegacyIdle: false, shouldTouch: false };

  // No iat means no provable age. Refuse rather than assume freshness.
  if (typeof iatMs !== "number" || !Number.isFinite(iatMs)) return DENY_CEILING;

  const age = now - iatMs;
  const rememberMe = session?.rememberMe === true;

  if (rememberMe) {
    if (age > REMEMBER_CEILING_MS) return DENY_CEILING;

    // Idle from the PERSISTED timestamp. Absent lastSeenAt on a remember-me row
    // would be malformed data; treat it as idle rather than as fresh.
    const lastSeen = session?.lastSeenAt ? session.lastSeenAt.getTime() : null;
    if (lastSeen === null) return DENY_IDLE;
    if (now - lastSeen > REMEMBER_IDLE_MS) return DENY_IDLE;

    return { ok: true, bypassLegacyIdle: true, shouldTouch: now - lastSeen > TOUCH_THROTTLE_MS };
  }

  // No remember-me, OR no row at all (fail-closed path): 24h from iat, and the
  // legacy in-memory idle still applies on top.
  if (age > DEFAULT_CEILING_MS) return DENY_CEILING;

  const lastSeen = session?.lastSeenAt ? session.lastSeenAt.getTime() : null;
  return {
    ok: true,
    bypassLegacyIdle: false,
    shouldTouch: lastSeen !== null && now - lastSeen > TOUCH_THROTTLE_MS,
  };
}

// ── Arc 34: ONE policy, applied to all four portals ─────────────────
//
// The constants above govern the staff-only policy that preceded this and are
// left intact so its tests keep passing. Everything below supersedes them.
//
// WHY UNIFORM. Before this the four portals had four different answers: staff
// 30m idle / 24h ceiling, carrier and shipper 60m idle / no ceiling, driver no
// idle at all and a 7-day token. None of the idle numbers were actually
// enforced, because the only idle store was an in-memory Map that empties on
// every process restart — and on Render that is every deploy.
//
// REMEMBER-ME SHORTENS RE-AUTH, NOT IDLE. A remembered session still idles out
// at 30 minutes; what it buys is not having to type a password again on the
// next sign-in. The preceding policy gave remember-me a 7-day rolling idle,
// which is a different and much weaker promise. That path was unreachable in
// production anyway (see the note on the missing writer), so tightening it
// costs nothing today and would have been expensive to discover later.

/** THE single source. Any other hardcoded lifetime is a CI failure. */
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_ABSOLUTE_HOURS = 12;

export const SESSION_IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000;
export const SESSION_ABSOLUTE_MS = SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000;

/** Distinct so the sign-in screen can say WHY, rather than just "signed out". */
export type SessionExpiryCode =
  | "SESSION_IDLE_EXPIRED"
  | "SESSION_ABSOLUTE_EXPIRED"
  /**
   * Arc 34 rollout. A token minted before this policy existed has no session
   * row, and never will — nothing was writing one for its portal. Reporting
   * that as SESSION_IDLE_EXPIRED would be a lie on day one, to someone who was
   * not idle, about a system they are meeting for the first time. The census
   * says this costs nobody (zero sign-ins in the 7 days before the rollout), so
   * it is cheap insurance rather than a necessity — which is the best moment to
   * buy the honest answer rather than the convenient one.
   */
  | "SESSION_REVOKED_POLICY_ROLLOUT";

export type PortalSessionVerdict =
  | { ok: true; shouldTouch: boolean }
  | { ok: false; code: SessionExpiryCode; message: string };

/**
 * Uniform across staff, carrier, shipper and driver.
 *
 * ABSOLUTE is stateless — derived from the token's own `iat`, so it holds even
 * when the session row is missing. IDLE requires the persisted row, which is
 * the whole reason this arc adds one to every portal: a stateless token cannot
 * express "has this person done anything lately".
 *
 * FAILS CLOSED ON A MISSING ROW, deliberately. A token with no session record
 * is either older than the rollout or has had its row swept, and in both cases
 * the honest answer is "sign in again" rather than "assume fresh".
 */
export function resolveSessionPolicy(args: {
  iatMs: number | null;
  now: number;
  lastActivityAt: Date | null;
  /** Absent row. Distinguished from a present row with a null timestamp. */
  sessionMissing?: boolean;
  /**
   * When the uniform policy went live. A token older than this never had a row
   * to lose, so it gets the rollout code rather than being told it went idle.
   */
  policyRolloutAtMs?: number;
}): PortalSessionVerdict {
  const { iatMs, now, lastActivityAt } = args;

  // No provable age. Refuse rather than assume freshness.
  if (typeof iatMs !== "number" || !Number.isFinite(iatMs)) {
    return {
      ok: false,
      code: "SESSION_ABSOLUTE_EXPIRED",
      message: "Your session could not be verified. Please sign in again.",
    };
  }

  if (now - iatMs > SESSION_ABSOLUTE_MS) {
    return {
      ok: false,
      code: "SESSION_ABSOLUTE_EXPIRED",
      message: `For security, sessions end after ${SESSION_ABSOLUTE_HOURS} hours. Please sign in again.`,
    };
  }

  if (args.sessionMissing || lastActivityAt === null) {
    // Distinguish "minted before the policy" from "went idle". A token issued
    // before the rollout cutoff predates session records entirely; anything
    // after it lost its row to a sweep or a revoke.
    const preRollout = typeof args.policyRolloutAtMs === "number" && iatMs < args.policyRolloutAtMs;
    return preRollout
      ? {
          ok: false,
          code: "SESSION_REVOKED_POLICY_ROLLOUT",
          message: "We've updated how sessions work. Please sign in again — this is a one-time change.",
        }
      : {
          ok: false,
          code: "SESSION_IDLE_EXPIRED",
          message: "Your session has ended. Please sign in again.",
        };
  }

  const idleFor = now - lastActivityAt.getTime();
  if (idleFor > SESSION_IDLE_MS) {
    return {
      ok: false,
      code: "SESSION_IDLE_EXPIRED",
      message: `You were signed out after ${SESSION_IDLE_MINUTES} minutes of inactivity.`,
    };
  }

  // Throttled so this is not an UPDATE per request.
  return { ok: true, shouldTouch: idleFor > TOUCH_THROTTLE_MS };
}

/**
 * How long the frontend should wait before warning. Exported so the warning
 * modal cannot drift from the rule it is warning about.
 */
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000;
