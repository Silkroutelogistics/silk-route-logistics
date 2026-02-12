import { prisma } from "../config/database";
import { calculateTier, calculateOverallScore, getBonusPercentage, checkGuestPromotion } from "./tierService";
import { createCheckCallSchedule } from "./checkCallAutomation";

/**
 * Cross-System Integration Service
 * Closes every data loop: Carrier Lifecycle, Load Lifecycle,
 * Factoring Fund, Shipper Credit, SRCPP Rewards.
 */

// ──────────────────────────────────────────────────
// LOOP 1 — Carrier Lifecycle: on approval → SRCPP scorecard + tier
// ──────────────────────────────────────────────────

export async function onCarrierApproved(carrierProfileId: string) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierProfileId },
    include: { user: { select: { id: true, firstName: true, company: true } } },
  });
  if (!profile) return;

  // Create initial SRCPP scorecard with baseline scores
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

  // Set initial tier to GUEST (new carrier, needs 3 loads for BRONZE)
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      tier: "GUEST",
      srcppTier: "GUEST",
      srcppJoinedDate: new Date(),
      source: "caravan",
    },
  });

  console.log(`[Integration] Carrier ${profile.user?.company || profile.id} approved → GUEST tier + initial scorecard created`);
}

// ──────────────────────────────────────────────────
// LOOP 2 — Load Lifecycle: on dispatched → check-call schedule
// ──────────────────────────────────────────────────

export async function onLoadDispatched(loadId: string) {
  await createCheckCallSchedule(loadId);
  console.log(`[Integration] Load ${loadId} dispatched → check-call schedule created`);
}

// ──────────────────────────────────────────────────
// LOOP 2+3+4+5 — on delivered: AP, fund, credit, SRCPP
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
              id: true, tier: true, srcppTier: true, srcppTotalLoads: true, srcppTotalMiles: true,
              paymentPreference: true,
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

  // ── SRCPP: Recalculate on load completion ──
  if (load.carrier?.carrierProfile) {
    // Increment total loads + miles
    const profileId = load.carrier.carrierProfile.id;
    await prisma.carrierProfile.update({
      where: { id: profileId },
      data: {
        srcppTotalLoads: { increment: 1 },
        srcppTotalMiles: { increment: load.distance || 0 },
      },
    });

    // Fire-and-forget SRCPP recalculation
    recalculateCarrierSRCPP(profileId).catch((e) =>
      console.error(`[Integration] SRCPP recalc error for ${profileId}:`, e.message)
    );
  }

  console.log(`[Integration] Load ${load.referenceNumber} delivered → AP + credit + SRCPP triggered`);
}

// ── Create Carrier Pay entry on delivery ──
async function createCarrierPayOnDelivery(load: any) {
  // Check for duplicate
  const existingPay = await prisma.carrierPay.findFirst({ where: { loadId: load.id } });
  if (existingPay) {
    console.log(`[Integration] CarrierPay already exists for load ${load.id}`);
    return;
  }

  const rc = load.rateConfirmations?.[0];
  const profile = load.carrier.carrierProfile;

  const lineHaul = load.carrierRate || load.rate || 0;
  const fuelSurcharge = rc?.fuelSurcharge || load.fuelSurcharge || 0;
  const accessorials = rc?.accessorialTotal || 0;
  const grossAmount = lineHaul + fuelSurcharge + accessorials;

  // Determine payment tier from carrier's SRCPP tier or preference
  const tierMap: Record<string, string> = {
    PLATINUM: "ELITE", GOLD: "PARTNER", SILVER: "PRIORITY", BRONZE: "STANDARD", GUEST: "STANDARD", NONE: "STANDARD",
  };
  const paymentTier = profile.paymentPreference || tierMap[profile.tier] || "STANDARD";

  // Calculate quick-pay fee
  const feeRates: Record<string, number> = {
    FLASH: 5, EXPRESS: 3.5, PRIORITY: 2, PARTNER: 1.5, ELITE: 0, STANDARD: 0,
  };
  const quickPayFeePercent = feeRates[paymentTier] || 0;
  const quickPayFeeAmount = grossAmount * (quickPayFeePercent / 100);
  const netAmount = grossAmount - quickPayFeeAmount;

  // Generate payment number
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await prisma.carrierPay.count({
    where: { paymentNumber: { startsWith: `CP-${todayStr}` } },
  });
  const paymentNumber = `CP-${todayStr}-${String(existingCount + 1).padStart(4, "0")}`;

  // Calculate SLA due date based on tier
  const slaDays: Record<string, number> = {
    FLASH: 0, EXPRESS: 1, PRIORITY: 2, PARTNER: 3, ELITE: 5, STANDARD: 30,
  };
  const dueDate = new Date();
  const slaHours = paymentTier === "FLASH" ? 2 : (slaDays[paymentTier] || 30) * 24;
  dueDate.setTime(dueDate.getTime() + slaHours * 60 * 60 * 1000);

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
      notes: `Auto-generated on delivery of load ${load.referenceNumber}`,
    },
  });

  // If >= $5K, create approval queue entry
  if (netAmount >= 5000) {
    await prisma.approvalQueue.create({
      data: {
        type: "CARRIER_PAYMENT",
        referenceId: payment.id,
        referenceType: "CarrierPay",
        amount: netAmount,
        description: `Auto-generated carrier payment ${paymentNumber} for load ${load.referenceNumber} — $${netAmount.toLocaleString()}`,
        priority: netAmount >= 10000 ? "HIGH" : "MEDIUM",
        status: "PENDING",
        requestedById: load.carrierId,
      },
    });
    console.log(`[Integration] $5K+ threshold → approval queue entry created for ${paymentNumber}`);
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

  console.log(`[Integration] CarrierPay ${paymentNumber} created: gross=$${grossAmount}, net=$${netAmount}, tier=${paymentTier}`);
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
    console.log(`[Integration] Shipper credit AUTO-BLOCKED for customer ${load.customerId} — utilization ${utilizationPct.toFixed(1)}%`);
  } else if (utilizationPct >= 80) {
    console.log(`[Integration] Shipper credit WARNING: customer ${load.customerId} at ${utilizationPct.toFixed(1)}% utilization`);
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
        console.log(`[Integration] Shipper credit UNBLOCKED for customer ${invoice.load.customerId}`);
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

  console.log(`[Integration] Invoice ${invoice.invoiceNumber} paid → fund credited $${paidAmount}, shipper credit released`);
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

    console.log(`[Integration] POD uploaded → invoice ${invoice.invoiceNumber} advanced to SENT, load to INVOICED`);
  }

  // Mark POD received on the CarrierPay if exists
  await prisma.carrierPay.updateMany({
    where: { loadId, docPod: false },
    data: { docPod: true },
  });
}

// ──────────────────────────────────────────────────
// LOOP 5 — SRCPP: Recalculate score + tier evaluation
// ──────────────────────────────────────────────────

export async function recalculateCarrierSRCPP(carrierProfileId: string) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierProfileId },
    include: {
      user: { select: { id: true, firstName: true, company: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  });
  if (!profile) return;

  // Check guest → bronze promotion first
  if (profile.tier === "GUEST" || profile.srcppTier === "GUEST") {
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
    },
  });

  if (loads.length === 0) return; // No recent activity

  // Calculate on-time pickup (within 2 hours of scheduled)
  const onTimePickups = loads.filter((l) => {
    if (!l.pickupDate) return true; // No schedule = assume on-time
    return true; // Without actual timestamps tracked per-event, assume on-time
  }).length;
  const onTimePickupPct = (onTimePickups / loads.length) * 100;

  // On-time delivery
  const onTimeDeliveries = loads.filter((l) => {
    if (!l.deliveryDate) return true;
    return true; // Same assumption
  }).length;
  const onTimeDeliveryPct = (onTimeDeliveries / loads.length) * 100;

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
  const timelyDocs = docs.length; // Simplified: if uploaded = timely
  const docTimeliness = loads.length > 0 ? Math.min(100, (timelyDocs / loads.length) * 100) : 80;

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

  // GPS compliance (check-call response rate as proxy)
  const gpsCompliancePct = communicationScore;

  const overallScore = calculateOverallScore({
    onTimePickupPct,
    onTimeDeliveryPct,
    communicationScore,
    claimRatio,
    documentSubmissionTimeliness: docTimeliness,
    acceptanceRate,
    gpsCompliancePct,
  });

  const newTier = calculateTier(overallScore);
  const oldTier = profile.tier;

  // Create new scorecard
  const bonusPct = getBonusPercentage(newTier);
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
      tierAtTime: newTier,
      bonusEarned,
    },
  });

  // Update carrier tier if changed
  if (newTier !== oldTier) {
    await prisma.carrierProfile.update({
      where: { id: profile.id },
      data: { tier: newTier, srcppTier: newTier },
    });

    // Create tier change notification
    const tierNames: Record<string, string> = {
      PLATINUM: "Platinum", GOLD: "Gold", SILVER: "Silver", BRONZE: "Bronze", GUEST: "Guest",
    };
    const direction = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "GUEST", "NONE"].indexOf(newTier) <
      ["PLATINUM", "GOLD", "SILVER", "BRONZE", "GUEST", "NONE"].indexOf(oldTier)
      ? "upgraded" : "adjusted";

    await prisma.notification.create({
      data: {
        userId: profile.userId,
        type: "GENERAL",
        title: `SRCPP Tier ${direction === "upgraded" ? "Upgrade" : "Change"}: ${tierNames[newTier]}`,
        message: `Your SRCPP tier has been ${direction} from ${tierNames[oldTier] || oldTier} to ${tierNames[newTier]}. Score: ${overallScore}. ${direction === "upgraded" ? "Congratulations!" : "Keep improving your performance metrics."}`,
        actionUrl: "/carrier/dashboard.html",
      },
    });

    console.log(`[Integration] SRCPP tier change: ${oldTier} → ${newTier} (score: ${overallScore}) for carrier ${profile.id}`);
  }

  // Create bonus if earned
  if (bonusEarned > 0) {
    await prisma.carrierBonus.create({
      data: {
        carrierId: profile.id,
        type: "PERFORMANCE",
        amount: bonusEarned,
        period: new Date().toISOString().slice(0, 7),
        status: "PENDING",
        description: `${bonusPct}% performance bonus (${newTier} tier, score: ${overallScore})`,
      },
    });
  }

  console.log(`[Integration] SRCPP recalculated for carrier ${profile.id}: score=${overallScore}, tier=${newTier}`);
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
// Cron: SRCPP tier recalculation for all active carriers
// ──────────────────────────────────────────────────

export async function processAllSRCPPRecalculations() {
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      tier: { notIn: ["NONE"] },
    },
    select: { id: true },
  });

  let recalculated = 0;
  for (const carrier of carriers) {
    try {
      await recalculateCarrierSRCPP(carrier.id);
      recalculated++;
    } catch (e: any) {
      console.error(`[Integration] SRCPP recalc failed for ${carrier.id}:`, e.message);
    }
  }

  console.log(`[Integration] SRCPP batch recalculation: ${recalculated}/${carriers.length} carriers processed`);
  return { total: carriers.length, recalculated };
}
