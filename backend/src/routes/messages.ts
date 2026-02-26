import { Router } from "express";
import { sendMessage, getConversation, getConversations, getUnreadCount, getUsers } from "../controllers/messageController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE", "ACCOUNTING", "SHIPPER", "CARRIER"));

router.post("/", sendMessage);
router.get("/conversations", getConversations);
router.get("/users", getUsers);
router.get("/unread-count", getUnreadCount);
router.get("/", getConversation);

export default router;
