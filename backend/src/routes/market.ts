import { Router } from "express";
import { getLanes, getRegions, getTrends, getCapacity } from "../controllers/marketController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"));

router.get("/lanes", getLanes);
router.get("/regions", getRegions);
router.get("/trends", getTrends);
router.get("/capacity", getCapacity);

export default router;
