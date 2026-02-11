import { Router } from "express";
import { createSettlement, getSettlements, getSettlementById, finalizeSettlement, markSettlementPaid } from "../controllers/settlementController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "ACCOUNTING"));

router.post("/", auditLog("CREATE", "Settlement"), createSettlement);
router.get("/", getSettlements);
router.get("/:id", getSettlementById);
router.patch("/:id/finalize", auditLog("FINALIZE", "Settlement"), finalizeSettlement);
router.patch("/:id/pay", auditLog("MARK_PAID", "Settlement"), markSettlementPaid);

export default router;
