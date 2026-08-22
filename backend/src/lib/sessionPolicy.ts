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
  /** Remember-me staff skip the legacy 30-minute in-memory idle entirely. */
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
