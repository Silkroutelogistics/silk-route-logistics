import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, getProfile, updateProfile, updatePreferences, changePassword, refreshToken, logout, handleVerifyOtp, handleResendOtp, forceChangePassword, forgotPassword, resetPassword } from "../controllers/authController";
import { authenticate, authorize } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validators/auth";
import { z } from "zod";

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many login attempts, please try again later" } });
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

// Authenticated routes
router.post("/force-change-password", authenticate, validateBody(z.object({ newPassword: z.string().min(8) })), forceChangePassword);
router.get("/me", authenticate, getProfile);
router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, validateBody(updateProfileSchema), updateProfile);
router.patch("/preferences", authenticate, validateBody(preferencesSchema), updatePreferences);
router.patch("/password", authenticate, validateBody(changePasswordSchema), changePassword);
router.post("/refresh", authenticate, refreshToken);
router.post("/logout", authenticate, logout);

export default router;
