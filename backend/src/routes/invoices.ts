import { Router } from "express";
import {
  createInvoice, getInvoices, getInvoiceById, submitForFactoring,
  getAllInvoices, updateInvoiceStatus, getInvoiceStats, updateInvoiceLineItems,
  batchUpdateInvoiceStatus, generateInvoiceFromLoad, markInvoicePaid,
  getInvoiceAging, getFinancialSummary,
  quickbooksConnect, quickbooksSyncInvoice, quickbooksSyncPayment,
} from "../controllers/invoiceController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

router.post("/", auditLog("CREATE", "Invoice"), createInvoice);
router.get("/", getInvoices);
router.get("/stats", getInvoiceStats);
router.get("/aging", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), getInvoiceAging);
router.get("/all", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getAllInvoices);
router.post("/generate/:loadId", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("GENERATE", "Invoice"), generateInvoiceFromLoad);
router.post("/batch/status", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("BATCH_UPDATE", "Invoice"), batchUpdateInvoiceStatus);
router.get("/:id", getInvoiceById);
router.put("/:id/line-items", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("UPDATE", "InvoiceLineItems"), updateInvoiceLineItems);
router.post("/:id/factor", auditLog("FACTOR", "Invoice"), submitForFactoring);
router.patch("/:id/status", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("UPDATE_STATUS", "Invoice"), updateInvoiceStatus);
router.patch("/:id/mark-paid", authorize("ADMIN", "CEO", "ACCOUNTING"), auditLog("MARK_PAID", "Invoice"), markInvoicePaid);

export default router;
