import { Router } from "express";
import rateLimit from "express-rate-limit";
import { chat, publicChat, getHistory, newConversation, getProactiveSuggestion } from "../controllers/chatController";
import { authenticate } from "../middleware/auth";

const router = Router();

const publicChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests, please try again later" },
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: "Rate limit reached. Please slow down." },
});

// Public chat (no auth, no tool calling, rate limited)
router.post("/public", publicChatLimiter, publicChat);

// Authenticated endpoints
router.post("/", authenticate, chatLimiter, chat);
router.get("/history", authenticate, getHistory);
router.post("/new-conversation", authenticate, newConversation);
router.get("/proactive", authenticate, getProactiveSuggestion);

export default router;
