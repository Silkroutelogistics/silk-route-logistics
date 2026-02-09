import { Router } from "express";
import { sendTender204, receiveResponse990, sendStatus214, sendInvoice210, getTransactions, getTransactionById } from "../controllers/ediController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/send-tender/:loadId", authorize("ADMIN", "BROKER"), sendTender204);
router.post("/receive-response", authorize("ADMIN", "BROKER"), receiveResponse990);
router.post("/send-status/:loadId", authorize("ADMIN", "BROKER", "DISPATCH"), sendStatus214);
router.post("/send-invoice/:invoiceId", authorize("ADMIN", "BROKER", "ACCOUNTING"), sendInvoice210);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionById);

export default router;
