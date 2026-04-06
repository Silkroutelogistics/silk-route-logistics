import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { register, login, getProfile, updateProfile, updatePreferences, changePassword, refreshToken, logout, handleVerifyOtp, handleResendOtp, forceChangePassword, forgotPassword, resetPassword, checkPasswordStrength, handleTotpLoginVerify } from "../controllers/authController";
import { authenticate, authorize, registerSession } from "../middleware/auth";
import { generateTotpSetup, verifyTotpCode, enableTotp, disableTotp } from "../services/totpService";
import { getAuthUrl, exchangeCode } from "../services/gmailService";
import { AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validators/auth";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { setTokenCookie } from "../utils/cookies";
import { z } from "zod";

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: "Too many login attempts. Please try again in 15 minutes." } });
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, message: { error: "Too many verification attempts. Please wait 15 minutes." } });
const passwordChangeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: "Too many password change attempts. Please try again later." } });

const otpSchema = z.object({ email: z.string().email(), code: z.string().length(8) });
const resendOtpSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().min(1), email: z.string().email(), newPassword: z.string().min(8) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  preferredTheme: z.string().min(1).optional(),
  darkMode: z.boolean().optional(),
});
const preferencesSchema = z.object({
  preferredTheme: z.enum(["silk-route-classic", "midnight-express", "desert-route", "arctic-haul", "highway-green", "chrome-steel"]).optional(),
  darkMode: z.boolean().optional(),
  notifications: z.object({
    loads: z.boolean().optional(),
    payments: z.boolean().optional(),
    scorecard: z.boolean().optional(),
    announcements: z.boolean().optional(),
  }).optional(),
});

// Public routes
router.post("/register", validateBody(registerSchema), register);
router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.post("/forgot-password", loginLimiter, validateBody(z.object({ email: z.string().email() })), forgotPassword);
router.post("/reset-password", passwordChangeLimiter, validateBody(resetPasswordSchema), resetPassword);
router.post("/verify-otp", otpVerifyLimiter, validateBody(otpSchema), handleVerifyOtp);
router.post("/resend-otp", loginLimiter, validateBody(resendOtpSchema), handleResendOtp);
router.post("/check-password", validateBody(z.object({ password: z.string() })), checkPasswordStrength);
router.post("/totp/login-verify", otpVerifyLimiter, validateBody(z.object({ totpToken: z.string().min(1), code: z.string().min(6).max(8) })), handleTotpLoginVerify);

// Authenticated routes
router.post("/force-change-password", authenticate, validateBody(z.object({ newPassword: z.string().min(8) })), forceChangePassword);
router.get("/me", authenticate, getProfile);
router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, validateBody(updateProfileSchema), updateProfile);
router.patch("/preferences", authenticate, validateBody(preferencesSchema), updatePreferences);
router.patch("/password", authenticate, validateBody(changePasswordSchema), changePassword);
router.post("/refresh", authenticate, refreshToken);
router.post("/logout", authenticate, logout);

// TOTP 2FA routes (employee-only)
router.post("/totp/setup", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await generateTotpSetup(req.user!.id, req.user!.email);
    res.json({ qrCode: result.qrCodeDataUrl, secret: result.secret, backupCodes: result.backupCodes });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to generate 2FA setup" });
  }
});

router.post("/totp/verify", authenticate, validateBody(z.object({ code: z.string().min(6).max(8) })), async (req: AuthRequest, res) => {
  try {
    const valid = await verifyTotpCode(req.user!.id, req.body.code);
    if (!valid) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }
    await enableTotp(req.user!.id);
    res.json({ message: "Two-factor authentication enabled successfully" });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to verify 2FA code" });
  }
});

router.post("/totp/disable", authenticate, validateBody(z.object({ code: z.string().min(6).max(8) })), async (req: AuthRequest, res) => {
  try {
    // ADMIN/CEO cannot disable 2FA — it is mandatory for these roles
    if (req.user!.role === "ADMIN" || req.user!.role === "CEO") {
      res.status(403).json({ error: "Two-factor authentication is mandatory for administrator accounts" });
      return;
    }
    const valid = await verifyTotpCode(req.user!.id, req.body.code);
    if (!valid) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }
    await disableTotp(req.user!.id);
    res.json({ message: "Two-factor authentication disabled" });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

// Forced 2FA setup for ADMIN/CEO — uses setupToken from login flow
router.post("/totp/force-setup", async (req, res) => {
  try {
    const { setupToken } = req.body;
    if (!setupToken) {
      res.status(400).json({ error: "Setup token is required" });
      return;
    }
    const payload = jwt.verify(setupToken, env.JWT_SECRET) as { userId: string; purpose: string };
    if (payload.purpose !== "force-2fa-setup") {
      res.status(401).json({ error: "Invalid setup token" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, email: true } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const result = await generateTotpSetup(user.id, user.email);
    res.json({ qrCode: result.qrCodeDataUrl, secret: result.secret, backupCodes: result.backupCodes });
  } catch (err: unknown) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid or expired setup token" });
      return;
    }
    res.status(500).json({ error: "Failed to generate 2FA setup" });
  }
});

router.post("/totp/force-enable", validateBody(z.object({ setupToken: z.string(), code: z.string().min(6).max(8) })), async (req, res) => {
  try {
    const { setupToken, code } = req.body;
    const payload = jwt.verify(setupToken, env.JWT_SECRET) as { userId: string; purpose: string };
    if (payload.purpose !== "force-2fa-setup") {
      res.status(401).json({ error: "Invalid setup token" });
      return;
    }
    const valid = await verifyTotpCode(payload.userId, code);
    if (!valid) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }
    await enableTotp(payload.userId);

    // 2FA is now enabled — issue full JWT
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    const token = jwt.sign({ userId: payload.userId }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "24h" } as jwt.SignOptions);
    if (user) registerSession(user.id, token, user.role);
    setTokenCookie(res, token);
    res.json({
      message: "Two-factor authentication enabled successfully",
      user,
      token,
    });
  } catch (err: unknown) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid or expired setup token" });
      return;
    }
    res.status(500).json({ error: "Failed to enable 2FA" });
  }
});

// Admin: List all employees
router.get("/users", authenticate, authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res) => {
  try {
    const users = await (await import("../config/database")).prisma.user.findMany({
      where: { role: { notIn: ["CARRIER", "SHIPPER"] } },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, company: true, isActive: true, lastLogin: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== "production" ? String(err) : "Internal server error" });
  }
});

// Admin: Toggle employee active status
router.patch("/users/:id/status", authenticate, authorize("ADMIN") as any, async (req: AuthRequest, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean" });
      return;
    }
    // Prevent self-deactivation
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: "Cannot change your own status" });
      return;
    }
    const user = await (await import("../config/database")).prisma.user.update({
      where: { id: req.params.id },
      data: { isActive },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== "production" ? String(err) : "Internal server error" });
  }
});

// ─── Google OAuth (Gmail Reply Tracking) ─────────────────────────

// Google OAuth callback — exchanges auth code for tokens
router.get("/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    res.status(400).json({ error: "No authorization code provided" });
    return;
  }
  try {
    const tokens = await exchangeCode(code as string);
    // In production, store refresh_token in env/DB
    // For now, display it so the admin can add to Render env vars
    res.json({
      message: "Gmail connected successfully! Add the refresh_token to Render as GOOGLE_OAUTH_REFRESH_TOKEN",
      refresh_token: tokens.refresh_token,
      note: "Save this refresh token — it won't be shown again",
    });
  } catch (err) {
    console.error("[Gmail OAuth] Token exchange error:", err);
    res.status(500).json({ error: "Failed to exchange code for tokens" });
  }
});

// Get Gmail OAuth authorization URL (admin only)
router.get("/google/auth-url", authenticate, authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res) => {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    res.status(400).json({ error: "Google OAuth not configured — set GOOGLE_OAUTH_CLIENT_ID in environment" });
    return;
  }
  res.json({ url: getAuthUrl() });
});

export default router;
