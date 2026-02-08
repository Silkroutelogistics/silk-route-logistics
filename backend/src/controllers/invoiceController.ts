import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createInvoiceSchema, submitForFactoringSchema } from "../validators/invoice";

let invoiceCounter = 1000;

export async function createInvoice(req: AuthRequest, res: Response) {
  const data = createInvoiceSchema.parse(req.body);
  invoiceCounter++;
  const invoice = await prisma.invoice.create({
    data: {
      ...data,
      invoiceNumber: `INV-${invoiceCounter}`,
      userId: req.user!.id,
    },
    include: { load: true },
  });
  res.status(201).json(invoice);
}

export async function getInvoices(req: AuthRequest, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { userId: req.user!.id },
    include: { load: { select: { originCity: true, originState: true, destCity: true, destState: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(invoices);
}

export async function getInvoiceById(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      load: true,
      user: { select: { id: true, company: true, firstName: true, lastName: true } },
      documents: true,
    },
  });

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(invoice);
}

export async function submitForFactoring(req: AuthRequest, res: Response) {
  const { advanceRate } = submitForFactoringSchema.parse(req.body);
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (invoice.userId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const factoringFee = invoice.amount * 0.03;
  const advanceAmount = (invoice.amount * advanceRate) / 100;

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      status: "SUBMITTED",
      factoringFee,
      advanceRate,
      advanceAmount,
    },
  });
  res.json(updated);
}
