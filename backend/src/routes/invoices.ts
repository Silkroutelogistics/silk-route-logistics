import { Router } from "express";
import { createInvoice, getInvoices, getInvoiceById, submitForFactoring, getAllInvoices, updateInvoiceStatus, getInvoiceStats } from "../controllers/invoiceController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

router.post("/", auditLog("CREATE", "Invoice"), createInvoice);
router.get("/", getInvoices);
router.get("/stats", getInvoiceStats);
router.get("/all", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getAllInvoices);
router.get("/:id", getInvoiceById);
router.post("/:id/factor", auditLog("FACTOR", "Invoice"), submitForFactoring);
router.patch("/:id/status", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), auditLog("UPDATE_STATUS", "Invoice"), updateInvoiceStatus);

export default router;
