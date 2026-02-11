import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getDashboard,
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  sendInvoice,
  markInvoicePaid,
  voidInvoice,
  getInvoiceAging,
  getPayments,
  getPaymentById,
  preparePayment,
  updatePayment,
  submitPayment,
  approvePayment,
  rejectPayment,
  holdPayment,
  markPaymentPaid,
  bulkApprovePayments,
  getPaymentQueue,
  getDisputes,
  getDisputeById,
  fileDispute,
  investigateDispute,
  proposeDisputeResolution,
  resolveDispute,
  getCreditList,
  getCreditById,
  updateCredit,
  getCreditAlerts,
  getFundBalance,
  getFundTransactions,
  getFundPerformance,
  fundAdjustment,
  getLoadPnl,
  getLaneProfitability,
  getCarrierProfitability,
  getShipperProfitability,
  getWeeklyReport,
  getMonthlyReport,
  exportData,
} from "../controllers/accountingController";

const router = Router();

// All routes require authentication
router.use(authenticate);

// --- Dashboard ---
router.get("/dashboard", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getDashboard);

// --- Invoices (AR) ---
router.get("/invoices/aging", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getInvoiceAging);
router.get("/invoices", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getInvoices);
router.get("/invoices/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getInvoiceById);
router.post("/invoices", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), createInvoice);
router.put("/invoices/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), updateInvoice);
router.post("/invoices/:id/send", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), sendInvoice);
router.put("/invoices/:id/mark-paid", authorize("ADMIN", "CEO", "ACCOUNTING"), markInvoicePaid);
router.post("/invoices/:id/void", authorize("ADMIN", "CEO"), voidInvoice);

// --- Carrier Payments (AP) ---
router.get("/payments/queue", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getPaymentQueue);
router.get("/payments", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getPayments);
router.get("/payments/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getPaymentById);
router.post("/payments/prepare", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), preparePayment);
router.post("/payments/bulk-approve", authorize("ADMIN", "CEO"), bulkApprovePayments);
router.put("/payments/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), updatePayment);
router.post("/payments/:id/submit", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), submitPayment);
router.post("/payments/:id/approve", authorize("ADMIN", "CEO"), approvePayment);
router.post("/payments/:id/reject", authorize("ADMIN", "CEO"), rejectPayment);
router.post("/payments/:id/hold", authorize("ADMIN", "CEO"), holdPayment);
router.post("/payments/:id/mark-paid", authorize("ADMIN", "CEO", "ACCOUNTING"), markPaymentPaid);

// --- Disputes ---
router.get("/disputes", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getDisputes);
router.get("/disputes/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getDisputeById);
router.post("/disputes", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), fileDispute);
router.put("/disputes/:id/investigate", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), investigateDispute);
router.put("/disputes/:id/propose", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), proposeDisputeResolution);
router.put("/disputes/:id/resolve", authorize("ADMIN", "CEO"), resolveDispute);

// --- Shipper Credit ---
router.get("/credit/alerts", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCreditAlerts);
router.get("/credit", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCreditList);
router.get("/credit/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCreditById);
router.put("/credit/:id", authorize("ADMIN", "CEO"), updateCredit);

// --- Factoring Fund ---
router.get("/fund/balance", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundBalance);
router.get("/fund/transactions", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundTransactions);
router.get("/fund/performance", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundPerformance);
router.post("/fund/adjustment", authorize("ADMIN", "CEO"), fundAdjustment);

// --- P&L / Profitability ---
router.get("/pnl/loads", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getLoadPnl);
router.get("/pnl/lanes", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getLaneProfitability);
router.get("/pnl/carriers", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCarrierProfitability);
router.get("/pnl/shippers", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getShipperProfitability);

// --- Reports ---
router.get("/reports/weekly", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getWeeklyReport);
router.get("/reports/monthly", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getMonthlyReport);

// --- Export ---
router.post("/export", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), exportData);

export default router;
