import { Router } from "express";
import {
  createRateConfirmation,
  getRateConfirmationsByLoad,
  getRateConfirmationById,
  updateRateConfirmation,
  sendRateConfirmation,
  downloadRateConfirmationPdf,
} from "../controllers/rateConfirmationController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();
router.use(authenticate);

router.post("/", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("CREATE", "RateConfirmation"), createRateConfirmation);
router.get("/load/:loadId", getRateConfirmationsByLoad);
router.get("/:id", getRateConfirmationById);
router.put("/:id", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("UPDATE", "RateConfirmation"), updateRateConfirmation);
router.post("/:id/send", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("SEND", "RateConfirmation"), sendRateConfirmation);
router.get("/:id/pdf", downloadRateConfirmationPdf);

export default router;
