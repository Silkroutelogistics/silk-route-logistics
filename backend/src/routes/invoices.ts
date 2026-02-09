import { Router } from "express";
import { createInvoice, getInvoices, getInvoiceById, submitForFactoring, getAllInvoices, updateInvoiceStatus, getInvoiceStats } from "../controllers/invoiceController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/", createInvoice);
router.get("/", getInvoices);
router.get("/stats", getInvoiceStats);
router.get("/all", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"), getAllInvoices);
router.get("/:id", getInvoiceById);
router.post("/:id/factor", submitForFactoring);
router.patch("/:id/status", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"), updateInvoiceStatus);

export default router;
