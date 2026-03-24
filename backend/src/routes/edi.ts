import { Router, Response } from "express";
import { sendTender204, receiveResponse990, sendStatus214, sendInvoice210, getTransactions, getTransactionById } from "../controllers/ediController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { prisma } from "../config/database";

const router = Router();

router.use(authenticate);

router.post("/send-tender/:loadId", authorize("ADMIN", "CEO", "BROKER"), sendTender204);
router.post("/receive-response", authorize("ADMIN", "CEO", "BROKER"), receiveResponse990);
router.post("/send-status/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH"), sendStatus214);
router.post("/send-invoice/:invoiceId", authorize("ADMIN", "CEO", "BROKER", "ACCOUNTING"), sendInvoice210);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionById);

// Retry a failed EDI transaction
router.post("/transactions/:id/retry", authorize("ADMIN", "CEO", "BROKER", "DISPATCH"), async (req: AuthRequest, res: Response) => {
  const tx = await prisma.eDITransaction.findUnique({ where: { id: req.params.id } });
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "ERROR") { res.status(400).json({ error: "Only ERROR transactions can be retried" }); return; }

  // Reset to PENDING for reprocessing
  const updated = await prisma.eDITransaction.update({
    where: { id: tx.id },
    data: { status: "PENDING", errorMessage: null, processedAt: null },
  });

  res.json({ ...updated, message: "Transaction queued for retry" });
});

export default router;
