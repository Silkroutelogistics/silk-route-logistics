import { Router } from "express";
import { getFinanceSummary, getAccountsReceivable, getAccountsPayable, getCarrierSettlements, markInvoicePaid } from "../controllers/accountingController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "ACCOUNTING", "BROKER"));

router.get("/summary", getFinanceSummary);
router.get("/receivable", getAccountsReceivable);
router.get("/payable", getAccountsPayable);
router.get("/settlements", getCarrierSettlements);
router.patch("/invoices/:id/pay", authorize("ADMIN", "ACCOUNTING"), markInvoicePaid);

export default router;
