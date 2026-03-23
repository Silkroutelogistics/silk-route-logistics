import { Router } from "express";
import { downloadBOL, downloadBOLFromLoad, downloadRateConfirmation, downloadEnhancedRateConfirmation, downloadShipperLoadConfirmation, downloadInvoicePDF, downloadSettlementPDF } from "../controllers/pdfController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/bol/:shipmentId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), downloadBOL);
router.get("/bol-load/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), downloadBOLFromLoad);
router.get("/rate-confirmation/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), downloadRateConfirmation);
router.get("/rate-confirmation-enhanced/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), downloadEnhancedRateConfirmation);
router.get("/shipper-load-confirmation/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "SHIPPER"), downloadShipperLoadConfirmation);
router.get("/invoice/:invoiceId", authorize("ADMIN", "CEO", "BROKER", "ACCOUNTING", "SHIPPER"), downloadInvoicePDF);
router.get("/settlement/:settlementId", authorize("ADMIN", "CEO", "ACCOUNTING"), downloadSettlementPDF);

export default router;
