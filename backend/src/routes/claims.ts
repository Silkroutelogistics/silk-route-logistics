import { Router } from "express";
import { createClaim, getClaims, getClaimById, updateClaim } from "../controllers/claimController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

router.post("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), auditLog("CREATE", "Claim"), createClaim);
router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getClaims);
router.get("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getClaimById);
router.patch("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), auditLog("UPDATE", "Claim"), updateClaim);

export default router;
