import { Router } from "express";
import {
  createRateConfirmation,
  getRateConfirmationsByLoad,
  getRateConfirmationById,
  updateRateConfirmation,
  sendRateConfirmation,
  downloadRateConfirmationPdf,
  downloadSignatureCertificate,
  sendToShipper,
  finalizeRateConfirmation,
} from "../controllers/rateConfirmationController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();
router.use(authenticate);

router.post("/", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("CREATE", "RateConfirmation"), createRateConfirmation);
router.get("/load/:loadId", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getRateConfirmationsByLoad);
router.get("/:id", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getRateConfirmationById);
router.put("/:id", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("UPDATE", "RateConfirmation"), updateRateConfirmation);
router.post("/:id/send", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("SEND", "RateConfirmation"), sendRateConfirmation);
router.get("/:id/pdf", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS", "ACCOUNTING", "CARRIER"), downloadRateConfirmationPdf);
// C5 — the Certificate of Electronic Signature. AE-only, deliberately: the
// certificate carries the signer's IP and the content hash, which are SRL's
// evidence about the carrier rather than the carrier's own copy. CARRIER is
// absent from this list and gets a 403, unlike /:id/pdf one line up.
router.get("/:id/certificate", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS", "ACCOUNTING"), downloadSignatureCertificate);
router.post("/:id/send-shipper", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("SEND", "RateConfirmation"), sendToShipper);
router.post("/:id/finalize", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("UPDATE", "RateConfirmation"), finalizeRateConfirmation);

export default router;
