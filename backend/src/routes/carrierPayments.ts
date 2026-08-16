import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { log } from "../lib/logger";
import {
  normalizeTier,
  quickPayAutoApprovePerLoad,
  quickPayMonthlyLimit,
  quickPayFeePercent,
  standardNetDays,
} from "../lib/quickPayPricing";
// One resolver for "what part of this settlement is the carrier's own money",
// reading the APPROVED accessorial ledger — the same store the amount being
// charged comes from. Shared with the delivery path, accounting and the manual
// carrier-pay route.
import { atCostReimbursementsForLoad } from "../services/integrationService";
// v3.8.asb — the Quick Pay pilot. One resolver for "is this carrier approved",
// shared with the carrier-facing gate and the delivery pricing path.
import { isQuickPayPilotApproved } from "../controllers/carrierController";

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
            // 422s QP_NOT_ELECTED_ON_LOAD. Null until the rate confirmation is
            // issued, and zero on every load the carrier did not elect Quick Pay
            // on — which, Quick Pay being opt-in per load, is most of them.
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

// ═══════════════════════════════════════════════════════════════════════════
// v3.8.asb — THE PER-LOAD QUICK PAY SPEED
// ═══════════════════════════════════════════════════════════════════════════
//
// Joining the pilot is a yes/no, asked once at onboarding. SPEED is per load,
// because same-day costs two points more than seven-day and a carrier's need
// for cash is a per-load fact, not a permanent setting. Someone who normally
// takes seven-day may want same-day on the one load that lands before a fuel
// bill, and should not have to change an account setting to get it.
//
// WHEN IT COUNTS. The election is frozen onto the load when the rate
// confirmation is ISSUED — sent to the carrier, not merely drafted (Quick Pay
// Agreement §3 cl.3, and rateConfirmationController.sendRateConfirmation). So
// this endpoint is only useful BEFORE that moment, and it says so rather than
// accepting a change it cannot honour.
//
// SAYING NOTHING HERE COSTS THE CARRIER NOTHING. A load with no election
// recorded is paid on the carrier's free tier terms at no fee (D1). This
// endpoint is not an opt-out from a default; it is the only way Quick Pay is
// ever switched on for a load. Nothing else turns it on.
//
// It is deliberately small: two endpoints, one field, no new model. The fuller
// version is a speed control on the tender-accept screen, which belongs to the
// tender surface and is reported as a follow-up rather than built here.
//
// GET  /api/carrier-payments/loads/:loadId/quickpay-speed
// PUT  /api/carrier-payments/loads/:loadId/quickpay-speed   { speed }
//
// Mounted above the `/:id` payment routes: Express matches in declaration
// order and "loads" would otherwise be read as a payment id.

type QpSpeed = "STANDARD" | "SEVEN_DAY" | "SAME_DAY";
const QP_SPEEDS: QpSpeed[] = ["STANDARD", "SEVEN_DAY", "SAME_DAY"];

/**
 * Resolve the load, prove the calling carrier owns it, and report whether the
 * election is still open.
 *
 * A carrier may only see and set the speed on their OWN load. `carrierId` on
 * Load is a User id (it is set from the accepting carrier's user), so it is
 * compared against req.user.id, matching every other ownership check in this
 * file.
 */
async function loadForSpeedElection(loadId: string, userId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      carrierId: true,
      referenceNumber: true,
      quickPaySpeed: true,
      quickPayFeePercent: true,
      rateConfirmations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
  if (!load) return { error: 404 as const, message: "Load not found" };
  if (load.carrierId !== userId) {
    // 404, not 403. A carrier should not be able to confirm that a load id
    // exists by probing this endpoint.
    return { error: 404 as const, message: "Load not found" };
  }
  // Issued means the carrier has been told, in writing, what the fee is. After
  // that the number is frozen and this endpoint stops being the right way to
  // change it.
  //
  // The test is the FROZEN FEE, not the rate confirmation's status, because the
  // frozen fee is the thing every charge path actually reads. Testing status
  // alone left a live exploit: flipping the speed after issue moved
  // Load.quickPaySpeed while Load.quickPayFeePercent stayed put, and the
  // delivery path reads the speed for the PAY DATE and the frozen percentage
  // for the FEE — so same-day money at the 7-day price. Now a change is refused
  // the instant there is a frozen number it could contradict.
  //
  // A frozen STANDARD election is 0, not null, and `!== null` locks it too:
  // once a carrier has been told in writing that a load costs them nothing,
  // that is settled in their favour and does not move here either.
  //
  // Rate confirmation status is kept as a second, belt-and-braces lock for a
  // load issued before the freeze moved to the send path, whose column may be
  // null even though the document went out.
  const rcStatus = load.rateConfirmations[0]?.status ?? null;
  const frozen = load.quickPayFeePercent !== null && load.quickPayFeePercent !== undefined;
  const issued = frozen || (rcStatus !== null && rcStatus !== "DRAFT");
  return { error: null, load, rcStatus, issued, frozen };
}

router.get("/loads/:loadId/quickpay-speed", async (req: AuthRequest, res: Response) => {
  const result = await loadForSpeedElection(req.params.loadId, req.user!.id);
  if (result.error) {
    res.status(result.error).json({ error: result.message });
    return;
  }

  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true, tier: true, quickPayEnabled: true },
  });
  const tier = normalizeTier(profile?.tier);

  const pilotApproved = profile ? await isQuickPayPilotApproved(profile.id) : false;
  const qpSigned = profile
    ? !!(await prisma.carrierAgreement.findFirst({
        where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
        select: { id: true },
      }))
    : false;
  const eligible = pilotApproved && qpSigned && profile?.quickPayEnabled === true;

  res.json({
    loadId: result.load.id,
    referenceNumber: result.load.referenceNumber,
    // What is recorded now. null means nothing chosen, which prices as standard
    // terms at no fee when the rate confirmation is issued (D1). The portal
    // should show that as the current state, not as an empty field.
    speed: result.load.quickPaySpeed,
    // Only ever non-null once the rate confirmation has been ISSUED. Before
    // that there is no fee, because nothing has been recorded on this load.
    feePercent: result.load.quickPayFeePercent,
    // Can it still be changed here?
    locked: result.issued,
    frozen: result.frozen,
    rateConfirmationStatus: result.rcStatus,
    // Whether Quick Pay is available to this carrier at all, and what each
    // speed costs THEM. §8: same-day is the seven-day fee plus two points.
    eligible,
    tier,
    options: eligible
      ? [
          { speed: "STANDARD", feePercent: 0, label: `Standard — free, Net-${standardNetDays(tier)}` },
          { speed: "SEVEN_DAY", feePercent: quickPayFeePercent(tier), label: `7-day Quick Pay — ${quickPayFeePercent(tier)}%` },
          { speed: "SAME_DAY", feePercent: quickPayFeePercent(tier, true), label: `Same-day Quick Pay — ${quickPayFeePercent(tier, true)}%` },
        ]
      : [],
  });
});

router.put("/loads/:loadId/quickpay-speed", async (req: AuthRequest, res: Response) => {
  const speed = String((req.body as { speed?: string })?.speed ?? "").toUpperCase() as QpSpeed;
  if (!QP_SPEEDS.includes(speed)) {
    res.status(400).json({
      error: `Choose one of ${QP_SPEEDS.join(", ")}.`,
      code: "QP_SPEED_INVALID",
    });
    return;
  }

  const result = await loadForSpeedElection(req.params.loadId, req.user!.id);
  if (result.error) {
    res.status(result.error).json({ error: result.message });
    return;
  }
  // REFUSED, never silently ignored. Accepting the write here and letting the
  // frozen fee stand is the exploit: the delivery path takes the pay date from
  // the speed and the fee from the frozen percentage, so a post-issue flip to
  // SAME_DAY bought same-day money at the 7-day price. The two halves are set
  // together when the document is issued and neither moves alone afterwards.
  if (result.issued) {
    const frozenSpeed = result.load.quickPaySpeed;
    const frozenPct = result.load.quickPayFeePercent;
    const settled =
      frozenSpeed && frozenPct !== null && frozenPct !== undefined
        ? frozenSpeed === "STANDARD"
          ? "standard terms at no fee"
          : `${frozenSpeed === "SAME_DAY" ? "same-day" : "7-day"} Quick Pay at ${frozenPct}%`
        : "the terms printed on it";
    res.status(409).json({
      error: `The rate confirmation for load ${result.load.referenceNumber} has already been issued at ${settled}, so that is what this load pays. Call your rep if it needs to change.`,
      code: "QP_SPEED_LOCKED",
      speed: frozenSpeed,
      feePercent: frozenPct,
    });
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

  // Choosing STANDARD is always allowed. It is a carrier saying "pay me on my
  // free terms on this one", which needs no approval, no agreement and no
  // switch — and it is a real election, distinct from never having chosen, so
  // it is recorded rather than left null.
  if (speed !== "STANDARD") {
    if (!(await isQuickPayPilotApproved(profile.id))) {
      res.status(403).json({
        error:
          "Quick Pay is running as a pilot and your account is not in it. Your loads pay on your standard tier terms, at no fee.",
        code: "QP_PILOT_NOT_APPROVED",
        action: { label: "Ask about the Quick Pay pilot", href: "/carrier/dashboard/activation" },
      });
      return;
    }
    const qpSigned = await prisma.carrierAgreement.findFirst({
      where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
      select: { id: true },
    });
    if (!qpSigned) {
      res.status(403).json({
        error:
          "Read and sign the Caravan Quick Pay Agreement in your portal first, then choose a Quick Pay speed on this load.",
        code: "QP_AGREEMENT_NOT_SIGNED",
        action: { label: "Review and sign", href: "/carrier/dashboard/activation" },
      });
      return;
    }
    if (profile.quickPayEnabled !== true) {
      res.status(403).json({
        error: "Quick Pay is turned off on your account. Turn it on in Activation, then choose a speed on this load.",
        code: "QP_NOT_ENABLED",
        action: { label: "Turn on Quick Pay", href: "/carrier/dashboard/activation" },
      });
      return;
    }
  }

  await prisma.load.update({ where: { id: result.load.id }, data: { quickPaySpeed: speed } });

  const tier = normalizeTier(profile.tier);
  // What it WILL cost. Not written to the load — the fee is recorded when the
  // rate confirmation is issued and not a moment before (§3), so quoting it
  // here without writing it is the honest shape.
  const willCost = speed === "STANDARD" ? 0 : quickPayFeePercent(tier, speed === "SAME_DAY");

  log.info({ loadId: result.load.id, carrierUserId: req.user!.id, speed }, "[QuickPay] per-load speed elected");
  res.json({
    loadId: result.load.id,
    referenceNumber: result.load.referenceNumber,
    speed,
    feePercentWhenIssued: willCost,
    note:
      speed === "STANDARD"
        ? `Load ${result.load.referenceNumber} pays your free ${tier} standard terms, Net-${standardNetDays(tier)}.`
        : `Load ${result.load.referenceNumber} is set to ${speed === "SAME_DAY" ? "same-day" : "7-day"} Quick Pay at ${willCost}%. The fee is confirmed in writing on the rate confirmation.`,
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
          // v3.8.asb — the `rateConfirmations` include is gone with the
          // formData read it existed to feed. It filtered `status: "SIGNED"`
          // against documents that normally sit at SENT, so it selected nothing
          // on a live settlement and the at-cost carve-out downstream silently
          // resolved to zero. Reimbursements now come from the accessorial
          // ledger, which is also where the amount being charged comes from.
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
  // Already priced as Quick Pay. Tested on the FEE, not on the label.
  //
  // This used to test `paymentMethod === "QUICKPAY"` alone, and the path that
  // creates nearly every Quick Pay settlement — createCarrierPayOnDelivery, which
  // prices the load off the fee frozen on it at rate-confirmation time — never
  // sets paymentMethod at all. So on a delivery-priced settlement the guard could
  // not fire. It was harmless in arithmetic, because the fee below is read from
  // the frozen election rather than re-derived, so a second request recomputed the
  // same numbers. It was not harmless as a guard: it read as a protection, and
  // somebody would eventually trust it.
  //
  // quickPayFeeAmount is the money and both creators write it unconditionally
  // (0 on standard terms, the deduction on Quick Pay), so a settlement that has
  // had a fee taken out of it cannot fail to be seen. This is the same reasoning
  // the §6 monthly ceiling below already applies for the same reason. The label
  // is kept as a second test because it is still a true positive where it survives.
  const alreadyPriced = (Number(payment.quickPayFeeAmount) || 0) > 0 || payment.paymentMethod === "QUICKPAY";
  if (alreadyPriced) {
    res.status(400).json({
      error: "Quick Pay is already applied to this settlement.",
      code: "QP_ALREADY_APPLIED",
    });
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

  // v3.8.asb — the pilot. Checked FIRST, ahead of the agreement and the
  // account switch, because it is the condition that decides whether Quick Pay
  // is offered to this carrier at all, and a carrier who was never in the
  // pilot should be told that rather than be sent to sign an agreement that
  // will not help them.
  //
  // Read from the enrolment, not from quickPayEnabled. The invariant says
  // enabled implies approved, so this is belt and braces — but this is a
  // deduction from a carrier's settlement, and a cache is not the thing to
  // stake that on.
  if (!(await isQuickPayPilotApproved(profile.id))) {
    res.status(403).json({
      error:
        "Quick Pay is running as a pilot and your account is not in it. This load pays your free standard terms, at no fee.",
      code: "QP_PILOT_NOT_APPROVED",
      action: { label: "Ask about the Quick Pay pilot", href: "/carrier/dashboard/activation" },
    });
    return;
  }

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
  //
  // The month-to-date figure counts settlements that ACTUALLY CARRY A FEE, not
  // settlements labelled QUICKPAY. It used to filter on `paymentMethod:
  // "QUICKPAY"`, and that label is written by exactly two places: this route,
  // and carrierPayController. The path that creates nearly every Quick Pay
  // settlement — integrationService.createCarrierPayOnDelivery, which prices the
  // load off the fee frozen on it at rate-confirmation time — never sets
  // paymentMethod at all. So the ceiling could not see the settlements it exists
  // to count, and a carrier could run past their monthly limit without the
  // review §6 promises ever being queued.
  //
  // Counting the fee rather than setting the label, for two reasons:
  //
  //   The label does not survive. accountingController.bulkProcessPayments
  //   writes `paymentMethod: paymentMethod ?? "ACH"` on an updateMany, so a
  //   routine payment batch overwrites QUICKPAY with ACH. Stamping the label at
  //   creation would fix this for as long as it took someone to batch a run of
  //   payments, and then it would silently under-count again — the same failure
  //   in a new place.
  //
  //   quickPayFeeAmount is the money. It is written unconditionally by both
  //   creators (0 on standard terms, the deduction on Quick Pay), so a row that
  //   had a fee taken out of it cannot fail to be counted. This is also the
  //   filter the delivery path's own §6 ceiling already uses
  //   (integrationService.ts), so the two ceilings now measure the same thing
  //   instead of disagreeing.
  //
  // VOID settlements are excluded, matching the delivery path: a voided
  // settlement is money that never went out and must not consume the ceiling.
  //
  // This row is excluded by id because it already exists — this route updates a
  // settlement rather than creating one. If delivery already priced it as Quick
  // Pay it would be inside the aggregate AND added again as `payment.amount`,
  // double-counting itself. The delivery path gets this for free by aggregating
  // before its create; here it has to be said.
  const monthQpAggregate = await prisma.carrierPay.aggregate({
    where: {
      carrierId: req.user!.id,
      id: { not: payment.id },
      quickPayFeeAmount: { gt: 0 },
      status: { notIn: ["VOID"] },
      createdAt: { gte: monthStart },
    },
    _sum: { amount: true },
  });
  const usedThisMonth = monthQpAggregate._sum.amount || 0;
  const overMonthly = usedThisMonth + payment.amount > monthlyLimit;

  // §4 — reimbursements repaid at cost against an original receipt are the
  // carrier's own money. Charging a fee on a lumper the carrier fronted skims
  // it.
  //
  // v3.8.asb — this read `load.rateConfirmations[0].formData.accessorials`,
  // which was wrong twice over. formData is the rate-confirmation PROPOSAL and
  // was retired as a money source in v3.8.asb; and the include feeding it
  // filtered `status: "SIGNED"` while rate confirmations normally sit at SENT,
  // so it usually resolved to undefined, the sum resolved to 0, and this
  // carve-out did not exist. A carrier requesting Quick Pay on the worked
  // example paid a fee on their own $150 lumper.
  //
  // It also subtracted a formData figure from `payment.amount`, which comes off
  // the ledger — one store on each side of a minus sign. Now both sides are the
  // ledger, via the one helper every charge path calls.
  const reimbursements = await atCostReimbursementsForLoad(payment.loadId);
  const feeBase = Math.max(0, Math.round((payment.amount - reimbursements) * 100) / 100);
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
