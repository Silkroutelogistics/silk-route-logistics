import { Router } from "express";
import { register, login, getProfile, updateProfile, changePassword } from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);
router.patch("/password", authenticate, changePassword);

export default router;
