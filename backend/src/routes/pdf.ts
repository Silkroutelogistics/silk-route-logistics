import { Router } from "express";
import { downloadBOL, downloadRateConfirmation, downloadInvoicePDF } from "../controllers/pdfController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/bol/:shipmentId", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS"), downloadBOL);
router.get("/rate-confirmation/:loadId", downloadRateConfirmation);
router.get("/invoice/:invoiceId", downloadInvoicePDF);

export default router;
