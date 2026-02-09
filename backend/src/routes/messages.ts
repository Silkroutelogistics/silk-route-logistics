import { Router } from "express";
import { sendMessage, getConversation, getConversations, getUnreadCount, getUsers } from "../controllers/messageController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/", sendMessage);
router.get("/conversations", getConversations);
router.get("/users", getUsers);
router.get("/unread-count", getUnreadCount);
router.get("/", getConversation);

export default router;
