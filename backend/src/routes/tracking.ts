import { Router } from "express";
import { getPublicTracking } from "../controllers/trackingController";

const router = Router();

// Public — no authentication required
router.get("/:token", getPublicTracking);

export default router;
