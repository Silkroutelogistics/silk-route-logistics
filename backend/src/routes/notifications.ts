import { Router } from "express";
import { getNotifications, markAsRead, markAllRead, getUnreadCount } from "../controllers/notificationController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllRead);

export default router;
