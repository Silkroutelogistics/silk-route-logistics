import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { authenticate, authorize, AuthRequest, registerSession, removeSession } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { setTokenCookie, clearTokenCookie } from "../utils/cookies";
import { blacklistToken } from "../utils/tokenBlacklist";
import { createOtp, verifyOtp as verifyOtpCode, getLastOtpCreatedAt } from "../services/otpService";
import { sendOtpEmail } from "../services/emailService";
import { verifyTotpCode } from "../services/totpService";
import { z } from "zod";
import { log } from "../lib/logger";

const router = Router();

// Sprint 53 (v3.8.aca) — Item 14: bumped 5→20 in parallel with routes/auth.ts
// after a manual lifecycle smoke locked out testing across legitimate retries.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

const carrierLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const forceChangePasswordSchema = z.object({
  newPassword: z.string().min(8),
});

const carrierOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});

const carrierTotpSchema = z.object({
  totpToken: z.string().min(1),
  code: z.string().min(1),
});

const carrierResendOtpSchema = z.object({
  email: z.string().email(),
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many verification attempts. Please try again later." },
});

// POST /api/carrier-auth/login — Carrier login step 1: validate password, send OTP
router.post("/login", loginLimiter, validateBody(carrierLoginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { carrierProfile: true },
  });

  if (!user || user.role !== "CARRIER") {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account has been deactivated. Contact support." });
    return;
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    res.status(423).json({
      error: `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
      lockedUntil: user.lockedUntil,
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    const MAX_FAILED = 5;
    const LOCKOUT_MS = 30 * 60 * 1000;
    const updateData: Record<string, unknown> = { failedLoginAttempts: newAttempts };
    if (newAttempts >= MAX_FAILED) {
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    }
    await prisma.user.update({ where: { id: user.id }, data: updateData }).catch(() => {});

    await prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: newAttempts >= MAX_FAILED ? "ERROR" : "WARNING",
        source: "carrierAuth",
        message: newAttempts >= MAX_FAILED
          ? `Carrier account locked for ${email} after ${newAttempts} failed attempts`
          : `Failed carrier login attempt for ${email} (attempt ${newAttempts}/${MAX_FAILED})`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || null,
      },
    }).catch(() => {});

    if (newAttempts >= MAX_FAILED) {
      res.status(423).json({ error: "Account has been temporarily locked due to too many failed attempts. Try again in 30 minutes." });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
    return;
  }

  // Reset failed attempts on successful login
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    }).catch(() => {});
  }

  const profile = user.carrierProfile;
  if (!profile) {
    res.status(403).json({ error: "No carrier profile found. Please complete registration first." });
    return;
  }

  // Send OTP instead of issuing JWT directly
  const code = await createOtp(user.id);
  sendOtpEmail(user.email, user.firstName, code).catch((err) =>
    log.error({ err: err }, "[Carrier OTP Email] Failed to send:"),
  );

  res.json({ pendingOtp: true, email: user.email });
});

// POST /api/carrier-auth/verify-otp — Carrier login step 2: verify OTP
router.post("/verify-otp", otpVerifyLimiter, validateBody(carrierOtpSchema), async (req: Request, res: Response) => {
  const { email, code } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { carrierProfile: true },
  });

  if (!user || user.role !== "CARRIER") {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const result = await verifyOtpCode(user.id, code);

  if (result.locked) {
    res.status(429).json({ error: "Too many failed attempts. Please request a new code in 15 minutes." });
    return;
  }

  if (!result.success) {
    const msg = result.attemptsRemaining !== undefined && result.attemptsRemaining > 0
      ? `Invalid code. ${result.attemptsRemaining} attempt(s) remaining.`
      : "Invalid or expired code";
    res.status(401).json({ error: msg });
    return;
  }

  // v3.8.ajd Sprint 1 — non-APPROVED carriers MAY log in now.
  // Frontend routes them to /carrier/dashboard/application-status which
  // renders state-specific content (review status, info requests, rejection
  // reason + reapply date, suspension notice). Full dashboard access stays
  // gated to APPROVED carriers — enforced by the layout-level redirect
  // for non-APPROVED status AND by per-route APPROVED checks at
  // carrierLoads.ts:31/169 and elsewhere that already key off APPROVED.
  // The login response carries onboardingStatus so the frontend can
  // route the user immediately after OTP success.
  const profile = user.carrierProfile!;
  if (profile.onboardingStatus === "SUSPENDED") {
    // SUSPENDED is the one terminal state where we still block login —
    // a suspended carrier should contact compliance@, not poke around
    // the portal. PENDING/REVIEWING/INFO_REQUESTED/REJECTED all let
    // the carrier in so they can see status or rejection reason.
    res.status(403).json({
      error: "Your carrier account has been suspended. Contact compliance@silkroutelogistics.ai for assistance.",
      onboardingStatus: profile.onboardingStatus,
    });
    return;
  }

  // Check if TOTP 2FA is enabled — require additional verification
  if (user.totpEnabled) {
    const totpTempToken = jwt.sign(
      { userId: user.id, purpose: "totp-verification" },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "5m" } as jwt.SignOptions,
    );
    res.json({ pendingTotp: true, totpToken: totpTempToken });
    return;
  }

  // Issue full JWT (profile already declared above)
  const mustChangePassword = !user.passwordChangedAt;
  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  registerSession(user.id, token, "CARRIER");
  setTokenCookie(res, token, "CARRIER");

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entity: "Session",
      changes: "Carrier login via OTP",
      ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    },
  }).catch(() => {});

  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, company: user.company },
    carrier: {
      id: profile.id, companyName: profile.companyName, mcNumber: profile.mcNumber, dotNumber: profile.dotNumber,
      tier: profile.tier, cppTier: profile.cppTier, onboardingStatus: profile.onboardingStatus, status: profile.status,
      equipmentTypes: profile.equipmentTypes, operatingRegions: profile.operatingRegions,
    },
    mustChangePassword,
    token,
  });
});

// POST /api/carrier-auth/totp-verify — Carrier login step 3 (if 2FA enabled): verify TOTP
router.post("/totp-verify", otpVerifyLimiter, validateBody(carrierTotpSchema), async (req: Request, res: Response) => {
  const { totpToken, code } = req.body;

  let payload: { userId: string; purpose?: string };
  try {
    payload = jwt.verify(totpToken, env.JWT_SECRET, { algorithms: ["HS256"] }) as any;
  } catch {
    res.status(401).json({ error: "Expired or invalid token. Please log in again." });
    return;
  }

  if (payload.purpose !== "totp-verification") {
    res.status(403).json({ error: "Invalid token for this operation" });
    return;
  }

  const valid = await verifyTotpCode(payload.userId, code);
  if (!valid) {
    res.status(401).json({ error: "Invalid authenticator code" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { carrierProfile: true },
  });

  if (!user || !user.carrierProfile) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // v3.8.ajd Sprint 1 — TOTP path mirrors the OTP path's allow-with-status
  // semantic. SUSPENDED is the only state that still hard-blocks login;
  // PENDING/REVIEWING/INFO_REQUESTED/REJECTED route to the application
  // status page after JWT issuance.
  if (user.carrierProfile.onboardingStatus === "SUSPENDED") {
    res.status(403).json({
      error: "Your carrier account has been suspended. Contact compliance@silkroutelogistics.ai for assistance.",
      onboardingStatus: user.carrierProfile.onboardingStatus,
    });
    return;
  }

  const profile = user.carrierProfile;
  const mustChangePassword = !user.passwordChangedAt;
  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  registerSession(user.id, token, "CARRIER");
  setTokenCookie(res, token, "CARRIER");

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entity: "Session",
      changes: "Carrier login via OTP + 2FA",
      ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    },
  }).catch(() => {});

  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, company: user.company },
    carrier: {
      id: profile.id, companyName: profile.companyName, mcNumber: profile.mcNumber, dotNumber: profile.dotNumber,
      tier: profile.tier, cppTier: profile.cppTier, onboardingStatus: profile.onboardingStatus, status: profile.status,
      equipmentTypes: profile.equipmentTypes, operatingRegions: profile.operatingRegions,
    },
    mustChangePassword,
    token,
  });
});

// POST /api/carrier-auth/resend-otp — Resend OTP for carrier login
router.post("/resend-otp", loginLimiter, validateBody(carrierResendOtpSchema), async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "CARRIER") {
    res.json({ message: "If an account exists, a new code has been sent" });
    return;
  }

  const lastCreated = await getLastOtpCreatedAt(user.id);
  if (lastCreated && Date.now() - lastCreated.getTime() < 60 * 1000) {
    res.status(429).json({ error: "Please wait before requesting a new code" });
    return;
  }

  const code = await createOtp(user.id);
  await sendOtpEmail(user.email, user.firstName, code);
  res.json({ message: "Code sent" });
});

// POST /api/carrier-auth/change-password — Carrier changes password
router.post("/change-password", authenticate, validateBody(changePasswordSchema), async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  if (!user || user.role !== "CARRIER") {
    res.status(403).json({ error: "Not a carrier account" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash, passwordChangedAt: new Date() },
  });

  // Blacklist old token before issuing new one
  if (req.token) {
    removeSession(req.user!.id, req.token);
    await blacklistToken(req.token, req.user!.id, "password-change").catch(() => {});
  }

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  registerSession(user.id, token, "CARRIER");
  setTokenCookie(res, token, "CARRIER");

  res.json({ success: true, token });
});

// POST /api/carrier-auth/force-change-password — First-login password set
router.post("/force-change-password", authenticate, validateBody(forceChangePasswordSchema), async (req: AuthRequest, res: Response) => {
  const { newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  if (!user || user.role !== "CARRIER") {
    res.status(403).json({ error: "Not a carrier account" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash, passwordChangedAt: new Date() },
  });

  if (req.token) {
    removeSession(req.user!.id, req.token);
    await blacklistToken(req.token, req.user!.id, "force-password-change").catch(() => {});
  }

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  registerSession(user.id, token, "CARRIER");
  setTokenCookie(res, token, "CARRIER");

  res.json({ success: true, token });
});

// POST /api/carrier-auth/logout — Clear cookie + blacklist token
router.post("/logout", authenticate, async (req: AuthRequest, res: Response) => {
  if (req.token) {
    removeSession(req.user!.id, req.token);
    await blacklistToken(req.token, req.user!.id, "logout").catch(() => {});
  }
  clearTokenCookie(res, "CARRIER");
  res.json({ success: true });
});

// GET /api/carrier-auth/me — Get carrier profile + user info
// Sprint 67.a (v3.8.afz) — defense-in-depth role gate. Pre-67.a /me only
// used authenticate middleware. If the candidate-token loop slipped an
// AE/SHIPPER token through (unlikely now with the new resolver but
// defensive), /me would return their user data on a carrier-portal
// endpoint. authorize("CARRIER") rejects non-CARRIER users explicitly.
router.get("/me", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, firstName: true, lastName: true, role: true, company: true, phone: true,
      carrierProfile: {
        include: {
          scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

// v3.8.ajd Sprint 1 — Carrier application status endpoint.
// Returns state-specific data for /carrier/dashboard/application-status.
// PENDING / REVIEWING: header context + submittedAt + supportive copy.
// INFO_REQUESTED: open info requests (v3.8.aje model lands here).
// APPROVED: approvedAt + cleared-to-operate flag (carrier should rarely
//   hit this surface — layout routes APPROVED carriers to the regular
//   dashboard — but kept defensive so a stale browser tab doesn't 404).
// REJECTED: rejectionReason + reapplyEligibleAt (v3.8.aje fields).
// SUSPENDED: not reachable here — login is blocked at the OTP/TOTP gate.
router.get("/application-status", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, firstName: true, lastName: true, company: true,
      carrierProfile: {
        select: {
          id: true,
          companyName: true,
          mcNumber: true,
          dotNumber: true,
          onboardingStatus: true,
          createdAt: true,
          approvedAt: true,
        },
      },
    },
  });

  if (!user || !user.carrierProfile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const profile = user.carrierProfile;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      company: user.company,
    },
    carrier: {
      id: profile.id,
      companyName: profile.companyName,
      mcNumber: profile.mcNumber,
      dotNumber: profile.dotNumber,
    },
    onboardingStatus: profile.onboardingStatus,
    submittedAt: profile.createdAt,
    approvedAt: profile.approvedAt,
    // INFO_REQUESTED.infoRequests + REJECTED.rejectionReason/reapplyEligibleAt
    // wire in here in v3.8.aje once the schema lands. Keep the endpoint
    // shape stable so the frontend status page can add per-state sections
    // without contract churn.
  });
});

export default router;
