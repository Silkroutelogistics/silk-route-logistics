// Per-load Quick Pay override service (v3.7.a).
//
// Records every instance where an AE elects a QP fee rate different from the
// carrier's tier default on a specific load. Audit-only — no hard gating.
// The monthly variance cron aggregates these for CEO review.
//
// Flow:
//   1. AE Console load creation UI pre-fills the QP rate from the assigned
//      carrier's tier default (via `getTierDefaultRate`).
//   2. AE optionally edits the rate. If the applied rate differs from the
//      tier default, the UI requires a reason (+ optional note).
//   3. On load save, `recordOverride` writes a `LoadQuickPayOverride` row.
//   4. The rate confirmation PDF shows ONLY the applied rate — carriers never
//      see the override mechanics or the tier default.

import { prisma } from "../config/database";
import { Prisma, OverrideReason } from "@prisma/client";
import { getEffectiveTier, getTierConfig } from "./caravanService";
import { log } from "../lib/logger";

export type OverrideReasonKey = keyof typeof OverrideReason;

/** Returns the carrier's current tier-default 7-day QP rate (e.g. 0.03 for Silver). */
export async function getTierDefaultRate(carrierUserId: string): Promise<number> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: carrierUserId },
    select: { tier: true },
  });
  if (!profile) return getTierConfig("SILVER").quickPayFee7Day;
  const tier = getEffectiveTier({ tier: profile.tier });
  return getTierConfig(tier).quickPayFee7Day;
}

export interface RecordOverrideInput {
  loadId: string;
  tierDefaultRate: number;
  appliedRate: number;
  reason?: OverrideReasonKey;
  reasonNote?: string;
  overriddenBy: string;
}

/**
 * Records a per-load QP override. Skips writing if the applied rate matches
 * the tier default (nothing to audit). Throws if `reason` missing when a
 * material override is present.
 */
export async function recordOverride(input: RecordOverrideInput) {
  const { loadId, tierDefaultRate, appliedRate, reason, reasonNote, overriddenBy } = input;

  // Same rate → no audit entry needed.
  if (Math.abs(appliedRate - tierDefaultRate) < 0.0001) return { created: false, reason: "no-delta" };

  if (!reason) {
    throw new Error("Override reason is required when applied rate differs from tier default");
  }
  if (reason === "OTHER" && !reasonNote?.trim()) {
    throw new Error("Free-text note is required when override reason is OTHER");
  }

  // Upsert: each load has a single override row (loadId is @unique in schema).
  const row = await prisma.loadQuickPayOverride.upsert({
    where: { loadId },
    create: {
      loadId,
      tierDefaultRate: new Prisma.Decimal(tierDefaultRate.toFixed(4)),
      appliedRate: new Prisma.Decimal(appliedRate.toFixed(4)),
      reason,
      reasonNote: reasonNote?.trim() || null,
      overriddenBy,
    },
    update: {
      tierDefaultRate: new Prisma.Decimal(tierDefaultRate.toFixed(4)),
      appliedRate: new Prisma.Decimal(appliedRate.toFixed(4)),
      reason,
      reasonNote: reasonNote?.trim() || null,
      overriddenBy,
      overriddenAt: new Date(),
    },
  });

  log.info(
    { loadId, tierDefaultRate, appliedRate, reason, overriddenBy },
    `[QuickPayOverride] recorded delta=${((appliedRate - tierDefaultRate) * 100).toFixed(2)}pp`,
  );

  return { created: true, override: row };
}

/** Returns the override for a load if one exists. */
export async function getOverride(loadId: string) {
  return prisma.loadQuickPayOverride.findUnique({ where: { loadId } });
}

export interface VarianceSummary {
  periodStart: Date;
  periodEnd: Date;
  overrideCount: number;
  avgDeltaPp: number;           // mean (applied - default) in percentage points
  totalMarginImpactUsd: number; // sum of (delta * carrierRate) across the period
  monthlyQpRevenueUsd: number;  // sum of QP fees collected in the period
  variancePctOfRevenue: number; // totalMarginImpactUsd / monthlyQpRevenueUsd
  reviewSuggested: boolean;     // true when variancePctOfRevenue > 1.5%
  byReason: Record<OverrideReasonKey, number>;
}

/**
 * Aggregates all LoadQuickPayOverride rows for the given [start, end) window
 * and computes the variance summary used by the monthly cron email.
 */
export async function summarizeVariance(periodStart: Date, periodEnd: Date): Promise<VarianceSummary> {
  const overrides = await prisma.loadQuickPayOverride.findMany({
    where: { overriddenAt: { gte: periodStart, lt: periodEnd } },
    include: { load: { select: { carrierRate: true, rate: true } } },
  });

  const byReason: Record<OverrideReasonKey, number> = {
    COMPETITIVE_MATCH: 0,
    VOLUME_BONUS: 0,
    STRATEGIC_LANE: 0,
    OTHER: 0,
  };

  let totalDelta = 0;
  let totalMarginImpact = 0;
  for (const o of overrides) {
    const tier = o.tierDefaultRate.toNumber();
    const applied = o.appliedRate.toNumber();
    const delta = applied - tier;
    totalDelta += delta;
    const carrierRate = o.load.carrierRate ?? o.load.rate ?? 0;
    totalMarginImpact += delta * carrierRate;
    byReason[o.reason as OverrideReasonKey] += 1;
  }

  // Monthly QP revenue: CarrierPay rows with QP fee in window.
  const revAgg = await prisma.carrierPay.aggregate({
    where: {
      createdAt: { gte: periodStart, lt: periodEnd },
      quickPayFeeAmount: { gt: 0 },
    },
    _sum: { quickPayFeeAmount: true },
  });
  const monthlyQpRevenueUsd = revAgg._sum.quickPayFeeAmount ?? 0;

  const avgDeltaPp = overrides.length > 0 ? (totalDelta / overrides.length) * 100 : 0;
  const variancePctOfRevenue = monthlyQpRevenueUsd > 0 ? (Math.abs(totalMarginImpact) / monthlyQpRevenueUsd) * 100 : 0;

  return {
    periodStart,
    periodEnd,
    overrideCount: overrides.length,
    avgDeltaPp,
    totalMarginImpactUsd: totalMarginImpact,
    monthlyQpRevenueUsd,
    variancePctOfRevenue,
    reviewSuggested: variancePctOfRevenue > 1.5,
    byReason,
  };
}
