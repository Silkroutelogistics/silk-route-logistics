import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";

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
  // Use last 16 chars as a lightweight fingerprint to avoid storing full tokens
  return token.slice(-16);
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

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // Check Authorization header first, then fall back to httpOnly cookie
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : req.cookies?.srl_token;

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
        }).catch(() => {});
      }
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
