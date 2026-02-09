import { Router } from "express";
import { getLanes, getRegions, getTrends, getCapacity, getBenchmarks, getIntelligence, getIntegrations, getRateIndex } from "../controllers/marketController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"));

router.get("/lanes", getLanes);
router.get("/regions", getRegions);
router.get("/trends", getTrends);
router.get("/capacity", getCapacity);
router.get("/benchmarks", getBenchmarks);
router.get("/intelligence", getIntelligence);
router.get("/integrations", getIntegrations);
router.get("/rate-index", getRateIndex);

export default router;
