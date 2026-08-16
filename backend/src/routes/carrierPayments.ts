import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { log } from "../lib/logger";
import {
  normalizeTier,
  quickPayAutoApprovePerLoad,
  quickPayMonthlyLimit,
} from "../lib/quickPayPricing";
import { sumAtCostReimbursements } from "../services/integrationService";

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
            // Returned so the portal can HIDE the QuickPay control on a load with
            // no recorded election, rather than offering a button that always
            // 422s QP_NOT_ELECTED_ON_LOAD. Auto-generated rate confirmations
            // (autoRateConfirmationService, the tender-accept path) currently
            // write no election, so that is most loads today.
            quickPayFeePercent: true,
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
//
// Every gate below maps to a clause. A carrier could previously be charged a
// Quick Pay fee having never signed the Quick Pay Agreement: this handler
// checked ownership, status and the monthly total, and nothing else. It read
// neither the signed agreement, nor the account election, nor the fee the rate
// confirmation actually froze on the load — it re-derived a fee from the tier
// ladder and deducted it.
//
//   §3  the election is per load, recorded on the rate confirmation
//   §4  the fee is not charged on at-cost reimbursements
//   §6  auto-approve ceilings by tier: over the per-load ceiling goes to
//       review, over the monthly ceiling is refused
//
// Every failure mode below leaves the carrier on free standard tier terms at no
// fee, which pays them more, not less.
router.post("/:id/request-quickpay", async (req: AuthRequest, res: Response) => {
  const payment = await prisma.carrierPay.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        select: {
          id: true,
          referenceNumber: true,
          quickPayFeePercent: true,
          rateConfirmations: {
            where: { status: "SIGNED" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { formData: true },
          },
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
  if (payment.status !== "PENDING" && payment.status !== "PREPARED") {
    res.status(400).json({ error: "QuickPay only available for pending payments" });
    return;
  }
  if (payment.paymentMethod === "QUICKPAY") {
    res.status(400).json({ error: "QuickPay already requested" });
    return;
  }

  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true, tier: true, quickPayEnabled: true },
  });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  const tier = normalizeTier(profile.tier);

  // §4 — never deduct a fee under an unsigned instrument.
  const qpAgreementSigned = !!(await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
    select: { id: true },
  }));
  if (!qpAgreementSigned) {
    res.status(403).json({
      error:
        "Quick Pay needs the Caravan Quick Pay Agreement signed first. Open Activation in your portal to read and sign it, then request Quick Pay again. This load keeps your free standard terms until then.",
      code: "QP_AGREEMENT_NOT_SIGNED",
      action: { label: "Review and sign", href: "/carrier/dashboard/activation" },
    });
    return;
  }

  // §3 — enabling Quick Pay makes the option available; disabling it withdraws
  // the election on every load not yet funded.
  if (profile.quickPayEnabled !== true) {
    res.status(403).json({
      error:
        "Quick Pay is turned off on your account. Turn it on in Activation, then request Quick Pay again. This load keeps your free standard terms until then.",
      code: "QP_NOT_ENABLED",
      action: { label: "Turn on Quick Pay", href: "/carrier/dashboard/activation" },
    });
    return;
  }

  // §3 — the fee is "recorded on that load when Broker issues the rate
  // confirmation for it", and "a load is priced by the Quick Pay speed recorded
  // on that load when its rate confirmation was issued, and by nothing else".
  // So the fee is read from the load, never re-derived from the tier ladder
  // here. Re-deriving it is how this endpoint used to charge a carrier a fee
  // that was recorded on nothing.
  //
  // This is also the third condition of the §3 gate — a Quick Pay fee has to be
  // recorded on the load before any fee is deducted.
  const electedPct = payment.load?.quickPayFeePercent;
  if (typeof electedPct !== "number" || electedPct <= 0) {
    res.status(422).json({
      error:
        `No Quick Pay fee is recorded on load ${payment.load?.referenceNumber || "this load"}, so it pays your ${tier} standard terms at no fee. The speed and fee are recorded when the rate confirmation is issued, before the load is hauled. Ask your rep which speed is recorded on a load and they will tell you.`,
      code: "QP_NOT_ELECTED_ON_LOAD",
      tier,
    });
    return;
  }
  const feePercent = electedPct;

  // §6 — rolling calendar-month ceiling. Measured on gross carrier pay, which
  // is stable regardless of the fee percentage and is the more conservative
  // bound.
  //
  // Over the ceiling is a REVIEW, not a refusal. §6 is explicit: "A request
  // above either limit is not refused. It is routed to Broker for manual
  // review, and Broker will approve or decline it and notify Carrier." This
  // route used to return 422 and stop, which is a refusal by an automatic rule
  // on a promise that said the opposite — and it disagreed with the delivery
  // path, which already queued a review on the same overage. Both ceilings now
  // behave the same way on both paths: apply the election, queue the review.
  const monthlyLimit = quickPayMonthlyLimit(tier);
  const autoApprovePerLoad = quickPayAutoApprovePerLoad(tier);
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
  const overMonthly = usedThisMonth + payment.amount > monthlyLimit;

  // §4 — reimbursements repaid at cost against an original receipt are the
  // carrier's own money. Charging a fee on a lumper the carrier fronted skims
  // it. Same carve-out the delivery pricing path applies, same helper.
  const reimbursements = sumAtCostReimbursements(
    (payment.load?.rateConfirmations?.[0]?.formData as any)?.accessorials,
  );
  const feeBase = Math.max(0, payment.amount - reimbursements);
  const discount = Math.round(feeBase * (feePercent / 100) * 100) / 100;
  const netAmount = Math.round((payment.amount - discount) * 100) / 100;

  const updated = await prisma.carrierPay.update({
    where: { id: payment.id },
    data: {
      paymentMethod: "QUICKPAY",
      quickPayDiscount: discount,
      quickPayFeePercent: feePercent,
      quickPayFeeAmount: discount,
      netAmount,
      // Sprint 33 mapping — 7-day is PRIORITY, same-day is FLASH. This endpoint
      // requests the 7-day product. paymentTier is a reporting label; it carries
      // no SLA and no money.
      paymentTier: "PRIORITY",
    },
  });

  // §6 — over either ceiling is not a refusal, it is a review. Previously the
  // per-load case returned a flag and queued nothing (so "auto-approved up to
  // $2,000" meant auto-approved at any amount) and the monthly case returned a
  // 422 (a refusal on a clause that says requests over the limit are not
  // refused). Both now queue the review §6 promises.
  const overAutoApprove = payment.amount > autoApprovePerLoad;
  const reviewReasons: string[] = [];
  if (overAutoApprove) {
    reviewReasons.push(
      `$${payment.amount.toLocaleString()} gross is over the ${tier} $${autoApprovePerLoad.toLocaleString()} per-load auto-approve ceiling`,
    );
  }
  if (overMonthly) {
    reviewReasons.push(
      `$${(usedThisMonth + payment.amount).toLocaleString()} month-to-date is over the ${tier} $${monthlyLimit.toLocaleString()} monthly auto-approve ceiling`,
    );
  }
  if (reviewReasons.length > 0) {
    await prisma.approvalQueue
      .create({
        data: {
          type: "CARRIER_PAYMENT",
          referenceId: payment.id,
          referenceType: "CarrierPay",
          amount: netAmount,
          description: `Quick Pay requested on ${payment.paymentNumber || payment.id} for load ${payment.load?.referenceNumber || payment.loadId} — ${reviewReasons.join("; ")}`,
          priority: "HIGH",
          status: "PENDING",
          requestedById: req.user!.id,
        },
      })
      .catch((e) => log.error({ err: e }, "[QuickPay] approval queue entry failed"));
  }

  res.json({
    ...updated,
    overAutoApprove,
    overMonthly,
    pendingReview: reviewReasons.length > 0,
    autoApprovePerLoad,
    usedThisMonthIncluding: usedThisMonth + payment.amount,
    monthlyLimit,
    reimbursementsExcluded: reimbursements,
  });
});

export default router;
