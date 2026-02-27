import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getUsers,
  updateUserStatus,
  resetUserPassword,
  getSystemStatus,
  getAnalytics,
} from "../controllers/adminController";

const router = Router();

// All routes require ADMIN role
router.use(authenticate, authorize("ADMIN") as any);

router.get("/users", getUsers as any);
router.patch("/users/:id/status", updateUserStatus as any);
router.post("/users/:id/reset-password", resetUserPassword as any);
router.get("/system-status", getSystemStatus as any);
router.get("/analytics", getAnalytics as any);

export default router;
