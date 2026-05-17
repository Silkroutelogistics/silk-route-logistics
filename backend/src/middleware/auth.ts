import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";
import { LEGACY_COOKIE_NAME } from "../utils/cookies";
import { log } from "../lib/logger";

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
];
const SHIPPER_PORTAL_MOUNTS = [
  "/api/shipper-portal",
];

function matchesPortalMount(baseUrl: string, mounts: string[]): boolean {
  return mounts.some((p) => baseUrl === p || baseUrl.startsWith(p + "/"));
}

function resolveCookieToken(req: AuthRequest): string | undefined {
  const cookies = req.cookies || {};
  const baseUrl = (req.baseUrl || "").toLowerCase();
  const isCarrierRoute = matchesPortalMount(baseUrl, CARRIER_PORTAL_MOUNTS);
  const isShipperRoute = matchesPortalMount(baseUrl, SHIPPER_PORTAL_MOUNTS);

  let preferred: string | undefined;
  let fallbacks: (string | undefined)[];

  if (isCarrierRoute) {
    preferred = cookies.srl_token_carrier;
    fallbacks = [cookies.srl_token_ae, cookies.srl_token_shipper];
  } else if (isShipperRoute) {
    preferred = cookies.srl_token_shipper;
    fallbacks = [cookies.srl_token_ae, cookies.srl_token_carrier];
  } else {
    preferred = cookies.srl_token_ae;
    fallbacks = [cookies.srl_token_carrier, cookies.srl_token_shipper];
  }

  // Legacy single-cookie name read as final fallback so pre-Sprint-53
  // sessions don't bounce mid-deploy. Removed once all browsers have
  // rotated through a fresh login (clearTokenCookie also wipes it).
  return preferred || fallbacks.find(Boolean) || cookies[LEGACY_COOKIE_NAME];
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // Check Authorization header first, then fall back to portal-scoped cookie
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : resolveCookieToken(req);

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    // Explicit algorithm to prevent algorithm confusion attacks
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as { userId: string };

    // Check if token has been revoked (logout blacklist)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      res.status(401).json({ error: "Token has been revoked" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Check if user account is still active
    if (!user.isActive) {
      res.status(403).json({ error: "Account has been deactivated" });
      return;
    }

    // Concurrent session check — reject if this token was evicted
    const sessions = activeSessions.get(user.id);
    const tokenHash = getTokenHash(token);
    if (sessions && sessions.size > 0 && !sessions.has(tokenHash)) {
      res.status(401).json({ error: "Session ended — you logged in from another device", code: "SESSION_REPLACED" });
      return;
    }

    // Server-side inactivity timeout check
    const last = lastActivity.get(user.id);
    const timeout = getSessionTimeout(user.role);
    if (last && Date.now() - last > timeout) {
      lastActivity.delete(user.id);
      removeSession(user.id, token);
      res.status(401).json({ error: "Session expired due to inactivity", code: "SESSION_TIMEOUT" });
      return;
    }
    // Update last activity timestamp
    lastActivity.set(user.id, Date.now());

    req.user = user;
    req.token = token; // Store for logout blacklisting
    Sentry.setUser({ id: user.id, email: user.email });
    Sentry.setTag("user.role", user.role);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Cleanup stale entries periodically (every 10 min)
setInterval(() => {
  const now = Date.now();
  const maxTimeout = 60 * 60 * 1000; // 1 hour max
  for (const [userId, ts] of lastActivity) {
    if (now - ts > maxTimeout) lastActivity.delete(userId);
  }
}, 10 * 60 * 1000);

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      // Log unauthorized access attempt
      if (req.user) {
        prisma.systemLog.create({
          data: {
            logType: "SECURITY",
            severity: "WARNING",
            source: "authorize",
            message: `Access denied: ${req.user.email} (${req.user.role}) attempted ${req.method} ${req.originalUrl} — required: ${roles.join(", ")}`,
            ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || null,
          },
        }).catch((e) => log.warn({ err: e }, "[Auth] Audit log write failed:"));
      }
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
