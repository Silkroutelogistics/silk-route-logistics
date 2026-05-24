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
import {
  createOtp,
  verifyOtp as verifyOtpCode,
  getLastOtpCreatedAt,
  createEmailVerificationToken,
  peekEmailVerificationToken,
  consumeEmailVerificationToken,
  getEmailVerificationResendCooldown,
} from "../services/otpService";
import { sendOtpEmail, sendEmailVerificationEmail } from "../services/emailService";
import { resolveCountry, extractClientIp, detectUnusualActivity } from "../services/geoService";
import { sendOtpSms } from "../services/openPhoneService";
import { resolveInfoRequest, getCategoryLabel } from "../services/infoRequestService";
import { upload } from "../config/upload";
import { uploadFile } from "../services/storageService";
import path from "path";
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

// v3.8.ajv C6 — Strong-password Zod chain mirrors the registration
// validator at validators/carrier.ts:10-15 (γ "Very Strong" tier from
// v3.8.aix). Pre-ajv the change-password + force-change-password schemas
// accepted `min(8)` only, allowing a carrier to downgrade from a strong
// registration password to `12345678`. Account-takeover path: attacker
// who briefly gets in via credential stuffing downgrades to weak value,
// retains access after legitimate carrier resets to a new strong pw.
// HIBP not re-checked server-side per the registration's same precedent
// (frontend handles that check; backend enforces composition rules).
const STRONG_PASSWORD = z.string()
  .min(14, "Password must be at least 14 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: STRONG_PASSWORD,
});

const forceChangePasswordSchema = z.object({
  newPassword: STRONG_PASSWORD,
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

  // v3.8.ajf — Unusual-activity detection at OTP-send time.
  // Compare current login IP's country against the user's last-known
  // login country. If they differ, send the OTP via BOTH email AND SMS
  // (defense-in-depth — account compromise typically captures password
  // + email but not phone). If they match (or no prior login data),
  // email-only as before.
  const currentIp = extractClientIp(req);
  const unusualResult = detectUnusualActivity({
    currentIp,
    lastLoginCountry: user.lastLoginCountry,
  });

  // Send OTP instead of issuing JWT directly
  const code = await createOtp(user.id);
  sendOtpEmail(user.email, user.firstName, code).catch((err) =>
    log.error({ err: err }, "[Carrier OTP Email] Failed to send:"),
  );

  // v3.8.ajy C7 — Honor active admin override that suppresses unusual-
  // activity SMS dispatch for this carrier. Cross-border owner-ops +
  // carriers that legitimately log in from multiple countries hit the
  // SMS gate every login until AE marks them as "trusted multi-country."
  // Override reuses Sprint 40's ComplianceOverride table with
  // checkCode=UNUSUAL_OTP_SMS_DISABLE — inherits 24h expiry + 15/30-day
  // quota + audit trail without new schema. AE applies via the
  // SecuritySignalsCard button on /dashboard/carriers carrier detail.
  let unusualOtpSmsOverrideActive = false;
  if (unusualResult.isUnusual) {
    const override = await prisma.complianceOverride.findFirst({
      where: {
        carrierId: profile.id,
        checkCode: "UNUSUAL_OTP_SMS_DISABLE",
        expiresAt: { gt: new Date() },
      },
      select: { id: true, expiresAt: true },
    });
    if (override) {
      unusualOtpSmsOverrideActive = true;
      // INFO-severity log so AE forensic timeline shows the suppression
      // happened (vs. a missing-event mystery). Carrier-facing response
      // unchanged — fraudster shouldn't learn from this either way.
      prisma.systemLog.create({
        data: {
          logType: "SECURITY",
          severity: "INFO",
          source: "carrierAuth-unusual-activity-override",
          message: `Unusual login for ${user.email} (${unusualResult.reason}) — SMS dispatch suppressed by active AE override (id: ${override.id}, expires: ${override.expiresAt.toISOString()}).`,
          ipAddress: currentIp || null,
        },
      }).catch(() => {});
    }
  }

  // Dual-channel: also send SMS when unusual + user has a phone on file
  // AND no active suppression override. SMS failure is non-fatal — email
  // is the primary channel; SMS is enhancement. Carrier still receives
  // the email OTP and can complete login normally. Failure is logged
  // for AE forensics.
  if (unusualResult.isUnusual && user.phone && !unusualOtpSmsOverrideActive) {
    sendOtpSms(user.phone, code).catch((err) =>
      log.error({ err, userId: user.id }, "[Carrier OTP SMS] Failed to send (unusual activity):"),
    );

    // SystemLog the detection for AE forensic review. NOT shown to
    // the carrier in the login response — avoid cluing in a fraudster
    // about the detection logic.
    prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: "WARNING",
        source: "carrierAuth-unusual-activity",
        message: `Unusual login attempt for ${user.email}: ${unusualResult.reason}. Dual-channel OTP dispatched (email + SMS).`,
        ipAddress: currentIp || null,
      },
    }).catch(() => {});
  }

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

  // v3.8.ajf — Update lastLoginIp + lastLoginCountry on successful OTP
  // verify so the NEXT login attempt has a current baseline to compare
  // against. Existing `lastLogin DateTime?` field is set elsewhere via
  // middleware; we only write the two new geo fields here.
  const currentLoginIp = extractClientIp(req);
  const currentLoginCountry = resolveCountry(currentLoginIp);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginIp: currentLoginIp || null,
      lastLoginCountry: currentLoginCountry,
      lastLogin: new Date(),
    },
  }).catch((err) => log.error({ err, userId: user.id }, "[Carrier OTP] lastLogin geo update failed"));

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

  // v3.8.ajf — Same last-login geo update as the OTP-verify path. TOTP
  // is the terminal success step for 2FA-enabled users, so the baseline
  // for next-login comparison must be written here.
  const totpLoginIp = extractClientIp(req);
  const totpLoginCountry = resolveCountry(totpLoginIp);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginIp: totpLoginIp || null,
      lastLoginCountry: totpLoginCountry,
      lastLogin: new Date(),
    },
  }).catch((err) => log.error({ err, userId: user.id }, "[Carrier TOTP] lastLogin geo update failed"));

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
      // v3.8.aje — emailVerifiedAt drives the "verify your email" state on
      // the carrier-portal status page. When null, the page renders a
      // top-of-card banner with a Resend Verification button.
      emailVerifiedAt: true,
      carrierProfile: {
        select: {
          id: true,
          companyName: true,
          mcNumber: true,
          dotNumber: true,
          onboardingStatus: true,
          createdAt: true,
          approvedAt: true,
          // v3.8.ajk — Rejection fields surfaced on the carrier portal
          // RejectedSection (reason badge + AE note + reapply date with
          // countdown + reapply CTA when eligible).
          rejectionReason: true,
          rejectedAt: true,
          rejectionNote: true,
          reapplyEligibleAt: true,
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
    emailVerifiedAt: user.emailVerifiedAt,
    // v3.8.ajk — Rejection metadata for RejectedSection rendering.
    rejectionReason: profile.rejectionReason,
    rejectedAt: profile.rejectedAt,
    rejectionNote: profile.rejectionNote,
    reapplyEligibleAt: profile.reapplyEligibleAt,
  });
});

// v3.8.aje Sprint A — Email verification.
// PUBLIC endpoint (no auth — the token IS the auth). Carrier clicks the
// link in their verification email which lands on /carrier/verify-email?
// token=<token>; the frontend page POSTs the token here. Backend:
//   1. peek the token (validates, doesn't burn yet)
//   2. resolve click-IP country via geoip-lite
//   3. transactional update: mark User.emailVerifiedAt + capture
//      emailVerifiedFromIp + emailVerifiedFromCountry, AND consume the
//      token. Atomic — if either write fails, both roll back so the
//      token is still usable for a retry.
// Returns whether registration country and verification country matched
// (the AE-visible fraud signal). Frontend just shows "verified" on
// success; the geo-mismatch lives in the AE drawer.
const verifyEmailSchema = z.object({ token: z.string().min(1) });
router.post("/verify-email", validateBody(verifyEmailSchema), async (req: Request, res: Response) => {
  const { token } = req.body;

  const peek = await peekEmailVerificationToken(token);
  if (!peek) {
    res.status(400).json({ error: "This verification link is invalid or has expired. Please request a new one from your application status page." });
    return;
  }

  // Idempotent: already-verified user can re-click without error.
  const existing = await prisma.user.findUnique({
    where: { id: peek.userId },
    select: { emailVerifiedAt: true, carrierProfile: { select: { registrationCountry: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.emailVerifiedAt) {
    // Consume the token anyway to clean up
    await consumeEmailVerificationToken(peek.otpId).catch(() => {});
    res.json({ verified: true, alreadyVerified: true });
    return;
  }

  const clickIp = extractClientIp(req);
  const clickCountry = resolveCountry(clickIp);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: peek.userId },
        data: {
          emailVerifiedAt: new Date(),
          emailVerifiedFromIp: clickIp || null,
          emailVerifiedFromCountry: clickCountry,
        },
      }),
      prisma.otpCode.update({
        where: { id: peek.otpId },
        data: { used: true },
      }),
    ]);
  } catch (err) {
    log.error({ err, userId: peek.userId }, "[Email Verify] Transaction failed");
    res.status(500).json({ error: "Verification could not be recorded. Please try again." });
    return;
  }

  // Surface geo-mismatch as a SystemLog row so AE forensics can find it
  // alongside the security signal stream. NOT shown to the carrier —
  // they only see the success state. Surfaces in AE drawer follow-up.
  const registrationCountry = existing.carrierProfile?.registrationCountry;
  const geoMismatch =
    registrationCountry && clickCountry && registrationCountry !== clickCountry;
  if (geoMismatch) {
    await prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: "WARNING",
        source: "emailVerification",
        message: `Email verified for user ${peek.userId} from ${clickCountry} but registered from ${registrationCountry} — country mismatch flagged for AE review.`,
        ipAddress: clickIp || null,
      },
    }).catch(() => {});
  }

  res.json({
    verified: true,
    alreadyVerified: false,
    // Frontend doesn't need geo data; this is server-side fraud signal.
  });
});

// v3.8.aje — Resend verification email.
// Carrier-authenticated (carrier must be logged in to request a resend
// from their application-status page). 60-second cooldown enforced via
// the latest VERIFY: token's createdAt. SUSPENDED carriers are already
// blocked at login so they can never reach here.
router.post("/resend-verification", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.emailVerifiedAt) {
    res.status(409).json({ error: "Your email is already verified." });
    return;
  }

  const cooldown = await getEmailVerificationResendCooldown(user.id);
  if (cooldown > 0) {
    res.status(429).json({
      error: `Please wait ${Math.ceil(cooldown / 1000)} second(s) before requesting another verification email.`,
      cooldownMs: cooldown,
    });
    return;
  }

  try {
    const token = await createEmailVerificationToken(user.id);
    const verifyUrl = `https://silkroutelogistics.ai/carrier/verify-email?token=${token}`;
    await sendEmailVerificationEmail(user.email, user.firstName, verifyUrl);
    res.json({ sent: true });
  } catch (err) {
    log.error({ err, userId: user.id }, "[Email Verify] Resend failed");
    res.status(500).json({ error: "Could not send verification email. Please try again in a moment." });
    return;
  }
});

// v3.8.ajh — Carrier-side InfoRequest endpoints.
//
// List OPEN requests for the authenticated carrier. Used by the
// application-status page to render the InfoRequestedSection list.
// Resolved + cancelled requests omitted by default — carrier only
// sees what they need to act on (avoids confusion with historical
// resolved requests). AE-side list endpoint sees all statuses.
router.get("/info-requests", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });

  if (!carrier) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const requests = await prisma.infoRequest.findMany({
    where: { carrierId: carrier.id, status: "OPEN" },
    orderBy: { createdAt: "asc" }, // oldest first so carrier resolves in order
    select: {
      id: true,
      category: true,
      message: true,
      createdAt: true,
    },
  });

  res.json({
    requests: requests.map((r) => ({
      ...r,
      categoryLabel: getCategoryLabel(r.category),
    })),
  });
});

// v3.8.aji — Resolve an OPEN info request with optional file attachments.
// Switched from JSON body to multipart/form-data. resolvedNote comes as
// a form field; files come as the `files[]` array (max 5). multer parses
// both before this handler runs.
//
// Flow: (1) carrier auth + ownership verified upfront by re-fetching
// the request with carrier scope (defense — service does this too but
// we want to gate file upload before doing any S3 writes). (2) Files
// uploaded to S3 + Document rows created with infoRequestId linkage.
// (3) Service called to mark RESOLVED + flip status + send AE email
// with attachment count. If service throws (e.g. request was already
// resolved by a concurrent click), uploaded docs are tied to the same
// request via infoRequestId — they're recoverable rather than lost.
router.post(
  "/info-requests/:id/resolve",
  authenticate,
  authorize("CARRIER"),
  upload.array("files", 5),
  async (req: AuthRequest, res: Response) => {
    try {
      const resolvedNote = (req.body?.resolvedNote || "").toString().trim();
      if (resolvedNote.length < 1) {
        res.status(400).json({ error: "Please provide a response" });
        return;
      }
      if (resolvedNote.length > 5000) {
        res.status(400).json({ error: "Response must be 5000 characters or less" });
        return;
      }

      // Verify request exists + belongs to this carrier + is OPEN before
      // burning S3 storage on uploads.
      const request = await prisma.infoRequest.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          status: true,
          carrier: { select: { id: true, userId: true } },
        },
      });
      if (!request) {
        res.status(404).json({ error: "Info request not found" });
        return;
      }
      if (request.carrier.userId !== req.user!.id) {
        res.status(403).json({ error: "Not authorized to resolve this request" });
        return;
      }
      if (request.status !== "OPEN") {
        res.status(409).json({ error: "This request has already been resolved or cancelled" });
        return;
      }

      // Upload attachments + create Document rows linking back to this
      // info request. Sequential rather than parallel to keep S3 calls
      // ordered + simplify error handling on partial-upload failures.
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      const uploadedDocs: Array<{ id: string; fileName: string; fileUrl: string }> = [];
      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        const storagePath = `carrier-docs/${request.carrier.id}/info-request-${request.id}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
        const fileUrl = await uploadFile(file.buffer, storagePath, file.mimetype);
        const doc = await prisma.document.create({
          data: {
            fileName: file.originalname,
            fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
            entityType: "CARRIER",
            entityId: request.carrier.id,
            docType: "INFO_REQUEST_RESPONSE",
            status: "PENDING",
            uploadSource: "CARRIER_PORTAL",
            userId: req.user!.id,
            infoRequestId: request.id,
          },
        });
        uploadedDocs.push({ id: doc.id, fileName: doc.fileName, fileUrl: doc.fileUrl });
      }

      const updated = await resolveInfoRequest({
        requestId: req.params.id,
        carrierUserId: req.user!.id,
        resolvedNote,
        attachmentCount: uploadedDocs.length,
      });

      res.json({ request: updated, attachments: uploadedDocs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resolve info request";
      log.error({ err, requestId: req.params.id, userId: req.user!.id }, "[InfoRequest] Carrier resolve failed");
      const status =
        msg === "Info request not found" ? 404 :
        msg === "Not authorized to resolve this request" ? 403 :
        msg === "This request has already been resolved or cancelled" ? 409 :
        500;
      res.status(status).json({ error: msg });
    }
  },
);

export default router;
