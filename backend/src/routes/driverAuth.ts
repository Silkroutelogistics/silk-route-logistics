import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/database";
import { validateBody } from "../middleware/validate";
import { authenticateDriver, DriverRequest, logDriverAuthEvent } from "../middleware/driverAuth";
import {
  verifyDriverInviteToken,
  mintDriverSessionToken,
  DRIVER_SESSION_MAX_AGE_MS,
} from "../lib/driverToken";
import { setTokenCookie, clearTokenCookie } from "../utils/cookies";
import { blacklistToken, isTokenBlacklisted } from "../utils/tokenBlacklist";
import { normalizePhoneE164 } from "../lib/phoneNormalization";
import { isWeakPin } from "../lib/pinValidation";

/**
 * v3.8.amz — SRL Driver Academy Sprint T2: driver phone + PIN authentication.
 *
 * Public surface (token IS the auth): POST /set-pin consumes an invite token
 * and sets the driver's 6-digit PIN. POST /login authenticates phone + PIN.
 * Authenticated surface (authenticateDriver): GET /me, POST /logout.
 *
 * Drivers are NOT platform Users — the session token carries driverId +
 * carrierProfileId + purpose "driver-training" only (see lib/driverToken.ts).
 *
 * Security posture (post-review hardening, v3.8.amz):
 *  - Login is enumeration-safe: identical generic 401 + a constant bcrypt
 *    compare (dummy hash) on every failure path, so neither the response
 *    nor the timing reveals whether a phone exists. A 423 "locked" is only
 *    returned when the CORRECT pin is supplied for a locked account (an
 *    attacker without the PIN can never reach it).
 *  - Multi-carrier same-phone is handled by matching the PIN across all
 *    activated drivers on that phone (each driver's own PIN matches their
 *    own record), so no driver is permanently unreachable.
 *  - set-pin is atomic (updateMany WHERE trainingPinHash IS NULL) and makes
 *    the invite token single-use (blacklist on consume) so a leaked/old link
 *    can't be replayed across a carrier PIN reset.
 */

const router = Router();

// Mirror carrierAuth.loginLimiter (15-min window, 20 attempts/IP). The
// per-driver lockout (5 fails → 15-min lock) is the second layer.
const driverLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

// set-pin is public (token-authed) — stricter cap than login.
const setPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const INACTIVE_DRIVER_STATUSES = ["INACTIVE", "TERMINATED"];
const MAX_PHONE_CANDIDATES = 5;

// Precomputed dummy hash so the no-driver / no-match login paths still spend
// a bcrypt.compare — removes the timing side-channel that would otherwise
// leak whether a phone exists on the roster.
const DUMMY_PIN_HASH = bcrypt.hashSync("000000", 12);

const PIN_REGEX = /^\d{6}$/;

const setPinSchema = z.object({
  token: z.string().min(10),
  pin: z.string().regex(PIN_REGEX, "PIN must be exactly 6 digits"),
});

const loginSchema = z.object({
  phone: z.string().min(7).max(20),
  pin: z.string().min(1).max(12),
});

function publicDriver(d: { id: string; firstName: string; lastName: string }) {
  return { id: d.id, firstName: d.firstName, lastName: d.lastName };
}

function clientIp(req: Request): string | null {
  return (req.headers["x-forwarded-for"] as string) || req.ip || null;
}

// POST /api/driver-auth/set-pin — consume invite token, set PIN, auto-login.
router.post("/set-pin", setPinLimiter, validateBody(setPinSchema), async (req: Request, res: Response) => {
  const { token, pin } = req.body as z.infer<typeof setPinSchema>;

  if (isWeakPin(pin)) {
    res.status(400).json({ error: "That PIN is too easy to guess. Choose a less obvious 6-digit PIN." });
    return;
  }

  const payload = verifyDriverInviteToken(token);
  if (!payload) {
    res.status(400).json({ error: "This invite link is invalid or has expired. Ask your carrier to send a new one." });
    return;
  }

  // Single-use: a consumed invite token is blacklisted on first use, so a
  // leaked/old link can't be replayed even after a carrier PIN reset.
  if (await isTokenBlacklisted(token)) {
    res.status(400).json({ error: "This invite link has already been used. Ask your carrier to send a new one, or sign in with your PIN." });
    return;
  }

  const driver = await prisma.driver.findUnique({
    where: { id: payload.driverId },
    select: { id: true, carrierProfileId: true, firstName: true, lastName: true, status: true, trainingPinHash: true },
  });

  if (!driver || !driver.carrierProfileId || driver.carrierProfileId !== payload.carrierProfileId) {
    res.status(400).json({ error: "This invite link is invalid or has expired. Ask your carrier to send a new one." });
    return;
  }
  if (INACTIVE_DRIVER_STATUSES.includes(driver.status)) {
    res.status(403).json({ error: "Your driver profile is inactive. Contact your carrier." });
    return;
  }
  // Replay guard: once a PIN is set, an old invite link cannot reset it.
  if (driver.trainingPinHash) {
    res.status(409).json({ error: "Your account is already set up. Please sign in with your PIN.", code: "ALREADY_ACTIVATED" });
    return;
  }

  const pinHash = await bcrypt.hash(pin, 12);
  // Atomic compare-and-set: only set if STILL null. A concurrent set-pin
  // (e.g. an old link racing a fresh one after reset) hits count===0 and
  // gets 409 instead of silently overwriting the winner's PIN.
  const result = await prisma.driver.updateMany({
    where: { id: driver.id, trainingPinHash: null },
    data: {
      trainingPinHash: pinHash,
      trainingPinSetAt: new Date(),
      trainingFailedAttempts: 0,
      trainingLockedUntil: null,
      trainingLastLoginAt: new Date(),
    },
  });
  if (result.count === 0) {
    res.status(409).json({ error: "Your account is already set up. Please sign in with your PIN.", code: "ALREADY_ACTIVATED" });
    return;
  }

  // Consume the invite token so it can never be replayed.
  await blacklistToken(token, driver.id, "invite-consumed").catch(() => {});
  void logDriverAuthEvent(`Driver ${driver.id} activated training PIN`, "INFO", clientIp(req));

  // Auto-login: issue a session so the driver lands straight in the portal.
  const sessionToken = mintDriverSessionToken(driver.id, driver.carrierProfileId);
  setTokenCookie(res, sessionToken, "DRIVER", DRIVER_SESSION_MAX_AGE_MS);
  res.json({ driver: publicDriver(driver), activated: true });
});

// POST /api/driver-auth/login — phone + PIN.
router.post("/login", driverLoginLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  const { phone, pin } = req.body as z.infer<typeof loginSchema>;
  const GENERIC = "Invalid phone number or PIN.";
  const now = Date.now();

  const normalized = normalizePhoneE164(phone);
  if (!normalized) {
    await bcrypt.compare(pin, DUMMY_PIN_HASH); // constant-time: no early-out
    res.status(401).json({ error: GENERIC });
    return;
  }

  // All activated, non-inactive drivers on this phone. Matching the PIN
  // across ALL of them (not findFirst) is what keeps a same-phone driver at
  // a second carrier reachable — each driver's own PIN matches their record.
  const candidates = await prisma.driver.findMany({
    where: {
      phone: normalized,
      trainingPinHash: { not: null },
      carrierProfileId: { not: null },
      status: { notIn: ["INACTIVE", "TERMINATED"] },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PHONE_CANDIDATES,
    select: { id: true, carrierProfileId: true, firstName: true, lastName: true, trainingPinHash: true, trainingFailedAttempts: true, trainingLockedUntil: true },
  });

  if (candidates.length === 0) {
    await bcrypt.compare(pin, DUMMY_PIN_HASH); // constant-time
    res.status(401).json({ error: GENERIC });
    return;
  }

  let matched: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    if (c.trainingPinHash && (await bcrypt.compare(pin, c.trainingPinHash))) {
      matched = c;
      break;
    }
  }

  if (!matched) {
    // Wrong PIN for every candidate — count the failure against the
    // non-locked ones, locking any that cross the threshold.
    await Promise.all(
      candidates
        .filter((c) => !(c.trainingLockedUntil && c.trainingLockedUntil.getTime() > now))
        .map((c) => {
          const attempts = c.trainingFailedAttempts + 1;
          const locking = attempts >= MAX_FAILED;
          return prisma.driver.update({
            where: { id: c.id },
            data: {
              trainingFailedAttempts: locking ? 0 : attempts,
              trainingLockedUntil: locking ? new Date(now + LOCKOUT_MS) : c.trainingLockedUntil,
            },
          });
        }),
    );
    void logDriverAuthEvent(`Driver login PIN mismatch on phone (${candidates.length} candidate(s))`, "WARNING", clientIp(req));
    res.status(401).json({ error: GENERIC });
    return;
  }

  // Correct PIN. If that specific account is locked, surface 423 — only
  // reachable WITH the correct PIN, so it leaks nothing to an attacker.
  if (matched.trainingLockedUntil && matched.trainingLockedUntil.getTime() > now) {
    const mins = Math.ceil((matched.trainingLockedUntil.getTime() - now) / 60000);
    res.status(423).json({ error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, code: "LOCKED" });
    return;
  }

  if (!matched.carrierProfileId) {
    res.status(401).json({ error: GENERIC });
    return;
  }

  await prisma.driver.update({
    where: { id: matched.id },
    data: { trainingFailedAttempts: 0, trainingLockedUntil: null, trainingLastLoginAt: new Date() },
  });

  const sessionToken = mintDriverSessionToken(matched.id, matched.carrierProfileId);
  setTokenCookie(res, sessionToken, "DRIVER", DRIVER_SESSION_MAX_AGE_MS);
  res.json({ driver: publicDriver(matched) });
});

// GET /api/driver-auth/me — current driver + carrier context.
router.get("/me", authenticateDriver, async (req: DriverRequest, res: Response) => {
  const driver = await prisma.driver.findUnique({
    where: { id: req.driver!.id },
    select: {
      id: true, firstName: true, lastName: true, phone: true, status: true,
      carrierProfile: { select: { companyName: true } },
    },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  res.json({
    driver: { id: driver.id, firstName: driver.firstName, lastName: driver.lastName, phone: driver.phone, status: driver.status },
    carrierName: driver.carrierProfile?.companyName || null,
  });
});

// POST /api/driver-auth/logout — revoke token + clear cookie.
router.post("/logout", authenticateDriver, async (req: DriverRequest, res: Response) => {
  if (req.token) {
    await blacklistToken(req.token, req.driver!.id, "driver-logout").catch(() => {});
  }
  clearTokenCookie(res, "DRIVER");
  res.json({ ok: true });
});

export default router;
