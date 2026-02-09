import { Router } from "express";
import { getMyFMCSAProfile, lookupFMCSA } from "../controllers/fmcsaController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Carrier's own FMCSA data
router.get("/my-profile", getMyFMCSAProfile);

// Admin/employee DOT lookup
router.get("/lookup/:dotNumber", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), lookupFMCSA);

export default router;
