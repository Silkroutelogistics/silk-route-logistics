import { Router } from "express";
import { getFinanceSummary, getAccountsReceivable, getAccountsPayable, getCarrierSettlements, markInvoicePaid, getMarginAnalysis, getProfitAndLoss, getAgingDetail, getPaymentHistory } from "../controllers/accountingController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"));

router.get("/summary", getFinanceSummary);
router.get("/receivable", getAccountsReceivable);
router.get("/payable", getAccountsPayable);
router.get("/settlements", getCarrierSettlements);
router.get("/margins", getMarginAnalysis);
router.get("/pl", getProfitAndLoss);
router.get("/aging/:bucket", getAgingDetail);
router.get("/payment-history", getPaymentHistory);
router.patch("/invoices/:id/pay", authorize("ADMIN", "CEO", "ACCOUNTING"), markInvoicePaid);

export default router;
