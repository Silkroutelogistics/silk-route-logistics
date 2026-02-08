import { Router } from "express";
import { createInvoice, getInvoices, getInvoiceById, submitForFactoring } from "../controllers/invoiceController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/", createInvoice);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);
router.post("/:id/factor", submitForFactoring);

export default router;
