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
import { isStaffRole, resolveStaffSessionPolicy } from "../lib/sessionPolicy";

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

// Server-side inactivity timeouts (ms)
const SESSION_TIMEOUT_EMPLOYEE = 30 * 60 * 1000; // 30 minutes
const SESSION_TIMEOUT_SHIPPER = 60 * 60 * 1000;  // 60 minutes
const SESSION_TIMEOUT_CARRIER = 60 * 60 * 1000;  // 60 minutes

// In-memory last-activity tracker (per userId)
const lastActivity = new Map<string, number>();

// Concurrent session tracking: userId → Set of active token hashes
const activeSessions = new Map<string, Set<string>>();
const MAX_SESSIONS_ADMIN = 1;  // ADMIN/CEO: 1 concurrent session
const MAX_SESSIONS_DEFAULT = 3; // Others: 3 concurrent sessions

function getTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function getMaxSessions(role: string): number {
  if (role === "ADMIN" || role === "CEO") return MAX_SESSIONS_ADMIN;
  return MAX_SESSIONS_DEFAULT;
}

export function registerSession(userId: string, token: string, role: string): void {
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
}

export function removeSession(userId: string, token: string): void {
  const sessions = activeSessions.get(userId);
  if (sessions) {
    sessions.delete(getTokenHash(token));
    if (sessions.size === 0) activeSessions.delete(userId);
  }
}

export function getSessionTimeout(role: string): number {
  if (role === "SHIPPER") return SESSION_TIMEOUT_SHIPPER;
  if (role === "CARRIER") return SESSION_TIMEOUT_CARRIER;
  return SESSION_TIMEOUT_EMPLOYEE;
}

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
  | { ok: false; reason: "invalid_jwt" | "blacklisted" | "user_not_found" | "user_inactive" | "session_replaced" | "session_timeout" | "session_ceiling" | "session_idle"; status: number; errorBody: { error: string; code?: string } };

async function tryAuthenticateToken(token: string): Promise<TryAuthResult> {
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

  // ── Staff session policy: ceiling from iat, idle from the PERSISTED row ────
  //
  // The legacy idle check below is an in-memory Map that empties on every
  // process restart, so on Render a deploy silently refreshed everyone's idle
  // clock. Staff enforcement therefore runs here, off persisted state. A
  // remember-me session then skips the legacy check entirely — its own 7-day
  // rolling idle governs instead. Portal roles fall straight through.
  if (isStaffRole(user.role)) {
    const persisted = await prisma.staffSession
      .findUnique({ where: { tokenHash }, select: { rememberMe: true, lastSeenAt: true } })
      .catch(() => null);

    const iatMs = typeof payload.iat === "number" ? payload.iat * 1000 : null;
    const verdict = resolveStaffSessionPolicy({ role: user.role, iatMs, now: Date.now(), session: persisted });

    if (!verdict.ok) {
      lastActivity.delete(user.id);
      removeSession(user.id, token);
      await prisma.staffSession.delete({ where: { tokenHash } }).catch(() => {});
      logAuthEvent(verdict.reason === "ceiling" ? "session.expired_ceiling" : "session.expired_idle", {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      return { ok: false, reason: `session_${verdict.reason}`, status: 401, errorBody: { error: verdict.message, code: verdict.code } };
    }

    // Throttled: only written when genuinely stale, so this is not a
    // per-request UPDATE. At 7-day granularity the lost precision is nil.
    if (verdict.shouldTouch) {
      await prisma.staffSession.update({ where: { tokenHash }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }

    if (verdict.bypassLegacyIdle) return { ok: true, user, token };
  }

  const last = lastActivity.get(user.id);
  const timeout = getSessionTimeout(user.role);
  if (last && Date.now() - last > timeout) {
    lastActivity.delete(user.id);
    removeSession(user.id, token);
    return { ok: false, reason: "session_timeout", status: 401, errorBody: { error: "Session expired due to inactivity", code: "SESSION_TIMEOUT" } };
  }

  return { ok: true, user, token };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // Check Authorization header first
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    const result = await tryAuthenticateToken(token);
    if (result.ok) {
      lastActivity.set(result.user.id, Date.now());
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
    const result = await tryAuthenticateToken(candidate);
    if (result.ok) {
      lastActivity.set(result.user.id, Date.now());
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

// Cleanup stale entries periodically (every 10 min)
setInterval(() => {
  const now = Date.now();
  const maxTimeout = 60 * 60 * 1000; // 1 hour max
  for (const [userId, ts] of lastActivity) {
    if (now - ts > maxTimeout) lastActivity.delete(userId);
  }
}, 10 * 60 * 1000);

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
            ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || null,
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
