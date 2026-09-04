import { queueDocumentIntake } from "../services/documentIntakeService";
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../config/database";
import { logAuthEvent } from "../lib/authEvents";
import { mintStepUpToken, STEP_UP_WINDOW_MINUTES, STEP_UP_ACTIONS } from "../lib/stepUpToken";
import { requireStepUp } from "../middleware/requireStepUp";
import { generateTotpSetup, verifyTotpCode, enableTotp, issueBackupCodes } from "../services/totpService";
import { caseInsensitiveEmailFilter } from "../lib/emailNormalization";
import { env } from "../config/env";
import { authenticate, authorize, AuthRequest, registerSession, removeSession, getTokenHash } from "../middleware/auth";
import { revokeSession } from "../lib/sessionStore";
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
import { sendOtpEmail, sendEmailVerificationEmail, sendExecutedAgreementEmail } from "../services/emailService";
import { resolveCountry, extractClientIp, detectUnusualActivity } from "../services/geoService";
import { sendOtpSms } from "../services/openPhoneService";
import { resolveInfoRequest, getCategoryLabel } from "../services/infoRequestService";
import { upload } from "../config/upload";
import { uploadFile, uploadFileToPath, getFileStream } from "../services/storageService";
// v3.8.aqh — agreement PDFs (skill-chrome multi-page legal doc).
// v3.8.asa — generic entry points. The BCA-only generators were the reason a
// signed Quick Pay Agreement could not be produced as a document at all.
import {
  generateAgreementPdf,
  generateAgreementBuffer,
  agreementPdfFilename,
} from "../services/agreementPdfService";
import { getAgreement, BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT, QP_VERSION, BCA_VERSION } from "../data/agreements";
// v3.8.asb — the Quick Pay pilot state. One resolver, so the carrier-facing
// gate and the pricing gates answer the same question the same way.
import { getLatestQuickPayEnrollment, notifyQuickPayPilotRequested } from "../controllers/carrierController";
import path from "path";
import { z } from "zod";
import { uploadLimiter } from "../middleware/rateLimiters";
import { log } from "../lib/logger";
import { clientIp, clientUserAgent } from "../lib/clientIp";
import { agreementContentHash, CanonicalCountersign } from "../lib/canonicalAgreementText";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../config/authority";

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

  // v3.8.ald — case-insensitive lookup.
  const user = await prisma.user.findFirst({
    where: caseInsensitiveEmailFilter(email),
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
        ipAddress: clientIp(req),
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
      ipAddress: clientIp(req) || "",
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
      ipAddress: clientIp(req) || "",
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
  // v3.8.ald — case-insensitive lookup.
  const user = await prisma.user.findFirst({ where: caseInsensitiveEmailFilter(email) });
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
    // Arc 34 — kill the PERSISTED row too, not just the in-memory Set. Without
    // this the row outlived the logout that ended it: harmless (the token is
    // blacklisted, and the policy would refuse it) but it left staff_sessions
    // holding rows for sessions a person had explicitly ended, until a sweep.
    // Logging out should mean the record of the session is gone.
    await revokeSession(getTokenHash(req.token)).catch(() => {});
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

// ─────────────────────────────────────────────────────────────
// Track 1 (2026-06-24) — Post-approval carrier activation.
//
// After an AE approves a carrier, the carrier completes a short activation
// step in their own portal:
//   • Sign the Broker-Carrier Agreement  (REQUIRED — creates the
//     CarrierAgreement{status:"SIGNED"} row that
//     complianceMonitorService.complianceCheck() hard-gates on, which is
//     what actually unlocks tendering. A typed legal name + checkbox is an
//     enforceable B2B e-signature under ESIGN/UETA; the full audit trail is
//     persisted on the agreement row.)
//   • Elect Quick Pay  (OPTIONAL + reversible — consent to the Caravan Quick
//     Pay Agreement. NEVER a hauling gate. Default off = standard Net terms.)
//
// All three endpoints require onboardingStatus === "APPROVED" (you do not
// put a binding contract in front of an applicant you might still reject).
// Per CLAUDE.md §16, the BCA/QP TEXT shown still needs Michigan attorney
// sign-off before go-live; this mechanism records the signature/consent
// against whatever the attorney-final document version is (bcaVersion /
// qpVersion), so the document can be swapped without a rebuild.
// ─────────────────────────────────────────────────────────────

// Resolve the calling carrier's CarrierProfile (mirrors /me +
// /application-status). Returns null -> caller responds 404.
/**
 * Where the executed copy goes. `contactEmail` first, login email as the
 * fallback — the same precedence notifyBidAction and the tender emails use, so
 * a carrier who nominated a dispatch address gets their paperwork there.
 */
async function resolveSignerEmail(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, carrierProfile: { select: { contactEmail: true } } },
  });
  return u?.carrierProfile?.contactEmail || u?.email || null;
}

/**
 * Email the executed copy and record on the row whether it actually went.
 *
 * NEVER THROWS, and never rolls anything back. It runs after the signature row
 * has committed and after the response has been sent, so the only thing a
 * failure may do is be recorded. What it must not do is disappear: the calling
 * blocks end in `.catch(() => {})`, so an error escaping this function would be
 * swallowed by that and the carrier would silently never receive their
 * agreement. Hence the internal try/catch and the persisted reason.
 *
 * The BUFFER IS PASSED IN, not regenerated. It is the same artefact just written
 * to storage, and PDF renders are not byte-stable — regenerating would email a
 * different file than the one on record for that execution.
 */
async function deliverExecutedCopy(
  agreementId: string,
  userId: string,
  params: { documentTitle: string; version: string; signedByName: string; pdf: Buffer; fileName: string },
): Promise<void> {
  try {
    const to = await resolveSignerEmail(userId);
    if (!to) throw new Error("No email on file for the signer");
    await sendExecutedAgreementEmail(to, params);
    await prisma.carrierAgreement.update({
      where: { id: agreementId },
      data: { executedCopySent: true, executedCopySentAt: new Date(), executedCopySendError: null },
    });
  } catch (err: any) {
    const reason = String(err?.message ?? err).slice(0, 500);
    log.error({ err, agreementId }, "[Agreement] executed-copy email FAILED — recorded on the row, not swallowed");
    await prisma.carrierAgreement
      .update({
        where: { id: agreementId },
        data: { executedCopySent: false, executedCopySentAt: null, executedCopySendError: reason },
      })
      .catch(() => {
        // If even the report cannot be written the log line above is the only
        // record. Recording a failure must never itself throw into the caller.
      });
  }
}

async function loadActivationProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      carrierProfile: {
        select: {
          id: true,
          onboardingStatus: true,
          activatedAt: true,
          quickPayEnabled: true,
          quickPayAgreedAt: true,
          quickPayVersion: true,
        },
      },
    },
  });
  return user?.carrierProfile ?? null;
}

// Carrier legal identity for the executed agreement PDF signature block.
async function loadCarrierIdentity(profileId: string) {
  const p = await prisma.carrierProfile.findUnique({
    where: { id: profileId },
    select: { companyName: true, mcNumber: true, dotNumber: true },
  });
  return {
    legalName: p?.companyName || "Carrier",
    mcNumber: p?.mcNumber || null,
    dotNumber: p?.dotNumber || null,
    ein: null,
  };
}

// GET /api/carrier-auth/agreement/:type — canonical agreement content (version +
// sections). PUBLIC: non-sensitive legal text, served to BOTH the approved
// carrier (activation review pane) and the pre-approval applicant (onboarding
// click-through) so every surface renders from ONE source and the signed
// version is always the backend canonical.
//
// v3.8.asb — the missing-middleware asymmetry against the /pdf sibling below
// is DELIBERATE, not an oversight. Recorded here so it is not "fixed" later:
//   - Gating this route would break onboarding. The click-through runs before
//     approval, so the applicant has no CARRIER session to authenticate with.
//   - The response is static: title, subtitle, version, preamble, sections.
//     It is the same terms a carrier is asked to sign before doing business,
//     and a prospective carrier reading them before applying is the intended
//     use. Nothing here is keyed to a carrier.
//   - /pdf IS gated because it renders the carrier's OWN executed copy —
//     signer name, title, timestamp and signer IP. That is carrier-specific
//     and must stay behind authenticate + authorize("CARRIER").
// Public body, private execution. Keep it that way.
router.get("/agreement/:type", async (req: AuthRequest, res: Response) => {
  const agreement = getAgreement(req.params.type);
  if (!agreement) {
    res.status(404).json({ error: "Unknown agreement" });
    return;
  }
  res.json({
    templateName: agreement.templateName,
    title: agreement.title,
    subtitle: agreement.subtitle,
    version: agreement.version,
    effectiveNote: agreement.effectiveNote,
    preamble: agreement.preamble,
    sections: agreement.sections,
  });
});

// GET /api/carrier-auth/agreement/:type/pdf — branded PDF, opens inline in a new
// tab. Executed copy (signer/date/IP + attestation) once signed, review copy
// otherwise.
router.get("/agreement/:type/pdf", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const agreement = getAgreement(req.params.type);
  if (!agreement) {
    res.status(404).json({ error: "Unknown agreement" });
    return;
  }
  const profile = await loadActivationProfile(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  const identity = await loadCarrierIdentity(profile.id);
  // v3.8.asa — signature lookup keys off the RESOLVED agreement, not a
  // hardcoded "broker-carrier". Pre-asa this route 404'd on quick-pay and,
  // had it not, would have stamped the BCA signature onto a Quick Pay PDF.
  const signed = await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: agreement.templateName },
    orderBy: { signedAt: "desc" },
  });
  const signature =
    signed && signed.signedAt
      ? {
          signedByName: signed.signedByName || identity.legalName,
          signedByTitle: signed.signedByTitle,
          signedAt: signed.signedAt,
          signerIp: signed.signerIp,
          version: signed.version,
        }
      : undefined;
  // The countersignature comes from the STORED ROW, so a copy downloaded
  // years later still names whoever bound the company at the time. NULL on
  // the two agreements executed before B8, which render without it — which
  // is true of them.
  const countersign =
    signed && signed.counterSignedByName && signed.counterSignedByTitle && signed.counterSignedAt
      ? {
          name: signed.counterSignedByName,
          title: signed.counterSignedByTitle,
          at: signed.counterSignedAt,
        }
      : undefined;
  // v3.8.bae — D1: AN EXECUTED AGREEMENT IS SERVED AS EXECUTED.
  //
  // This route called getAgreement(type) with no version, so it rendered the
  // LIVE body while the attestation printed the version the carrier actually
  // signed. Reproduced on the one real Quick Pay carrier: one PDF containing
  // both "2026-09-04-v5" in the body and "2026-08-16-v4" in the attestation.
  // A carrier who signed v4 was shown v5 and told they had signed it.
  //
  // The archive was built for exactly this and the route simply never asked for
  // it. Three sources, in order of fidelity:
  //
  //   1. THE STORED COPY. Bytes generated at signing, hashed at signing. This
  //      is the document, not a reconstruction of it, so it wins whenever it
  //      exists. All three signed rows in production have one.
  //   2. THE ARCHIVED BODY, re-rendered. Used when no copy was stored — the
  //      pre-v3.8.aqh rows, and any future storage failure.
  //   3. Refusal. If the signed version resolves to a DIFFERENT body, the
  //      archive is missing and there is no faithful document to serve.
  //
  // Refusing is deliberate and it is the whole point. getAgreement falls back
  // to the current body when a version is not archived, silently — which is the
  // defect this commit removes, so re-serving that fallback here would remove
  // it in one place and reinstate it in the other. A 409 names the missing
  // archive and is fixed by archiving; a wrong document is not fixed by
  // anything, because nobody can see that it is wrong.
  if (signed) {
    if (signed.documentUrl) {
      try {
        const stored = await getFileStream(signed.documentUrl);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${agreementPdfFilename({ ...agreement, version: signed.version })}"`,
        );
        stored.pipe(res);
        return;
      } catch (err) {
        // A stored copy that cannot be read must not block the carrier from
        // their own agreement. Fall through and re-render the archived body,
        // which is the same document by construction.
        log.warn(
          { agreementId: signed.id, err: err instanceof Error ? err.message : String(err) },
          "[agreement-pdf] stored copy unreadable, re-rendering from the archive",
        );
      }
    }

    const executed = getAgreement(req.params.type, signed.version);
    if (!executed || executed.version !== signed.version) {
      res.status(409).json({
        error:
          `This agreement was signed on version ${signed.version}, which is not archived. ` +
          `Serving the current body would show you a document you did not sign. ` +
          `Contact compliance@silkroutelogistics.ai.`,
        code: "AGREEMENT_VERSION_UNARCHIVED",
      });
      return;
    }

    const executedDoc = generateAgreementPdf(executed, {
      carrier: identity,
      signature,
      countersign,
      shell: true,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${agreementPdfFilename(executed)}"`);
    executedDoc.pipe(res);
    return;
  }

  // Unsigned: the current body, as a specimen. No signature, no countersign —
  // there is nothing to attest to yet.
  const doc = generateAgreementPdf(agreement, {
    carrier: identity,
    signature,
    countersign,
    shell: true,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${agreementPdfFilename(agreement)}"`);
  doc.pipe(res);
});

// GET /api/carrier-auth/activation-status — what the carrier still needs to
// do post-approval. bcaSigned reads the SAME query the compliance gate +
// vetting use (carrierAgreement findFirst status SIGNED, latest by signedAt),
// so the portal can never disagree with the gate.
// ─── Mandatory 2FA enrollment (Arc 11 B1-ENROLLMENT) ────────────────────────
//
// Two steps on purpose. Setup hands over a QR and a typed key; confirm proves
// the authenticator actually works before anything is armed. Nothing is enabled
// until a real code round-trips, so a carrier cannot strand themselves behind a
// second factor they never successfully paired.
//
// Backup codes are issued at CONFIRM, not at setup, and shown exactly once —
// since v3.8.atl they are stored as bcrypt hashes and cannot be read back.

router.post("/totp/setup", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { email: true, totpEnabled: true },
  });
  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  if (user.totpEnabled) {
    // Re-running setup would mint a new secret and silently invalidate the
    // authenticator the carrier is currently using.
    res.status(409).json({
      error: "Two-factor authentication is already set up on this account.",
      code: "TOTP_ALREADY_ENABLED",
    });
    return;
  }

  const setup = await generateTotpSetup(req.user!.id, user.email);
  logAuthEvent("totp.setup_started", { userId: req.user!.id, req });

  res.json({
    qrCode: setup.qrCodeDataUrl,
    // The typed fallback, for a carrier whose phone cannot scan the screen it is
    // being shown on — which is most of them, since both are often one device.
    manualKey: setup.secret,
    appHint: "Google Authenticator, Microsoft Authenticator, or any authenticator app",
  });
});

const totpConfirmSchema = z.object({ code: z.string().trim().min(6).max(8) });

router.post(
  "/totp/confirm",
  authenticate,
  authorize("CARRIER"),
  validateBody(totpConfirmSchema),
  async (req: AuthRequest, res: Response) => {
    const valid = await verifyTotpCode(req.user!.id, req.body.code);
    if (!valid) {
      logAuthEvent("totp.enrollment_failed", { userId: req.user!.id, reason: "totp_invalid", req });
      res.status(400).json({
        error: "That code did not match. Check your authenticator app and try the current code.",
        code: "TOTP_CODE_INVALID",
      });
      return;
    }

    await enableTotp(req.user!.id);
    // Fresh codes AFTER the pairing is proven — see issueBackupCodes.
    const backupCodes = await issueBackupCodes(req.user!.id);
    logAuthEvent("totp.enrolled", { userId: req.user!.id, req });

    res.json({
      enabled: true,
      backupCodes,
      warning:
        "These codes are shown once and cannot be recovered. Save them somewhere you can reach without your phone.",
    });
  },
);

// ─── Step-up verification (Arc 11 B2) ───────────────────────────────────────
//
// Signing in proved who you are. This proves you are STILL there, and that the
// person changing the payment terms is the person who typed the password.
//
// The action is bound into the token so a step-up granted for one change
// cannot be spent on another. The carrier consented to a specific thing.

const stepUpSchema = z.object({
  code: z.string().trim().min(6).max(8),
  action: z.enum(STEP_UP_ACTIONS),
});

router.post(
  "/step-up",
  authenticate,
  authorize("CARRIER"),
  otpVerifyLimiter,
  validateBody(stepUpSchema),
  async (req: AuthRequest, res: Response) => {
    const valid = await verifyTotpCode(req.user!.id, req.body.code);
    if (!valid) {
      logAuthEvent("stepup.failed", { userId: req.user!.id, reason: "totp_invalid", req });
      res.status(401).json({
        error: "That code did not match. Check your authenticator app and try the current code.",
        code: "TOTP_CODE_INVALID",
      });
      return;
    }

    logAuthEvent("stepup.granted", { userId: req.user!.id, req });
    res.json({
      stepUpToken: mintStepUpToken(req.user!.id, req.body.action),
      expiresInMinutes: STEP_UP_WINDOW_MINUTES,
    });
  },
);

router.get("/totp/status", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { totpEnabled: true, emailVerifiedAt: true },
  });
  res.json({
    enrolled: !!user?.totpEnabled,
    emailVerified: !!user?.emailVerifiedAt,
    required: true,
  });
});

router.get("/activation-status", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const profile = await loadActivationProfile(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const agreement = await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: "broker-carrier" },
    orderBy: { signedAt: "desc" },
    select: { id: true, version: true, signedAt: true, signedByName: true, expiresAt: true },
  });
  // Quick Pay is now a real signature too (v3.8.aqi) — a "quick-pay"
  // CarrierAgreement, recorded only when the carrier opts in.
  const qpAgreement = await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
    orderBy: { signedAt: "desc" },
    select: { signedAt: true, signedByName: true, version: true },
  });
  // v3.8.asb — the carrier's most recent pilot enrolment of any status. The
  // LATEST rather than the live one: DECLINED and WITHDRAWN are exactly the
  // states the portal most needs to render, and both are terminal.
  const qpEnrollment = await getLatestQuickPayEnrollment(profile.id);
  const now = new Date();
  const bcaSigned = !!agreement && (!agreement.expiresAt || agreement.expiresAt > now);
  const enrolmentUser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { totpEnabled: true },
  });
  const totpEnrolled = !!enrolmentUser?.totpEnabled;

  res.json({
    onboardingStatus: profile.onboardingStatus,
    // Arc 11 — the enrollment gate sits ABOVE the activation gate and above the
    // application-status page: an unenrolled carrier reaches the enrollment
    // screen and nothing else, whatever their onboarding state. Unlike
    // requiresActivation this is NOT conditioned on APPROVED, because a PENDING
    // carrier waiting on review still has an account worth protecting.
    requiresTotpEnrollment: !totpEnrolled,
    // requiresActivation: approved, but the gate-satisfying BCA isn't signed yet.
    requiresActivation: profile.onboardingStatus === "APPROVED" && !bcaSigned,
    bca: {
      signed: bcaSigned,
      signedAt: agreement?.signedAt ?? null,
      signedByName: agreement?.signedByName ?? null,
      version: agreement?.version ?? null,
    },
    quickPay: {
      enabled: profile.quickPayEnabled,
      signed: !!qpAgreement,
      agreedAt: profile.quickPayAgreedAt ?? qpAgreement?.signedAt ?? null,
      signedByName: qpAgreement?.signedByName ?? null,
      version: profile.quickPayVersion,
      // v3.8.asb — the pilot state, so the portal renders the carrier's actual
      // position instead of an enable switch that will 403. `pilotStatus` is
      // null when they have never asked.
      //
      // Reason text is returned for DECLINED and WITHDRAWN because a carrier is
      // owed the reason they were given, not a bare status. It is the same
      // string the AE typed and the same string the notification carried.
      pilotStatus: qpEnrollment?.status ?? null,
      pilotRequestedAt: qpEnrollment?.requestedAt ?? null,
      pilotDecidedAt: qpEnrollment?.reviewedAt ?? null,
      pilotWithdrawnAt: qpEnrollment?.withdrawnAt ?? null,
      pilotReason:
        qpEnrollment?.status === "WITHDRAWN"
          ? qpEnrollment.withdrawalReason
          : qpEnrollment?.status === "DECLINED"
            ? qpEnrollment.reviewNote
            : null,
      // Can the carrier turn Quick Pay ON right now? Approval alone is not
      // enough — the signature is the other half — but this is what decides
      // whether the switch is offered at all.
      pilotApproved: qpEnrollment?.status === "APPROVED",
    },
    activatedAt: profile.activatedAt,
  });
});

// POST /api/carrier-auth/sign-bca — carrier e-signs the Broker-Carrier
// Agreement at activation. Creates a CarrierAgreement{status:"SIGNED"}
// (evergreen — BCAs terminate via clause, not an expiry date, so expiresAt
// stays null and the gate never trips on expiry), which unblocks the
// complianceCheck hard-gate. Idempotent on the same version.
// `electronicRecordsConsent` MUST be declared here. validateBody replaces
// req.body with the parsed result and z.object() strips undeclared keys, so an
// undeclared field arrives at the handler as undefined — and since the handler
// blocks on it being true, every execution would fail with the consent reason
// while the client was sending it correctly. That is Sub-pattern 5, and the TONU
// 422 shipped in exactly this shape.
const signBcaSchema = z.object({
  signedByName: z.string().trim().min(2, "Enter your full legal name").max(120),
  signedByTitle: z.string().trim().max(120).optional(),
  agreed: z.boolean().refine((v) => v === true, {
    message: "You must agree to the Broker-Carrier Agreement to sign.",
  }),
  electronicRecordsConsent: z.boolean().optional(),
  bcaVersion: z.string().trim().min(1).max(60),
});
router.post("/sign-bca", authenticate, authorize("CARRIER"), validateBody(signBcaSchema), async (req: AuthRequest, res: Response) => {
  const profile = await loadActivationProfile(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  if (profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({
      error: "Your application must be approved before you can sign the Broker-Carrier Agreement.",
      code: "NOT_APPROVED",
    });
    return;
  }

  const { signedByName, signedByTitle, bcaVersion: postedVersion } = req.body as {
    signedByName: string;
    signedByTitle?: string;
    bcaVersion: string;
  };

  // v3.8.asb — the posted version is CHECKED, never stamped. Pre-asb this
  // route wrote whatever string the client sent (any value up to 60 chars)
  // onto a binding signature row. A tab left open across a version bump
  // therefore recorded consent naming a body that can no longer be produced
  // from this repo — the unreproducible-document defect the agreement work
  // exists to close, surviving at the last step.
  //
  // Stamping BCA_VERSION unconditionally would be the opposite error: it
  // records consent to the CURRENT body against a signer who read the OLD
  // one. When the two disagree there is no version we can honestly write, so
  // the signature is refused and the carrier is sent back to re-read. The
  // response carries the current version so the client can refetch
  // GET /agreement/broker-carrier and re-render before retrying.
  if (postedVersion !== BCA_VERSION) {
    res.status(409).json({
      error:
        "The Broker-Carrier Agreement was updated while this page was open. Reload the page to review the current version, then sign.",
      code: "AGREEMENT_VERSION_STALE",
      currentVersion: BCA_VERSION,
    });
    return;
  }
  const bcaVersion = BCA_VERSION;
  const now = new Date();

  // ESIGN §101(c): consent to do business electronically is a SEPARATE act from
  // agreeing to the document. Blocked, not defaulted — a consent nobody gave is
  // worth less than no consent at all, because it looks like one.
  if (req.body.electronicRecordsConsent !== true) {
    res.status(400).json({
      error: "Electronic records consent not given",
      code: "ELECTRONIC_RECORDS_CONSENT_REQUIRED",
    });
    return;
  }
  // Server clock. A body-supplied consentAt is never read — the timestamp is
  // evidence of when WE received the acknowledgement, not when a client says it
  // happened.
  const consentAt = now;

  // Idempotent: a current SIGNED, non-expired agreement of THIS version means
  // already-signed (return it). A different version (attorney updated the
  // doc) falls through and re-records consent to the new version.
  const existing = await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: "broker-carrier" },
    orderBy: { signedAt: "desc" },
  });
  if (existing && existing.version === bcaVersion && (!existing.expiresAt || existing.expiresAt > now)) {
    res.json({ signed: true, alreadySigned: true, agreement: existing });
    return;
  }

  const ip = extractClientIp(req);
  const userAgent = clientUserAgent(req) || "";

  // The hash is computed BEFORE the create and written IN it. One statement, so
  // there is no window in which a signature row exists without the hash of what
  // was signed — which a follow-up update would have left open on every failure
  // between the two.
  const bcaIdentity = await loadCarrierIdentity(profile.id);

  // SRL COUNTERSIGNS ON ACCEPTANCE. The carrier's acceptance is the last act
  // needed to form the agreement, so this is the instant the company is bound
  // and the instant to record binding it. Built BEFORE the hash and written in
  // the SAME create, for the reason the hash already is: no window may exist
  // in which a signature row lacks the countersignature the hash covers.
  const bcaCountersign: CanonicalCountersign = {
    name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at: now,
  };
  const bcaContentHash = agreementContentHash(BROKER_CARRIER_AGREEMENT, {
    carrier: bcaIdentity ?? undefined,
    signature: { signedByName, signedByTitle: signedByTitle || null, signedAt: now, signerIp: ip || null, version: bcaVersion, consentAt },
    countersign: bcaCountersign,
  });

  const agreement = await prisma.carrierAgreement.create({
    data: {
      carrierId: profile.id,
      version: bcaVersion,
      templateName: "broker-carrier",
      status: "SIGNED",
      contentHash: bcaContentHash,
      signedAt: now,
      signedByName,
      signedByTitle: signedByTitle || null,
      // The broker half. Never the carrier columns above — those record who
      // the CARRIER sent, and writing SRL into them would forge the carrier
      // signature on the company's own paper.
      counterSignedByName: bcaCountersign.name,
      counterSignedByTitle: bcaCountersign.title,
      counterSignedAt: now,
      signatureData: signedByName, // typed-name e-signature
      signerIp: ip || "",
      signerUserAgent: userAgent,
      consentAt,
      expiresAt: null, // evergreen — terminates via clause, not a date
      createdById: req.user!.id,
    },
  });

  // Refresh the click-wrap audit fields + mark activation complete (the BCA
  // is the load-bearing activation step; QP is optional and separate).
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      bcaAgreedAt: now,
      bcaAgreedFromIp: ip || null,
      bcaAgreedFromUserAgent: userAgent || null,
      bcaVersion,
      activatedAt: profile.activatedAt ?? now,
    },
  });

  // Notify AE that a carrier signed (mirrors carrierVettingController.signAgreement).
  prisma.user
    .findMany({ where: { role: "ADMIN" }, select: { id: true } })
    .then((admins) =>
      prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "AGREEMENT_SIGNED",
          title: "Carrier Agreement Signed",
          message: `${signedByName} signed the Broker-Carrier Agreement (carrier ${profile.id}).`,
          link: `/dashboard/carriers`,
        })),
      }),
    )
    .catch(() => {});

  // v3.8.aqh — generate + store the EXECUTED BCA PDF (documentUrl) so the carrier
  // can download their countersigned copy. Non-blocking; the signature record is
  // already persisted above and the download endpoint regenerates on demand too.
  void (async () => {
    const identity = await loadCarrierIdentity(profile.id);
    const buf = await generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, {
      carrier: identity,
      signature: { signedByName, signedByTitle: signedByTitle || null, signedAt: now, signerIp: ip || null, version: bcaVersion, consentAt },
      // The SAME countersign object the hash was taken over. Rebuilding it
      // here would be a second construction of one fact, free to drift from
      // the hash that is supposed to cover it.
      countersign: bcaCountersign,
      // Same shell as the download route above. A stored executed copy that
      // does not look like the copy the carrier can pull on demand is two
      // documents for one agreement.
      shell: true,
    });
    const url = await uploadFileToPath(buf, `agreements/bca-${agreement.id}.pdf`, "application/pdf");
    await prisma.carrierAgreement.update({ where: { id: agreement.id }, data: { documentUrl: url } });

    // Decision 6 — the same bytes just stored, delivered to the signer.
    await deliverExecutedCopy(agreement.id, req.user!.id, {
      documentTitle: "Broker-Carrier Agreement",
      version: bcaVersion,
      signedByName,
      pdf: buf,
      fileName: `SRL-Broker-Carrier-Agreement-${bcaVersion}.pdf`,
    });
  })().catch(() => {});

  res.status(201).json({ signed: true, agreement });
});

// POST /api/carrier-auth/quickpay-election — opt in / out of account-level
// Quick Pay. Opt-in records consent to the Caravan Quick Pay Agreement
// (audit trail). REVERSIBLE and NOT a hauling gate. Opting out flips the
// flag but preserves the last-consent audit fields as history. A carrier who
// never calls this stays quickPayEnabled=false (standard Net terms) and is
// fully operational once the BCA is signed.
const quickPayElectionSchema = z
  .object({
    enabled: z.boolean(),
    signedByName: z.string().trim().max(120).optional(),
    signedByTitle: z.string().trim().max(120).optional(),
    agreedToQpTerms: z.boolean().optional(),
    // See the note on signBcaSchema: declared or it is stripped and every
    // enable blocks on a consent the client did send.
    electronicRecordsConsent: z.boolean().optional(),
    qpVersion: z.string().trim().max(60).optional(),
  })
  // v3.8.aqi — enabling Quick Pay now requires a typed-name e-signature (parity
  // with the BCA), not just a checkbox.
  .refine(
    (d) =>
      !d.enabled ||
      (d.agreedToQpTerms === true && !!d.qpVersion && !!d.signedByName && d.signedByName.trim().length >= 2),
    {
      message: "To enable Quick Pay, type your full legal name and agree to the Quick Pay Agreement.",
      path: ["signedByName"],
    },
  );
// Step-up gated (Arc 11 B2): this changes what the carrier is paid and when.
// A session alone should not be able to move money terms.
router.post("/quickpay-election", authenticate, authorize("CARRIER"), requireStepUp("quickpay-election"), validateBody(quickPayElectionSchema), async (req: AuthRequest, res: Response) => {
  const profile = await loadActivationProfile(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  if (profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({
      error: "Your application must be approved before you can elect Quick Pay.",
      code: "NOT_APPROVED",
    });
    return;
  }

  // ── v3.8.asb — the Quick Pay PILOT gate ──────────────────────────────────
  //
  // Quick Pay is a pilot now, and a carrier no longer switches it on for
  // themselves. They request it, an AE approves, and only then does this
  // endpoint have anything to enable. Everything below this block — the
  // version check, the signature, the executed PDF — is unchanged and still
  // required; the pilot state simply comes first.
  //
  // Scoped to the ENABLE path. Opting out is always allowed, including from a
  // withdrawn or declined state: a carrier must never be stuck holding a
  // switch they cannot turn off, and turning it off records no consent so it
  // needs no approval to sit behind. That is also what keeps the invariant
  // one-directional — this endpoint can set quickPayEnabled true only with an
  // APPROVED enrolment, and false at any time.
  //
  // Four distinct codes because the portal has four different things to say,
  // and collapsing them into one "not eligible" would leave a carrier who was
  // declined last week unable to tell that from a request nobody has read yet.
  if ((req.body as { enabled?: boolean }).enabled === true) {
    const latest = await getLatestQuickPayEnrollment(profile.id);

    if (!latest) {
      res.status(403).json({
        error:
          "Quick Pay is running as a pilot and is not open to every carrier yet. Ask to be considered and we will come back to you.",
        code: "QP_PILOT_NOT_REQUESTED",
        action: { label: "Request the Quick Pay pilot", href: "/carrier/dashboard/activation" },
      });
      return;
    }
    if (latest.status === "PENDING") {
      res.status(403).json({
        error:
          "Your request to join the Quick Pay pilot is with our team. We will let you know as soon as it is decided. Until then your loads pay on your standard terms, at no fee.",
        code: "QP_PILOT_PENDING",
        requestedAt: latest.requestedAt,
      });
      return;
    }
    if (latest.status === "DECLINED") {
      res.status(403).json({
        error:
          "Your request to join the Quick Pay pilot was not approved. Your loads pay on your standard tier terms, at no fee. Talk to your rep if something has changed and you would like us to look again.",
        code: "QP_PILOT_DECLINED",
        decidedAt: latest.reviewedAt,
        reason: latest.reviewNote,
      });
      return;
    }
    if (latest.status === "WITHDRAWN") {
      res.status(403).json({
        error:
          "Quick Pay has been withdrawn from your account, so it cannot be switched back on here. Any load that already carries a Quick Pay fee still pays at that fee, on that schedule. Talk to your rep about rejoining the pilot.",
        code: "QP_PILOT_WITHDRAWN",
        withdrawnAt: latest.withdrawnAt,
        reason: latest.withdrawalReason,
      });
      return;
    }
    // Falls through only on APPROVED.
  }

  const { enabled, signedByName, signedByTitle, qpVersion } = req.body as {
    enabled: boolean;
    signedByName?: string;
    signedByTitle?: string;
    qpVersion?: string;
  };
  const now = new Date();
  const ip = extractClientIp(req);
  const userAgent = clientUserAgent(req) || "";

  // v3.8.asb — same fix as sign-bca above, and this path was worse: the
  // version was OPTIONAL and fell back with `qpVersion || QP_VERSION`, so a
  // client could stamp an arbitrary string on a binding row, and a stale tab
  // silently recorded consent to a body nobody can reproduce. The posted
  // version is now checked against the served constant and never stamped.
  // Only the enable path signs anything, so the check is scoped to it —
  // opting out records no consent and needs no version.
  if (enabled && qpVersion !== QP_VERSION) {
    res.status(409).json({
      error:
        "The Caravan Quick Pay Agreement was updated while this page was open. Reload the page to review the current version, then enable Quick Pay.",
      code: "AGREEMENT_VERSION_STALE",
      currentVersion: QP_VERSION,
    });
    return;
  }
  const version = QP_VERSION;

  // ESIGN §101(c): consent to electronic records is a separate act from agreeing
  // to the terms. Only gated on ENABLE — opting out records no consent and needs
  // none. Blocked rather than defaulted, for the same reason as the BCA.
  if (enabled && req.body.electronicRecordsConsent !== true) {
    res.status(400).json({
      error: "Electronic records consent not given",
      code: "ELECTRONIC_RECORDS_CONSENT_REQUIRED",
    });
    return;
  }
  const consentAt = now; // server clock; a body-supplied value is never read

  if (enabled) {
    // Record the Quick Pay Agreement signature — a real typed-name e-signature
    // (parity with the BCA), persisted as a "quick-pay" CarrierAgreement row.
    // Idempotent per version. This NEVER satisfies the BCA gate (that query is
    // filtered to templateName "broker-carrier").
    const existingQp = await prisma.carrierAgreement.findFirst({
      where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
      orderBy: { signedAt: "desc" },
    });
    if (!existingQp || existingQp.version !== version) {
      const qpIdentity = await loadCarrierIdentity(profile.id);
      // Same countersign rule as the BCA. Quick Pay is a separately executed
      // instrument, so it is separately countersigned rather than inheriting
      // the BCA's — they can be signed days apart.
      const qpCountersign: CanonicalCountersign = {
        name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at: now,
      };
      const qpContentHash = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, {
        carrier: qpIdentity ?? undefined,
        signature: { signedByName: signedByName!, signedByTitle: signedByTitle || null, signedAt: now, signerIp: ip || null, version, consentAt },
        countersign: qpCountersign,
      });
      const qpRow = await prisma.carrierAgreement.create({
        data: {
          contentHash: qpContentHash,
          carrierId: profile.id,
          version,
          templateName: "quick-pay",
          status: "SIGNED",
          signedAt: now,
          signedByName: signedByName!,
          signedByTitle: signedByTitle || null,
          signatureData: signedByName!,
          counterSignedByName: qpCountersign.name,
          counterSignedByTitle: qpCountersign.title,
          counterSignedAt: now,
          signerIp: ip || "",
          signerUserAgent: userAgent,
          consentAt,
          expiresAt: null,
          createdById: req.user!.id,
        },
      });

      // v3.8.asa — store the EXECUTED Quick Pay PDF, mirroring sign-bca. The
      // signature row above is binding, so a countersigned copy has to exist as
      // a document the carrier, a factor, or a court can be handed.
      void (async () => {
        const identity = await loadCarrierIdentity(profile.id);
        const buf = await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {
          // v3.8.bad — same shell as the download route, for the same reason
          // it was given to the BCA: a stored copy that does not look like the
          // copy the carrier can pull is two documents for one agreement, and
          // the one that counts in a dispute is whichever they are holding.
          shell: true,
          countersign: qpCountersign,
          carrier: identity,
          signature: { signedByName: signedByName!, signedByTitle: signedByTitle || null, signedAt: now, signerIp: ip || null, version, consentAt },
        });
        const url = await uploadFileToPath(buf, `agreements/qp-${qpRow.id}.pdf`, "application/pdf");
        await prisma.carrierAgreement.update({ where: { id: qpRow.id }, data: { documentUrl: url } });

        // Decision 6 — same bytes, delivered to the signer.
        await deliverExecutedCopy(qpRow.id, req.user!.id, {
          documentTitle: "Caravan Quick Pay Agreement",
          version,
          signedByName: signedByName!,
          pdf: buf,
          fileName: `SRL-Caravan-Quick-Pay-Agreement-${version}.pdf`,
        });
      })().catch(() => {});
    }
    await prisma.carrierProfile.update({
      where: { id: profile.id },
      data: {
        quickPayEnabled: true,
        quickPayAgreedAt: now,
        quickPayAgreedFromIp: ip || null,
        quickPayAgreedFromUserAgent: userAgent || null,
        quickPayVersion: version,
      },
    });
    res.json({ quickPayEnabled: true, quickPayAgreedAt: now, quickPayVersion: version, signed: true });
    return;
  }

  // Opt out — flip the flag; the signed agreement row + audit history are kept.
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: { quickPayEnabled: false },
  });
  res.json({ quickPayEnabled: false, signed: false });
});

// POST /api/carrier-auth/quickpay-pilot-request — ask to join the Quick Pay
// pilot from the portal.
//
// v3.8.asb. The request is normally made at onboarding
// (carrierRegisterSchema.requestQuickPayPilot). This is the same request for
// the carrier who did not tick the box then, or who was declined earlier and
// wants to be looked at again. Without it the "Ask to be considered" message
// the election gate returns would point at nothing.
//
// Records a PENDING enrolment and stops. It enables nothing, signs nothing and
// changes no price. An AE approves or declines it from the queue.
router.post("/quickpay-pilot-request", authenticate, authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const profile = await loadActivationProfile(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  if (profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({
      error: "Your application must be approved before you can ask to join the Quick Pay pilot.",
      code: "NOT_APPROVED",
    });
    return;
  }

  const existing = await getLatestQuickPayEnrollment(profile.id);

  // Idempotent while a request is open, so a double tap does not read as a
  // failure. The partial unique index would reject the second row anyway; this
  // answers plainly instead of surfacing a constraint violation.
  if (existing?.status === "PENDING") {
    res.json({ status: "PENDING", requestedAt: existing.requestedAt, alreadyRequested: true });
    return;
  }
  if (existing?.status === "APPROVED") {
    res.json({ status: "APPROVED", alreadyApproved: true });
    return;
  }

  // DECLINED and WITHDRAWN are terminal rows outside the one-live index, so a
  // carrier can ask again and each attempt keeps its own record.
  const created = await prisma.quickPayEnrollment.create({
    data: { carrierProfileId: profile.id, status: "PENDING" },
  });

  // Tell the desk. Without this the carrier is told "our team will look at
  // your request" and nothing puts it in front of anyone.
  void notifyQuickPayPilotRequested(profile.id, "portal");

  log.info({ carrierProfileId: profile.id, enrollmentId: created.id }, "[QuickPayPilot] requested from portal");
  res.status(201).json({
    status: "PENDING",
    requestedAt: created.requestedAt,
    message:
      "Thanks. Our team will look at your request and let you know. Until then your loads pay on your standard tier terms, at no fee.",
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
  // v3.8.aqo — carrier-facing multipart route; the /api/carrier-auth path mount
  // only applies authLimiter, which is not an upload budget.
  uploadLimiter,
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

        // v3.8.awh — a carrier answering an info request is the OTHER way a COI
        // arrives, and it went through a different route, so it needed the same
        // notification. The service, not this route, decides whether to read it.
        queueDocumentIntake({
          documentId: doc.id,
          docType: doc.docType,
          entityType: doc.entityType,
          entityId: doc.entityId,
          fileUrl: doc.fileUrl,
          fileType: doc.fileType,
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
