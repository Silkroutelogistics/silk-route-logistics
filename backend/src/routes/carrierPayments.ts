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

// v3.8.ajx C5 — Tier-graduated QuickPay limits per CLAUDE.md §8.
//
// Silver: auto-approve $2,000/load · monthly limit $15K
// Gold:   auto-approve $4,000/load · monthly limit $40K
// Platinum: auto-approve $6,000/load · monthly limit $80K
//
// Pre-ajx the request-quickpay endpoint had ZERO enforcement of either
// bound. A carrier could request QP on a $50K freight settlement and the
// system would happily mark the row paymentMethod=QUICKPAY + record the
// discount with no upstream review trigger; same for cumulative month
// (carrier could rack up $200K in QP requests on a $15K-limit Silver
// account). C5 makes the monthly aggregate a hard block at request time
// (most-actionable upstream gate; AE-approval review is downstream).
//
// `auto-approve $X/load` is currently advisory — set on the row so AE
// review surfaces the over-threshold flag — but does NOT block the
// request (carrier may still request QP on a $5K Silver load; it just
// gets flagged for AE review rather than auto-approving). Hard block
// on per-load deferred until the AE approval-state-machine work lands
// (banked as v3.8.ajx C5b follow-up).
const QP_TIER_LIMITS: Record<string, { autoApprovePerLoad: number; monthlyLimit: number }> = {
  PLATINUM: { autoApprovePerLoad: 6000, monthlyLimit: 80000 },
  GOLD: { autoApprovePerLoad: 4000, monthlyLimit: 40000 },
  SILVER: { autoApprovePerLoad: 2000, monthlyLimit: 15000 },
};

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
  let tier = "SILVER";
  if (profile) {
    tier = profile.tier || "SILVER";
    if (profile.tier === "PLATINUM") feePercent = 1;
    else if (profile.tier === "GOLD") feePercent = 1.5;
    else if (profile.tier === "SILVER") feePercent = 2;
  }

  // v3.8.ajx C5 — Monthly limit hard block. Aggregate this carrier's QP
  // activity (anything with paymentMethod=QUICKPAY) created within the
  // current calendar month. If this request would push the total over
  // the tier's monthly limit, refuse with 422 + structured message so the
  // carrier portal can render "Monthly limit reached. Cycle resets [date]."
  const limits = QP_TIER_LIMITS[tier] || QP_TIER_LIMITS.SILVER;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthQpAggregate = await prisma.carrierPay.aggregate({
    where: {
      carrierId: req.user!.id,
      paymentMethod: "QUICKPAY",
      createdAt: { gte: monthStart },
    },
    _sum: { amount: true },
  });
  const usedThisMonth = monthQpAggregate._sum.amount || 0;
  if (usedThisMonth + payment.amount > limits.monthlyLimit) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    res.status(422).json({
      error: `Monthly QuickPay limit reached for ${tier} tier ($${limits.monthlyLimit.toLocaleString()}). Cycle resets ${monthEnd.toISOString().slice(0, 10)}.`,
      code: "QP_MONTHLY_LIMIT_EXCEEDED",
      tier,
      monthlyLimit: limits.monthlyLimit,
      usedThisMonth,
      requestedAmount: payment.amount,
    });
    return;
  }

  // Per-load auto-approve threshold — flag for AE review but allow the
  // request to proceed. Banked as C5b for hard-enforcement once the
  // AE-approval state machine surface stabilizes.
  const overAutoApprove = payment.amount > limits.autoApprovePerLoad;

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

  res.json({
    ...updated,
    // v3.8.ajx C5 — informational flag so the carrier portal can surface
    // "Awaiting AE review (over $X auto-approve threshold)" rather than
    // assuming the QP request was auto-approved. Hard-enforcement of the
    // per-load auto-approve threshold deferred to C5b.
    overAutoApprove,
    autoApprovePerLoad: limits.autoApprovePerLoad,
    usedThisMonthIncluding: usedThisMonth + payment.amount,
    monthlyLimit: limits.monthlyLimit,
  });
});

export default router;
