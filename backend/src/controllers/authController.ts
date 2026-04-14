import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { registerSchema, loginSchema } from "../validators/auth";
import { AuthRequest } from "../middleware/auth";
import { createOtp, verifyOtp as verifyOtpCode, getLastOtpCreatedAt, createPasswordResetToken, verifyPasswordResetToken } from "../services/otpService";
import { sendOtpEmail, sendPasswordResetEmail } from "../services/emailService";
import { setTokenCookie, clearTokenCookie } from "../utils/cookies";
import { blacklistToken } from "../utils/tokenBlacklist";
import { validatePassword } from "../utils/passwordPolicy";
import { verifyTotpCode } from "../services/totpService";
import { registerSession, removeSession } from "../middleware/auth";
import { log } from "../lib/logger";

const PASSWORD_EXPIRY_DAYS = 60;
function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);

  // Enforce password policy
  const pwCheck = validatePassword(data.password);
  if (!pwCheck.valid) {
    res.status(400).json({ error: pwCheck.errors[0], passwordErrors: pwCheck.errors });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const { password: _, ...userData } = data;
  const user = await prisma.user.create({
    data: { ...userData, passwordHash, passwordChangedAt: new Date() } as any,
    select: { id: true, email: true, firstName: true, lastName: true, role: true, company: true },
  });

  // Auto-create Customer record for SHIPPER users so portal works immediately
  if (user.role === "SHIPPER") {
    await prisma.customer.create({
      data: {
        name: user.company || `${user.firstName} ${user.lastName}`,
        type: "SHIPPER",
        contactName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        creditLimit: 50000,
        creditStatus: "NOT_CHECKED",
        paymentTerms: "Net 30",
        onboardingStatus: "PENDING",
        status: "Active",
        userId: user.id,
      },
    }).catch((err) => log.error({ err: err }, "[Register] Auto-create customer failed:"));
  }

  const token = signToken(user.id);
  registerSession(user.id, token, user.role);
  setTokenCookie(res, token);
  res.status(201).json({ user, token });
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account has been deactivated" });
    return;
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    res.status(423).json({
      error: `Account is temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      lockedUntil: user.lockedUntil,
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    const updateData: Record<string, unknown> = { failedLoginAttempts: newAttempts };

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }

    await prisma.user.update({ where: { id: user.id }, data: updateData }).catch(() => {});

    // Log failed login for security monitoring
    await prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: newAttempts >= MAX_FAILED_ATTEMPTS ? "ERROR" : "WARNING",
        source: "authController",
        message: newAttempts >= MAX_FAILED_ATTEMPTS
          ? `Account locked for ${email} after ${newAttempts} failed attempts`
          : `Failed login attempt for ${email} (attempt ${newAttempts}/${MAX_FAILED_ATTEMPTS})`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || null,
      },
    }).catch(() => {});

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
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

  // Send OTP instead of issuing JWT
  const code = await createOtp(user.id);
  sendOtpEmail(user.email, user.firstName, code).catch((err) =>
    log.error({ err: err }, "[OTP Email] Failed to send:"),
  );

  res.json({ pendingOtp: true, email: user.email });
}

export async function handleVerifyOtp(req: Request, res: Response) {
  const { email, code } = req.body;
  if (!email || !code) {
    res.status(400).json({ error: "Email and code are required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const result = await verifyOtpCode(user.id, code);

  if (result.locked) {
    // Log lockout event
    await prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: "ERROR",
        source: "authController",
        message: `OTP lockout triggered for ${email} — too many failed attempts`,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || null,
      },
    }).catch(() => {});

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

  // ADMIN and CEO accounts MUST have 2FA enabled — force setup if not
  if ((user.role === "ADMIN" || user.role === "CEO") && !user.totpEnabled) {
    const setupToken = jwt.sign(
      { userId: user.id, purpose: "force-2fa-setup" },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "10m" } as jwt.SignOptions,
    );
    res.json({ require2FASetup: true, setupToken });
    return;
  }

  // Check password expiry
  const baseDate = user.passwordChangedAt || user.createdAt;
  const daysSinceChange = (Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceChange >= PASSWORD_EXPIRY_DAYS) {
    const tempToken = jwt.sign(
      { userId: user.id, purpose: "force-change-password" },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "10m" } as jwt.SignOptions,
    );
    res.json({ passwordExpired: true, tempToken });
    return;
  }

  // Issue full JWT + audit log
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || "";
  const userAgent = req.headers["user-agent"] || "";

  const token = signToken(user.id);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entity: "Session",
      ipAddress: typeof ipAddress === "string" ? ipAddress : String(ipAddress),
      userAgent,
    },
  });

  registerSession(user.id, token, user.role);
  setTokenCookie(res, token);
  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    token,
  });
}

export async function handleResendOtp(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal whether user exists
    res.json({ message: "If an account exists, a new code has been sent" });
    return;
  }

  // Rate limit: last OTP must be at least 60s ago
  const lastCreated = await getLastOtpCreatedAt(user.id);
  if (lastCreated && Date.now() - lastCreated.getTime() < 60 * 1000) {
    res.status(429).json({ error: "Please wait before requesting a new code" });
    return;
  }

  const code = await createOtp(user.id);
  await sendOtpEmail(user.email, user.firstName, code);

  res.json({ message: "Code sent" });
}

export async function forceChangePassword(req: AuthRequest, res: Response) {
  const { newPassword } = req.body;
  const pwCheck = validatePassword(newPassword || "");
  if (!pwCheck.valid) {
    res.status(400).json({ error: pwCheck.errors[0], passwordErrors: pwCheck.errors });
    return;
  }

  // Verify this is a force-change-password token
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as { userId: string; purpose?: string };
      if (payload.purpose !== "force-change-password") {
        res.status(403).json({ error: "Invalid token for this operation" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || "";
  const userAgent = req.headers["user-agent"] || "";

  const fullToken = signToken(req.user!.id);

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "LOGIN",
      entity: "Session",
      changes: "Password changed (expired)",
      ipAddress: typeof ipAddress === "string" ? ipAddress : String(ipAddress),
      userAgent,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  setTokenCookie(res, fullToken);
  res.json({ user, token: fullToken });
}

export async function getProfile(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      company: true, role: true, phone: true, isVerified: true, createdAt: true,
      preferredTheme: true, darkMode: true, preferences: true,
      carrierProfile: { select: { mcNumber: true, dotNumber: true, tier: true } },
    },
  });
  res.json(user);
}

export async function updateProfile(req: AuthRequest, res: Response) {
  const { firstName, lastName, phone, company, preferredTheme, darkMode } = req.body;
  const data: Record<string, any> = {};
  if (firstName) data.firstName = firstName;
  if (lastName) data.lastName = lastName;
  if (phone !== undefined) data.phone = phone;
  if (company !== undefined) data.company = company;
  if (preferredTheme !== undefined) data.preferredTheme = preferredTheme;
  if (darkMode !== undefined) data.darkMode = darkMode;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: { id: true, email: true, firstName: true, lastName: true, company: true, role: true, phone: true, preferredTheme: true, darkMode: true },
  });
  res.json(user);
}

export async function updatePreferences(req: AuthRequest, res: Response) {
  const { preferredTheme, darkMode, preferences } = req.body;
  const data: Record<string, any> = {};
  if (preferredTheme !== undefined) data.preferredTheme = preferredTheme;
  if (darkMode !== undefined) data.darkMode = darkMode;

  // Free-form preferences JSON — merge into existing so partial patches
  // don't wipe sibling keys (e.g. setting waterfall mode shouldn't
  // erase a future theme-customization setting).
  if (preferences !== undefined && typeof preferences === "object") {
    const current = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { preferences: true },
    });
    const merged = { ...(current?.preferences as Record<string, any> | null ?? {}), ...preferences };
    data.preferences = merged;
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: { id: true, preferredTheme: true, darkMode: true, preferences: true },
  });
  res.json(user);
}

export async function refreshToken(req: AuthRequest, res: Response) {
  // Blacklist the old token before issuing new one (rotation)
  if (req.token) {
    removeSession(req.user!.id, req.token);
    await blacklistToken(req.token, req.user!.id, "refresh-rotation").catch(() => {});
  }

  const token = signToken(req.user!.id);
  registerSession(req.user!.id, token, req.user!.role);
  setTokenCookie(res, token);
  res.json({ token });
}

export async function logout(req: AuthRequest, res: Response) {
  // Remove from active sessions and blacklist token
  if (req.token) {
    removeSession(req.user!.id, req.token);
    await blacklistToken(req.token, req.user!.id, "logout").catch(() => {});
  }

  // Log logout event
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "LOGOUT",
      entity: "Session",
      ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    },
  }).catch(() => {});

  clearTokenCookie(res);
  res.json({ message: "Logged out successfully" });
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current password and new password are required" });
    return;
  }
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) {
    res.status(400).json({ error: pwCheck.errors[0], passwordErrors: pwCheck.errors });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Current password is incorrect" }); return; }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  // Blacklist current token to force re-authentication
  if (req.token) {
    await blacklistToken(req.token, req.user!.id, "password-change").catch(() => {});
  }

  // Issue a fresh token so the user stays logged in on this session
  const newToken = signToken(req.user!.id);
  setTokenCookie(res, newToken);
  res.json({ message: "Password updated successfully", token: newToken });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Always return generic message to prevent user enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const frontendUrl = env.CORS_ORIGIN.split(",")[0].trim();
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    sendPasswordResetEmail(user.email, user.firstName, resetUrl).catch((err) =>
      log.error({ err: err }, "[Password Reset Email] Failed:"),
    );
  }

  res.json({ message: "If an account with that email exists, a password reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, email, newPassword, totpCode } = req.body;
  if (!token || !email || !newPassword) {
    res.status(400).json({ error: "Token, email, and new password are required" });
    return;
  }

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) {
    res.status(400).json({ error: pwCheck.errors[0], passwordErrors: pwCheck.errors });
    return;
  }

  const userId = await verifyPasswordResetToken(token);
  if (!userId) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email !== email) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

  // If user has TOTP 2FA enabled, require TOTP code for password reset
  if (user.totpEnabled) {
    if (!totpCode) {
      res.status(400).json({ error: "Two-factor authentication code is required", requires2FA: true });
      return;
    }
    const totpValid = await verifyTotpCode(user.id, totpCode);
    if (!totpValid) {
      res.status(401).json({ error: "Invalid authenticator code" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  res.json({ message: "Password has been reset successfully. You can now log in." });
}

export async function handleTotpLoginVerify(req: Request, res: Response) {
  const { totpToken, code } = req.body;
  if (!totpToken || !code) {
    res.status(400).json({ error: "Token and code are required" });
    return;
  }

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
    select: { id: true, email: true, firstName: true, lastName: true, role: true, passwordChangedAt: true, createdAt: true },
  });

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Check password expiry
  const baseDate = user.passwordChangedAt || user.createdAt;
  const daysSinceChange = (Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceChange >= PASSWORD_EXPIRY_DAYS) {
    const tempToken = jwt.sign(
      { userId: user.id, purpose: "force-change-password" },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "10m" } as jwt.SignOptions,
    );
    res.json({ passwordExpired: true, tempToken });
    return;
  }

  // Issue full JWT + audit log
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || "";
  const userAgent = req.headers["user-agent"] || "";

  const token = signToken(user.id);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entity: "Session",
      changes: "2FA verified",
      ipAddress: typeof ipAddress === "string" ? ipAddress : String(ipAddress),
      userAgent,
    },
  });

  registerSession(user.id, token, user.role);
  setTokenCookie(res, token);
  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    token,
  });
}

export async function checkPasswordStrength(req: Request, res: Response) {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }
  const result = validatePassword(password);
  res.json({ strength: result.strength, valid: result.valid, errors: result.errors });
}
