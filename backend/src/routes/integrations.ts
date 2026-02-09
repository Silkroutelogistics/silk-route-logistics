import { Router } from "express";
import { getIntegrations, triggerSync } from "../controllers/integrationController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/", getIntegrations);
router.post("/sync/:provider", authorize("ADMIN", "CEO", "BROKER"), triggerSync);

export default router;
