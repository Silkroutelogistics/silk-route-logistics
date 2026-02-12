import { Router } from "express";
import { getFinancialSummary, quickbooksConnect, quickbooksSyncInvoice, quickbooksSyncPayment } from "../controllers/invoiceController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "ACCOUNTING") as any);

router.get("/summary", getFinancialSummary);

// QuickBooks placeholder endpoints
router.post("/quickbooks/connect", quickbooksConnect);
router.post("/quickbooks/sync-invoice", quickbooksSyncInvoice);
router.post("/quickbooks/sync-payment", quickbooksSyncPayment);

export default router;
