import { Router } from "express";
import {
  createInvoice, getInvoices, getInvoiceById, submitForFactoring,
  getAllInvoices, getInvoiceStats, updateInvoiceLineItems,
  generateInvoiceFromLoad, markInvoicePaid,
  getInvoiceAging, getFinancialSummary,
  quickbooksConnect, quickbooksSyncInvoice, quickbooksSyncPayment,
} from "../controllers/invoiceController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { rejectInvoiceStatusWrite } from "../middleware/invoiceStatusWrite";

const router = Router();

router.use(authenticate);
// v3.8.bno — ruling 2026-09-27, 6: no route here sets an invoice's status from
// its body. PATCH /:id/status and POST /batch/status, which did, are gone.
router.use(rejectInvoiceStatusWrite);

router.post("/", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("CREATE", "Invoice"), createInvoice);
router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getInvoices);
router.get("/stats", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getInvoiceStats);
router.get("/aging", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), getInvoiceAging);
router.get("/all", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getAllInvoices);
router.post("/generate/:loadId", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("GENERATE", "Invoice"), generateInvoiceFromLoad);
router.get("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getInvoiceById);
// audit-pass1: MISSING-UI — invoice line-item edit lives in accounting; this route never wired.
router.put("/:id/line-items", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("UPDATE", "InvoiceLineItems"), updateInvoiceLineItems);
router.post("/:id/factor", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("FACTOR", "Invoice"), submitForFactoring);
// audit-pass1: DUPLICATE — same markInvoicePaid controller as PUT /accounting/invoices/:id/mark-paid, which is what the frontend calls. Consolidation candidate, not deleted (money path).
router.patch("/:id/mark-paid", authorize("ADMIN", "CEO", "ACCOUNTING"), auditLog("MARK_PAID", "Invoice"), markInvoicePaid);

export default router;
