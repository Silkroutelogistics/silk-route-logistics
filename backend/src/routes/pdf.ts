import { Router } from "express";
import { downloadBOLFromLoad, downloadRateConfirmation, downloadEnhancedRateConfirmation, downloadShipperLoadConfirmation, downloadInvoicePDF, downloadSettlementPDF } from "../controllers/pdfController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// v3.8.awu — CARRIER admitted here, gated per-record in the controller.
// A carrier hauling a load needs its bill of lading: it is the document the
// shipper signs at the dock. Before this the only BOL reachable from the carrier
// portal was an off-brand HTML re-render, because this route excluded CARRIER
// and Load.bolPdfUrl is written by nothing. The ownership check in
// downloadBOLFromLoad is what makes the role safe to add — see it before
// widening any other role here.
router.get("/bol-load/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "CARRIER"), downloadBOLFromLoad);
router.get("/rate-confirmation/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), downloadRateConfirmation);
router.get("/rate-confirmation-enhanced/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), downloadEnhancedRateConfirmation);
router.get("/shipper-load-confirmation/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "SHIPPER"), downloadShipperLoadConfirmation);
router.get("/invoice/:invoiceId", authorize("ADMIN", "CEO", "BROKER", "ACCOUNTING", "SHIPPER"), downloadInvoicePDF);
router.get("/settlement/:settlementId", authorize("ADMIN", "CEO", "ACCOUNTING"), downloadSettlementPDF);

export default router;
