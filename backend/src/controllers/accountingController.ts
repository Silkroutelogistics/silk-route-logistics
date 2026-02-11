import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

// ============================================================
// HELPERS
// ============================================================

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function paginate(query: Record<string, any>) {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

// ============================================================
// 1. DASHBOARD
// ============================================================

export async function getDashboard(req: AuthRequest, res: Response) {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);

    // --- Cash position: fund balance (latest entry) ---
    const latestFund = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true },
    });
    const cashBalance = latestFund?.runningBalance ?? 0;

    // --- Accounts Receivable outstanding ---
    const arOutstanding = await prisma.invoice.aggregate({
      where: { status: { in: ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "OVERDUE", "PARTIAL"] } },
      _sum: { amount: true },
      _count: true,
    });

    // --- Accounts Payable due (unpaid carrier pays) ---
    const apDue = await prisma.carrierPay.aggregate({
      where: { status: { in: ["PENDING", "PREPARED", "SUBMITTED", "APPROVED", "PROCESSING", "SCHEDULED"] } },
      _sum: { netAmount: true },
      _count: true,
    });

    // --- Quick-pay revenue MTD (fee income from quick-pay) ---
    const qpRevenue = await prisma.carrierPay.aggregate({
      where: {
        paidAt: { gte: monthStart },
        quickPayFeeAmount: { gt: 0 },
        status: "PAID",
      },
      _sum: { quickPayFeeAmount: true },
    });

    // --- Revenue MTD from delivered/completed loads ---
    const mtdLoads = await prisma.load.findMany({
      where: {
        status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
        deliveryDate: { gte: monthStart },
        customerRate: { not: null },
      },
      select: { customerRate: true, carrierRate: true, grossMargin: true, marginPercent: true },
    });

    const mtdRevenue = mtdLoads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
    const mtdMargins = mtdLoads.filter((l) => l.marginPercent !== null);
    const avgMargin = mtdMargins.length > 0
      ? mtdMargins.reduce((s, l) => s + (l.marginPercent ?? 0), 0) / mtdMargins.length
      : 0;

    // --- Pending approvals (carrier pays awaiting approval) ---
    const pendingApprovals = await prisma.carrierPay.count({
      where: { status: "SUBMITTED" },
    });

    // --- Overdue invoices count ---
    const overdueInvoices = await prisma.invoice.count({
      where: {
        status: { in: ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "OVERDUE"] },
        dueDate: { lt: now },
      },
    });

    // --- Open disputes ---
    const openDisputes = await prisma.paymentDispute.count({
      where: { status: { in: ["OPEN", "INVESTIGATING", "PROPOSED"] } },
    });

    // --- Credit alerts (shipper blocked or over 80% utilization) ---
    const creditAlerts = await prisma.shipperCredit.count({
      where: {
        OR: [
          { autoBlocked: true },
          {
            creditLimit: { gt: 0 },
            currentUtilized: { gt: 0 },
          },
        ],
      },
    });

    res.json({
      cashBalance,
      arOutstanding: arOutstanding._sum.amount ?? 0,
      arCount: arOutstanding._count,
      apDue: apDue._sum.netAmount ?? 0,
      apCount: apDue._count,
      qpRevenueMTD: qpRevenue._sum.quickPayFeeAmount ?? 0,
      revenueMTD: mtdRevenue,
      avgMarginPercent: Math.round(avgMargin * 100) / 100,
      loadsThisMonth: mtdLoads.length,
      pendingApprovals,
      alerts: {
        overdueInvoices,
        openDisputes,
        creditAlerts,
      },
    });
  } catch (error: any) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard", details: error.message });
  }
}

// ============================================================
// 2-8. INVOICES (Accounts Receivable)
// ============================================================

export async function getInvoices(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { status, customerId, shipperId, dateFrom, dateTo, search } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (customerId || shipperId) {
      where.load = { customerId: (customerId || shipperId) as string };
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search as string, mode: "insensitive" } },
        { load: { referenceNumber: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          load: {
            select: {
              referenceNumber: true,
              originCity: true,
              originState: true,
              destCity: true,
              destState: true,
              customerRate: true,
              customer: { select: { id: true, name: true } },
            },
          },
          user: { select: { id: true, firstName: true, lastName: true, company: true } },
          lineItems: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    // Enrich with aging info
    const now = new Date();
    const enriched = invoices.map((inv) => {
      const daysOutstanding = inv.dueDate
        ? daysBetween(inv.dueDate, now)
        : daysBetween(inv.createdAt, now);
      const isOverdue = inv.dueDate ? now > inv.dueDate && !["PAID", "VOID"].includes(inv.status) : false;
      return { ...inv, daysOutstanding: Math.max(0, daysOutstanding), isOverdue };
    });

    res.json({
      invoices: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("getInvoices error:", error);
    res.status(500).json({ error: "Failed to fetch invoices", details: error.message });
  }
}

export async function getInvoiceById(req: AuthRequest, res: Response) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        load: {
          select: {
            id: true,
            referenceNumber: true,
            loadNumber: true,
            originCity: true,
            originState: true,
            destCity: true,
            destState: true,
            pickupDate: true,
            deliveryDate: true,
            customerRate: true,
            carrierRate: true,
            grossMargin: true,
            marginPercent: true,
            equipmentType: true,
            weight: true,
            distance: true,
            customer: { select: { id: true, name: true, contactName: true, email: true, paymentTerms: true } },
            carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
          },
        },
        user: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
        documents: true,
      },
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json(invoice);
  } catch (error: any) {
    console.error("getInvoiceById error:", error);
    res.status(500).json({ error: "Failed to fetch invoice", details: error.message });
  }
}

export async function createInvoice(req: AuthRequest, res: Response) {
  try {
    const {
      loadId,
      amount,
      lineHaulAmount,
      fuelSurchargeAmount,
      accessorialsAmount,
      dueDate,
      notes,
      lineItems,
    } = req.body;

    if (!loadId || !amount) {
      res.status(400).json({ error: "loadId and amount are required" });
      return;
    }

    // Verify load exists
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { id: true, posterId: true, customerId: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }

    // Generate invoice number: INV-YYYYMMDD-XXXX
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const existingCount = await prisma.invoice.count({
      where: { invoiceNumber: { startsWith: `INV-${todayStr}` } },
    });
    const invoiceNumber = `INV-${todayStr}-${String(existingCount + 1).padStart(4, "0")}`;

    const totalAmount = (lineHaulAmount ?? 0) + (fuelSurchargeAmount ?? 0) + (accessorialsAmount ?? 0) || amount;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        loadId,
        userId: load.posterId,
        createdById: req.user!.id,
        amount,
        lineHaulAmount: lineHaulAmount ?? null,
        fuelSurchargeAmount: fuelSurchargeAmount ?? null,
        accessorialsAmount: accessorialsAmount ?? null,
        totalAmount,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes ?? null,
        status: "DRAFT",
        lineItems: lineItems?.length
          ? {
              create: lineItems.map((item: any, idx: number) => ({
                description: item.description,
                quantity: item.quantity ?? 1,
                rate: item.rate,
                amount: item.amount ?? item.rate * (item.quantity ?? 1),
                type: item.type ?? "LINEHAUL",
                sortOrder: idx,
              })),
            }
          : undefined,
      },
      include: { lineItems: true },
    });

    res.status(201).json(invoice);
  } catch (error: any) {
    console.error("createInvoice error:", error);
    res.status(500).json({ error: "Failed to create invoice", details: error.message });
  }
}

export async function updateInvoice(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (!["DRAFT", "REJECTED"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot edit invoice in status ${existing.status}` });
      return;
    }

    const {
      amount,
      lineHaulAmount,
      fuelSurchargeAmount,
      accessorialsAmount,
      dueDate,
      notes,
      lineItems,
    } = req.body;

    const totalAmount = (lineHaulAmount ?? existing.lineHaulAmount ?? 0)
      + (fuelSurchargeAmount ?? existing.fuelSurchargeAmount ?? 0)
      + (accessorialsAmount ?? existing.accessorialsAmount ?? 0)
      || amount
      || existing.amount;

    // If new line items provided, replace them
    if (lineItems?.length) {
      await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        amount: amount ?? existing.amount,
        lineHaulAmount: lineHaulAmount ?? existing.lineHaulAmount,
        fuelSurchargeAmount: fuelSurchargeAmount ?? existing.fuelSurchargeAmount,
        accessorialsAmount: accessorialsAmount ?? existing.accessorialsAmount,
        totalAmount,
        dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
        notes: notes ?? existing.notes,
        lineItems: lineItems?.length
          ? {
              create: lineItems.map((item: any, idx: number) => ({
                description: item.description,
                quantity: item.quantity ?? 1,
                rate: item.rate,
                amount: item.amount ?? item.rate * (item.quantity ?? 1),
                type: item.type ?? "LINEHAUL",
                sortOrder: idx,
              })),
            }
          : undefined,
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    res.json(invoice);
  } catch (error: any) {
    console.error("updateInvoice error:", error);
    res.status(500).json({ error: "Failed to update invoice", details: error.message });
  }
}

export async function sendInvoice(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (!["DRAFT", "SUBMITTED"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot send invoice in status ${existing.status}` });
      return;
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: "SENT",
        sentDate: new Date(),
      },
    });

    res.json(invoice);
  } catch (error: any) {
    console.error("sendInvoice error:", error);
    res.status(500).json({ error: "Failed to send invoice", details: error.message });
  }
}

export async function markInvoicePaid(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { paidAmount, paymentReference, paymentMethod } = req.body;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (existing.status === "PAID") {
      res.status(400).json({ error: "Invoice is already paid" });
      return;
    }
    if (existing.status === "VOID") {
      res.status(400).json({ error: "Cannot pay a voided invoice" });
      return;
    }

    const amountPaid = paidAmount ?? existing.totalAmount ?? existing.amount;
    const isPartial = amountPaid < (existing.totalAmount ?? existing.amount);

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: isPartial ? "PARTIAL" : "PAID",
        paidAt: new Date(),
        paidAmount: amountPaid,
        paymentReference: paymentReference ?? null,
        paymentMethod: paymentMethod ?? null,
      },
    });

    // Update the load status to COMPLETED if fully paid
    if (!isPartial) {
      await prisma.load.updateMany({
        where: { id: existing.loadId, status: "INVOICED" },
        data: { status: "COMPLETED" },
      });
    }

    res.json(invoice);
  } catch (error: any) {
    console.error("markInvoicePaid error:", error);
    res.status(500).json({ error: "Failed to mark invoice paid", details: error.message });
  }
}

export async function voidInvoice(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (existing.status === "PAID") {
      res.status(400).json({ error: "Cannot void a paid invoice. Issue a credit memo instead." });
      return;
    }
    if (existing.status === "VOID") {
      res.status(400).json({ error: "Invoice is already voided" });
      return;
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: "VOID",
        notes: reason ? `VOIDED: ${reason}\n${existing.notes ?? ""}` : existing.notes,
      },
    });

    res.json(invoice);
  } catch (error: any) {
    console.error("voidInvoice error:", error);
    res.status(500).json({ error: "Failed to void invoice", details: error.message });
  }
}

export async function getInvoiceAging(req: AuthRequest, res: Response) {
  try {
    const now = new Date();
    const unpaidStatuses: any[] = ["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "OVERDUE", "PARTIAL"];

    const invoices = await prisma.invoice.findMany({
      where: { status: { in: unpaidStatuses } },
      include: {
        load: {
          select: {
            referenceNumber: true,
            originCity: true,
            originState: true,
            destCity: true,
            destState: true,
            customer: { select: { id: true, name: true } },
          },
        },
        user: { select: { firstName: true, lastName: true, company: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const buckets = {
      current: { invoices: [] as any[], total: 0 },
      "1-30": { invoices: [] as any[], total: 0 },
      "31-60": { invoices: [] as any[], total: 0 },
      "61-90": { invoices: [] as any[], total: 0 },
      "90+": { invoices: [] as any[], total: 0 },
    };

    let grandTotal = 0;

    for (const inv of invoices) {
      const anchorDate = inv.dueDate ?? inv.createdAt;
      const daysOld = daysBetween(anchorDate, now);
      const enriched = { ...inv, daysOutstanding: Math.max(0, daysOld) };

      grandTotal += inv.amount;

      if (daysOld <= 0) {
        buckets.current.invoices.push(enriched);
        buckets.current.total += inv.amount;
      } else if (daysOld <= 30) {
        buckets["1-30"].invoices.push(enriched);
        buckets["1-30"].total += inv.amount;
      } else if (daysOld <= 60) {
        buckets["31-60"].invoices.push(enriched);
        buckets["31-60"].total += inv.amount;
      } else if (daysOld <= 90) {
        buckets["61-90"].invoices.push(enriched);
        buckets["61-90"].total += inv.amount;
      } else {
        buckets["90+"].invoices.push(enriched);
        buckets["90+"].total += inv.amount;
      }
    }

    res.json({
      buckets,
      summary: {
        current: buckets.current.total,
        "1-30": buckets["1-30"].total,
        "31-60": buckets["31-60"].total,
        "61-90": buckets["61-90"].total,
        "90+": buckets["90+"].total,
        grandTotal,
        invoiceCount: invoices.length,
      },
    });
  } catch (error: any) {
    console.error("getInvoiceAging error:", error);
    res.status(500).json({ error: "Failed to fetch aging report", details: error.message });
  }
}

// ============================================================
// 10-20. CARRIER PAYMENTS (Accounts Payable)
// ============================================================

export async function getPayments(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { status, carrierId, paymentTier, dateFrom, dateTo, search } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (carrierId) where.carrierId = carrierId;
    if (paymentTier) where.paymentTier = paymentTier;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }
    if (search) {
      where.OR = [
        { paymentNumber: { contains: search as string, mode: "insensitive" } },
        { load: { referenceNumber: { contains: search as string, mode: "insensitive" } } },
        { carrier: { company: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.carrierPay.findMany({
        where,
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
          load: {
            select: {
              referenceNumber: true,
              originCity: true,
              originState: true,
              destCity: true,
              destState: true,
            },
          },
          preparedBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.carrierPay.count({ where }),
    ]);

    res.json({
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("getPayments error:", error);
    res.status(500).json({ error: "Failed to fetch payments", details: error.message });
  }
}

export async function getPaymentById(req: AuthRequest, res: Response) {
  try {
    const payment = await prisma.carrierPay.findUnique({
      where: { id: req.params.id },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            carrierProfile: {
              select: { paymentPreference: true, srcppTier: true },
            },
          },
        },
        load: {
          select: {
            id: true,
            referenceNumber: true,
            loadNumber: true,
            originCity: true,
            originState: true,
            destCity: true,
            destState: true,
            pickupDate: true,
            deliveryDate: true,
            customerRate: true,
            carrierRate: true,
            grossMargin: true,
            distance: true,
            podUrl: true,
            bolUrl: true,
          },
        },
        rateConfirmation: {
          select: { id: true, rateConNumber: true, totalCharges: true, signed: true, pdfUrl: true },
        },
        preparedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        rejectedBy: { select: { id: true, firstName: true, lastName: true } },
        disputes: {
          select: { id: true, disputeNumber: true, status: true, disputedAmount: true, disputeType: true },
        },
        settlement: { select: { id: true, settlementNumber: true, status: true } },
      },
    });

    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    res.json(payment);
  } catch (error: any) {
    console.error("getPaymentById error:", error);
    res.status(500).json({ error: "Failed to fetch payment", details: error.message });
  }
}

export async function preparePayment(req: AuthRequest, res: Response) {
  try {
    const {
      carrierId,
      loadId,
      rateConfirmationId,
      paymentTier,
      lineHaul,
      fuelSurcharge,
      accessorialsTotal,
      paymentMethod,
      scheduledDate,
      dueDate,
      notes,
    } = req.body;

    if (!carrierId || !loadId) {
      res.status(400).json({ error: "carrierId and loadId are required" });
      return;
    }

    // Verify load
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { id: true, carrierRate: true, totalCarrierPay: true, fuelSurcharge: true },
    });
    if (!load) {
      res.status(404).json({ error: "Load not found" });
      return;
    }

    const lh = lineHaul ?? load.carrierRate ?? load.totalCarrierPay ?? 0;
    const fs = fuelSurcharge ?? load.fuelSurcharge ?? 0;
    const acc = accessorialsTotal ?? 0;
    const grossAmount = lh + fs + acc;

    // Calculate quick-pay discount if applicable
    const tier = paymentTier ?? "STANDARD";
    let quickPayFeePercent = 0;
    if (tier === "FLASH") quickPayFeePercent = 5;
    else if (tier === "EXPRESS") quickPayFeePercent = 4;
    else if (tier === "PRIORITY") quickPayFeePercent = 3;
    else if (tier === "PARTNER") quickPayFeePercent = 2;
    else if (tier === "ELITE") quickPayFeePercent = 1.5;

    const quickPayFeeAmount = grossAmount * (quickPayFeePercent / 100);
    const netAmount = grossAmount - quickPayFeeAmount;

    // Generate payment number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const existingCount = await prisma.carrierPay.count({
      where: { paymentNumber: { startsWith: `CP-${todayStr}` } },
    });
    const paymentNumber = `CP-${todayStr}-${String(existingCount + 1).padStart(4, "0")}`;

    const payment = await prisma.carrierPay.create({
      data: {
        paymentNumber,
        carrierId,
        loadId,
        rateConfirmationId: rateConfirmationId ?? null,
        paymentTier: tier,
        lineHaul: lh,
        fuelSurcharge: fs,
        accessorialsTotal: acc,
        amount: grossAmount,
        grossAmount,
        quickPayFeePercent,
        quickPayFeeAmount,
        quickPayDiscount: quickPayFeeAmount,
        netAmount,
        status: "PREPARED",
        paymentMethod: paymentMethod ?? null,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        preparedById: req.user!.id,
        preparedAt: new Date(),
        notes: notes ?? null,
      },
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        load: { select: { referenceNumber: true } },
      },
    });

    res.status(201).json(payment);
  } catch (error: any) {
    console.error("preparePayment error:", error);
    res.status(500).json({ error: "Failed to prepare payment", details: error.message });
  }
}

export async function updatePayment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.carrierPay.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (!["PENDING", "PREPARED", "REJECTED"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot edit payment in status ${existing.status}` });
      return;
    }

    const {
      lineHaul,
      fuelSurcharge,
      accessorialsTotal,
      paymentMethod,
      paymentTier,
      scheduledDate,
      dueDate,
      notes,
    } = req.body;

    const lh = lineHaul ?? existing.lineHaul ?? 0;
    const fs = fuelSurcharge ?? existing.fuelSurcharge ?? 0;
    const acc = accessorialsTotal ?? existing.accessorialsTotal ?? 0;
    const grossAmount = lh + fs + acc;

    const tier = paymentTier ?? existing.paymentTier;
    let quickPayFeePercent = existing.quickPayFeePercent ?? 0;
    if (paymentTier) {
      if (tier === "FLASH") quickPayFeePercent = 5;
      else if (tier === "EXPRESS") quickPayFeePercent = 4;
      else if (tier === "PRIORITY") quickPayFeePercent = 3;
      else if (tier === "PARTNER") quickPayFeePercent = 2;
      else if (tier === "ELITE") quickPayFeePercent = 1.5;
      else quickPayFeePercent = 0;
    }

    const quickPayFeeAmount = grossAmount * (quickPayFeePercent / 100);
    const netAmount = grossAmount - quickPayFeeAmount;

    const payment = await prisma.carrierPay.update({
      where: { id },
      data: {
        lineHaul: lh,
        fuelSurcharge: fs,
        accessorialsTotal: acc,
        amount: grossAmount,
        grossAmount,
        quickPayFeePercent,
        quickPayFeeAmount,
        quickPayDiscount: quickPayFeeAmount,
        netAmount,
        paymentTier: tier,
        paymentMethod: paymentMethod ?? existing.paymentMethod,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : existing.scheduledDate,
        dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
        notes: notes ?? existing.notes,
      },
    });

    res.json(payment);
  } catch (error: any) {
    console.error("updatePayment error:", error);
    res.status(500).json({ error: "Failed to update payment", details: error.message });
  }
}

export async function submitPayment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.carrierPay.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (!["PENDING", "PREPARED", "REJECTED"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot submit payment in status ${existing.status}` });
      return;
    }

    const payment = await prisma.carrierPay.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    res.json(payment);
  } catch (error: any) {
    console.error("submitPayment error:", error);
    res.status(500).json({ error: "Failed to submit payment", details: error.message });
  }
}

export async function approvePayment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.carrierPay.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (existing.status !== "SUBMITTED") {
      res.status(400).json({ error: `Can only approve payments in SUBMITTED status, current: ${existing.status}` });
      return;
    }

    const payment = await prisma.carrierPay.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    res.json(payment);
  } catch (error: any) {
    console.error("approvePayment error:", error);
    res.status(500).json({ error: "Failed to approve payment", details: error.message });
  }
}

export async function rejectPayment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await prisma.carrierPay.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (existing.status !== "SUBMITTED") {
      res.status(400).json({ error: `Can only reject payments in SUBMITTED status, current: ${existing.status}` });
      return;
    }

    const payment = await prisma.carrierPay.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedById: req.user!.id,
        rejectedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    res.json(payment);
  } catch (error: any) {
    console.error("rejectPayment error:", error);
    res.status(500).json({ error: "Failed to reject payment", details: error.message });
  }
}

export async function holdPayment(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await prisma.carrierPay.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (["PAID", "VOID"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot hold payment in status ${existing.status}` });
      return;
    }

    const payment = await prisma.carrierPay.update({
      where: { id },
      data: {
        status: "ON_HOLD",
        notes: reason ? `HOLD: ${reason}\n${existing.notes ?? ""}` : existing.notes,
      },
    });

    res.json(payment);
  } catch (error: any) {
    console.error("holdPayment error:", error);
    res.status(500).json({ error: "Failed to hold payment", details: error.message });
  }
}

export async function markPaymentPaid(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { paymentMethod, checkNumber, referenceNumber } = req.body;

    const existing = await prisma.carrierPay.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (!["APPROVED", "PROCESSING", "SCHEDULED"].includes(existing.status)) {
      res.status(400).json({ error: `Can only mark as paid from APPROVED/PROCESSING/SCHEDULED, current: ${existing.status}` });
      return;
    }

    const payment = await prisma.carrierPay.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentDate: new Date(),
        paymentMethod: paymentMethod ?? existing.paymentMethod ?? "ACH",
        checkNumber: checkNumber ?? existing.checkNumber,
        referenceNumber: referenceNumber ?? existing.referenceNumber,
      },
    });

    // Record in factoring fund as outflow
    const latestFund = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true },
    });
    const currentBalance = latestFund?.runningBalance ?? 0;

    await prisma.factoringFund.create({
      data: {
        transactionType: "CARRIER_PAYMENT_OUT",
        amount: -payment.netAmount,
        runningBalance: currentBalance - payment.netAmount,
        referenceType: "CarrierPay",
        referenceId: payment.id,
        description: `Carrier payment ${payment.paymentNumber} paid`,
        createdById: req.user!.id,
      },
    });

    res.json(payment);
  } catch (error: any) {
    console.error("markPaymentPaid error:", error);
    res.status(500).json({ error: "Failed to mark payment paid", details: error.message });
  }
}

export async function bulkApprovePayments(req: AuthRequest, res: Response) {
  try {
    const { paymentIds } = req.body;
    if (!paymentIds?.length) {
      res.status(400).json({ error: "paymentIds array is required" });
      return;
    }

    const result = await prisma.carrierPay.updateMany({
      where: {
        id: { in: paymentIds },
        status: "SUBMITTED",
      },
      data: {
        status: "APPROVED",
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    res.json({ approved: result.count, requested: paymentIds.length });
  } catch (error: any) {
    console.error("bulkApprovePayments error:", error);
    res.status(500).json({ error: "Failed to bulk approve", details: error.message });
  }
}

export async function getPaymentQueue(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);

    // Quick-pay queue: payments with non-STANDARD tier that are pending/prepared/submitted
    const where: any = {
      paymentTier: { not: "STANDARD" },
      status: { in: ["PENDING", "PREPARED", "SUBMITTED", "APPROVED"] },
    };

    const [payments, total] = await Promise.all([
      prisma.carrierPay.findMany({
        where,
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
          load: {
            select: {
              referenceNumber: true,
              originCity: true,
              originState: true,
              destCity: true,
              destState: true,
              deliveryDate: true,
              podSigned: true,
            },
          },
          preparedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [
          { paymentTier: "asc" }, // FLASH first
          { createdAt: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.carrierPay.count({ where }),
    ]);

    // Calculate SLA deadlines
    const enriched = payments.map((p) => {
      let slaHours = 168; // default 7 days
      if (p.paymentTier === "FLASH") slaHours = 2;
      else if (p.paymentTier === "EXPRESS") slaHours = 24;
      else if (p.paymentTier === "PRIORITY") slaHours = 48;
      else if (p.paymentTier === "PARTNER") slaHours = 72;
      else if (p.paymentTier === "ELITE") slaHours = 120;

      const slaDeadline = new Date(p.createdAt.getTime() + slaHours * 3_600_000);
      const hoursRemaining = Math.max(0, (slaDeadline.getTime() - Date.now()) / 3_600_000);

      return {
        ...p,
        slaHours,
        slaDeadline,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        isOverdue: hoursRemaining <= 0,
      };
    });

    res.json({
      queue: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("getPaymentQueue error:", error);
    res.status(500).json({ error: "Failed to fetch payment queue", details: error.message });
  }
}

// ============================================================
// 21-26. DISPUTES
// ============================================================

export async function getDisputes(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { status, disputeType, carrierId } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (disputeType) where.disputeType = disputeType;
    if (carrierId) where.carrierId = carrierId;

    const [disputes, total] = await Promise.all([
      prisma.paymentDispute.findMany({
        where,
        include: {
          carrierPayment: {
            select: {
              paymentNumber: true,
              netAmount: true,
              status: true,
              carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
              load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
            },
          },
          filedBy: { select: { id: true, firstName: true, lastName: true } },
          resolvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.paymentDispute.count({ where }),
    ]);

    res.json({
      disputes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("getDisputes error:", error);
    res.status(500).json({ error: "Failed to fetch disputes", details: error.message });
  }
}

export async function getDisputeById(req: AuthRequest, res: Response) {
  try {
    const dispute = await prisma.paymentDispute.findUnique({
      where: { id: req.params.id },
      include: {
        carrierPayment: {
          include: {
            carrier: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
            load: {
              select: {
                id: true,
                referenceNumber: true,
                originCity: true,
                originState: true,
                destCity: true,
                destState: true,
                customerRate: true,
                carrierRate: true,
                distance: true,
              },
            },
            rateConfirmation: { select: { id: true, rateConNumber: true, totalCharges: true, pdfUrl: true } },
          },
        },
        filedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!dispute) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }

    res.json(dispute);
  } catch (error: any) {
    console.error("getDisputeById error:", error);
    res.status(500).json({ error: "Failed to fetch dispute", details: error.message });
  }
}

export async function fileDispute(req: AuthRequest, res: Response) {
  try {
    const {
      carrierPaymentId,
      disputeType,
      disputedAmount,
      description,
    } = req.body;

    if (!carrierPaymentId || !disputeType || disputedAmount === undefined || !description) {
      res.status(400).json({ error: "carrierPaymentId, disputeType, disputedAmount, and description are required" });
      return;
    }

    // Verify carrier payment exists
    const cp = await prisma.carrierPay.findUnique({
      where: { id: carrierPaymentId },
      select: { id: true, loadId: true, carrierId: true },
    });
    if (!cp) {
      res.status(404).json({ error: "Carrier payment not found" });
      return;
    }

    // Generate dispute number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const existingCount = await prisma.paymentDispute.count({
      where: { disputeNumber: { startsWith: `DSP-${todayStr}` } },
    });
    const disputeNumber = `DSP-${todayStr}-${String(existingCount + 1).padStart(4, "0")}`;

    const dispute = await prisma.paymentDispute.create({
      data: {
        disputeNumber,
        carrierPaymentId,
        loadId: cp.loadId,
        carrierId: cp.carrierId,
        disputeType,
        disputedAmount,
        description,
        status: "OPEN",
        filedById: req.user!.id,
      },
      include: {
        carrierPayment: { select: { paymentNumber: true } },
        filedBy: { select: { firstName: true, lastName: true } },
      },
    });

    // Mark the carrier pay as disputed
    await prisma.carrierPay.update({
      where: { id: carrierPaymentId },
      data: { status: "DISPUTED" },
    });

    res.status(201).json(dispute);
  } catch (error: any) {
    console.error("fileDispute error:", error);
    res.status(500).json({ error: "Failed to file dispute", details: error.message });
  }
}

export async function investigateDispute(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { investigationNotes } = req.body;

    const existing = await prisma.paymentDispute.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }
    if (!["OPEN", "INVESTIGATING"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot investigate dispute in status ${existing.status}` });
      return;
    }

    const dispute = await prisma.paymentDispute.update({
      where: { id },
      data: {
        status: "INVESTIGATING",
        investigationNotes: investigationNotes
          ? `${existing.investigationNotes ? existing.investigationNotes + "\n---\n" : ""}[${new Date().toISOString()}] ${investigationNotes}`
          : existing.investigationNotes,
      },
    });

    res.json(dispute);
  } catch (error: any) {
    console.error("investigateDispute error:", error);
    res.status(500).json({ error: "Failed to update investigation", details: error.message });
  }
}

export async function proposeDisputeResolution(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { proposedResolution, proposedAmount } = req.body;

    if (!proposedResolution) {
      res.status(400).json({ error: "proposedResolution is required" });
      return;
    }

    const existing = await prisma.paymentDispute.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }
    if (!["OPEN", "INVESTIGATING"].includes(existing.status)) {
      res.status(400).json({ error: `Cannot propose resolution for dispute in status ${existing.status}` });
      return;
    }

    const dispute = await prisma.paymentDispute.update({
      where: { id },
      data: {
        status: "PROPOSED",
        proposedResolution,
        proposedAmount: proposedAmount ?? null,
      },
    });

    res.json(dispute);
  } catch (error: any) {
    console.error("proposeDisputeResolution error:", error);
    res.status(500).json({ error: "Failed to propose resolution", details: error.message });
  }
}

export async function resolveDispute(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { resolutionNotes, resolutionAmount, approved } = req.body;

    const existing = await prisma.paymentDispute.findUnique({
      where: { id },
      include: { carrierPayment: { select: { id: true, status: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }
    if (["CLOSED", "APPROVED", "DENIED"].includes(existing.status)) {
      res.status(400).json({ error: `Dispute is already resolved with status ${existing.status}` });
      return;
    }

    const finalStatus = approved !== false ? "APPROVED" : "DENIED";

    const dispute = await prisma.paymentDispute.update({
      where: { id },
      data: {
        status: finalStatus,
        resolutionNotes: resolutionNotes ?? null,
        resolutionAmount: resolutionAmount ?? existing.proposedAmount ?? null,
        resolvedById: req.user!.id,
        resolvedAt: new Date(),
      },
    });

    // If resolved, move carrier pay back to a workable state
    if (existing.carrierPayment) {
      if (finalStatus === "APPROVED" && resolutionAmount) {
        // Adjust the payment amount
        await prisma.carrierPay.update({
          where: { id: existing.carrierPaymentId },
          data: {
            status: "PREPARED",
            netAmount: resolutionAmount,
            amount: resolutionAmount,
            notes: `Adjusted after dispute ${existing.disputeNumber}: ${resolutionNotes ?? ""}`,
          },
        });
      } else {
        // Return to previous workable status
        await prisma.carrierPay.update({
          where: { id: existing.carrierPaymentId },
          data: { status: "PREPARED" },
        });
      }
    }

    res.json(dispute);
  } catch (error: any) {
    console.error("resolveDispute error:", error);
    res.status(500).json({ error: "Failed to resolve dispute", details: error.message });
  }
}

// ============================================================
// 27-30. SHIPPER CREDIT
// ============================================================

export async function getCreditList(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { grade, blocked } = req.query;

    const where: any = {};
    if (grade) where.creditGrade = grade;
    if (blocked === "true") where.autoBlocked = true;
    if (blocked === "false") where.autoBlocked = false;

    const [credits, total] = await Promise.all([
      prisma.shipperCredit.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true, contactName: true, email: true, phone: true, status: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.shipperCredit.count({ where }),
    ]);

    // Enrich with utilization percentage
    const enriched = credits.map((c) => ({
      ...c,
      utilizationPercent: c.creditLimit > 0
        ? Math.round((c.currentUtilized / c.creditLimit) * 10000) / 100
        : 0,
      availableCredit: Math.max(0, c.creditLimit - c.currentUtilized),
    }));

    res.json({
      credits: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("getCreditList error:", error);
    res.status(500).json({ error: "Failed to fetch credit list", details: error.message });
  }
}

export async function getCreditById(req: AuthRequest, res: Response) {
  try {
    const credit = await prisma.shipperCredit.findUnique({
      where: { id: req.params.id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            contactName: true,
            email: true,
            phone: true,
            status: true,
            paymentTerms: true,
            annualRevenue: true,
            creditLimit: true,
            creditStatus: true,
          },
        },
      },
    });

    if (!credit) {
      res.status(404).json({ error: "Shipper credit record not found" });
      return;
    }

    // Fetch recent invoices for this shipper
    const recentInvoices = await prisma.invoice.findMany({
      where: {
        load: { customerId: credit.customerId },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        status: true,
        createdAt: true,
        dueDate: true,
        paidAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Calculate payment history stats
    const paidInvoices = recentInvoices.filter((i) => i.paidAt && i.dueDate);
    const paymentHistory = paidInvoices.map((i) => {
      const daysToPayAfterDue = daysBetween(i.dueDate!, i.paidAt!);
      return { invoiceNumber: i.invoiceNumber, amount: i.amount, daysToPayAfterDue };
    });

    res.json({
      ...credit,
      utilizationPercent: credit.creditLimit > 0
        ? Math.round((credit.currentUtilized / credit.creditLimit) * 10000) / 100
        : 0,
      availableCredit: Math.max(0, credit.creditLimit - credit.currentUtilized),
      recentInvoices,
      paymentHistory,
    });
  } catch (error: any) {
    console.error("getCreditById error:", error);
    res.status(500).json({ error: "Failed to fetch credit detail", details: error.message });
  }
}

export async function updateCredit(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      creditGrade,
      creditLimit,
      paymentTerms,
      autoBlocked,
      blockedReason,
      notes,
    } = req.body;

    const existing = await prisma.shipperCredit.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Shipper credit record not found" });
      return;
    }

    const credit = await prisma.shipperCredit.update({
      where: { id },
      data: {
        creditGrade: creditGrade ?? existing.creditGrade,
        creditLimit: creditLimit ?? existing.creditLimit,
        paymentTerms: paymentTerms ?? existing.paymentTerms,
        autoBlocked: autoBlocked ?? existing.autoBlocked,
        blockedReason: autoBlocked === true ? (blockedReason ?? "Manually blocked by admin") : autoBlocked === false ? null : existing.blockedReason,
        blockedAt: autoBlocked === true ? new Date() : autoBlocked === false ? null : existing.blockedAt,
        lastCreditReview: new Date(),
        notes: notes ?? existing.notes,
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    res.json(credit);
  } catch (error: any) {
    console.error("updateCredit error:", error);
    res.status(500).json({ error: "Failed to update credit", details: error.message });
  }
}

export async function getCreditAlerts(req: AuthRequest, res: Response) {
  try {
    // Find all credits that are concerning
    const allCredits = await prisma.shipperCredit.findMany({
      where: {
        creditLimit: { gt: 0 },
      },
      include: {
        customer: { select: { id: true, name: true, contactName: true, email: true } },
      },
    });

    const alerts: any[] = [];

    for (const credit of allCredits) {
      const utilPct = (credit.currentUtilized / credit.creditLimit) * 100;

      if (credit.autoBlocked) {
        alerts.push({
          ...credit,
          alertType: "BLOCKED",
          severity: "CRITICAL",
          message: `${credit.customer.name} is blocked: ${credit.blockedReason ?? "Auto-blocked"}`,
          utilizationPercent: Math.round(utilPct * 100) / 100,
        });
      } else if (utilPct >= 90) {
        alerts.push({
          ...credit,
          alertType: "OVER_90",
          severity: "HIGH",
          message: `${credit.customer.name} at ${Math.round(utilPct)}% credit utilization`,
          utilizationPercent: Math.round(utilPct * 100) / 100,
        });
      } else if (utilPct >= 80) {
        alerts.push({
          ...credit,
          alertType: "OVER_80",
          severity: "MEDIUM",
          message: `${credit.customer.name} at ${Math.round(utilPct)}% credit utilization`,
          utilizationPercent: Math.round(utilPct * 100) / 100,
        });
      }

      // Late payer alert
      if (credit.avgDaysToPay > 45) {
        alerts.push({
          ...credit,
          alertType: "SLOW_PAYER",
          severity: "MEDIUM",
          message: `${credit.customer.name} avg ${Math.round(credit.avgDaysToPay)} days to pay`,
          utilizationPercent: Math.round(utilPct * 100) / 100,
        });
      }
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    alerts.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

    res.json({ alerts, count: alerts.length });
  } catch (error: any) {
    console.error("getCreditAlerts error:", error);
    res.status(500).json({ error: "Failed to fetch credit alerts", details: error.message });
  }
}

// ============================================================
// 31-34. FACTORING FUND
// ============================================================

export async function getFundBalance(req: AuthRequest, res: Response) {
  try {
    const latest = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true, createdAt: true },
    });

    // Calculate totals by type
    const totals = await prisma.factoringFund.groupBy({
      by: ["transactionType"],
      _sum: { amount: true },
      _count: true,
    });

    const byType: Record<string, { total: number; count: number }> = {};
    for (const t of totals) {
      byType[t.transactionType] = {
        total: t._sum.amount ?? 0,
        count: t._count,
      };
    }

    // Today's transactions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTotal = await prisma.factoringFund.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { amount: true },
      _count: true,
    });

    res.json({
      currentBalance: latest?.runningBalance ?? 0,
      lastUpdated: latest?.createdAt ?? null,
      byType,
      today: {
        netChange: todayTotal._sum.amount ?? 0,
        transactionCount: todayTotal._count,
      },
    });
  } catch (error: any) {
    console.error("getFundBalance error:", error);
    res.status(500).json({ error: "Failed to fetch fund balance", details: error.message });
  }
}

export async function getFundTransactions(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { transactionType, dateFrom, dateTo } = req.query;

    const where: any = {};
    if (transactionType) where.transactionType = transactionType;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }

    const [transactions, total] = await Promise.all([
      prisma.factoringFund.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.factoringFund.count({ where }),
    ]);

    res.json({
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("getFundTransactions error:", error);
    res.status(500).json({ error: "Failed to fetch fund transactions", details: error.message });
  }
}

export async function getFundPerformance(req: AuthRequest, res: Response) {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // MTD metrics
    const mtdData = await prisma.factoringFund.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { transactionType: true, amount: true, createdAt: true },
    });

    // YTD metrics
    const ytdData = await prisma.factoringFund.findMany({
      where: { createdAt: { gte: yearStart } },
      select: { transactionType: true, amount: true, createdAt: true },
    });

    function summarize(data: typeof mtdData) {
      let totalIn = 0;
      let totalOut = 0;
      let qpFees = 0;
      for (const d of data) {
        if (d.amount > 0) totalIn += d.amount;
        else totalOut += Math.abs(d.amount);
        if (d.transactionType === "QP_FEE_EARNED") qpFees += d.amount;
      }
      return { totalIn, totalOut, netFlow: totalIn - totalOut, qpFeeIncome: qpFees, transactionCount: data.length };
    }

    // Monthly breakdown for the year
    const monthlyBreakdown: Record<string, { inflows: number; outflows: number; qpFees: number }> = {};
    for (const d of ytdData) {
      const key = d.createdAt.toISOString().slice(0, 7);
      if (!monthlyBreakdown[key]) monthlyBreakdown[key] = { inflows: 0, outflows: 0, qpFees: 0 };
      if (d.amount > 0) monthlyBreakdown[key].inflows += d.amount;
      else monthlyBreakdown[key].outflows += Math.abs(d.amount);
      if (d.transactionType === "QP_FEE_EARNED") monthlyBreakdown[key].qpFees += d.amount;
    }

    const monthly = Object.entries(monthlyBreakdown)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        ...data,
        netFlow: data.inflows - data.outflows,
      }));

    res.json({
      mtd: summarize(mtdData),
      ytd: summarize(ytdData),
      monthly,
    });
  } catch (error: any) {
    console.error("getFundPerformance error:", error);
    res.status(500).json({ error: "Failed to fetch fund performance", details: error.message });
  }
}

export async function fundAdjustment(req: AuthRequest, res: Response) {
  try {
    const { amount, description } = req.body;

    if (amount === undefined || !description) {
      res.status(400).json({ error: "amount and description are required" });
      return;
    }

    const latest = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true },
    });
    const currentBalance = latest?.runningBalance ?? 0;
    const newBalance = currentBalance + amount;

    const entry = await prisma.factoringFund.create({
      data: {
        transactionType: "ADJUSTMENT",
        amount,
        runningBalance: newBalance,
        description,
        createdById: req.user!.id,
      },
    });

    res.status(201).json({
      ...entry,
      previousBalance: currentBalance,
      newBalance,
    });
  } catch (error: any) {
    console.error("fundAdjustment error:", error);
    res.status(500).json({ error: "Failed to create adjustment", details: error.message });
  }
}

// ============================================================
// 35-38. P&L / PROFITABILITY
// ============================================================

export async function getLoadPnl(req: AuthRequest, res: Response) {
  try {
    const { page, limit, skip } = paginate(req.query);
    const { dateFrom, dateTo, minMargin, maxMargin, customerId } = req.query;

    const where: any = {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      customerRate: { not: null },
    };
    if (dateFrom || dateTo) {
      where.deliveryDate = {};
      if (dateFrom) where.deliveryDate.gte = new Date(dateFrom as string);
      if (dateTo) where.deliveryDate.lte = new Date(dateTo as string);
    }
    if (customerId) where.customerId = customerId;
    if (minMargin) where.marginPercent = { ...where.marginPercent, gte: parseFloat(minMargin as string) };
    if (maxMargin) where.marginPercent = { ...where.marginPercent, lte: parseFloat(maxMargin as string) };

    const [loads, total] = await Promise.all([
      prisma.load.findMany({
        where,
        select: {
          id: true,
          referenceNumber: true,
          loadNumber: true,
          originCity: true,
          originState: true,
          destCity: true,
          destState: true,
          distance: true,
          customerRate: true,
          carrierRate: true,
          grossMargin: true,
          marginPercent: true,
          revenuePerMile: true,
          costPerMile: true,
          marginPerMile: true,
          fuelSurcharge: true,
          equipmentType: true,
          deliveryDate: true,
          customer: { select: { id: true, name: true } },
          carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        },
        orderBy: { deliveryDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.load.count({ where }),
    ]);

    // Aggregate stats
    const allLoadsForStats = await prisma.load.aggregate({
      where,
      _sum: { customerRate: true, carrierRate: true, grossMargin: true },
      _avg: { marginPercent: true, revenuePerMile: true, costPerMile: true },
      _count: true,
    });

    res.json({
      loads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      aggregates: {
        totalLoads: allLoadsForStats._count,
        totalRevenue: allLoadsForStats._sum.customerRate ?? 0,
        totalCost: allLoadsForStats._sum.carrierRate ?? 0,
        totalMargin: allLoadsForStats._sum.grossMargin ?? 0,
        avgMarginPercent: Math.round((allLoadsForStats._avg.marginPercent ?? 0) * 100) / 100,
        avgRevenuePerMile: Math.round((allLoadsForStats._avg.revenuePerMile ?? 0) * 100) / 100,
        avgCostPerMile: Math.round((allLoadsForStats._avg.costPerMile ?? 0) * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error("getLoadPnl error:", error);
    res.status(500).json({ error: "Failed to fetch load P&L", details: error.message });
  }
}

export async function getLaneProfitability(req: AuthRequest, res: Response) {
  try {
    const { dateFrom, dateTo, minLoads } = req.query;

    const where: any = {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      customerRate: { not: null },
      carrierRate: { not: null },
    };
    if (dateFrom || dateTo) {
      where.deliveryDate = {};
      if (dateFrom) where.deliveryDate.gte = new Date(dateFrom as string);
      if (dateTo) where.deliveryDate.lte = new Date(dateTo as string);
    }

    const loads = await prisma.load.findMany({
      where,
      select: {
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        customerRate: true,
        carrierRate: true,
        grossMargin: true,
        marginPercent: true,
        distance: true,
        revenuePerMile: true,
      },
    });

    // Group by lane (origin state -> dest state)
    const lanes: Record<string, {
      lane: string;
      originState: string;
      destState: string;
      loads: number;
      totalRevenue: number;
      totalCost: number;
      totalMargin: number;
      margins: number[];
      distances: number[];
      rpms: number[];
    }> = {};

    for (const load of loads) {
      const laneKey = `${load.originState}-${load.destState}`;
      if (!lanes[laneKey]) {
        lanes[laneKey] = {
          lane: `${load.originState} -> ${load.destState}`,
          originState: load.originState,
          destState: load.destState,
          loads: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalMargin: 0,
          margins: [],
          distances: [],
          rpms: [],
        };
      }
      const l = lanes[laneKey];
      l.loads++;
      l.totalRevenue += load.customerRate ?? 0;
      l.totalCost += load.carrierRate ?? 0;
      l.totalMargin += load.grossMargin ?? 0;
      if (load.marginPercent !== null) l.margins.push(load.marginPercent);
      if (load.distance !== null) l.distances.push(load.distance);
      if (load.revenuePerMile !== null) l.rpms.push(load.revenuePerMile);
    }

    const minLoadCount = parseInt(minLoads as string) || 1;

    const laneResults = Object.values(lanes)
      .filter((l) => l.loads >= minLoadCount)
      .map((l) => ({
        lane: l.lane,
        originState: l.originState,
        destState: l.destState,
        loadCount: l.loads,
        totalRevenue: Math.round(l.totalRevenue * 100) / 100,
        totalCost: Math.round(l.totalCost * 100) / 100,
        totalMargin: Math.round(l.totalMargin * 100) / 100,
        avgMarginPercent: l.margins.length
          ? Math.round((l.margins.reduce((s, m) => s + m, 0) / l.margins.length) * 100) / 100
          : 0,
        avgDistance: l.distances.length
          ? Math.round(l.distances.reduce((s, d) => s + d, 0) / l.distances.length)
          : 0,
        avgRevenuePerMile: l.rpms.length
          ? Math.round((l.rpms.reduce((s, r) => s + r, 0) / l.rpms.length) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.totalMargin - a.totalMargin);

    res.json({
      lanes: laneResults,
      totalLanes: laneResults.length,
      topLane: laneResults[0] ?? null,
      bottomLane: laneResults[laneResults.length - 1] ?? null,
    });
  } catch (error: any) {
    console.error("getLaneProfitability error:", error);
    res.status(500).json({ error: "Failed to fetch lane profitability", details: error.message });
  }
}

export async function getCarrierProfitability(req: AuthRequest, res: Response) {
  try {
    const { dateFrom, dateTo, minLoads } = req.query;

    const where: any = {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      carrierId: { not: null },
      customerRate: { not: null },
      carrierRate: { not: null },
    };
    if (dateFrom || dateTo) {
      where.deliveryDate = {};
      if (dateFrom) where.deliveryDate.gte = new Date(dateFrom as string);
      if (dateTo) where.deliveryDate.lte = new Date(dateTo as string);
    }

    const loads = await prisma.load.findMany({
      where,
      select: {
        carrierId: true,
        customerRate: true,
        carrierRate: true,
        grossMargin: true,
        marginPercent: true,
        distance: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
    });

    // Group by carrier
    const carriers: Record<string, {
      carrier: any;
      loads: number;
      totalRevenue: number;
      totalCost: number;
      totalMargin: number;
      margins: number[];
      totalMiles: number;
    }> = {};

    for (const load of loads) {
      const key = load.carrierId!;
      if (!carriers[key]) {
        carriers[key] = {
          carrier: load.carrier,
          loads: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalMargin: 0,
          margins: [],
          totalMiles: 0,
        };
      }
      const c = carriers[key];
      c.loads++;
      c.totalRevenue += load.customerRate ?? 0;
      c.totalCost += load.carrierRate ?? 0;
      c.totalMargin += load.grossMargin ?? 0;
      if (load.marginPercent !== null) c.margins.push(load.marginPercent);
      c.totalMiles += load.distance ?? 0;
    }

    const minLoadCount = parseInt(minLoads as string) || 1;

    const carrierResults = Object.values(carriers)
      .filter((c) => c.loads >= minLoadCount)
      .map((c) => ({
        carrier: c.carrier,
        loadCount: c.loads,
        totalRevenue: Math.round(c.totalRevenue * 100) / 100,
        totalCost: Math.round(c.totalCost * 100) / 100,
        totalMargin: Math.round(c.totalMargin * 100) / 100,
        avgMarginPercent: c.margins.length
          ? Math.round((c.margins.reduce((s, m) => s + m, 0) / c.margins.length) * 100) / 100
          : 0,
        totalMiles: Math.round(c.totalMiles),
        revenuePerMile: c.totalMiles > 0
          ? Math.round((c.totalRevenue / c.totalMiles) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.totalMargin - a.totalMargin);

    res.json({
      carriers: carrierResults,
      totalCarriers: carrierResults.length,
    });
  } catch (error: any) {
    console.error("getCarrierProfitability error:", error);
    res.status(500).json({ error: "Failed to fetch carrier profitability", details: error.message });
  }
}

export async function getShipperProfitability(req: AuthRequest, res: Response) {
  try {
    const { dateFrom, dateTo, minLoads } = req.query;

    const where: any = {
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      customerId: { not: null },
      customerRate: { not: null },
    };
    if (dateFrom || dateTo) {
      where.deliveryDate = {};
      if (dateFrom) where.deliveryDate.gte = new Date(dateFrom as string);
      if (dateTo) where.deliveryDate.lte = new Date(dateTo as string);
    }

    const loads = await prisma.load.findMany({
      where,
      select: {
        customerId: true,
        customerRate: true,
        carrierRate: true,
        grossMargin: true,
        marginPercent: true,
        distance: true,
        customer: { select: { id: true, name: true, contactName: true, paymentTerms: true } },
      },
    });

    // Group by shipper/customer
    const shippers: Record<string, {
      customer: any;
      loads: number;
      totalRevenue: number;
      totalCost: number;
      totalMargin: number;
      margins: number[];
      totalMiles: number;
    }> = {};

    for (const load of loads) {
      const key = load.customerId!;
      if (!shippers[key]) {
        shippers[key] = {
          customer: load.customer,
          loads: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalMargin: 0,
          margins: [],
          totalMiles: 0,
        };
      }
      const s = shippers[key];
      s.loads++;
      s.totalRevenue += load.customerRate ?? 0;
      s.totalCost += load.carrierRate ?? 0;
      s.totalMargin += load.grossMargin ?? 0;
      if (load.marginPercent !== null) s.margins.push(load.marginPercent);
      s.totalMiles += load.distance ?? 0;
    }

    const minLoadCount = parseInt(minLoads as string) || 1;

    const shipperResults = Object.values(shippers)
      .filter((s) => s.loads >= minLoadCount)
      .map((s) => ({
        customer: s.customer,
        loadCount: s.loads,
        totalRevenue: Math.round(s.totalRevenue * 100) / 100,
        totalCost: Math.round(s.totalCost * 100) / 100,
        totalMargin: Math.round(s.totalMargin * 100) / 100,
        avgMarginPercent: s.margins.length
          ? Math.round((s.margins.reduce((sum, m) => sum + m, 0) / s.margins.length) * 100) / 100
          : 0,
        totalMiles: Math.round(s.totalMiles),
        revenuePerMile: s.totalMiles > 0
          ? Math.round((s.totalRevenue / s.totalMiles) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({
      shippers: shipperResults,
      totalShippers: shipperResults.length,
    });
  } catch (error: any) {
    console.error("getShipperProfitability error:", error);
    res.status(500).json({ error: "Failed to fetch shipper profitability", details: error.message });
  }
}

// ============================================================
// 39-40. REPORTS
// ============================================================

export async function getWeeklyReport(req: AuthRequest, res: Response) {
  try {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const prevWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);

    // This week's loads
    const thisWeekLoads = await prisma.load.findMany({
      where: {
        status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
        deliveryDate: { gte: weekStart },
      },
      select: { customerRate: true, carrierRate: true, grossMargin: true, marginPercent: true, distance: true },
    });

    // Previous week for comparison
    const prevWeekLoads = await prisma.load.findMany({
      where: {
        status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
        deliveryDate: { gte: prevWeekStart, lt: weekStart },
      },
      select: { customerRate: true, carrierRate: true, grossMargin: true, marginPercent: true, distance: true },
    });

    function summarizeLoads(loads: typeof thisWeekLoads) {
      const revenue = loads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
      const cost = loads.reduce((s, l) => s + (l.carrierRate ?? 0), 0);
      const margin = loads.reduce((s, l) => s + (l.grossMargin ?? 0), 0);
      const margins = loads.filter((l) => l.marginPercent !== null).map((l) => l.marginPercent!);
      const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
      return { loadCount: loads.length, revenue, cost, margin, avgMarginPercent: Math.round(avgMargin * 100) / 100 };
    }

    const current = summarizeLoads(thisWeekLoads);
    const previous = summarizeLoads(prevWeekLoads);

    // Invoices sent this week
    const invoicesSent = await prisma.invoice.count({
      where: { sentDate: { gte: weekStart } },
    });

    // Payments made this week
    const paymentsMade = await prisma.carrierPay.aggregate({
      where: { paidAt: { gte: weekStart }, status: "PAID" },
      _sum: { netAmount: true },
      _count: true,
    });

    // Payments received this week
    const paymentsReceived = await prisma.invoice.aggregate({
      where: { paidAt: { gte: weekStart }, status: "PAID" },
      _sum: { paidAmount: true },
      _count: true,
    });

    // Open disputes
    const openDisputes = await prisma.paymentDispute.count({
      where: { status: { in: ["OPEN", "INVESTIGATING", "PROPOSED"] } },
    });

    res.json({
      period: {
        start: weekStart,
        end: now,
        type: "weekly",
      },
      current,
      previous,
      change: {
        revenue: previous.revenue > 0
          ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 10000) / 100
          : null,
        loadCount: previous.loadCount > 0
          ? Math.round(((current.loadCount - previous.loadCount) / previous.loadCount) * 10000) / 100
          : null,
        margin: previous.avgMarginPercent > 0
          ? Math.round((current.avgMarginPercent - previous.avgMarginPercent) * 100) / 100
          : null,
      },
      invoicesSent,
      paymentsMade: {
        count: paymentsMade._count,
        total: paymentsMade._sum.netAmount ?? 0,
      },
      paymentsReceived: {
        count: paymentsReceived._count,
        total: paymentsReceived._sum.paidAmount ?? 0,
      },
      openDisputes,
    });
  } catch (error: any) {
    console.error("getWeeklyReport error:", error);
    res.status(500).json({ error: "Failed to generate weekly report", details: error.message });
  }
}

export async function getMonthlyReport(req: AuthRequest, res: Response) {
  try {
    const now = new Date();
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month as string) - 1 : now.getMonth();
    const targetYear = year ? parseInt(year as string) : now.getFullYear();

    const periodStart = new Date(targetYear, targetMonth, 1);
    const periodEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    // Previous month for comparison
    const prevStart = new Date(targetYear, targetMonth - 1, 1);
    const prevEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Revenue from loads
    const [currentLoads, prevLoads] = await Promise.all([
      prisma.load.findMany({
        where: {
          status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
          deliveryDate: { gte: periodStart, lte: periodEnd },
        },
        select: { customerRate: true, carrierRate: true, grossMargin: true, marginPercent: true, distance: true, equipmentType: true },
      }),
      prisma.load.findMany({
        where: {
          status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
          deliveryDate: { gte: prevStart, lte: prevEnd },
        },
        select: { customerRate: true, carrierRate: true, grossMargin: true, marginPercent: true, distance: true, equipmentType: true },
      }),
    ]);

    function summarize(loads: typeof currentLoads) {
      const revenue = loads.reduce((s, l) => s + (l.customerRate ?? 0), 0);
      const cost = loads.reduce((s, l) => s + (l.carrierRate ?? 0), 0);
      const margin = loads.reduce((s, l) => s + (l.grossMargin ?? 0), 0);
      const margins = loads.filter((l) => l.marginPercent !== null).map((l) => l.marginPercent!);
      const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
      return { loadCount: loads.length, revenue, cost, margin, avgMarginPercent: Math.round(avgMargin * 100) / 100 };
    }

    const current = summarize(currentLoads);
    const previous = summarize(prevLoads);

    // Invoice stats
    const [invoicesCreated, invoicesPaid, invoicesOverdue] = await Promise.all([
      prisma.invoice.count({ where: { createdAt: { gte: periodStart, lte: periodEnd } } }),
      prisma.invoice.aggregate({
        where: { paidAt: { gte: periodStart, lte: periodEnd }, status: "PAID" },
        _sum: { paidAmount: true },
        _count: true,
      }),
      prisma.invoice.count({
        where: { status: { in: ["OVERDUE"] }, dueDate: { gte: periodStart, lte: periodEnd } },
      }),
    ]);

    // Carrier pay stats
    const [carrierPaysPaid, qpFees] = await Promise.all([
      prisma.carrierPay.aggregate({
        where: { paidAt: { gte: periodStart, lte: periodEnd }, status: "PAID" },
        _sum: { netAmount: true, quickPayFeeAmount: true },
        _count: true,
      }),
      prisma.factoringFund.aggregate({
        where: { createdAt: { gte: periodStart, lte: periodEnd }, transactionType: "QP_FEE_EARNED" },
        _sum: { amount: true },
      }),
    ]);

    // Equipment type breakdown
    const equipmentBreakdown: Record<string, number> = {};
    for (const load of currentLoads) {
      const eq = load.equipmentType || "Other";
      equipmentBreakdown[eq] = (equipmentBreakdown[eq] || 0) + 1;
    }

    // Disputes
    const disputesFiled = await prisma.paymentDispute.count({
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
    });
    const disputesResolved = await prisma.paymentDispute.count({
      where: { resolvedAt: { gte: periodStart, lte: periodEnd } },
    });

    res.json({
      period: {
        start: periodStart,
        end: periodEnd,
        month: targetMonth + 1,
        year: targetYear,
        type: "monthly",
      },
      current,
      previous,
      change: {
        revenuePercent: previous.revenue > 0
          ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 10000) / 100
          : null,
        loadCountPercent: previous.loadCount > 0
          ? Math.round(((current.loadCount - previous.loadCount) / previous.loadCount) * 10000) / 100
          : null,
        marginDelta: Math.round((current.avgMarginPercent - previous.avgMarginPercent) * 100) / 100,
      },
      invoices: {
        created: invoicesCreated,
        paid: invoicesPaid._count,
        paidAmount: invoicesPaid._sum.paidAmount ?? 0,
        overdue: invoicesOverdue,
      },
      carrierPay: {
        paid: carrierPaysPaid._count,
        paidAmount: carrierPaysPaid._sum.netAmount ?? 0,
        quickPayFees: carrierPaysPaid._sum.quickPayFeeAmount ?? 0,
      },
      qpFeeIncome: qpFees._sum.amount ?? 0,
      equipmentBreakdown,
      disputes: {
        filed: disputesFiled,
        resolved: disputesResolved,
      },
    });
  } catch (error: any) {
    console.error("getMonthlyReport error:", error);
    res.status(500).json({ error: "Failed to generate monthly report", details: error.message });
  }
}

// ============================================================
// 41. EXPORT
// ============================================================

export async function exportData(req: AuthRequest, res: Response) {
  try {
    const { type, dateFrom, dateTo, format } = req.body;

    if (!type) {
      res.status(400).json({ error: "type is required (invoices, payments, disputes, loads, credit)" });
      return;
    }

    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    const hasDateFilter = dateFrom || dateTo;

    let data: any[] = [];
    let columns: string[] = [];

    switch (type) {
      case "invoices": {
        data = await prisma.invoice.findMany({
          where: hasDateFilter ? { createdAt: dateFilter } : {},
          include: {
            load: {
              select: {
                referenceNumber: true,
                originCity: true,
                originState: true,
                destCity: true,
                destState: true,
                customer: { select: { name: true } },
              },
            },
            user: { select: { firstName: true, lastName: true, company: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        });
        columns = [
          "invoiceNumber", "status", "amount", "totalAmount", "dueDate",
          "sentDate", "paidAt", "paidAmount", "paymentMethod", "loadReference",
          "shipper", "route", "createdAt",
        ];
        data = data.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          amount: inv.amount,
          totalAmount: inv.totalAmount,
          dueDate: inv.dueDate,
          sentDate: inv.sentDate,
          paidAt: inv.paidAt,
          paidAmount: inv.paidAmount,
          paymentMethod: inv.paymentMethod,
          loadReference: inv.load?.referenceNumber,
          shipper: inv.load?.customer?.name ?? inv.user?.company,
          route: inv.load ? `${inv.load.originCity}, ${inv.load.originState} -> ${inv.load.destCity}, ${inv.load.destState}` : "",
          createdAt: inv.createdAt,
        }));
        break;
      }

      case "payments": {
        data = await prisma.carrierPay.findMany({
          where: hasDateFilter ? { createdAt: dateFilter } : {},
          include: {
            carrier: { select: { firstName: true, lastName: true, company: true } },
            load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        });
        columns = [
          "paymentNumber", "status", "carrierName", "grossAmount", "quickPayFee",
          "netAmount", "paymentTier", "paymentMethod", "loadReference", "route",
          "paidAt", "createdAt",
        ];
        data = data.map((cp) => ({
          paymentNumber: cp.paymentNumber,
          status: cp.status,
          carrierName: cp.carrier?.company || `${cp.carrier?.firstName} ${cp.carrier?.lastName}`,
          grossAmount: cp.grossAmount ?? cp.amount,
          quickPayFee: cp.quickPayFeeAmount,
          netAmount: cp.netAmount,
          paymentTier: cp.paymentTier,
          paymentMethod: cp.paymentMethod,
          loadReference: cp.load?.referenceNumber,
          route: cp.load ? `${cp.load.originCity}, ${cp.load.originState} -> ${cp.load.destCity}, ${cp.load.destState}` : "",
          paidAt: cp.paidAt,
          createdAt: cp.createdAt,
        }));
        break;
      }

      case "disputes": {
        data = await prisma.paymentDispute.findMany({
          where: hasDateFilter ? { createdAt: dateFilter } : {},
          include: {
            carrierPayment: {
              select: {
                paymentNumber: true,
                carrier: { select: { firstName: true, lastName: true, company: true } },
                load: { select: { referenceNumber: true } },
              },
            },
            filedBy: { select: { firstName: true, lastName: true } },
            resolvedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        });
        columns = [
          "disputeNumber", "status", "disputeType", "disputedAmount",
          "proposedAmount", "resolutionAmount", "carrier", "loadReference",
          "filedBy", "resolvedBy", "filedAt", "resolvedAt",
        ];
        data = data.map((d) => ({
          disputeNumber: d.disputeNumber,
          status: d.status,
          disputeType: d.disputeType,
          disputedAmount: d.disputedAmount,
          proposedAmount: d.proposedAmount,
          resolutionAmount: d.resolutionAmount,
          carrier: d.carrierPayment?.carrier?.company || `${d.carrierPayment?.carrier?.firstName} ${d.carrierPayment?.carrier?.lastName}`,
          loadReference: d.carrierPayment?.load?.referenceNumber,
          filedBy: d.filedBy ? `${d.filedBy.firstName} ${d.filedBy.lastName}` : "",
          resolvedBy: d.resolvedBy ? `${d.resolvedBy.firstName} ${d.resolvedBy.lastName}` : "",
          filedAt: d.filedAt,
          resolvedAt: d.resolvedAt,
        }));
        break;
      }

      case "loads": {
        data = await prisma.load.findMany({
          where: {
            status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
            ...(hasDateFilter ? { deliveryDate: dateFilter } : {}),
          },
          select: {
            referenceNumber: true,
            loadNumber: true,
            originCity: true,
            originState: true,
            destCity: true,
            destState: true,
            distance: true,
            customerRate: true,
            carrierRate: true,
            grossMargin: true,
            marginPercent: true,
            equipmentType: true,
            deliveryDate: true,
            customer: { select: { name: true } },
            carrier: { select: { firstName: true, lastName: true, company: true } },
          },
          orderBy: { deliveryDate: "desc" },
          take: 5000,
        });
        columns = [
          "referenceNumber", "loadNumber", "origin", "destination", "distance",
          "customerRate", "carrierRate", "grossMargin", "marginPercent",
          "equipmentType", "shipper", "carrier", "deliveryDate",
        ];
        data = data.map((l) => ({
          referenceNumber: l.referenceNumber,
          loadNumber: l.loadNumber,
          origin: `${l.originCity}, ${l.originState}`,
          destination: `${l.destCity}, ${l.destState}`,
          distance: l.distance,
          customerRate: l.customerRate,
          carrierRate: l.carrierRate,
          grossMargin: l.grossMargin,
          marginPercent: l.marginPercent,
          equipmentType: l.equipmentType,
          shipper: l.customer?.name,
          carrier: l.carrier?.company || (l.carrier ? `${l.carrier.firstName} ${l.carrier.lastName}` : ""),
          deliveryDate: l.deliveryDate,
        }));
        break;
      }

      case "credit": {
        const credits = await prisma.shipperCredit.findMany({
          include: {
            customer: { select: { name: true, contactName: true, email: true, phone: true } },
          },
          orderBy: { updatedAt: "desc" },
        });
        columns = [
          "shipper", "creditGrade", "creditLimit", "currentUtilized",
          "availableCredit", "utilizationPercent", "paymentTerms",
          "avgDaysToPay", "totalInvoices", "onTimePayments", "latePayments",
          "autoBlocked",
        ];
        data = credits.map((c) => ({
          shipper: c.customer.name,
          creditGrade: c.creditGrade,
          creditLimit: c.creditLimit,
          currentUtilized: c.currentUtilized,
          availableCredit: Math.max(0, c.creditLimit - c.currentUtilized),
          utilizationPercent: c.creditLimit > 0
            ? Math.round((c.currentUtilized / c.creditLimit) * 10000) / 100
            : 0,
          paymentTerms: c.paymentTerms,
          avgDaysToPay: c.avgDaysToPay,
          totalInvoices: c.totalInvoices,
          onTimePayments: c.onTimePayments,
          latePayments: c.latePayments,
          autoBlocked: c.autoBlocked,
        }));
        break;
      }

      default:
        res.status(400).json({ error: `Unknown export type: ${type}. Use: invoices, payments, disputes, loads, credit` });
        return;
    }

    // If CSV format requested, convert to CSV
    if (format === "csv" && data.length > 0) {
      const header = columns.join(",");
      const rows = data.map((row) =>
        columns.map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(",")
      );
      const csv = [header, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${type}-export-${new Date().toISOString().slice(0, 10)}.csv`);
      res.send(csv);
      return;
    }

    // Default: JSON
    res.json({
      type,
      columns,
      data,
      count: data.length,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user!.id,
    });
  } catch (error: any) {
    console.error("exportData error:", error);
    res.status(500).json({ error: "Failed to export data", details: error.message });
  }
}
