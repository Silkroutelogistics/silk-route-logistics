import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, getProfile, updateProfile, changePassword } from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many login attempts, please try again later" } });

router.post("/register", register);
router.post("/login", loginLimiter, login);
router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);
router.patch("/password", authenticate, changePassword);

export default router;
