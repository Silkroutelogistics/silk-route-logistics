import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, getProfile, updateProfile, changePassword, refreshToken, logout, handleVerifyOtp, handleResendOtp, forceChangePassword } from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many login attempts, please try again later" } });

router.post("/register", register);
router.post("/login", loginLimiter, login);
router.post("/verify-otp", handleVerifyOtp);
router.post("/resend-otp", handleResendOtp);
router.post("/force-change-password", authenticate, forceChangePassword);
router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);
router.patch("/password", authenticate, changePassword);
router.post("/refresh", authenticate, refreshToken);
router.post("/logout", authenticate, logout);

export default router;
