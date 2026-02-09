import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { generate204, parse990, generate214, generate210 } from "../services/ediService";

export async function sendTender204(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({ where: { id: req.params.loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  const result = await generate204(load, req.body.carrierId);
  res.status(201).json(result);
}

export async function receiveResponse990(req: AuthRequest, res: Response) {
  const result = await parse990(JSON.stringify(req.body));
  res.json(result);
}

export async function sendStatus214(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({ where: { id: req.params.loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  const { statusCode, location } = req.body;
  const result = await generate214(load, statusCode, location);
  res.json(result);
}

export async function sendInvoice210(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: { load: true },
  });
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  const result = await generate210(invoice);
  res.json(result);
}

export async function getTransactions(req: AuthRequest, res: Response) {
  const { transactionSet, status, loadId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const where: Record<string, unknown> = {};
  if (transactionSet) where.transactionSet = transactionSet;
  if (status) where.status = status;
  if (loadId) where.loadId = loadId;

  const p = parseInt(page);
  const l = parseInt(limit);

  const [transactions, total] = await Promise.all([
    prisma.eDITransaction.findMany({
      where,
      include: { load: { select: { referenceNumber: true } } },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * l,
      take: l,
    }),
    prisma.eDITransaction.count({ where }),
  ]);

  res.json({ transactions, total, page: p, totalPages: Math.ceil(total / l) });
}

export async function getTransactionById(req: AuthRequest, res: Response) {
  const transaction = await prisma.eDITransaction.findUnique({
    where: { id: req.params.id },
    include: { load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } } },
  });
  if (!transaction) { res.status(404).json({ error: "Transaction not found" }); return; }
  res.json(transaction);
}
