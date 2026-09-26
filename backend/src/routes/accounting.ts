import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import {
  getAccountingSummary,
  getDashboard,
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  sendInvoice,
  markInvoiceSent,
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
  schedulePaymentProcessing,
  bulkProcessPayments,
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
  getApprovals,
  getApprovalById,
  reviewApproval,
  getFundHealth,
  getFinancialReports,
  generateFinancialReport,
  deleteFinancialReport,
  getAPAging,
  getCPPTierSchedule,
  getAccountingDashboardEnhanced,
  getQuickPayHealth,
  getQuickPayRevenue,
} from "../controllers/accountingController";
import { auditLog } from "../middleware/audit";
import type { AuthRequest } from "../middleware/auth";
import type { Response } from "express";
import { getArReminderSwitch, setArReminderSwitch } from "../lib/arReminderSwitch";

const router = Router();

// All routes require authentication
router.use(authenticate);

// --- Payment reminder emails (v3.8.bko) ---
// The switch for the only code that emails customers about unpaid invoices.
// OFF until an admin turns it on; accounting can see it, only ADMIN/CEO flip it.
router.get("/reminder-emails", authorize("ADMIN", "CEO", "ACCOUNTING"), async (_req: AuthRequest, res: Response) => {
  res.json(await getArReminderSwitch());
});
router.put(
  "/reminder-emails",
  authorize("ADMIN", "CEO"),
  validateBody(z.object({ enabled: z.boolean() })),
  auditLog("UPDATE", "ArReminderSwitch"),
  async (req: AuthRequest, res: Response) => {
    res.json(await setArReminderSwitch(req.body.enabled === true));
  },
);

// --- Dashboard ---
router.get("/summary", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getAccountingSummary);
router.get("/dashboard", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getDashboard);
router.get("/dashboard/enhanced", authorize("ADMIN", "CEO", "ACCOUNTING"), getAccountingDashboardEnhanced);

// --- Invoices (AR) ---
router.get("/invoices/aging", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getInvoiceAging);
router.get("/invoices", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getInvoices);
router.get("/invoices/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getInvoiceById);
router.post("/invoices", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), createInvoice);
router.put("/invoices/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), updateInvoice);
router.post("/invoices/:id/send", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), sendInvoice);
// Records a delivery made outside SRL (Tipalti, a portal, by hand). Never emails.
const markInvoiceSentSchema = z.object({
  channel: z.enum(["EMAIL", "TIPALTI", "MANUAL"]).optional(),
  deliveredAt: z.string().datetime({ offset: true }).optional(),
});
router.post("/invoices/:id/mark-sent", authorize("ADMIN", "CEO", "ACCOUNTING"), validateBody(markInvoiceSentSchema), markInvoiceSent);
router.put("/invoices/:id/mark-paid", authorize("ADMIN", "CEO", "ACCOUNTING"), markInvoicePaid);
router.post("/invoices/:id/void", authorize("ADMIN", "CEO"), voidInvoice);

// --- Carrier Payments (AP) ---
router.get("/payments/queue", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getPaymentQueue);
router.get("/payments/aging", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getAPAging);
router.get("/payments/cpp-tiers", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCPPTierSchedule);
router.get("/payments", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getPayments);
router.get("/payments/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getPaymentById);
router.post("/payments/prepare", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), preparePayment);
router.post("/payments/bulk-approve", authorize("ADMIN", "CEO"), bulkApprovePayments);
// audit-pass1: MISSING-UI — live money path (fee gate hardened v3.8.asb); no AE edit surface built. See orphan-endpoint-triage.md.
router.put("/payments/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), updatePayment);
router.post("/payments/:id/submit", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), submitPayment);
router.post("/payments/:id/approve", authorize("ADMIN", "CEO"), approvePayment);
router.post("/payments/:id/reject", authorize("ADMIN", "CEO"), rejectPayment);
router.post("/payments/:id/hold", authorize("ADMIN", "CEO"), holdPayment);
router.post("/payments/:id/process", authorize("ADMIN", "CEO", "ACCOUNTING"), schedulePaymentProcessing);
router.post("/payments/:id/mark-paid", authorize("ADMIN", "CEO", "ACCOUNTING"), markPaymentPaid);
router.post("/payments/bulk-process", authorize("ADMIN", "CEO"), bulkProcessPayments);

// --- Disputes ---
router.get("/disputes", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getDisputes);
router.get("/disputes/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getDisputeById);
router.post("/disputes", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), fileDispute);
// audit-pass1: RESOLVED (Arc 3 Phase 3) — wired from /accounting/disputes (Log Investigation).
router.put("/disputes/:id/investigate", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), investigateDispute);
// audit-pass1: RESOLVED (Arc 3 Phase 3) — wired from /accounting/disputes (Propose Resolution).
router.put("/disputes/:id/propose", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), proposeDisputeResolution);
// audit-pass1: RESOLVED (Arc 3 Phase 3) — wired from /accounting/disputes (Approve / Deny; ADMIN+CEO only). The page previously POSTed here, and only a PUT exists, so every resolve click 404d.
router.put("/disputes/:id/resolve", authorize("ADMIN", "CEO"), resolveDispute);

// --- Shipper Credit ---
router.get("/credit/alerts", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCreditAlerts);
router.get("/credit", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCreditList);
router.get("/credit/:id", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCreditById);
router.put("/credit/:id", authorize("ADMIN", "CEO"), updateCredit);

// --- Factoring Fund ---
router.get("/fund/balance", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundBalance);
router.get("/fund/health", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundHealth);
router.get("/fund/transactions", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundTransactions);
router.get("/fund/performance", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getFundPerformance);
router.post("/fund/adjustment", authorize("ADMIN", "CEO"), fundAdjustment);

// --- Approval Queue ---
router.get("/approvals", authorize("ADMIN", "CEO"), getApprovals);
router.get("/approvals/:id", authorize("ADMIN", "CEO"), getApprovalById);
router.post("/approvals/:id/review", authorize("ADMIN", "CEO"), reviewApproval);

// --- P&L / Profitability ---
router.get("/pnl/loads", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getLoadPnl);
router.get("/pnl/lanes", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getLaneProfitability);
router.get("/pnl/carriers", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getCarrierProfitability);
router.get("/pnl/shippers", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getShipperProfitability);

// --- Financial Reports ---
router.get("/reports/stored", authorize("ADMIN", "CEO", "ACCOUNTING"), getFinancialReports);
router.post("/reports/generate", authorize("ADMIN", "CEO", "ACCOUNTING"), generateFinancialReport);
// audit-pass1: MISSING-UI — saved-report delete has no frontend affordance.
router.delete("/reports/:id", authorize("ADMIN", "CEO"), deleteFinancialReport);
router.get("/reports/weekly", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getWeeklyReport);
router.get("/reports/monthly", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), getMonthlyReport);

// --- Quick Pay Revenue ---
router.get("/quickpay-health", authorize("ADMIN", "CEO", "ACCOUNTING"), getQuickPayHealth);
router.get("/quickpay-revenue", authorize("ADMIN", "CEO", "ACCOUNTING"), getQuickPayRevenue);

// --- Export ---
router.post("/export", authorize("ADMIN", "CEO", "ACCOUNTING", "BROKER"), exportData);

export default router;
