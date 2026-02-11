import { Router } from "express";
import {
  createCheckCall,
  getCheckCallsByLoad,
  getRecentCheckCalls,
} from "../controllers/checkCallController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();
router.use(authenticate);

router.post("/", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("CREATE", "CheckCall"), createCheckCall);
router.get("/recent", getRecentCheckCalls);
router.get("/load/:loadId", getCheckCallsByLoad);

export default router;
