import { Router } from "express";
import { chat, publicChat } from "../controllers/chatController";
import { authenticate } from "../middleware/auth";

const router = Router();

// Public chat (no auth, no user context)
router.post("/public", publicChat);

// Authenticated chat (full user context)
router.post("/", authenticate, chat);

export default router;
