import { Router } from "express";
import rateLimit from "express-rate-limit";
import { chat, publicChat } from "../controllers/chatController";
import { authenticate } from "../middleware/auth";

const router = Router();

const publicChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later" },
});

// Public chat (no auth, no user context)
router.post("/public", publicChatLimiter, publicChat);

// Authenticated chat (full user context)
router.post("/", authenticate, chat);

export default router;
