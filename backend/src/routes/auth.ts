import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, getProfile, updateProfile, updatePreferences, changePassword, refreshToken, logout, handleVerifyOtp, handleResendOtp, forceChangePassword, forgotPassword, resetPassword, checkPasswordStrength, handleTotpLoginVerify } from "../controllers/authController";
import { authenticate, authorize } from "../middleware/auth";
import { generateTotpSetup, verifyTotpCode, enableTotp, disableTotp } from "../services/totpService";
import { AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validators/auth";
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

export default router;
