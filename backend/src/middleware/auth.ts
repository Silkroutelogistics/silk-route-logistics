import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";
import { LEGACY_COOKIE_NAME } from "../utils/cookies";
import { log } from "../lib/logger";
import { logAuthEvent } from "../lib/authEvents";
// resolveStaffSessionPolicy and isStaffRole are deliberately NOT imported any
// more — see the supersession note at the policy site below. They remain
// exported from lib/sessionPolicy with their tests intact; they simply have no
// place in the request path now that one policy governs every portal.
import { resolveSessionPolicy } from "../lib/sessionPolicy";
import { createSession, touchSession, type SessionPortalName } from "../lib/sessionStore";
import { clientIp } from "../lib/clientIp";

export interface AuthRequest extends Request<any, any, any, any> {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
  token?: string; // Store raw token for blacklist on logout
}

// SUPERSEDED 2026-08-25 — the per-role inactivity timeouts and the in-memory
// tracker that went with them lived here (employee 30m, shipper 60m, carrier
// 60m, held in a `lastActivity` Map keyed by userId).
//
// They are gone rather than retained because they had already stopped being a
// policy and had become a contradiction. Two proofs, not opinions:
//
//   1. The Map was WRITE-ONLY. Repo-wide it had `.set` and `.delete` and a
//      10-minute sweep, and ZERO reads — nothing ever compared an entry
//      against a timeout to refuse a request. It also lived in the process, so
//      on Render every deploy silently refreshed everyone's idle clock; a rule
//      any restart resets is not a rule.
//   2. `getSessionTimeout(role)` — the only function that read these three
//      numbers — had no caller anywhere in the repository.
//
// Under Arc 34 the answer is one number for every portal (SESSION_IDLE_MINUTES
// in lib/sessionPolicy), measured off the PERSISTED lastSeenAt. Keeping a
// second, unreferenced set of numbers that disagreed with it is how a reader
// six months from now ends up citing the wrong one.

/**
 * Arc 34 — when the uniform policy went live. Hardcoded rather than env-driven,
 * matching the AUTHORITY_AGE_GATE_LIVE_AT precedent: a cutoff that can be moved
 * by configuration is a cutoff nobody can reason about six months later.
 *
 * IT MUST BE THE MERGE INSTANT, and it was set at the merge rather than when
 * this code was written. The first value here was 2026-08-24T20:00:00Z, chosen
 * for a merge expected that day. The merge did not happen that day, and by the
 * time the harness ran the constant was 28 hours stale — which made this branch
 * DEAD, because any token predating the rollout was also past the 12h absolute
 * cap, so the ceiling answered first and this code could never be reached.
 *
 * A cutoff in the past is not a conservative default. It is a silently disabled
 * feature. If this ever needs re-dating, re-date it to the new merge instant.
 *
 * Exported so the proof harness asserts against THIS value rather than a copy
 * of it — a test that hardcodes its own cutoff proves only that two literals
 * match.
 */
export const POLICY_ROLLOUT_AT_MS = Date.parse("2026-08-26T00:30:00Z");

/**
 * Arc 34 — background polls authenticate but do NOT count as activity.
 *
 * A 30-second poll would keep an abandoned desk signed in indefinitely, which
 * is the precise opposite of what an idle timeout is for. Declared by the
 * CLIENT via this header, opt-in: an endpoint that forgets to declare itself
 * merely keeps the session alive, whereas defaulting the other way would sign
 * people out mid-task. Wrongly resetting is the smaller harm.
 */
export const BACKGROUND_POLL_HEADER = "x-srl-background-poll";

export function isBackgroundPollRequest(req: { headers?: Record<string, unknown> }): boolean {
  const v = req?.headers?.[BACKGROUND_POLL_HEADER];
  return v === "1" || v === "true";
}

// Concurrent session tracking: userId → Set of active token hashes
const activeSessions = new Map<string, Set<string>>();
const MAX_SESSIONS_ADMIN = 1;  // ADMIN/CEO: 1 concurrent session
const MAX_SESSIONS_DEFAULT = 3; // Others: 3 concurrent sessions

// Exported so the SSO callback keys staff_sessions with the SAME derivation
// the middleware looks up by. Note it TRUNCATES to 32 chars — reimplementing
// a plain sha256 elsewhere would silently never match.
export function getTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function getMaxSessions(role: string): number {
  if (role === "ADMIN" || role === "CEO") return MAX_SESSIONS_ADMIN;
  return MAX_SESSIONS_DEFAULT;
}

/** Role -> portal. FACTOR sits with staff: it is an internal counterparty
 *  login, not one of the three self-service portals. */
export function portalForRole(role: string): SessionPortalName {
  if (role === "CARRIER") return "CARRIER";
  if (role === "SHIPPER") return "SHIPPER";
  if (role === "DRIVER") return "DRIVER";
  return "AE";
}

/**
 * @param persistSession  Set false when the CALLER already writes the session
 *   row. The SSO callback does — it owns rememberMe, which nothing else knows —
 *   and a second upsert here made two writers for one row on one path. Their
 *   test caught it by asserting the write happens exactly once.
 */
export function registerSession(userId: string, token: string, role: string, rememberMe = false, persistSession = true): void {
  let sessions = activeSessions.get(userId);
  if (!sessions) {
    sessions = new Set();
    activeSessions.set(userId, sessions);
  }
  const hash = getTokenHash(token);
  const maxSessions = getMaxSessions(role);

  // If at limit, evict oldest session (FIFO — first added gets removed)
  if (sessions.size >= maxSessions && !sessions.has(hash)) {
    const oldest = sessions.values().next().value;
    if (oldest) sessions.delete(oldest);
  }
  sessions.add(hash);

  // Arc 34 — the PERSISTED half. The Set above is per-process and empties on
  // every restart, which on Render is every deploy; that is why idle timeout
  // was never actually enforced for carrier, shipper or driver. Fire-and-forget
  // because a login that already succeeded must not fail on a bookkeeping
  // write, and because the policy fails closed: a missing row costs a re-auth,
  // never an unbounded session.
  if (persistSession) {
    void createSession({ token, userId, portal: portalForRole(role), rememberMe }).catch((err) =>
      log.error({ err, userId, role }, "[Session] persisted session write failed"),
    );
  }
}

export function removeSession(userId: string, token: string): void {
  const sessions = activeSessions.get(userId);
  if (sessions) {
    sessions.delete(getTokenHash(token));
    if (sessions.size === 0) activeSessions.delete(userId);
  }
}

// SUPERSEDED 2026-08-25 — getSessionTimeout(role) returned the per-role idle
// window (60m for SHIPPER/CARRIER, 30m otherwise). It was exported and had zero
// callers. Ask lib/sessionPolicy instead: SESSION_IDLE_MS is the one answer,
// and it is the same answer for every portal.

/**
 * Sprint 53 (v3.8.aca) — Resolve the right portal-scoped JWT cookie for
 * this request. Pre-Sprint-53 a single `srl_token` cookie served all
 * portals and collided when one browser held AE + carrier sessions
 * concurrently. Now we set srl_token_ae / srl_token_carrier /
 * srl_token_shipper at mint time and pick by req.baseUrl here.
 *
 * Sprint 53.a (v3.8.acb) — Replaced substring `.includes("/carrier")`
 * with explicit allow-lists below. The substring match wrongly routed
 * AE-side endpoints like /api/carriers (plural), /api/carrier-pay, and
 * /api/carrier-calls to the carrier cookie, producing 403 on AE Console
 * when both portals were logged in the same browser (CARRIER token
 * failing authorize("ADMIN", ...) downstream). Allow-list is explicit
 * + audit-stable; new carrier-portal mounts must be added here.
 *
 * Known limitation (per §13.3 Item 161 V2 audit + Sprint 53.a decision):
 * /api/carrier (singular mixed mount, audience-split per carrier.ts) is
 * EXCLUDED from CARRIER_PORTAL_MOUNTS. Its 6 carrier-facing endpoints
 * (dashboard, scorecard, revenue, bonuses, onboarding-status, documents)
 * return AE-scoped data when both portals are logged in the same
 * browser. Real-world users hold one role per browser so the fallback
 * chain rescues. Architectural fix (split mount or X-Portal header)
 * tracked as Sprint 54+ candidate.
 *
 * Preference chain: portal-mount match → other portal cookies → legacy
 * `srl_token` (pre-Sprint-53 sessions, grace-period only). Role gating
 * still enforced by authorize() downstream, so a wrong-portal token will
 * fail there even if it slips through here.
 */
const CARRIER_PORTAL_MOUNTS = [
  "/api/carrier-auth",
  "/api/carrier-loads",
  "/api/carrier-compliance",
  "/api/carrier-payments",
  "/api/carrier-tenders",
  "/api/carrier-drivers", // v3.8.amw — Driver Academy T1 roster
];
const SHIPPER_PORTAL_MOUNTS = [
  "/api/shipper-portal",
];

function matchesPortalMount(baseUrl: string, mounts: string[]): boolean {
  return mounts.some((p) => baseUrl === p || baseUrl.startsWith(p + "/"));
}

/**
 * Sprint 67.a (v3.8.afz) — Return CANDIDATE token list, not single token.
 *
 * Pre-67.a this returned the first PRESENT cookie (preferred || fallback ||
 * legacy). The problem: if preferred is present but holds an INVALID JWT
 * (blacklisted, session-replaced, expired), authenticate would decode it,
 * fail, and 401 — even when a valid fallback cookie was sitting right
 * there. The Network tab evidence Wasi captured 2026-05-20 showed exactly
 * this: /api/carrier-auth/me returned 304 (carrier cookie valid) while
 * /api/notifications returned 401 (AE cookie preferred for non-portal-
 * mount routes, present but invalid, fallback never tried).
 *
 * Now returns an ordered array. authenticate tries each candidate in
 * order until one decodes + passes session/blacklist gates. First valid
 * wins. Empty cookies omitted; legacy still tried as final candidate.
 *
 * Root architectural fix for the auth-portal-bleed bug class that has
 * recurred since Sprint 53. Every prior fix addressed a symptom layer;
 * this fixes the resolver itself.
 */
function resolveCookieCandidates(req: AuthRequest): { tokens: string[]; meta: { baseUrl: string; isCarrierRoute: boolean; isShipperRoute: boolean } } {
  const cookies = req.cookies || {};
  const baseUrl = (req.baseUrl || "").toLowerCase();
  const isCarrierRoute = matchesPortalMount(baseUrl, CARRIER_PORTAL_MOUNTS);
  const isShipperRoute = matchesPortalMount(baseUrl, SHIPPER_PORTAL_MOUNTS);

  let ordered: (string | undefined)[];

  if (isCarrierRoute) {
    ordered = [cookies.srl_token_carrier, cookies.srl_token_ae, cookies.srl_token_shipper];
  } else if (isShipperRoute) {
    ordered = [cookies.srl_token_shipper, cookies.srl_token_ae, cookies.srl_token_carrier];
  } else {
    ordered = [cookies.srl_token_ae, cookies.srl_token_carrier, cookies.srl_token_shipper];
  }
  ordered.push(cookies[LEGACY_COOKIE_NAME]);

  // Dedupe + drop empty. authenticate tries each in order until one validates.
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of ordered) {
    if (t && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  }

  return { tokens, meta: { baseUrl, isCarrierRoute, isShipperRoute } };
}

/**
 * Try to authenticate a single token. Returns the resolved user + token
 * on success, or a typed reason on failure. Used by authenticate() which
 * iterates through candidate tokens until one passes.
 */
type TryAuthResult =
  | { ok: true; user: NonNullable<AuthRequest["user"]>; token: string }
  | { ok: false; reason: "invalid_jwt" | "blacklisted" | "user_not_found" | "user_inactive" | "session_replaced" | "session_timeout" | "session_ceiling" | "session_idle" | "session_expired"; status: number; errorBody: { error: string; code?: string } };

async function tryAuthenticateToken(token: string, isBackgroundPoll = false): Promise<TryAuthResult> {
  let payload: { userId?: unknown; purpose?: unknown; iat?: unknown };
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as { userId?: unknown; purpose?: unknown; iat?: unknown };
  } catch {
    return { ok: false, reason: "invalid_jwt", status: 401, errorBody: { error: "Invalid token" } };
  }

  // v3.8.amz (review fix) — explicit cross-token-class isolation. Driver
  // invite/session tokens (and any future purpose-scoped token) carry a
  // `purpose` claim and NO userId; reject them here so they can never be
  // honored on a User-authenticated route, even if a future refactor adds
  // an early payload-read before the DB lookup. Today they already fail at
  // the user lookup (id: undefined → null) — this makes the boundary
  // explicit rather than implicit.
  if (typeof payload.purpose === "string" || typeof payload.userId !== "string") {
    return { ok: false, reason: "invalid_jwt", status: 401, errorBody: { error: "Invalid token" } };
  }
  const userId = payload.userId;

  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    return { ok: false, reason: "blacklisted", status: 401, errorBody: { error: "Token has been revoked" } };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true },
  });

  if (!user) return { ok: false, reason: "user_not_found", status: 401, errorBody: { error: "User not found" } };
  if (!user.isActive) return { ok: false, reason: "user_inactive", status: 403, errorBody: { error: "Account has been deactivated" } };

  const sessions = activeSessions.get(user.id);
  const tokenHash = getTokenHash(token);
  if (sessions && sessions.size > 0 && !sessions.has(tokenHash)) {
    return { ok: false, reason: "session_replaced", status: 401, errorBody: { error: "Session ended — you logged in from another device", code: "SESSION_REPLACED" } };
  }

  // ── SUPERSEDED 2026-08-25 — the staff-only session policy used to run HERE ──
  //
  // WHAT IT DID, and when it was correct. Until today a staff-role branch ran
  // ahead of the block below: it read staff_sessions, called
  // resolveStaffSessionPolicy, enforced a 24h ceiling (30d + a 7-day rolling
  // idle for remember-me), touched lastSeenAt when stale, and returned early
  // for remember-me sessions. Against a staff-only rule that was right, and
  // its fail-closed design is what made an absent row safe rather than lucky.
  //
  // WHY IT IS GONE (Arc 34, ratified 2026-08-25: 30m idle / 12h absolute, all
  // four portals). Two defects, both proved live rather than reasoned about:
  //
  //   A. Its throttled touch wrote lastSeenAt = now BEFORE the block below
  //      re-read that same row, so the uniform idle rule judged a timestamp
  //      the previous branch had just refreshed. Staff idle was unenforceable.
  //      The touch was also ungated by the background-poll marker, so a 30s
  //      poll kept an abandoned desk signed in indefinitely. Control, same
  //      fixture and a 31-minute backdate, differing only in role:
  //          ADMIN   (staff)     -> 200, lastSeenAt refreshed to 0m
  //          CARRIER (non-staff) -> 401, row deleted by the refusal path
  //
  //   B. `if (verdict.bypassLegacyIdle) return { ok: true }` was an early
  //      return, so a remembered session never reached the uniform policy at
  //      all and kept its 7-day rolling idle.
  //
  // resolveStaffSessionPolicy still EXISTS and is still exported — its 24 tests
  // describe a pure function and all still pass. It simply no longer sits in
  // the request path. One judge, below, for every portal.

  // ── Arc 34: ONE policy, every portal ────────────────────────────────
  //
  // Replaces the in-memory idle check for all roles. That Map lived in the
  // process, so every deploy silently refreshed everyone's idle clock — a
  // 30-minute rule that any restart reset. Carrier, shipper and driver had no
  // enforced idle at all in practice.
  //
  // Absolute comes from the token's own iat and needs no row. Idle needs the
  // persisted lastSeenAt, which is why registerSession now writes one.
  const sessionRow = await prisma.staffSession
    .findUnique({ where: { tokenHash }, select: { lastSeenAt: true } })
    .catch(() => null);

  const verdict = resolveSessionPolicy({
    iatMs: typeof payload.iat === "number" ? payload.iat * 1000 : null,
    now: Date.now(),
    lastActivityAt: sessionRow?.lastSeenAt ?? null,
    sessionMissing: sessionRow === null,
    policyRolloutAtMs: POLICY_ROLLOUT_AT_MS,
  });

  if (!verdict.ok) {
    removeSession(user.id, token);
    // ONLY when a row was actually read.
    //
    // This delete used to run unconditionally, and the read directly above had
    // already returned null in the case that matters -- so there was nothing
    // for it to remove and it could ONLY ever destroy a row written
    // concurrently. registerSession persists fire-and-forget, so a login that
    // loses the race has an upsert in flight: if it landed between the
    // findUnique and this line, the delete removed the row that had just been
    // written and the session was dead for good rather than failing once and
    // working on retry.
    //
    // A refusal that read nothing removes nothing.
    if (sessionRow !== null) {
      await prisma.staffSession.delete({ where: { tokenHash } }).catch(() => {});
    }
    logAuthEvent(
      verdict.code === "SESSION_ABSOLUTE_EXPIRED" ? "session.expired_ceiling" : "session.expired_idle",
      { userId: user.id, email: user.email, role: user.role },
    );
    return {
      ok: false,
      reason: "session_expired",
      status: 401,
      errorBody: { error: verdict.message, code: verdict.code },
    };
  }

  // THE ONLY TOUCH. Throttled by the policy, so this is not an UPDATE per
  // request, and gated on the poll marker so a background poll authenticates
  // without counting as activity.
  //
  // The previous comment here claimed "background polls never reach here —
  // markBackgroundPoll short-circuits above". No such short-circuit existed;
  // the gate is the `!isBackgroundPoll` on this line and always was. It is
  // recorded because a comment describing a mechanism that does not exist is
  // worse than none: it invites the next reader to trust a guard nobody wrote.
  if (verdict.shouldTouch && !isBackgroundPoll) await touchSession(tokenHash);

  return { ok: true, user, token };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // Check Authorization header first
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    const result = await tryAuthenticateToken(token, isBackgroundPollRequest(req));
    if (result.ok) {
      req.user = result.user;
      req.token = token;
      Sentry.setUser({ id: result.user.id, email: result.user.email });
      Sentry.setTag("user.role", result.user.role);
      next();
      return;
    }
    res.status(result.status).json(result.errorBody);
    return;
  }

  // Sprint 67.a (v3.8.afz) — try candidate cookies in priority order. First
  // valid one wins. Pre-67.a only the preferred cookie was tried — if it
  // was present-but-invalid (blacklisted / session-replaced / expired)
  // the fallback chain was never consulted, producing 401 on routes the
  // user was legitimately authenticated for via a different portal cookie.
  const { tokens, meta } = resolveCookieCandidates(req);

  if (tokens.length === 0) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  let lastFailure: TryAuthResult | null = null;
  for (const candidate of tokens) {
    const result = await tryAuthenticateToken(candidate, isBackgroundPollRequest(req));
    if (result.ok) {
      req.user = result.user;
      req.token = candidate;
      Sentry.setUser({ id: result.user.id, email: result.user.email });
      Sentry.setTag("user.role", result.user.role);
      next();
      return;
    }
    lastFailure = result;
  }

  // Sprint 67.a — none of the candidate cookies validated. Return the
  // last failure reason (typically informative for the user agent flow).
  if (lastFailure && !lastFailure.ok) {
    res.status(lastFailure.status).json(lastFailure.errorBody);
    return;
  }

  res.status(401).json({ error: "Invalid token" });
  // meta logged via Sentry tag for ops triage
  Sentry.setTag("auth.portal_meta", JSON.stringify(meta));
}

// SUPERSEDED 2026-08-25 — a 10-minute interval swept stale `lastActivity`
// entries. With the Map gone it swept nothing. Expiry now lives in
// sweepExpiredSessions (lib/sessionStore), which deletes real rows.

// ─────────────────────────────────────────────────────────────────────────────
// v3.8.aue — ACCOUNT_EXECUTIVE effective-permission resolution.
//
// ACCOUNT_EXECUTIVE is deliberately NOT enumerated in the ~280 authorize()
// call-sites it is entitled to. It resolves centrally, here, as:
//
//     ACCOUNT_EXECUTIVE = (BROKER ∪ OPERATIONS) − ACCOUNT_EXECUTIVE_DENY
//
// DENY is evaluated BEFORE any grant, so an inherited BROKER/OPERATIONS grant
// can never leak a denied surface — and it still applies even if a future
// call-site names ACCOUNT_EXECUTIVE explicitly. Deny always wins.
//
// Do NOT add "ACCOUNT_EXECUTIVE" to individual authorize() lists. Widening the
// role means editing AE_INHERITED_ROLES or ACCOUNT_EXECUTIVE_DENY here, so the
// role's true reach stays readable in one place.
//
// The deprecated AE value is a separate, older role — see schema.prisma. It is
// NOT inherited and must not be used in new code.
// ─────────────────────────────────────────────────────────────────────────────

export const ACCOUNT_EXECUTIVE = "ACCOUNT_EXECUTIVE";

/** Roles ACCOUNT_EXECUTIVE inherits route grants from. */
export const AE_INHERITED_ROLES: readonly string[] = ["BROKER", "OPERATIONS"];

type DenyRule = { name: string; re: RegExp; methods?: string[] };

/**
 * Surfaces ACCOUNT_EXECUTIVE may never reach. Patterns are matched against the
 * NORMALIZED path (see normalizeRoutePath) and must therefore be lowercase and
 * carry no trailing slash.
 */
export const ACCOUNT_EXECUTIVE_DENY: readonly DenyRule[] = [
  // ── Money movement ────────────────────────────────────────────────────────
  { name: "accounting-payments", re: /^\/api\/accounting\/payments(\/|$)/ },
  { name: "accounting-fund", re: /^\/api\/accounting\/fund(\/|$)/ },
  { name: "accounting-credit", re: /^\/api\/accounting\/credit(\/|$)/ },
  { name: "quickpay-override", re: /^\/api\/loads\/[^/]+\/quickpay-override(\/|$)/ },
  // carrier-pay is granted to BROKER by a FILE-LEVEL guard (carrierPay.ts:9)
  // and 5 of its 6 routes have no per-route gate, so a per-route scan misses
  // it entirely. POST /carrier-pay/batch is a live settle path.
  { name: "carrier-pay", re: /^\/api\/carrier-pay(\/|$)/ },
  // Factoring moves money. The rest of /invoices/* is allowed.
  { name: "invoice-factoring", re: /^\/api\/invoices\/[^/]+\/factor(\/|$)/, methods: ["POST"] },

  // ── Admin surfaces: defense-in-depth ──────────────────────────────────────
  // Redundant today — neither BROKER nor OPERATIONS reaches these, so nothing
  // is inherited to deny. Kept so that if either role is ever added to an
  // admin route, ACCOUNT_EXECUTIVE does not silently acquire it too.
  { name: "admin-console", re: /^\/api\/admin(\/|$)/ },
  { name: "system-logs", re: /^\/api\/system-logs(\/|$)/ },
  { name: "audit-trail", re: /^\/api\/audit-trail(\/|$)/ },
];

/**
 * Normalize a request URL before deny-matching.
 *
 * Express routing is case-insensitive and non-strict about trailing slashes by
 * default, so `/API/Accounting/Payments/` and `/api/accounting/payments` reach
 * the same handler. A case-sensitive matcher would let the first bypass the
 * deny list. Strips query/hash, lowercases, collapses duplicate slashes, and
 * removes trailing slashes.
 */
export function normalizeRoutePath(originalUrl: string): string {
  let p = originalUrl || "";
  const cut = Math.min(
    ...[p.indexOf("?"), p.indexOf("#")].filter((i) => i !== -1).concat([p.length]),
  );
  p = p.slice(0, cut).toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** Returns the DenyRule that blocks this request, or null if none applies. */
export function matchAccountExecutiveDeny(method: string, originalUrl: string): DenyRule | null {
  const path = normalizeRoutePath(originalUrl);
  const verb = (method || "").toUpperCase();
  for (const rule of ACCOUNT_EXECUTIVE_DENY) {
    if (rule.methods && !rule.methods.includes(verb)) continue;
    if (rule.re.test(path)) return rule;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// v3.8.awy — CARRIER_REVIEWER effective-permission resolution.
//
// The mirror image of ACCOUNT_EXECUTIVE above. That role INHERITS broadly and is
// narrowed by a deny-list; this one inherits NOTHING and is widened by an
// allow-list:
//
//     CARRIER_REVIEWER = ∅ ∪ CARRIER_REVIEWER_ALLOW
//
// An allow-list rather than a deny-list because the role is defined by the short
// list of things it may do, not the long list it may not. Modelling it as
// "OPERATIONS minus everything dangerous" would mean every future grant to
// OPERATIONS silently widened it too — which is the failure mode a first-hire
// role can least afford.
//
// It is NOT enumerated at call sites, for the reason ACCOUNT_EXECUTIVE is not:
// the role's true reach must stay readable in one place. Do not add
// "CARRIER_REVIEWER" to individual authorize() lists.
//
// WHAT IT MAY DO — approve, decline, start review, request info, cancel an info
// request, re-vet, and verify/reject/upload carrier documents. Every one is
// reversible from this same seat (a decline is undone by lift-rejection), which
// is what makes the set delegable: it is queue work, not policy.
//
// WHAT IT MAY NEVER DO, and why each is excluded rather than merely absent:
//   terminate an agreement   — hard-blocks the carrier from every tender
//   sign/create an agreement — signing CLEARS AGREEMENT_TERMINATED, so granting
//                              it would let this role un-terminate a carrier it
//                              cannot terminate (the awx asymmetry, not repeated)
//   any compliance override  — scoped or blanket; §14 reserves the judgment call
//   authority-grant-date     — an INPUT to the <12-month absolute. Excluding the
//                              block but not its input would be theatre
//   quickpay-override        — the per-load FEE. Quick Pay ENROLMENT is a
//                              different thing and is also excluded here, being
//                              a money decision rather than a queue decision
//   grace-period, suspend, delete/restore, emergency-approve, test-account flag
//
// Deny-by-default: anything not matched below is refused, so a new carrier route
// does not silently join this role's reach by resembling one that did.
//
// ONE HONEST LIMIT, stated because the allow-list reads stronger than it is.
// This resolution runs INSIDE authorize(), so it bounds the routes that HAVE an
// authorize() gate. It does not bound the 144 routes that have none — those are
// reachable by any authenticated principal, and CARRIER_REVIEWER is no exception.
// That is not a hole this role opens (every employee role has the same reach
// there) and it is not a reason to delay the role, but "the allow-list is its
// entire reach" is only true of gated routes. The ungated inventory is
// enumerated and frozen in routeAuthorizeCoverage.test.ts; as it shrinks, this
// caveat shrinks with it.
// ─────────────────────────────────────────────────────────────────────────────

export const CARRIER_REVIEWER = "CARRIER_REVIEWER";

type AllowRule = { name: string; re: RegExp; methods?: string[] };

/**
 * The complete reach of CARRIER_REVIEWER. Matched against the NORMALIZED path
 * (see normalizeRoutePath), so patterns are lowercase and carry no trailing
 * slash. `methods` is required on every rule: a bare path grant would hand this
 * role every verb the route family exposes, and DELETE /carriers/:id lives in
 * the same family as the reads it legitimately needs.
 */
export const CARRIER_REVIEWER_ALLOW: readonly AllowRule[] = [
  // ── Reading the queue ─────────────────────────────────────────────────────
  { name: "carriers-list", re: /^\/api\/carriers$/, methods: ["GET"] },
  { name: "carrier-detail", re: /^\/api\/carriers\/[^/]+$/, methods: ["GET"] },
  { name: "carrier-score", re: /^\/api\/carriers\/[^/]+\/score$/, methods: ["GET"] },
  { name: "vetting-report", re: /^\/api\/carriers\/[^/]+\/vetting-report$/, methods: ["GET"] },
  { name: "vetting-history", re: /^\/api\/carriers\/[^/]+\/(vetting-history|compass-history)$/, methods: ["GET"] },
  { name: "carrier-inspections", re: /^\/api\/carriers\/[^/]+\/inspections$/, methods: ["GET"] },
  { name: "carrier-agreements-read", re: /^\/api\/carriers\/[^/]+\/agreements$/, methods: ["GET"] },
  { name: "carrier-documents-read", re: /^\/api\/carriers\/[^/]+\/documents$/, methods: ["GET"] },
  { name: "carrier-document-file", re: /^\/api\/carriers\/[^/]+\/documents\/[^/]+\/file$/, methods: ["GET"] },
  { name: "compliance-carrier-read", re: /^\/api\/compliance\/carrier\/[^/]+$/, methods: ["GET"] },

  // ── Working the queue ─────────────────────────────────────────────────────
  { name: "start-review", re: /^\/api\/carriers\/[^/]+\/start-review$/, methods: ["POST"] },
  { name: "approve", re: /^\/api\/carriers\/[^/]+\/approve$/, methods: ["POST"] },
  { name: "reject", re: /^\/api\/carriers\/[^/]+\/reject$/, methods: ["POST"] },
  { name: "lift-rejection", re: /^\/api\/carriers\/[^/]+\/lift-rejection$/, methods: ["POST"] },
  { name: "full-vet", re: /^\/api\/carriers\/[^/]+\/full-vet$/, methods: ["POST"] },

  // ── Info requests ─────────────────────────────────────────────────────────
  { name: "info-requests-list", re: /^\/api\/info-requests$/, methods: ["GET"] },
  { name: "info-request-create", re: /^\/api\/info-requests$/, methods: ["POST"] },
  { name: "info-request-cancel", re: /^\/api\/info-requests\/[^/]+\/cancel$/, methods: ["PATCH"] },

  // ── Documents on the application ──────────────────────────────────────────
  { name: "carrier-document-upload", re: /^\/api\/carriers\/[^/]+\/documents$/, methods: ["POST"] },
  { name: "carrier-document-verify", re: /^\/api\/carriers\/[^/]+\/documents\/[^/]+$/, methods: ["PATCH"] },
];

/** Returns the AllowRule permitting this request, or null if none does. */
export function matchCarrierReviewerAllow(method: string, originalUrl: string): AllowRule | null {
  const path = normalizeRoutePath(originalUrl);
  const verb = (method || "").toUpperCase();
  for (const rule of CARRIER_REVIEWER_ALLOW) {
    if (rule.methods && !rule.methods.includes(verb)) continue;
    if (rule.re.test(path)) return rule;
  }
  return null;
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const deny = (reason: string) => {
      if (req.user) {
        prisma.systemLog.create({
          data: {
            logType: "SECURITY",
            severity: "WARNING",
            source: "authorize",
            message: `Access denied: ${req.user.email} (${req.user.role}) attempted ${req.method} ${req.originalUrl} — ${reason}`,
            ipAddress: clientIp(req),
          },
        }).catch((e) => log.warn({ err: e }, "[Auth] Audit log write failed:"));
      }
      res.status(403).json({ error: "Insufficient permissions" });
    };

    if (!req.user) {
      deny(`required: ${roles.join(", ")}`);
      return;
    }

    // DENY FIRST — before any grant, inherited or explicit.
    if (req.user.role === ACCOUNT_EXECUTIVE) {
      const rule = matchAccountExecutiveDeny(req.method, req.originalUrl);
      if (rule) {
        deny(`ACCOUNT_EXECUTIVE denied by rule: ${rule.name}`);
        return;
      }
    }

    // v3.8.awy — CARRIER_REVIEWER resolves ENTIRELY here, and deny-by-default.
    //
    // It inherits nothing, so `roles.includes(...)` can never grant it: the role
    // is not named at any call site by design. The allow-list is its whole reach,
    // and anything unmatched is refused — so a carrier route added later does not
    // join this role by resembling one that did.
    if (req.user.role === CARRIER_REVIEWER) {
      const allow = matchCarrierReviewerAllow(req.method, req.originalUrl);
      if (!allow) {
        deny("CARRIER_REVIEWER: not on the carrier-review allow-list");
        return;
      }
      next();
      return;
    }

    const granted =
      roles.includes(req.user.role) ||
      (req.user.role === ACCOUNT_EXECUTIVE && AE_INHERITED_ROLES.some((r) => roles.includes(r)));

    if (!granted) {
      deny(`required: ${roles.join(", ")}`);
      return;
    }
    next();
  };
}
