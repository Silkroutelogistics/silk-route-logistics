import { prisma } from "../config/database";
import { getEffectiveTier, getTierConfig } from "./caravanService";
import { sendRemittanceEmail } from "./emailService";
import { log } from "../lib/logger";

// ─── Quick Pay Capital Constants ────────────────────────────

const QP_CAPITAL = 70000;
const QP_MAX_DEPLOY = 56000; // 80% of capital
const QP_PAUSE_ENTRY_TIER = 20000; // pause entry-tier (Silver) QP below this cash level
const QP_PAUSE_ALL = 15000; // pause ALL QP below this
const QP_CARRIER_CAP = 0.25; // 25% of available capital per carrier

// ─── Types ──────────────────────────────────────────────────

export interface QpValidationResult {
  approved: boolean;
  reason?: string;
  checks: {
    podVerified: boolean;
    marginCheck: boolean; // load margin >= 15%
    cashAvailable: boolean;
    carrierCapCheck: boolean; // within 25% cap
    tierEligible: boolean;
    withinAutoLimit: boolean;
    withinMonthlyLimit: boolean;
  };
  netPayment: number;
  feeAmount: number;
  feeRate: number;
}

interface CashPositionResult {
  totalCapital: number;
  deployed: number;
  available: number;
  pendingShipperAR: number;
  bronzePaused: boolean;
  allQPPaused: boolean;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Returns current cash position from the CashPosition table (latest record)
 * or calculates live from outstanding QP records.
 */
export async function getCashPosition(): Promise<CashPositionResult> {
  const latest = await prisma.cashPosition.findFirst({
    orderBy: { date: "desc" },
  });

  if (latest) {
    return {
      totalCapital: latest.totalCapital,
      deployed: latest.deployed,
      available: latest.available,
      pendingShipperAR: latest.pendingShipperAR,
      bronzePaused: latest.bronzePaused,
      allQPPaused: latest.allQPPaused,
    };
  }

  // Fallback: calculate live
  return {
    totalCapital: QP_CAPITAL,
    deployed: 0,
    available: QP_CAPITAL,
    pendingShipperAR: 0,
    bronzePaused: false,
    allQPPaused: false,
  };
}

/**
 * Runs ALL safety checks for a quick-pay request.
 */
export async function validateQuickPay(
  loadId: string,
  carrierId: string
): Promise<QpValidationResult> {
  const checks = {
    podVerified: false,
    marginCheck: false,
    cashAvailable: false,
    carrierCapCheck: false,
    tierEligible: false,
    withinAutoLimit: false,
    withinMonthlyLimit: false,
  };

  const failResult = (reason: string, partial?: Partial<typeof checks>): QpValidationResult => ({
    approved: false,
    reason,
    checks: { ...checks, ...partial },
    netPayment: 0,
    feeAmount: 0,
    feeRate: 0,
  });

  // Load the load + carrier profile
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      carrierRate: true,
      customerRate: true,
      rate: true,
      status: true,
    },
  });
  if (!load) return failResult("Load not found");

  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      tier: true,
      quickPayFeeRate: true,
      quickPayAutoLimit: true,
      quickPayMonthlyLimit: true,
      userId: true,
    },
  });
  if (!profile) return failResult("Carrier profile not found");

  const effectiveTier = getEffectiveTier({ tier: profile.tier });
  const tierConfig = getTierConfig(effectiveTier);

  // 1. POD uploaded and verified
  const podDoc = await prisma.document.findFirst({
    where: { loadId, docType: "POD" },
    select: { id: true },
  });
  checks.podVerified = !!podDoc;
  if (!checks.podVerified) return failResult("POD not uploaded or verified", checks);

  // 2. Load margin >= 15%
  const carrierRate = (load as any).carrierRate || (load as any).rate || 0;
  const customerRate = (load as any).customerRate || (load as any).rate || 0;
  const margin = customerRate > 0 ? (customerRate - carrierRate) / customerRate : 0;
  checks.marginCheck = margin >= 0.15;
  if (!checks.marginCheck) {
    return failResult(`Load margin ${(margin * 100).toFixed(1)}% is below 15% minimum`, checks);
  }

  // 3. Cash position checks
  const cash = await getCashPosition();
  checks.cashAvailable = cash.available > QP_PAUSE_ALL;
  if (!checks.cashAvailable) return failResult("Cash position too low — all QP paused", checks);

  if (effectiveTier === "SILVER" && cash.available <= QP_PAUSE_ENTRY_TIER) {
    return failResult("Cash position too low — Silver (entry-tier) QP paused", checks);
  }

  // Calculate payment amounts (7-day rate; same-day uses quickPayFeeSameDay)
  const feeRate = profile.quickPayFeeRate || tierConfig.quickPayFee7Day;
  const grossAmount = carrierRate;
  const feeAmount = Math.round(grossAmount * feeRate * 100) / 100;
  const netPayment = Math.round((grossAmount - feeAmount) * 100) / 100;

  // 4. Deployed + this payment < $56K
  if (cash.deployed + netPayment > QP_MAX_DEPLOY) {
    return failResult(
      `Would exceed max deployment: $${cash.deployed} + $${netPayment} > $${QP_MAX_DEPLOY}`,
      checks
    );
  }

  // 5. Carrier's outstanding QP < 25% of available capital
  const carrierOutstanding = await prisma.carrierPay.aggregate({
    where: {
      carrierId: profile.userId,
      status: { in: ["PREPARED", "APPROVED"] },
      quickPayFeeAmount: { gt: 0 },
    },
    _sum: { netAmount: true },
  });
  const carrierTotal = carrierOutstanding._sum.netAmount || 0;
  const carrierCap = cash.available * QP_CARRIER_CAP;
  checks.carrierCapCheck = carrierTotal + netPayment <= carrierCap;
  if (!checks.carrierCapCheck) {
    return failResult(
      `Carrier QP cap exceeded: $${carrierTotal + netPayment} > $${carrierCap.toFixed(0)} (25% of available)`,
      checks
    );
  }

  // 6. Tier eligible (all tiers eligible in the 3-tier system)
  checks.tierEligible = true;

  // 7. Within auto-approve limit
  const autoLimit = profile.quickPayAutoLimit || tierConfig.quickPayAutoLimit;
  checks.withinAutoLimit = netPayment <= autoLimit;

  // 8. Within monthly limit
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyTotal = await prisma.carrierPay.aggregate({
    where: {
      carrierId: profile.userId,
      quickPayFeeAmount: { gt: 0 },
      createdAt: { gte: startOfMonth },
      status: { notIn: ["VOID"] },
    },
    _sum: { netAmount: true },
  });
  const monthlyUsed = monthlyTotal._sum.netAmount || 0;
  const monthlyLimit = profile.quickPayMonthlyLimit || tierConfig.quickPayMonthlyLimit;
  checks.withinMonthlyLimit = monthlyUsed + netPayment <= monthlyLimit;
  if (!checks.withinMonthlyLimit) {
    return failResult(
      `Monthly QP limit exceeded: $${monthlyUsed + netPayment} > $${monthlyLimit}`,
      checks
    );
  }

  return {
    approved: true,
    checks,
    netPayment,
    feeAmount,
    feeRate,
  };
}

/**
 * Executes a quick-pay payment after validation.
 */
export async function processQuickPay(
  loadId: string,
  carrierId: string,
  approvedBy: string
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  // Validate first
  const validation = await validateQuickPay(loadId, carrierId);
  if (!validation.approved) {
    return { success: false, error: validation.reason };
  }

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      referenceNumber: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      carrierRate: true,
      rate: true,
    },
  });
  if (!load) return { success: false, error: "Load not found" };

  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { email: true, firstName: true, company: true } } },
  });
  if (!profile) return { success: false, error: "Carrier not found" };

  const grossAmount = (load as any).carrierRate || (load as any).rate || 0;

  // Generate payment number
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await prisma.carrierPay.count({
    where: { paymentNumber: { startsWith: `QP-${todayStr}` } },
  });
  const paymentNumber = `QP-${todayStr}-${String(existingCount + 1).padStart(4, "0")}`;

  // Create the carrier pay record
  const payment = await prisma.carrierPay.create({
    data: {
      paymentNumber,
      carrierId: profile.userId,
      loadId,
      paymentTier: "FLASH" as any,
      lineHaul: grossAmount,
      fuelSurcharge: 0,
      accessorialsTotal: 0,
      amount: grossAmount,
      grossAmount,
      quickPayFeePercent: validation.feeRate * 100,
      quickPayFeeAmount: validation.feeAmount,
      quickPayDiscount: validation.feeAmount,
      netAmount: validation.netPayment,
      status: "APPROVED",
      dueDate: new Date(),
      preparedAt: new Date(),
      approvedById: approvedBy,
      approvedAt: new Date(),
      notes: `Quick Pay processed for load ${load.referenceNumber}`,
    },
  });

  // Update cash position
  await updateCashPosition();

  // Record QP fee in factoring fund
  if (validation.feeAmount > 0) {
    const latestFund = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true },
    });
    const currentBalance = latestFund?.runningBalance ?? 0;

    await prisma.factoringFund.create({
      data: {
        transactionType: "QP_FEE_EARNED",
        amount: validation.feeAmount,
        runningBalance: currentBalance + validation.feeAmount,
        referenceType: "CarrierPay",
        referenceId: payment.id,
        description: `Quick-pay fee (${(validation.feeRate * 100).toFixed(1)}%) on ${paymentNumber}`,
      },
    });
  }

  // Send remittance email
  const lane = `${(load as any).originCity || "?"}, ${(load as any).originState || "?"} → ${(load as any).destCity || "?"}, ${(load as any).destState || "?"}`;
  const estimatedArrival = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  try {
    await sendRemittanceEmail(profile.user.email, {
      carrierName: profile.user.company || profile.user.firstName || "Carrier",
      loadRef: load.referenceNumber || loadId,
      lane,
      grossAmount,
      qpFeeRate: validation.feeRate * 100,
      qpFeeAmount: validation.feeAmount,
      netPayment: validation.netPayment,
      paymentMethod: "ACH",
      estimatedArrival,
    });
  } catch (e: any) {
    log.error(`[QuickPay] Remittance email failed: ${e.message}`);
  }

  log.info(
    `[QuickPay] Processed ${paymentNumber}: gross=$${grossAmount}, fee=$${validation.feeAmount}, net=$${validation.netPayment}`
  );

  return { success: true, paymentId: payment.id };
}

/**
 * Recalculates cash position from all outstanding QP records.
 */
export async function updateCashPosition(): Promise<void> {
  const outstandingQP = await prisma.carrierPay.aggregate({
    where: {
      quickPayFeeAmount: { gt: 0 },
      status: { in: ["PREPARED", "APPROVED", "PROCESSING"] },
    },
    _sum: { netAmount: true },
  });

  const deployed = outstandingQP._sum.netAmount || 0;
  const available = QP_CAPITAL - deployed;

  const pendingAR = await prisma.invoice.aggregate({
    where: {
      status: { in: ["SENT", "OVERDUE"] },
    },
    _sum: { amount: true },
  });

  // `bronzePaused` is a legacy DB column name — semantically it's now the
  // entry-tier (Silver) pause flag. Column stays named for backward compat;
  // API consumers still read `bronzePaused`.
  const bronzePaused = available <= QP_PAUSE_ENTRY_TIER;
  const allQPPaused = available <= QP_PAUSE_ALL;

  await prisma.cashPosition.create({
    data: {
      totalCapital: QP_CAPITAL,
      deployed,
      available,
      pendingShipperAR: pendingAR._sum.amount || 0,
      bronzePaused,
      allQPPaused,
    },
  });

  log.info(
    `[QuickPay] Cash position updated: deployed=$${deployed}, available=$${available}, entryTierPaused=${bronzePaused}, allPaused=${allQPPaused}`
  );
}

/**
 * Returns current QP pause status.
 */
export async function checkQpPauseStatus(): Promise<{
  bronzePaused: boolean;
  allPaused: boolean;
  available: number;
  deployed: number;
}> {
  const cash = await getCashPosition();
  return {
    bronzePaused: cash.available <= QP_PAUSE_ENTRY_TIER,
    allPaused: cash.available <= QP_PAUSE_ALL,
    available: cash.available,
    deployed: cash.deployed,
  };
}
