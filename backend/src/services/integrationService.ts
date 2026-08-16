import { prisma } from "../config/database";
import { calculateOverallScore, getBonusPercentage, checkGuestPromotion } from "./tierService";
import { createCheckCallSchedule } from "./checkCallAutomation";
import { notifyMatchedCarriers } from "./carrierOutreachService";
import { checkMilestoneAdvancement, applyMilestoneRewards, getEffectiveTier, getTierConfig } from "./caravanService";
import { calcOnTimePerformance } from "../lib/onTimePerformance";
import { calcDocTimeliness } from "../lib/docTimeliness";
import { log } from "../lib/logger";
import {
  standardNetDays,
  quickPayAutoApprovePerLoad,
  quickPayMonthlyLimit,
  speedFromPaymentTier,
  type QuickPaySpeed,
} from "../lib/quickPayPricing";

/**
 * Cross-System Integration Service
 * Closes every data loop: Carrier Lifecycle, Load Lifecycle,
 * Factoring Fund, Shipper Credit, CPP Rewards.
 */

// ──────────────────────────────────────────────────
// LOOP 1 — Carrier Lifecycle: on approval → CPP scorecard + tier
// ──────────────────────────────────────────────────

export async function onCarrierApproved(carrierProfileId: string) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierProfileId },
    include: { user: { select: { id: true, firstName: true, company: true } } },
  });
  if (!profile) return;

  // v3.8.aqp — idempotency guard. This is now called from BOTH the Compass
  // auto-approve path (carrierController.verifyCarrier) AND the AE manual-approve
  // path (approvalService.approveCarrier). If the carrier was already
  // initialized (cppJoinedDate set), skip — otherwise a second call would create
  // a duplicate scorecard and reset the join date, corrupting tenure/tier math.
  if (profile.cppJoinedDate) {
    log.info(`[Integration] Carrier ${profile.user?.company || profile.id} already initialized (cppJoinedDate set) — skipping onCarrierApproved`);
    return;
  }

  // Create initial CPP scorecard with baseline scores
  await prisma.carrierScorecard.create({
    data: {
      carrierId: profile.id,
      period: "MONTHLY",
      onTimePickupPct: 100,
      onTimeDeliveryPct: 100,
      communicationScore: 80,
      claimRatio: 0,
      documentSubmissionTimeliness: 80,
      acceptanceRate: 100,
      gpsCompliancePct: 80,
      overallScore: 88,
      tierAtTime: "GUEST",
      bonusEarned: 0,
    },
  });

  // Set initial tier to GUEST (new carrier, needs 3 loads for SILVER entry tier)
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      tier: "GUEST",
      cppTier: "GUEST",
      cppJoinedDate: new Date(),
      source: "caravan",
    },
  });

  log.info(`[Integration] Carrier ${profile.user?.company || profile.id} approved → GUEST tier + initial scorecard created`);
}

// ──────────────────────────────────────────────────
// LOOP 1.5 — Load Lifecycle: on posted → AI carrier outreach
// ──────────────────────────────────────────────────

export async function onLoadPosted(loadId: string) {
  const result = await notifyMatchedCarriers(loadId);
  log.info(`[Integration] Load ${loadId} posted → ${result.notified} carrier(s) notified via outreach`);
  return result;
}

// ──────────────────────────────────────────────────
// LOOP 2 — Load Lifecycle: on dispatched → check-call schedule
// ──────────────────────────────────────────────────

export async function onLoadDispatched(loadId: string) {
  await createCheckCallSchedule(loadId);
  log.info(`[Integration] Load ${loadId} dispatched → check-call schedule created`);
}

// ──────────────────────────────────────────────────
// LOOP 2+3+4+5 — on delivered: AP, fund, credit, CPP
// ──────────────────────────────────────────────────

export async function onLoadDelivered(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      carrier: {
        select: {
          id: true, company: true, firstName: true, lastName: true,
          carrierProfile: {
            select: {
              id: true, tier: true, cppTier: true, cppTotalLoads: true, cppTotalMiles: true,
              paymentPreference: true,
              // v3.8.asa — quickPayEnabled was read by createCarrierPayOnDelivery
              // but never selected, so it was always undefined and the v3.8.aqk
              // election check could never be true. It failed safe (no fee ever
              // charged) but the account-level path was inert.
              quickPayEnabled: true,
            },
          },
        },
      },
      rateConfirmations: {
        where: { status: "SIGNED" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      customer: { select: { id: true, name: true } },
    },
  });

  if (!load) return;

  // ── AP: Create CarrierPay ──
  if (load.carrierId && load.carrier?.carrierProfile) {
    await createCarrierPayOnDelivery(load);
  }

  // ── Shipper Credit: Increase utilization ──
  if (load.customerId) {
    await updateShipperCreditOnDelivery(load);
  }

  // ── CPP: Recalculate on load completion ──
  if (load.carrier?.carrierProfile) {
    // Increment total loads + miles
    const profileId = load.carrier.carrierProfile.id;
    await prisma.carrierProfile.update({
      where: { id: profileId },
      data: {
        cppTotalLoads: { increment: 1 },
        cppTotalMiles: { increment: load.distance || 0 },
      },
    });

    // Fire-and-forget CPP recalculation
    recalculateCarrierCPP(profileId).catch((e) =>
      log.error({ err: e }, `[Integration] CPP recalc error for ${profileId}:`)
    );
  }

  // Check carrier milestone advancement
  if (load.carrier?.carrierProfile) {
    const cpId = load.carrier.carrierProfile.id;
    checkMilestoneAdvancement(cpId).then(result => {
      if (result.advanced) applyMilestoneRewards(cpId, result.newMilestone!);
    }).catch(e => log.error({ err: e }, "[Milestone]"));
  }

  log.info(`[Integration] Load ${load.referenceNumber} delivered → AP + credit + CPP + milestone triggered`);
}

// ──────────────────────────────────────────────────
// Quick Pay pricing helpers (v3.8.asa)
//
// The Caravan Quick Pay Agreement promises three things the pay path did not
// do. These helpers are what make the promises true, and they are exported so
// they can be tested without a database.
//
//   §3  The election is PER LOAD. Enabling Quick Pay on the account makes the
//       option available; it does not apply Quick Pay to every load. The
//       elected fee is frozen on the Load row when the rate confirmation is
//       issued (Load.quickPayFeePercent), so toggling the account flag later
//       cannot re-price a load that has already been hauled.
//   §4  SAME-DAY Quick Pay exists at every tier: the 7-day tier fee plus a
//       universal 2% premium (Silver 5%, Gold 4%, Platinum 3%).
//   §4  Reimbursements repaid AT COST against an original receipt — lumper
//       fees above all — are not subject to the Quick Pay fee.
// ──────────────────────────────────────────────────

// Defined in lib/quickPayPricing, the one authoritative Quick Pay module.
// Re-exported here so existing importers keep working.
export type { QuickPaySpeed };

/**
 * Resolves the elected speed from the fee percent recorded on the load.
 *
 * The rate confirmation is the per-load document the carrier accepts, and the
 * fee percent printed on it is the elected price. We compare it against the
 * carrier's own tier ladder rather than trusting Load.carrierPaymentTier, which
 * is written from two different sources with two different meanings (the RC
 * finalize path writes the CPP tier string into a PaymentTier enum column) and
 * so cannot be relied on.
 *
 * An AE override to some rate that is on neither rung is still Quick Pay, and
 * is treated as the 7-day product — the default speed, and the slower of the
 * two, so an ambiguous election never shortens SRL's own obligation.
 */
export function resolveQuickPaySpeed(
  electedPct: number | null | undefined,
  tier: { quickPayFee7Day: number; quickPayFeeSameDay: number },
): QuickPaySpeed {
  if (electedPct === null || electedPct === undefined || electedPct <= 0) return "STANDARD";
  const sameDayPct = tier.quickPayFeeSameDay * 100;
  return Math.abs(electedPct - sameDayPct) < 0.01 ? "QP_SAMEDAY" : "QP_7DAY";
}

/**
 * True when an accessorial line is money the carrier fronted and SRL repays at
 * cost, rather than money the carrier earned.
 *
 * Lumper is the ratified case (CLAUDE.md §5: carrier fronts, reimbursed on the
 * original receipt, at cost). Detention, layover and TONU are earnings and are
 * correctly inside the fee base. The match is deliberately narrow: anything not
 * recognised as a reimbursement stays in the base, so a mislabelled line can
 * only ever cost SRL margin, never skim a carrier's own money.
 */
export function isAtCostReimbursement(line: { type?: string | null; description?: string | null }): boolean {
  const text = `${line?.type ?? ""} ${line?.description ?? ""}`.toLowerCase();
  return /\blumper\b|\breimburse/.test(text);
}

/** Sum of at-cost reimbursement lines. Paid in full, excluded from the fee base. */
export function sumAtCostReimbursements(
  lines: Array<{ type?: string | null; description?: string | null; amount?: number | null }> | null | undefined,
): number {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((sum, l) => (isAtCostReimbursement(l) ? sum + (Number(l?.amount) || 0) : sum), 0);
}

// Published business hours, CLAUDE.md §6 — Mon-Fri, 7:00 AM to 7:00 PM Eastern.
const BUSINESS_TZ = "America/New_York";
const BUSINESS_OPEN_HOUR = 7;
const BUSINESS_CLOSE_HOUR = 19;

/** Eastern-time calendar parts for an instant. */
function easternParts(d: Date): { year: number; month: number; day: number; hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24, // "24" is midnight in some ICU builds
    dow: dowMap[get("weekday")] ?? 0,
  };
}

/** The instant corresponding to a given Eastern wall-clock time. */
function easternWallClockToInstant(year: number, month: number, day: number, hour: number): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour);
  const probe = new Date(asIfUtc);
  const inZone = new Date(probe.toLocaleString("en-US", { timeZone: BUSINESS_TZ }));
  const inUtc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asIfUtc + (inUtc.getTime() - inZone.getTime()));
}

/**
 * Quick Pay Agreement §5: same-day Quick Pay is paid on the same business day
 * when complete documentation arrives during published business hours, and on
 * the next business day when it arrives outside them.
 */
export function sameDayQuickPayDueDate(receivedAt: Date): Date {
  const et = easternParts(receivedAt);
  const isWeekday = et.dow >= 1 && et.dow <= 5;
  if (isWeekday && et.hour >= BUSINESS_OPEN_HOUR && et.hour < BUSINESS_CLOSE_HOUR) return receivedAt;

  // Before open on a weekday: today at open. Otherwise: the next weekday at open.
  let cursor = new Date(receivedAt);
  if (!(isWeekday && et.hour < BUSINESS_OPEN_HOUR)) {
    do {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    } while (![1, 2, 3, 4, 5].includes(easternParts(cursor).dow));
  }
  const next = easternParts(cursor);
  return easternWallClockToInstant(next.year, next.month, next.day, BUSINESS_OPEN_HOUR);
}

/**
 * When Broker received complete documentation for a load, or null if it has
 * not arrived yet.
 *
 * Quick Pay Agreement §5 and Broker-Carrier Agreement §5 both date payment
 * timing from "receipt of complete and accurate documentation", never from
 * delivery, and §5 is explicit that "if documentation is incomplete or
 * inaccurate, the timing clock has not started".
 *
 * POD presence is the machine-checkable proxy for that documentation set. It is
 * the one required item the platform reliably records with a timestamp, and it
 * is the item a carrier cannot deliver without. If BOL and lumper receipts
 * later get their own verified state, add them to this query and every timing
 * path inherits it, because this is the only place the trigger is decided.
 */
export async function documentationReceivedAt(loadId: string): Promise<Date | null> {
  const pod = await prisma.document.findFirst({
    where: { loadId, docType: "POD" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return pod?.createdAt ?? null;
}

/**
 * Due date for a settlement, measured from receipt of complete documentation.
 *
 * Same-day resolves through the published-business-hours rule; 7-day Quick Pay
 * is seven days; standard is the carrier's free tier net terms (§3).
 */
export function quickPayDueDate(speed: QuickPaySpeed, tier: string | null | undefined, receivedAt: Date): Date {
  if (speed === "QP_SAMEDAY") return sameDayQuickPayDueDate(receivedAt);
  const days = speed === "QP_7DAY" ? 7 : standardNetDays(tier);
  return new Date(receivedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

// ── Create Carrier Pay entry on delivery ──
async function createCarrierPayOnDelivery(load: any) {
  // Check for duplicate
  const existingPay = await prisma.carrierPay.findFirst({ where: { loadId: load.id } });
  if (existingPay) {
    log.info(`[Integration] CarrierPay already exists for load ${load.id}`);
    return;
  }

  const rc = load.rateConfirmations?.[0];
  const profile = load.carrier.carrierProfile;

  const lineHaul = load.carrierRate || load.rate || 0;
  const fuelSurcharge = rc?.fuelSurcharge || load.fuelSurcharge || 0;
  const accessorials = rc?.accessorialTotal || 0;
  const grossAmount = lineHaul + fuelSurcharge + accessorials;

  // v3.8.aqk GO-LIVE BLOCKER FIX — Quick Pay is OPT-IN (CLAUDE.md §8).
  // This previously mapped SILVER -> "PRIORITY" -> a 2% fee and a 2-day due
  // date for EVERY carrier, so a carrier who never elected Quick Pay (and never
  // signed the QP Agreement) had 2% skimmed off their first settlement and lost
  // their free Net-30. Standard pay by tier is FREE per §8.
  //
  // v3.8.asa — the election is now PER LOAD, which is what the Quick Pay
  // Agreement §3 actually promises. aqk read the ACCOUNT boolean at delivery,
  // so flipping it re-priced loads that had already been hauled, in both
  // directions. The elected fee is frozen on the Load when the rate
  // confirmation is issued, and that is the number we charge.
  //
  // Three conditions, all required, each mapping to a clause:
  //   1. a positive elected fee on this load               (§3 per-load)
  //   2. a signed Caravan Quick Pay Agreement              (never deduct a fee
  //                                                         under an unsigned
  //                                                         instrument)
  //   3. Quick Pay still enabled on the account            (§3 withdrawal on any
  //                                                         load not yet funded)
  // Any one missing pays standard tier terms at no fee. Every failure mode
  // therefore pays the carrier MORE, not less.
  const tierKey = getEffectiveTier({ tier: profile.tier });
  const tierConfig = getTierConfig(tierKey);
  const cppTier = profile.tier || "SILVER";

  const electedPct: number | null =
    typeof load.quickPayFeePercent === "number"
      ? load.quickPayFeePercent
      : typeof rc?.formData?.quickPayFeePercent === "number"
        ? rc.formData.quickPayFeePercent
        : null;

  const qpAgreementSigned = !!(await prisma.carrierAgreement.findFirst({
    where: { carrierId: profile.id, status: "SIGNED", templateName: "quick-pay" },
    select: { id: true },
  }));

  const speed: QuickPaySpeed =
    qpAgreementSigned && profile.quickPayEnabled === true
      ? resolveQuickPaySpeed(electedPct, tierConfig)
      : "STANDARD";

  // §4 — the fee is calculated on line haul, fuel surcharge and approved
  // accessorials, but NOT on reimbursements repaid at cost. A carrier who
  // fronts $150 of lumper is repaid $150; skimming it would charge them a fee
  // on their own money.
  const reimbursements = sumAtCostReimbursements(rc?.formData?.accessorials);
  const feeBase = Math.max(0, grossAmount - reimbursements);

  const paymentTier = speed === "QP_SAMEDAY" ? "FLASH" : speed === "QP_7DAY" ? "PRIORITY" : "STANDARD";
  const quickPayFeePercent = speed === "STANDARD" ? 0 : (electedPct as number);
  const quickPayFeeAmount = Math.round(feeBase * (quickPayFeePercent / 100) * 100) / 100;
  const netAmount = Math.round((grossAmount - quickPayFeeAmount) * 100) / 100;

  // Generate payment number
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await prisma.carrierPay.count({
    where: { paymentNumber: { startsWith: `CP-${todayStr}` } },
  });
  const paymentNumber = `CP-${todayStr}-${String(existingCount + 1).padStart(4, "0")}`;

  // Due date per §8: elected Quick Pay pays at 7 days, same-day pays on the
  // business-hours rule, and otherwise the carrier keeps their tier's FREE
  // standard net terms (Silver Net-30, Gold Net-21, Platinum Net-14).
  //
  // The clock runs from receipt of complete documentation, NOT from delivery.
  // This path fires on delivery, and it used to stamp receivedAt = now, which
  // started every carrier's clock before their POD existed — a comment here even
  // claimed "delivery with a POD on file is the trigger this path fires on",
  // which was untrue of this function; POD handling is onPODUploaded. That made
  // the settlement look due before §5 says the clock had started.
  //
  // If documentation has not arrived, the clock has not started and dueDate
  // stays null. onPODUploaded stamps it the moment the deficiency is cured,
  // which is what §5 promises.
  const receivedAt = await documentationReceivedAt(load.id);
  const dueDate = receivedAt ? quickPayDueDate(speed, cppTier, receivedAt) : null;

  const payment = await prisma.carrierPay.create({
    data: {
      paymentNumber,
      carrierId: load.carrierId,
      loadId: load.id,
      rateConfirmationId: rc?.id || null,
      paymentTier: paymentTier as any,
      lineHaul,
      fuelSurcharge,
      accessorialsTotal: accessorials,
      amount: grossAmount,
      grossAmount,
      quickPayFeePercent,
      quickPayFeeAmount,
      quickPayDiscount: quickPayFeeAmount,
      netAmount,
      status: "PREPARED",
      dueDate,
      preparedAt: new Date(),
      // Quick Pay Agreement §7 — the deduction has to be verifiable on its
      // face. The columns above carry gross / fee % / fee $ / net; the note
      // records the speed elected and any at-cost reimbursement excluded from
      // the fee base, so a carrier querying a settlement gets the whole answer.
      notes:
        `Auto-generated on delivery of load ${load.referenceNumber}` +
        (speed === "STANDARD"
          ? ` · Standard ${standardNetDays(cppTier)}-day tier terms, no Quick Pay fee`
          : ` · ${speed === "QP_SAMEDAY" ? "Same-day" : "7-day"} Quick Pay elected at ${quickPayFeePercent}%`) +
        (speed !== "STANDARD" && reimbursements > 0
          ? ` · $${reimbursements.toFixed(2)} at-cost reimbursement paid in full and excluded from the fee base`
          : "") +
        (receivedAt
          ? ` · Payment clock started on receipt of documentation ${receivedAt.toISOString().slice(0, 10)}`
          : ` · Payment clock starts on receipt of complete documentation (POD outstanding)`),
    },
  });

  log.info(
    { loadId: load.id, tier: tierKey, speed, electedPct, reimbursements, feeBase, quickPayFeeAmount, netAmount, dueDate },
    `[Integration] CarrierPay ${paymentNumber} priced — ${speed}`,
  );

  // Approval review.
  //
  // Quick Pay Agreement §6 sets auto-approve ceilings BY TIER: Silver $2,000
  // per load and $15,000 per month, Gold $4,000 and $40,000, Platinum $6,000
  // and $80,000. This path used a flat $5,000, so a $4,000 Silver Quick Pay
  // load auto-approved unreviewed against a $2,000 ceiling the carrier had just
  // signed. Over a ceiling is a review, never a refusal — §6 says "auto-approved
  // up to", and refusing here would deny a carrier something the instrument
  // grants.
  //
  // The tier ceilings govern Quick Pay funding. A standard-terms settlement is
  // not a Quick Pay decision, so it keeps the generic large-payment review.
  let reviewReason: string | null = null;
  if (speed === "STANDARD") {
    if (netAmount >= 5000) {
      reviewReason = `$${netAmount.toLocaleString()} standard settlement`;
    }
  } else {
    const perLoadCeiling = quickPayAutoApprovePerLoad(cppTier);
    const monthCeiling = quickPayMonthlyLimit(cppTier);
    if (grossAmount > perLoadCeiling) {
      reviewReason = `$${grossAmount.toLocaleString()} gross is over the ${cppTier} $${perLoadCeiling.toLocaleString()} per-load Quick Pay auto-approve ceiling`;
    } else {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthQp = await prisma.carrierPay.aggregate({
        where: {
          carrierId: load.carrierId,
          quickPayFeeAmount: { gt: 0 },
          createdAt: { gte: monthStart },
          status: { notIn: ["VOID"] },
        },
        _sum: { amount: true },
      });
      const usedThisMonth = monthQp._sum.amount || 0;
      if (usedThisMonth + grossAmount > monthCeiling) {
        reviewReason = `$${(usedThisMonth + grossAmount).toLocaleString()} month-to-date is over the ${cppTier} $${monthCeiling.toLocaleString()} monthly Quick Pay auto-approve ceiling`;
      }
    }
  }

  if (reviewReason) {
    await prisma.approvalQueue.create({
      data: {
        type: "CARRIER_PAYMENT",
        referenceId: payment.id,
        referenceType: "CarrierPay",
        amount: netAmount,
        description: `Auto-generated carrier payment ${paymentNumber} for load ${load.referenceNumber} — ${reviewReason}`,
        priority: netAmount >= 10000 ? "HIGH" : "MEDIUM",
        status: "PENDING",
        requestedById: load.carrierId,
      },
    });
    log.info(`[Integration] Approval queue entry created for ${paymentNumber} — ${reviewReason}`);
  }

  // Record QP fee in factoring fund (if any)
  if (quickPayFeeAmount > 0) {
    const latestFund = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true },
    });
    const currentBalance = latestFund?.runningBalance ?? 0;

    await prisma.factoringFund.create({
      data: {
        transactionType: "QP_FEE_EARNED",
        amount: quickPayFeeAmount,
        runningBalance: currentBalance + quickPayFeeAmount,
        referenceType: "CarrierPay",
        referenceId: payment.id,
        description: `Quick-pay fee (${quickPayFeePercent}%) on ${paymentNumber}`,
      },
    });
  }

  log.info(`[Integration] CarrierPay ${paymentNumber} created: gross=$${grossAmount}, net=$${netAmount}, tier=${paymentTier}`);
}

// ── Update Shipper Credit utilization on delivery ──
async function updateShipperCreditOnDelivery(load: any) {
  const credit = await prisma.shipperCredit.findUnique({
    where: { customerId: load.customerId },
  });
  if (!credit) return;

  const invoiceAmount = load.customerRate || load.rate || 0;

  await prisma.shipperCredit.update({
    where: { id: credit.id },
    data: {
      currentUtilized: { increment: invoiceAmount },
      totalInvoices: { increment: 1 },
    },
  });

  // Check utilization thresholds
  const newUtilized = credit.currentUtilized + invoiceAmount;
  const utilizationPct = credit.creditLimit > 0 ? (newUtilized / credit.creditLimit) * 100 : 0;

  if (utilizationPct >= 100 && !credit.autoBlocked) {
    // Auto-block at limit
    await prisma.shipperCredit.update({
      where: { id: credit.id },
      data: {
        autoBlocked: true,
        blockedReason: `Credit limit reached: $${newUtilized.toLocaleString()} / $${credit.creditLimit.toLocaleString()} (${utilizationPct.toFixed(1)}%)`,
        blockedAt: new Date(),
      },
    });
    log.info(`[Integration] Shipper credit AUTO-BLOCKED for customer ${load.customerId} — utilization ${utilizationPct.toFixed(1)}%`);
  } else if (utilizationPct >= 80) {
    log.info(`[Integration] Shipper credit WARNING: customer ${load.customerId} at ${utilizationPct.toFixed(1)}% utilization`);
  }
}

// ──────────────────────────────────────────────────
// LOOP 3 — Factoring Fund: credit on invoice paid
// ──────────────────────────────────────────────────

export async function onInvoicePaid(invoiceId: string, paidAmount: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      load: { select: { id: true, referenceNumber: true, customerId: true, carrierId: true } },
    },
  });
  if (!invoice) return;

  // Credit factoring fund — shipper payment coming in
  const latestFund = await prisma.factoringFund.findFirst({
    orderBy: { createdAt: "desc" },
    select: { runningBalance: true },
  });
  const currentBalance = latestFund?.runningBalance ?? 0;

  await prisma.factoringFund.create({
    data: {
      transactionType: "SHIPPER_PAYMENT_IN",
      amount: paidAmount,
      runningBalance: currentBalance + paidAmount,
      referenceType: "Invoice",
      referenceId: invoice.id,
      description: `Shipper payment received for invoice ${invoice.invoiceNumber}`,
    },
  });

  // Release shipper credit utilization
  if (invoice.load?.customerId) {
    const credit = await prisma.shipperCredit.findUnique({
      where: { customerId: invoice.load.customerId },
    });
    if (credit) {
      const newUtilized = Math.max(0, credit.currentUtilized - paidAmount);
      const updateData: Record<string, any> = {
        currentUtilized: newUtilized,
        onTimePayments: { increment: 1 },
      };

      // Check if payment is on time
      if (invoice.dueDate && new Date() > invoice.dueDate) {
        updateData.latePayments = { increment: 1 };
        delete updateData.onTimePayments;
      }

      // Unblock if was blocked and now under limit
      if (credit.autoBlocked && newUtilized < credit.creditLimit) {
        updateData.autoBlocked = false;
        updateData.blockedReason = null;
        updateData.blockedAt = null;
        log.info(`[Integration] Shipper credit UNBLOCKED for customer ${invoice.load.customerId}`);
      }

      // Update avg days to pay
      const daysToPay = invoice.dueDate
        ? Math.max(0, Math.floor((Date.now() - invoice.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
        : 30;
      const totalPayments = credit.onTimePayments + credit.latePayments + 1;
      updateData.avgDaysToPay = Math.round(((credit.avgDaysToPay * (totalPayments - 1)) + daysToPay) / totalPayments * 100) / 100;

      await prisma.shipperCredit.update({
        where: { id: credit.id },
        data: updateData,
      });
    }
  }

  // Release factoring reserves for the related carrier payment (if carrier was already paid)
  if (invoice.load) {
    const carrierPay = await prisma.carrierPay.findFirst({
      where: { loadId: invoice.load.id, status: "PAID" },
    });
    if (carrierPay && carrierPay.quickPayFeeAmount === 0 && (carrierPay.grossAmount ?? 0) > 0) {
      // Check if reserve exists and hasn't been released yet
      const existingRelease = await prisma.factoringFund.findFirst({
        where: { referenceId: carrierPay.id, transactionType: "RESERVE_RELEASE" },
      });
      if (!existingRelease) {
        const FACTORING_RESERVE_PCT = 2;
        const reserveRelease = Math.round((carrierPay.grossAmount ?? 0) * (FACTORING_RESERVE_PCT / 100) * 100) / 100;

        const latestBalance = await prisma.factoringFund.findFirst({
          orderBy: { createdAt: "desc" },
          select: { runningBalance: true },
        });
        const balance = (latestBalance?.runningBalance ?? 0) + reserveRelease;

        await prisma.factoringFund.create({
          data: {
            transactionType: "RESERVE_RELEASE",
            amount: reserveRelease,
            runningBalance: balance,
            referenceType: "CarrierPay",
            referenceId: carrierPay.id,
            description: `Factoring reserve released — shipper paid invoice ${invoice.invoiceNumber}`,
          },
        });
        log.info(`[Integration] Factoring reserve $${reserveRelease} released for carrier pay ${carrierPay.paymentNumber}`);
      }
    }
  }

  log.info(`[Integration] Invoice ${invoice.invoiceNumber} paid → fund credited $${paidAmount}, shipper credit released`);
}

// ──────────────────────────────────────────────────
// POD Upload → advance load to POD_RECEIVED + invoice to INVOICED
// ──────────────────────────────────────────────────

export async function onPODUploaded(loadId: string) {
  // Advance load status to POD_RECEIVED
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) return;

  if (load.status === "DELIVERED") {
    await prisma.load.update({
      where: { id: loadId },
      data: { status: "POD_RECEIVED" },
    });
  }

  // Advance invoice status to INVOICED (ready to send)
  const invoice = await prisma.invoice.findFirst({
    where: { loadId, status: { in: ["SUBMITTED", "DRAFT"] } },
  });
  if (invoice) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT", sentDate: new Date() },
    });

    // Update load status
    await prisma.load.update({
      where: { id: loadId },
      data: { status: "INVOICED" },
    });

    log.info(`[Integration] POD uploaded → invoice ${invoice.invoiceNumber} advanced to SENT, load to INVOICED`);
  }

  // Mark POD received on the CarrierPay if exists
  await prisma.carrierPay.updateMany({
    where: { loadId, docPod: false },
    data: { docPod: true },
  });

  // Quick Pay Agreement §5 — "the clock starts when the deficiency is cured".
  // A settlement created on delivery before documentation arrived has no due
  // date; this is where it gets one. Rows that already have a due date are left
  // alone, so a later POD revision never moves a date the carrier was given.
  const receivedAt = (await documentationReceivedAt(loadId)) ?? new Date();
  const awaitingDocs = await prisma.carrierPay.findMany({
    where: { loadId, dueDate: null },
    select: { id: true, carrierId: true, paymentTier: true, paymentNumber: true },
  });
  for (const pay of awaitingDocs) {
    const profile = await prisma.carrierProfile.findUnique({
      where: { userId: pay.carrierId },
      select: { tier: true },
    });
    const dueDate = quickPayDueDate(speedFromPaymentTier(pay.paymentTier), profile?.tier, receivedAt);
    await prisma.carrierPay.update({ where: { id: pay.id }, data: { dueDate } });
    log.info(
      `[Integration] Documentation received for load ${loadId} → payment clock started on ${pay.paymentNumber || pay.id}, due ${dueDate.toISOString().slice(0, 10)}`,
    );
  }
}

// ──────────────────────────────────────────────────
// LOOP 5 — CPP: Recalculate score + tier evaluation
// ──────────────────────────────────────────────────

export async function recalculateCarrierCPP(carrierProfileId: string) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierProfileId },
    include: {
      user: { select: { id: true, firstName: true, company: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  });
  if (!profile) return;

  // Check guest → bronze promotion first
  if (profile.tier === "GUEST" || profile.cppTier === "GUEST") {
    const promoted = await checkGuestPromotion(carrierProfileId);
    if (promoted) return; // Promotion handled
  }

  // Gather performance metrics from last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const loads = await prisma.load.findMany({
    where: {
      carrierId: profile.userId,
      status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] },
      updatedAt: { gte: since },
    },
    select: {
      id: true, pickupDate: true, deliveryDate: true, status: true,
      createdAt: true, updatedAt: true,
      pickupTimeEnd: true, deliveryTimeEnd: true,
      actualPickupDatetime: true, actualDeliveryDatetime: true,
    },
  });

  if (loads.length === 0) return; // No recent activity

  // Build A (2026-05-30): real on-time pickup/delivery from the actual event
  // timestamps the carrier portal already captures (Load.actualPickupDatetime /
  // actualDeliveryDatetime), compared to the scheduled appointment window + 2h
  // grace. Replaces the prior always-100% stubs. Loads without an appointment
  // window OR without an actual timestamp are excluded from the denominator;
  // when nothing is measurable yet the helper returns a neutral 100 (no penalty
  // for a carrier we have no on-time data on). Coverage widens with Build B
  // (AE-path stamping + trackingEvents backfill). See lib/onTimePerformance.ts.
  const onTimePickupPct = calcOnTimePerformance(
    loads.map((l) => ({ scheduledDate: l.pickupDate, timeEnd: l.pickupTimeEnd, actual: l.actualPickupDatetime }))
  ).pct;
  const onTimeDeliveryPct = calcOnTimePerformance(
    loads.map((l) => ({ scheduledDate: l.deliveryDate, timeEnd: l.deliveryTimeEnd, actual: l.actualDeliveryDatetime }))
  ).pct;

  // Check-call communication score
  const checkCalls = await prisma.checkCallSchedule.findMany({
    where: {
      load: { carrierId: profile.userId },
      scheduledTime: { gte: since },
    },
    select: { status: true },
  });
  const totalChecks = checkCalls.length || 1;
  const respondedChecks = checkCalls.filter((c) => c.status === "RESPONDED").length;
  const communicationScore = (respondedChecks / totalChecks) * 100;

  // Claim ratio
  const claims = await prisma.paymentDispute.count({
    where: {
      carrierPayment: { carrierId: profile.userId },
      createdAt: { gte: since },
    },
  });
  const claimRatio = loads.length > 0 ? (claims / loads.length) * 100 : 0;

  // Document submission timeliness (POD within 24h of delivery)
  const docs = await prisma.document.findMany({
    where: {
      userId: profile.userId,
      docType: "POD",
      createdAt: { gte: since },
    },
    select: { createdAt: true, loadId: true },
  });
  // Build D/E (2026-05-30): real POD timeliness — POD uploaded within 24h of the
  // actual delivery timestamp (populated by Builds A/B), via the pure
  // lib/docTimeliness helper. Build the earliest-POD-per-load map (the join),
  // then measure. Loads missing an actual delivery time OR a POD are excluded;
  // neutral 100 until measurable.
  const podByLoad = new Map<string, Date>();
  for (const d of docs) {
    if (!d.loadId) continue;
    const prev = podByLoad.get(d.loadId);
    if (!prev || d.createdAt < prev) podByLoad.set(d.loadId, d.createdAt); // earliest POD per load
  }
  const docTimeliness = calcDocTimeliness(
    loads.map((l) => ({ actualDelivery: l.actualDeliveryDatetime, podUploadedAt: podByLoad.get(l.id) ?? null }))
  ).pct;

  // Tender acceptance rate
  const tenders = await prisma.loadTender.findMany({
    where: {
      carrierId: profile.id,
      createdAt: { gte: since },
    },
    select: { status: true },
  });
  const totalTenders = tenders.length || 1;
  const acceptedTenders = tenders.filter((t) => t.status === "ACCEPTED").length;
  const acceptanceRate = (acceptedTenders / totalTenders) * 100;

  // Tracking compliance (Build C + F 2026-05-30) — % of the carrier's loads that
  // had captured location visibility, read from LoadTrackingEvent (latitude set).
  // This unifies every location source via the locationSource enum: carrier
  // portal, geofence, check-call-email, AND ELD pings (motiveService /
  // samsaraService write LoadTrackingEvent with locationSource=ELD).
  //
  // Build F (Wasi decision 2026-05-30, option 2): tracking compliance is
  // TELEMATICS-ACTIVATED. Until a carrier connects ELD (eldEnabled), SRL doesn't
  // systematically capture location, so scoring real coverage would penalize the
  // carrier for our integration gap — it stays NEUTRAL (100), consistent with the
  // neutral-default on-time/doc factors. Once ELD is connected the SAME query
  // measures real coverage with no rework (ELD pings already write
  // LoadTrackingEvent). The CarrierScorecard column stays `gpsCompliancePct` (no
  // migration churn); the public factor is "Tracking compliance" on /carriers.
  let gpsCompliancePct = 100; // neutral until telematics-activated
  if (profile.eldEnabled) {
    const trackedLoads = await prisma.loadTrackingEvent.findMany({
      where: { loadId: { in: loads.map((l) => l.id) }, latitude: { not: null } },
      select: { loadId: true },
      distinct: ["loadId"],
    });
    gpsCompliancePct = loads.length > 0 ? (trackedLoads.length / loads.length) * 100 : 100;
  }

  const overallScore = calculateOverallScore({
    onTimePickupPct,
    onTimeDeliveryPct,
    communicationScore,
    claimRatio,
    documentSubmissionTimeliness: docTimeliness,
    acceptanceRate,
    gpsCompliancePct,
  });

  // Tier-from-score auto-promotion retired. Carrier's current tier is the
  // source of truth for scorecard + bonus calculation; tier advancement
  // runs through the canonical milestone gate (caravanService
  // .checkMilestoneAdvancement) on a separate path.
  const currentTier = profile.tier;
  const bonusPct = getBonusPercentage(currentTier);
  const recentRevenue = await prisma.invoice.aggregate({
    where: {
      userId: profile.userId,
      status: { in: ["FUNDED", "PAID"] },
      createdAt: { gte: since },
    },
    _sum: { amount: true },
  });
  const bonusEarned = (recentRevenue._sum.amount || 0) * (bonusPct / 100);

  await prisma.carrierScorecard.create({
    data: {
      carrierId: profile.id,
      period: "MONTHLY",
      onTimePickupPct: Math.round(onTimePickupPct * 100) / 100,
      onTimeDeliveryPct: Math.round(onTimeDeliveryPct * 100) / 100,
      communicationScore: Math.round(communicationScore * 100) / 100,
      claimRatio: Math.round(claimRatio * 100) / 100,
      documentSubmissionTimeliness: Math.round(docTimeliness * 100) / 100,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      gpsCompliancePct: Math.round(gpsCompliancePct * 100) / 100,
      overallScore,
      tierAtTime: currentTier,
      bonusEarned,
    },
  });

  // Create bonus if earned
  if (bonusEarned > 0) {
    await prisma.carrierBonus.create({
      data: {
        carrierId: profile.id,
        type: "PERFORMANCE",
        amount: bonusEarned,
        period: new Date().toISOString().slice(0, 7),
        status: "PENDING",
        description: `${bonusPct}% performance bonus (${currentTier} tier, score: ${overallScore})`,
      },
    });
  }

  log.info(`[Integration] CPP scorecard refreshed for carrier ${profile.id}: score=${overallScore}, tier=${currentTier}`);
}

// ──────────────────────────────────────────────────
// LOOP 4 — Shipper Credit enforcement on load creation
// ──────────────────────────────────────────────────

export async function enforceShipperCredit(customerId: string): Promise<{ allowed: boolean; reason?: string }> {
  const credit = await prisma.shipperCredit.findUnique({
    where: { customerId },
  });

  if (!credit) {
    // Auto-create credit record with default $50K limit (defense in depth)
    await prisma.shipperCredit.create({
      data: { customerId, creditLimit: 50000, creditGrade: "B", paymentTerms: "NET30" },
    }).catch(() => {});
    return { allowed: true };
  }

  if (credit.autoBlocked) {
    return { allowed: false, reason: `Shipper is auto-blocked: ${credit.blockedReason || "credit limit exceeded"}` };
  }

  const utilizationPct = credit.creditLimit > 0 ? (credit.currentUtilized / credit.creditLimit) * 100 : 0;
  if (utilizationPct >= 100) {
    return { allowed: false, reason: `Credit limit reached: $${credit.currentUtilized.toLocaleString()} / $${credit.creditLimit.toLocaleString()}` };
  }

  return { allowed: true };
}

// ──────────────────────────────────────────────────
// LOOP 6 — Load Cancellation / TONU cleanup
// ──────────────────────────────────────────────────

export async function onLoadCancelledOrTONU(loadId: string, reason?: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { id: true } },
      carrier: { select: { id: true, carrierProfile: { select: { id: true } } } },
    },
  });
  if (!load) return;

  // 1. Cancel all active tenders for this load
  await prisma.loadTender.updateMany({
    where: { loadId, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
    data: { status: "DECLINED", respondedAt: new Date(), deletedAt: new Date() },
  });

  // 2. Reverse shipper credit utilization if it was incremented on delivery
  if (load.customerId && ["DELIVERED", "POD_RECEIVED", "INVOICED"].includes(load.status)) {
    const invoiceAmount = (load as any).customerRate || (load as any).rate || 0;
    if (invoiceAmount > 0) {
      const credit = await prisma.shipperCredit.findUnique({
        where: { customerId: load.customerId },
      });
      if (credit) {
        const newUtilized = Math.max(0, credit.currentUtilized - invoiceAmount);
        const updateData: Record<string, any> = { currentUtilized: newUtilized };

        // Unblock if was auto-blocked and now under limit
        if (credit.autoBlocked && newUtilized < credit.creditLimit) {
          updateData.autoBlocked = false;
          updateData.blockedReason = null;
          updateData.blockedAt = null;
          log.info(`[Integration] Shipper credit UNBLOCKED after load cancellation for customer ${load.customerId}`);
        }

        await prisma.shipperCredit.update({ where: { id: credit.id }, data: updateData });
      }
    }
  }

  // 3. Void any carrier pay records
  const carrierPays = await prisma.carrierPay.findMany({
    where: { loadId, status: { notIn: ["PAID", "VOID"] } },
  });

  for (const cp of carrierPays) {
    await prisma.carrierPay.update({
      where: { id: cp.id },
      data: {
        status: "VOID",
        notes: `${cp.notes ? cp.notes + "\n" : ""}VOIDED: Load ${load.status === "TONU" ? "TONU" : "cancelled"} — ${reason || "no reason provided"}`,
      },
    });

    // Cancel any related approval queue entries
    await prisma.approvalQueue.updateMany({
      where: { referenceId: cp.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    // Reverse factoring fund entries for this carrier pay
    const fundEntries = await prisma.factoringFund.findMany({
      where: { referenceId: cp.id, referenceType: "CarrierPay" },
    });
    if (fundEntries.length > 0) {
      const latestFund = await prisma.factoringFund.findFirst({
        orderBy: { createdAt: "desc" },
        select: { runningBalance: true },
      });
      let runningBalance = latestFund?.runningBalance ?? 0;

      for (const entry of fundEntries) {
        // Reverse each entry
        runningBalance -= entry.amount;
        await prisma.factoringFund.create({
          data: {
            transactionType: "REVERSAL",
            amount: -entry.amount,
            runningBalance,
            referenceType: "CarrierPay",
            referenceId: cp.id,
            description: `Reversal of ${entry.transactionType} — load ${load.status === "TONU" ? "TONU" : "cancelled"} (${entry.description})`,
          },
        });
      }
    }
  }

  // 4. Soft-delete invoices
  await prisma.invoice.updateMany({
    where: { loadId, deletedAt: null },
    data: { deletedAt: new Date(), status: "VOID" },
  });

  // 5. Cancel check-call schedules
  await prisma.checkCallSchedule.updateMany({
    where: { loadId, status: { in: ["PENDING", "SENT"] } },
    data: { status: "CANCELLED" },
  });

  log.info(`[Integration] Load ${load.referenceNumber || loadId} ${load.status === "TONU" ? "TONU" : "cancelled"} → credit reversed, AP voided, fund reversed, tenders cancelled`);
}

// ──────────────────────────────────────────────────
// Cron: CPP tier recalculation for all active carriers
// ──────────────────────────────────────────────────

export async function processAllCPPRecalculations() {
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      isTestAccount: false, // v3.8.alm §13.3 Item 189 — CPP recalc sweep
      tier: { notIn: ["NONE"] },
    },
    select: { id: true },
  });

  let recalculated = 0;
  for (const carrier of carriers) {
    try {
      await recalculateCarrierCPP(carrier.id);
      recalculated++;
    } catch (e: any) {
      log.error({ err: e }, `[Integration] CPP recalc failed for ${carrier.id}:`);
    }
  }

  log.info(`[Integration] CPP batch recalculation: ${recalculated}/${carriers.length} carriers processed`);
  return { total: carriers.length, recalculated };
}
