import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createInvoiceSchema, submitForFactoringSchema } from "../validators/invoice";

export async function createInvoice(req: AuthRequest, res: Response) {
  const data = createInvoiceSchema.parse(req.body);
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });
  const lastNum = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace("INV-", ""), 10) : 1000;
  const invoice = await prisma.invoice.create({
    data: {
      ...data,
      invoiceNumber: `INV-${lastNum + 1}`,
      userId: req.user!.id,
    } as any,
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

  // Ownership check: user must own the invoice or be ADMIN/BROKER/OPERATIONS
  const isOwner = invoice.userId === req.user!.id;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isOwner && !isEmployee) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  res.json(invoice);
}

/** Admin/broker: get all invoices across all users */
export async function getAllInvoices(req: AuthRequest, res: Response) {
  const { status, page = "1", limit = "50" } = req.query;
  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        load: { select: { originCity: true, originState: true, destCity: true, destState: true, referenceNumber: true } },
        user: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
    }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ invoices, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
}

/** Admin/broker: update invoice status */
export async function updateInvoiceStatus(req: AuthRequest, res: Response) {
  const { status } = req.body;
  const valid = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PAID", "REJECTED"];
  if (!valid.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const data: Record<string, unknown> = { status };
  if (status === "PAID") data.paidAt = new Date();

  const updated = await prisma.invoice.update({ where: { id: req.params.id }, data, include: { load: true, user: { select: { id: true, firstName: true, lastName: true, company: true } } } });
  res.json(updated);
}

/** Get invoice summary stats */
export async function getInvoiceStats(req: AuthRequest, res: Response) {
  const isEmployee = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"].includes(req.user!.role);
  const userFilter = isEmployee ? {} : { userId: req.user!.id };

  const [total, byStatus, totalAmount, paidAmount] = await Promise.all([
    prisma.invoice.count({ where: userFilter }),
    prisma.invoice.groupBy({ by: ["status"], where: userFilter, _count: true, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: userFilter, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { ...userFilter, status: "PAID" }, _sum: { amount: true } }),
  ]);

  // AR aging
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);
  const unpaidFilter = { ...userFilter, status: { notIn: ["PAID", "REJECTED", "DRAFT"] as any } };

  const [current, over30, over60, over90] = await Promise.all([
    prisma.invoice.aggregate({ where: { ...unpaidFilter, createdAt: { gte: d30 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...unpaidFilter, createdAt: { lt: d30, gte: d60 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...unpaidFilter, createdAt: { lt: d60, gte: d90 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...unpaidFilter, createdAt: { lt: d90 } }, _sum: { amount: true }, _count: true }),
  ]);

  res.json({
    total,
    byStatus,
    totalAmount: totalAmount._sum.amount || 0,
    paidAmount: paidAmount._sum.amount || 0,
    aging: {
      current: { amount: current._sum.amount || 0, count: current._count },
      over30: { amount: over30._sum.amount || 0, count: over30._count },
      over60: { amount: over60._sum.amount || 0, count: over60._count },
      over90: { amount: over90._sum.amount || 0, count: over90._count },
    },
  });
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
