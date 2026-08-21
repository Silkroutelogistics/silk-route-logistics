import { Response } from "express";
import { prisma } from "../config/database";
import { syncCarrierSettled, syncCarrierSettledForPays } from "../lib/settlementFlags";
import { AuthRequest } from "../middleware/auth";
import { log } from "../lib/logger";
// One resolver for "is this carrier in the pilot", shared with the carrier
// gate and the delivery pricing path, so all three answer the same way.
import { isQuickPayPilotApproved } from "./carrierController";
// One resolver for "what part of this settlement is the carrier's own money",
// shared with the delivery path, the carrier portal and accounting.
import { atCostReimbursementsForLoad, syncCarrierPayAccessorials } from "../services/integrationService";
import { createCarrierPaySchema, updateCarrierPaySchema, batchCarrierPaySchema, carrierPayQuerySchema } from "../validators/carrierPay";

/**
 * Decide, server-side, what Quick Pay fee — if any — a hand-raised carrier pay
 * may carry.
 *
 * The client never supplies the number. Before this, POST /carrier-pay took
 * `quickPayDiscountPct` off the request body and applied it with no enrolment
 * lookup, no signed-agreement lookup, no `quickPayEnabled` read and no per-load
 * election read, so any percentage could be charged to any carrier. The AE
 * modal defaulted it to 2 — the GOLD rate — which on a Silver carrier is a
 * point under what they agreed to, on a fee they may never have elected.
 *
 * Four things have to be true, and they are the same four the election endpoint
 * and the delivery pricing path check:
 *   1. the carrier is APPROVED into the pilot
 *   2. the Caravan Quick Pay Agreement is signed
 *   3. quickPayEnabled is on
 *   4. THIS load carries an election — a fee frozen at rate-confirmation time,
 *      or a non-standard speed elected before it
 *
 * Any one missing and the pay is raised at the full amount on standard terms,
 * which pays the carrier MORE. That is the safe direction for every failure.
 */
async function resolveManualQuickPayFee(
  carrierUserId: string,
  loadId: string,
): Promise<{ ok: true; feePercent: number } | { ok: false; status: number; error: string; code: string }> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: carrierUserId },
    select: { id: true, tier: true, quickPayEnabled: true },
  });
  if (!profile) {
    return { ok: false, status: 404, error: "No carrier profile for that carrier id.", code: "CARRIER_PROFILE_NOT_FOUND" };
  }

  if (!(await isQuickPayPilotApproved(profile.id))) {
    return {
      ok: false,
      status: 403,
      error: "This carrier is not approved into the Quick Pay pilot, so no Quick Pay fee can be charged. Raise the pay on standard terms.",
      code: "QP_PILOT_NOT_APPROVED",
    };
  }

  const qpSigned = await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
    select: { id: true },
  });
  if (!qpSigned) {
    return {
      ok: false,
      status: 403,
      error: "This carrier has not signed the Caravan Quick Pay Agreement, so no Quick Pay fee can be charged.",
      code: "QP_AGREEMENT_NOT_SIGNED",
    };
  }

  if (profile.quickPayEnabled !== true) {
    return {
      ok: false,
      status: 403,
      error: "Quick Pay is switched off on this carrier's account, so no Quick Pay fee can be charged.",
      code: "QP_NOT_ENABLED",
    };
  }

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, carrierId: true, referenceNumber: true, quickPayFeePercent: true, quickPaySpeed: true },
  });
  if (!load) {
    return { ok: false, status: 404, error: "Load not found.", code: "LOAD_NOT_FOUND" };
  }
  if (load.carrierId !== carrierUserId) {
    return {
      ok: false,
      status: 400,
      error: `Load ${load.referenceNumber} is not assigned to that carrier.`,
      code: "LOAD_CARRIER_MISMATCH",
    };
  }

  // The frozen figure is the ONLY figure. It is what the rate confirmation told
  // the carrier this load would cost, and re-deriving it here could quietly
  // disagree with the paper they are holding.
  if (typeof load.quickPayFeePercent === "number" && load.quickPayFeePercent > 0) {
    return { ok: true, feePercent: load.quickPayFeePercent };
  }

  // v3.8.asb — a ladder fallback used to sit here: if no fee was frozen but a
  // non-STANDARD speed was elected, it priced off §8 at the carrier's tier.
  //
  // Deleted. The state it fired in is precisely the window between a carrier
  // electing Quick Pay and an AE sending the rate confirmation — so it charged a
  // percentage that had been issued on no document, to a carrier holding no
  // paper saying it, which is the shape of every Quick Pay defect this codebase
  // has had. Quick Pay Agreement §3 is unambiguous: a load is priced by the fee
  // "recorded on that load when Broker issues the rate confirmation for it, and
  // by nothing else".
  //
  // If no fee is frozen, no fee is charged. That is what the delivery path does,
  // what the carrier-portal request path does, and what accountingController
  // does. This was the last path that disagreed.

  return {
    ok: false,
    status: 422,
    error: `Load ${load.referenceNumber} has no Quick Pay election on it, so it pays standard tier terms at no fee. The carrier elects Quick Pay on a load before its rate confirmation is issued.`,
    code: "QP_NOT_ELECTED_ON_LOAD",
  };
}

export async function createCarrierPay(req: AuthRequest, res: Response) {
  const data = createCarrierPaySchema.parse(req.body);

  let quickPayDiscount: number | null = null;
  let feePercent = 0;
  let netAmount = data.amount;
  let paymentMethod = data.paymentMethod || null;

  // v3.8.asb — at-cost reimbursements are carved out of the fee base HERE too.
  //
  // This path multiplied the whole settlement: `data.amount * feePercent/100`,
  // with no reimbursement lookup anywhere in the file. On the worked example
  // that is 2% of $3,100 rather than 2% of $2,950 — $3.00 taken out of the $150
  // lumper the carrier fronted and SRL repays at cost. Charging a carrier a fee
  // on their own money is the one thing CLAUDE.md §5 is most explicit about.
  //
  // The figure comes from the same ledger helper the other two charge paths now
  // use, so a lumper is carved out identically on all three.
  let reimbursements = 0;

  if (data.isQuickPay === true) {
    const fee = await resolveManualQuickPayFee(data.carrierId, data.loadId);
    if (!fee.ok) {
      res.status(fee.status).json({ error: fee.error, code: fee.code });
      return;
    }
    feePercent = fee.feePercent;
    reimbursements = await atCostReimbursementsForLoad(data.loadId);
    const feeBase = Math.max(0, Math.round((data.amount - reimbursements) * 100) / 100);
    quickPayDiscount = Math.round(feeBase * (feePercent / 100) * 100) / 100;
    netAmount = Math.round((data.amount - quickPayDiscount) * 100) / 100;
    // Set so this row is visible to the monthly-ceiling aggregate, which keys
    // on paymentMethod.
    paymentMethod = "QUICKPAY";
    log.info(
      { carrierUserId: data.carrierId, loadId: data.loadId, feePercent, feeBase, reimbursements, quickPayDiscount },
      "[QuickPay] manual carrier pay priced from the fee frozen on the load",
    );
  }

  const carrierPay = await prisma.carrierPay.create({
    data: {
      carrierId: data.carrierId,
      loadId: data.loadId,
      amount: data.amount,
      // v3.8.asb — written so the row states its own gross and its own
      // accessorial content instead of leaving both null. The re-price path no
      // longer depends on these (it derives from `amount`, which cannot be
      // null), so this is honesty on the record rather than load-bearing
      // arithmetic: `accessorialsTotal: 0` says truthfully that this
      // hand-raised settlement recorded no accessorials, which is what makes a
      // later ledger approval a clean addition rather than a guess.
      //
      // lineHaul and fuelSurcharge stay null on purpose. This route takes one
      // `amount` and no split, so writing a split here would be inventing one.
      grossAmount: data.amount,
      accessorialsTotal: 0,
      quickPayDiscount,
      // Written alongside the deduction so the row shows the rate that produced
      // it. Without this a carrier sees money taken off and no percentage.
      quickPayFeePercent: feePercent,
      quickPayFeeAmount: quickPayDiscount ?? 0,
      netAmount,
      paymentMethod: paymentMethod as any,
      scheduledDate: data.scheduledDate,
      notes: data.notes,
    },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
    },
  });

  // v3.8.ase — fold in any accessorials that were ALREADY APPROVED when this
  // settlement was raised.
  //
  // This is the only settlement creator wired to the AE console, and it takes
  // `amount` verbatim from the request. `accessorialsTotal: 0` above is a true
  // statement about what the REQUEST contained, and the comment there is right
  // that it makes a later approval a clean addition — but it only works in that
  // direction. An accessorial approved BEFORE the AE raised the settlement had
  // already fired its sync, found no CarrierPay row, and returned early
  // (integrationService.ts:870, "Not settled yet — delivery will read the ledger
  // fresh"). For a hand-raised settlement there is no delivery path to read it
  // fresh, so the money was simply dropped and the carrier was underpaid with
  // nothing anywhere recording it.
  //
  // Running the existing sync once after the row exists closes that window using
  // the mechanism that is already tripwired, idempotent, and refuses to rewrite a
  // committed settlement. Deliberately not a second pricing implementation —
  // this session has already paid for having several of those.
  //
  // Non-blocking: the settlement is created and the AE gets their 201 either way.
  // A failure here leaves the ledger and the settlement out of step, which is
  // exactly what syncCarrierPayAccessorials detects and escalates next time it
  // runs on this load.
  void syncCarrierPayAccessorials(data.loadId).catch((err) =>
    log.error(
      { err, loadId: data.loadId, carrierPayId: carrierPay.id },
      "[CarrierPay] post-create accessorial sync failed — settlement may understate approved accessorials",
    ),
  );

  res.status(201).json(carrierPay);
}

export async function getCarrierPays(req: AuthRequest, res: Response) {
  const query = carrierPayQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (query.carrierId) where.carrierId = query.carrierId;
  if (query.status && query.status !== "ALL") where.status = query.status;

  const [carrierPays, total] = await Promise.all([
    prisma.carrierPay.findMany({
      where,
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.carrierPay.count({ where }),
  ]);

  res.json({ carrierPays, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getCarrierPayById(req: AuthRequest, res: Response) {
  const carrierPay = await prisma.carrierPay.findUnique({
    where: { id: req.params.id },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, rate: true, pickupDate: true, deliveryDate: true } },
      settlement: true,
    },
  });

  if (!carrierPay) {
    res.status(404).json({ error: "Carrier pay not found" });
    return;
  }

  res.json(carrierPay);
}

export async function updateCarrierPay(req: AuthRequest, res: Response) {
  const data = updateCarrierPaySchema.parse(req.body);
  const existing = await prisma.carrierPay.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Carrier pay not found" }); return; }

  const updateData: Record<string, unknown> = { ...data };
  if (data.status === "PAID") {
    updateData.paidAt = new Date();
  }

  const updated = await prisma.carrierPay.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
    },
  });

  // ARC 16 — recomputed rather than set, so a status moving AWAY from PAID
  // (a correction, a void reversal) puts the load back on the board instead
  // of leaving a stale true behind. §13.3 Item 221.3.
  await syncCarrierSettled(updated.loadId);

  res.json(updated);
}

export async function batchUpdateCarrierPays(req: AuthRequest, res: Response) {
  const { ids, action } = batchCarrierPaySchema.parse(req.body);

  const statusMap: Record<string, string> = {
    SCHEDULE: "SCHEDULED",
    PROCESS: "PROCESSING",
    PAY: "PAID",
    VOID: "VOID",
  };

  const newStatus = statusMap[action];
  const data: Record<string, unknown> = { status: newStatus };
  if (newStatus === "PAID") data.paidAt = new Date();

  const result = await prisma.$transaction(
    ids.map((id) => prisma.carrierPay.update({ where: { id }, data }))
  );

  // ARC 16 — same sync for the bulk path. Deduplicates by load, so paying
  // twelve pays across three loads is three flag reads, not twelve.
  await syncCarrierSettledForPays(ids);

  res.json({ updated: result.length });
}

export async function getCarrierPaySummary(req: AuthRequest, res: Response) {
  const [totalOwed, totalPaid, totalScheduled, quickPaySavings] = await Promise.all([
    prisma.carrierPay.aggregate({
      where: { status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] } },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { status: "PAID" },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { status: "SCHEDULED" },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.carrierPay.aggregate({
      where: { quickPayDiscount: { not: null } },
      _sum: { quickPayDiscount: true },
      _count: true,
    }),
  ]);

  res.json({
    totalOwed: { amount: totalOwed._sum.netAmount || 0, count: totalOwed._count },
    totalPaid: { amount: totalPaid._sum.netAmount || 0, count: totalPaid._count },
    totalScheduled: { amount: totalScheduled._sum.netAmount || 0, count: totalScheduled._count },
    quickPaySavings: { amount: quickPaySavings._sum.quickPayDiscount || 0, count: quickPaySavings._count },
  });
}
