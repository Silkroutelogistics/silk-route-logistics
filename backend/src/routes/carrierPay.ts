import { Router } from "express";
import { createCarrierPay, getCarrierPays, getCarrierPayById, updateCarrierPay, batchUpdateCarrierPays, getCarrierPaySummary } from "../controllers/carrierPayController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"));

router.post("/", auditLog("CREATE", "CarrierPay"), createCarrierPay);
router.get("/", getCarrierPays);
router.get("/summary", getCarrierPaySummary);
router.post("/batch", auditLog("BATCH_UPDATE", "CarrierPay"), batchUpdateCarrierPays);
router.get("/:id", getCarrierPayById);
router.patch("/:id", auditLog("UPDATE", "CarrierPay"), updateCarrierPay);

export default router;
