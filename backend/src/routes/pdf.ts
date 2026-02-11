import { Router } from "express";
import { downloadBOL, downloadBOLFromLoad, downloadRateConfirmation, downloadInvoicePDF, downloadSettlementPDF } from "../controllers/pdfController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/bol/:shipmentId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), downloadBOL);
router.get("/bol-load/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), downloadBOLFromLoad);
router.get("/rate-confirmation/:loadId", downloadRateConfirmation);
router.get("/invoice/:invoiceId", downloadInvoicePDF);
router.get("/settlement/:settlementId", authorize("ADMIN", "CEO", "ACCOUNTING"), downloadSettlementPDF);

export default router;
