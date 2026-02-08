import { Router } from "express";
import { sendMessage, getConversation, getUnreadCount } from "../controllers/messageController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/", sendMessage);
router.get("/", getConversation);
router.get("/unread-count", getUnreadCount);

export default router;
