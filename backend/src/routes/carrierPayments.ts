import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(authorize("CARRIER"));

// GET /api/carrier-payments — Carrier's payment history
router.get("/", async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const status = req.query.status as string;

  const where: Record<string, unknown> = {
    carrierId: req.user!.id,
  };
  if (status && status !== "ALL") {
    where.status = status;
  }

  const [payments, total] = await Promise.all([
    prisma.carrierPay.findMany({
      where,
      include: {
        load: {
          select: {
            id: true, referenceNumber: true,
            originCity: true, originState: true,
            destCity: true, destState: true,
            pickupDate: true, deliveryDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.carrierPay.count({ where }),
  ]);

  res.json({ payments, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/carrier-payments/summary — Payment summary/totals
router.get("/summary", async (req: AuthRequest, res: Response) => {
  const [totalPaid, totalPending, totalScheduled, ytdEarnings, quickPaySavings] = await Promise.all([
    prisma.carrierPay.aggregate({
      where: { carrierId: req.user!.id, status: "PAID" },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { carrierId: req.user!.id, status: { in: ["PENDING", "PREPARED", "SUBMITTED", "APPROVED", "PROCESSING"] } },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { carrierId: req.user!.id, status: "SCHEDULED" },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: {
        carrierId: req.user!.id,
        status: "PAID",
        paidAt: { gte: new Date(new Date().getFullYear(), 0, 1) },
      },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: {
        carrierId: req.user!.id,
        quickPayDiscount: { not: null },
      },
      _sum: { quickPayDiscount: true },
      _count: true,
    }),
  ]);

  res.json({
    totalPaid: { amount: totalPaid._sum.netAmount || 0, count: totalPaid._count },
    totalPending: { amount: totalPending._sum.netAmount || 0, count: totalPending._count },
    totalScheduled: { amount: totalScheduled._sum.netAmount || 0, count: totalScheduled._count },
    ytdEarnings: { amount: ytdEarnings._sum.netAmount || 0, count: ytdEarnings._count },
    quickPayUsed: { discount: quickPaySavings._sum.quickPayDiscount || 0, count: quickPaySavings._count },
  });
});

// GET /api/carrier-payments/:id — Single payment detail
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const payment = await prisma.carrierPay.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        select: {
          id: true, referenceNumber: true,
          originCity: true, originState: true,
          destCity: true, destState: true,
          pickupDate: true, deliveryDate: true,
          carrierRate: true, distance: true,
        },
      },
    },
  });

  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (payment.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  res.json(payment);
});

// POST /api/carrier-payments/:id/request-quickpay — Request QuickPay on a pending payment
router.post("/:id/request-quickpay", async (req: AuthRequest, res: Response) => {
  const payment = await prisma.carrierPay.findUnique({ where: { id: req.params.id } });
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (payment.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  if (payment.status !== "PENDING" && payment.status !== "PREPARED") {
    res.status(400).json({ error: "QuickPay only available for pending payments" });
    return;
  }
  if (payment.paymentMethod === "QUICKPAY") {
    res.status(400).json({ error: "QuickPay already requested" });
    return;
  }

  // Get carrier tier to determine QuickPay fee
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  let feePercent = 3; // Default 3%
  if (profile) {
    if (profile.tier === "PLATINUM") feePercent = 1;
    else if (profile.tier === "GOLD") feePercent = 1.5;
    else if (profile.tier === "SILVER") feePercent = 2;
  }

  const discount = payment.amount * (feePercent / 100);
  const netAmount = payment.amount - discount;

  const updated = await prisma.carrierPay.update({
    where: { id: payment.id },
    data: {
      paymentMethod: "QUICKPAY",
      quickPayDiscount: discount,
      quickPayFeePercent: feePercent,
      quickPayFeeAmount: discount,
      netAmount,
      paymentTier: "FLASH",
    },
  });

  res.json(updated);
});

export default router;
