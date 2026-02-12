import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createInvoiceSchema, submitForFactoringSchema, updateLineItemsSchema, batchInvoiceStatusSchema } from "../validators/invoice";
import { generateInvoicePdf } from "../services/pdfService";
import { sendEmail, wrap } from "../services/emailService";

export async function createInvoice(req: AuthRequest, res: Response) {
  const data = createInvoiceSchema.parse(req.body);
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });
  const lastNum = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace("INV-", ""), 10) : 1000;

  const { lineItems, ...invoiceData } = data;

  // If line items provided, compute amount from them
  const computedAmount = lineItems && lineItems.length > 0
    ? lineItems.reduce((sum, li) => sum + li.amount, 0)
    : data.amount;

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        ...invoiceData,
        amount: computedAmount,
        invoiceNumber: `INV-${lastNum + 1}`,
        userId: req.user!.id,
      } as any,
    });

    if (lineItems && lineItems.length > 0) {
      await tx.invoiceLineItem.createMany({
        data: lineItems.map((li, idx) => ({
          invoiceId: inv.id,
          description: li.description,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount,
          type: li.type,
          sortOrder: li.sortOrder ?? idx,
        })),
      });
    }

    return tx.invoice.findUnique({
      where: { id: inv.id },
      include: { load: true, lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  });

  res.status(201).json(invoice);
}

export async function getInvoices(req: AuthRequest, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { userId: req.user!.id },
    include: {
      load: { select: { originCity: true, originState: true, destCity: true, destState: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
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
      lineItems: { orderBy: { sortOrder: "asc" } },
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
        lineItems: { orderBy: { sortOrder: "asc" } },
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

/** Update line items for an invoice (replace strategy) */
export async function updateInvoiceLineItems(req: AuthRequest, res: Response) {
  const { lineItems } = updateLineItemsSchema.parse(req.body);
  const invoiceId = req.params.id;

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const newAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);

  const updated = await prisma.$transaction(async (tx) => {
    // Delete old line items
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });

    // Create new ones
    await tx.invoiceLineItem.createMany({
      data: lineItems.map((li, idx) => ({
        invoiceId,
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.amount,
        type: li.type,
        sortOrder: li.sortOrder ?? idx,
      })),
    });

    // Update invoice amount
    return tx.invoice.update({
      where: { id: invoiceId },
      data: { amount: newAmount },
      include: { load: true, lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  });

  res.json(updated);
}

/** Batch update invoice statuses */
export async function batchUpdateInvoiceStatus(req: AuthRequest, res: Response) {
  const { ids, status } = batchInvoiceStatusSchema.parse(req.body);

  const data: Record<string, unknown> = { status };
  if (status === "PAID") data.paidAt = new Date();

  const result = await prisma.$transaction(
    ids.map((id) => prisma.invoice.update({ where: { id }, data }))
  );

  res.json({ updated: result.length, invoices: result });
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

/** Generate invoice from load data, create PDF, email to shipper */
export async function generateInvoiceFromLoad(req: AuthRequest, res: Response) {
  const loadId = req.params.loadId;
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: true,
      carrier: { select: { company: true, firstName: true, lastName: true } },
    },
  });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  // Check if invoice already exists
  const existing = await prisma.invoice.findFirst({ where: { loadId } });
  if (existing) {
    res.json({ message: "Invoice already exists", invoice: existing });
    return;
  }

  // Generate invoice number
  const lastInvoice = await prisma.invoice.findFirst({ orderBy: { createdAt: "desc" }, select: { invoiceNumber: true } });
  const lastNum = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace("INV-", ""), 10) : 1000;
  const invoiceNumber = `INV-${lastNum + 1}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const customerRate = load.customerRate || load.rate;
  const fuelSurcharge = load.fuelSurcharge || 0;
  const totalAmount = customerRate + fuelSurcharge;

  const lineItems: Array<{ description: string; quantity: number; rate: number; amount: number; type: "LINEHAUL" | "FUEL_SURCHARGE" | "ACCESSORIAL" | "DETENTION" | "LUMPER" | "OTHER"; sortOrder: number }> = [
    { description: `Linehaul: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`, quantity: 1, rate: customerRate, amount: customerRate, type: "LINEHAUL", sortOrder: 0 },
  ];
  if (fuelSurcharge > 0) {
    lineItems.push({ description: "Fuel Surcharge", quantity: 1, rate: fuelSurcharge, amount: fuelSurcharge, type: "FUEL_SURCHARGE", sortOrder: 1 });
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        userId: req.user!.id,
        createdById: req.user!.id,
        loadId,
        amount: totalAmount,
        totalAmount,
        lineHaulAmount: customerRate,
        fuelSurchargeAmount: fuelSurcharge,
        status: "DRAFT",
        dueDate,
      },
    });
    await tx.invoiceLineItem.createMany({
      data: lineItems.map((li) => ({ invoiceId: inv.id, ...li })),
    });
    return tx.invoice.findUnique({ where: { id: inv.id }, include: { load: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  });

  // Generate PDF
  try {
    const pdfBuffer = await generateInvoicePdf(invoice as any);
    const pdfUrl = `/uploads/invoices/${invoiceNumber}.pdf`;
    const { env } = await import("../config/env");
    const fsP = await import("fs/promises");
    const pPath = await import("path");
    const dir = pPath.resolve(env.UPLOAD_DIR, "invoices");
    await fsP.mkdir(dir, { recursive: true });
    await fsP.writeFile(pPath.resolve(dir, `${invoiceNumber}.pdf`), pdfBuffer);
    await prisma.invoice.update({ where: { id: invoice!.id }, data: { pdfUrl } });
  } catch (e: any) {
    console.error("[Invoice] PDF generation error:", e.message);
  }

  // Email to shipper if requested
  if (load.customer?.email) {
    const shipperName = load.customer.contactName || load.customer.name;
    const body = `
      <h2 style="color:#1e293b;margin:0 0 12px">Invoice ${invoiceNumber}</h2>
      <p style="color:#475569">Dear ${shipperName},</p>
      <p style="color:#475569">Please find your invoice for shipment <strong>${load.referenceNumber}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Route</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Amount</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">$${totalAmount.toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Due Date</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b">Terms</td>
            <td style="padding:8px 12px">Net 30</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:12px">If you have questions, contact us at info@silkroutelogistics.ai</p>
    `;
    await sendEmail(load.customer.email, `Invoice ${invoiceNumber} — ${load.referenceNumber}`, wrap(body)).catch((e: any) => console.error("[Invoice] Email error:", e.message));

    await prisma.invoice.update({ where: { id: invoice!.id }, data: { status: "SENT", sentDate: new Date() } });
  }

  res.status(201).json(invoice);
}

/** Mark invoice as paid */
export async function markInvoicePaid(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const { paidAmount, paymentReference, paymentMethod } = req.body;

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paidAmount: paidAmount || invoice.amount,
      paymentReference,
      paymentMethod: paymentMethod || "ACH",
    },
    include: { load: true },
  });
  res.json(updated);
}

/** Invoice aging report: 30/60/90 day buckets */
export async function getInvoiceAging(req: AuthRequest, res: Response) {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);
  const unpaid = { status: { notIn: ["PAID", "REJECTED", "VOID", "DRAFT"] as any } };

  const [current, over30, over60, over90, invoices] = await Promise.all([
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { gte: d30 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { lt: d30, gte: d60 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { lt: d60, gte: d90 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { lt: d90 } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.findMany({
      where: unpaid,
      include: {
        load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
        user: { select: { company: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  res.json({
    summary: {
      current: { amount: current._sum.amount || 0, count: current._count },
      over30: { amount: over30._sum.amount || 0, count: over30._count },
      over60: { amount: over60._sum.amount || 0, count: over60._count },
      over90: { amount: over90._sum.amount || 0, count: over90._count },
      total: {
        amount: (current._sum.amount || 0) + (over30._sum.amount || 0) + (over60._sum.amount || 0) + (over90._sum.amount || 0),
        count: current._count + over30._count + over60._count + over90._count,
      },
    },
    invoices,
  });
}

/** Financial summary with period filter */
export async function getFinancialSummary(req: AuthRequest, res: Response) {
  const period = (req.query.period as string) || "month";
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "week":
      startDate = new Date(now.getTime() - 7 * 86400000);
      break;
    case "quarter":
      startDate = new Date(now.getTime() - 90 * 86400000);
      break;
    default: // month
      startDate = new Date(now.getTime() - 30 * 86400000);
  }

  const loads = await prisma.load.findMany({
    where: { createdAt: { gte: startDate }, status: { notIn: ["CANCELLED", "TONU", "DRAFT"] } },
    select: { customerRate: true, carrierRate: true, rate: true, grossMargin: true, marginPercent: true, quickPayFeePercent: true },
  });

  const totalRevenue = loads.reduce((s, l) => s + (l.customerRate || l.rate || 0), 0);
  const totalCarrierCost = loads.reduce((s, l) => s + (l.carrierRate || 0), 0);
  const totalMargin = totalRevenue - totalCarrierCost;
  const avgMarginPct = loads.length > 0
    ? loads.reduce((s, l) => s + (l.marginPercent || 0), 0) / loads.length
    : 0;
  const quickPayFees = loads.reduce((s, l) => {
    if (l.quickPayFeePercent && l.carrierRate) return s + (l.carrierRate * l.quickPayFeePercent / 100);
    return s;
  }, 0);

  // Invoice aging summary
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);
  const unpaid = { status: { notIn: ["PAID", "REJECTED", "VOID", "DRAFT"] as any } };

  const [currentAR, over30AR, over60AR, over90AR] = await Promise.all([
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { gte: d30 } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { lt: d30, gte: d60 } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { lt: d60, gte: d90 } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { ...unpaid, createdAt: { lt: d90 } }, _sum: { amount: true } }),
  ]);

  res.json({
    period,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCarrierCost: Math.round(totalCarrierCost * 100) / 100,
    totalMargin: Math.round(totalMargin * 100) / 100,
    avgMarginPct: Math.round(avgMarginPct * 100) / 100,
    loadsCount: loads.length,
    quickPayFees: Math.round(quickPayFees * 100) / 100,
    invoiceAging: {
      current: currentAR._sum.amount || 0,
      over30: over30AR._sum.amount || 0,
      over60: over60AR._sum.amount || 0,
      over90: over90AR._sum.amount || 0,
    },
  });
}

/** QuickBooks scaffold — placeholder endpoints */
export async function quickbooksConnect(_req: AuthRequest, res: Response) {
  res.json({ message: "QuickBooks integration not yet active. Coming soon.", status: "inactive" });
}

export async function quickbooksSyncInvoice(_req: AuthRequest, res: Response) {
  res.json({ message: "QuickBooks integration not yet active. Invoice sync will be available after QB connection.", status: "inactive" });
}

export async function quickbooksSyncPayment(_req: AuthRequest, res: Response) {
  res.json({ message: "QuickBooks integration not yet active. Payment sync will be available after QB connection.", status: "inactive" });
}
