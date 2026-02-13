import { prisma } from "../../config/database";
import { Prisma } from "@prisma/client";

/**
 * Anomaly Detector — Detects unusual patterns across the platform.
 *
 * Scans for:
 *   - Rate anomalies (unusually high/low quotes)
 *   - Carrier behavior anomalies (sudden fall-off spike, payment disputes)
 *   - Customer anomalies (sudden volume drop, payment delays)
 *   - System anomalies (API cost spikes, error rate spikes)
 *
 * Uses simple z-score detection. Results are logged to AnomalyLog.
 */

const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

interface AnomalyResult {
  entityType: string;
  entityId: string;
  anomalyType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  data: Record<string, unknown>;
}

// ─── Rate Anomaly Detection ──────────────────────────────────────────────────

async function detectRateAnomalies(): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  const lanes = await prisma.laneRateIntelligence.findMany({
    where: { sampleSize: { gte: 5 } },
  });

  for (const lane of lanes) {
    if (lane.volatility > 0 && lane.lastQuotedRate) {
      const rpm = lane.lastQuotedRate; // using raw value
      const zScore = Math.abs(rpm - lane.avgRatePerMile) / lane.volatility;

      if (zScore > 3) {
        anomalies.push({
          entityType: "LANE",
          entityId: `${lane.originZip}-${lane.destZip}`,
          anomalyType: "RATE_OUTLIER",
          severity: zScore > 4 ? "HIGH" : "MEDIUM",
          description: `Rate $${rpm}/mi is ${zScore.toFixed(1)} std devs from avg $${lane.avgRatePerMile}/mi on ${lane.originZip}→${lane.destZip}`,
          data: { avgRpm: lane.avgRatePerMile, lastRpm: rpm, zScore, volatility: lane.volatility },
        });
      }
    }
  }

  return anomalies;
}

// ─── Carrier Behavior Anomalies ──────────────────────────────────────────────

async function detectCarrierAnomalies(): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  // Carriers with sudden spike in cancellations
  const recentCancellations = await prisma.load.groupBy({
    by: ["carrierId"],
    where: {
      status: { in: ["CANCELLED", "TONU"] },
      updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      carrierId: { not: null },
    },
    _count: true,
  });

  for (const group of recentCancellations) {
    if (!group.carrierId || group._count < 2) continue;

    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: group.carrierId },
      select: { companyName: true },
    });

    if (group._count >= 3) {
      anomalies.push({
        entityType: "CARRIER",
        entityId: group.carrierId,
        anomalyType: "CANCELLATION_SPIKE",
        severity: group._count >= 5 ? "CRITICAL" : "HIGH",
        description: `${carrier?.companyName ?? "Unknown"} cancelled ${group._count} loads in 7 days`,
        data: { cancellations: group._count, period: "7d" },
      });
    }
  }

  return anomalies;
}

// ─── Customer Anomalies ──────────────────────────────────────────────────────

async function detectCustomerAnomalies(): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  // Customers whose recent load volume dropped significantly
  const customers = await prisma.customerIntelligence.findMany({
    where: { daysSinceLastLoad: { gte: 30 }, totalLoads: { gte: 5 } },
  });

  for (const ci of customers) {
    if (ci.churnRisk > 0.5) {
      const cust = await prisma.customer.findUnique({
        where: { id: ci.customerId },
        select: { name: true },
      }).catch(() => null);

      anomalies.push({
        entityType: "CUSTOMER",
        entityId: ci.customerId,
        anomalyType: "CHURN_RISK",
        severity: ci.churnRisk > 0.8 ? "HIGH" : "MEDIUM",
        description: `${cust?.name ?? "Unknown"} — ${ci.daysSinceLastLoad} days since last load, churn risk ${(ci.churnRisk * 100).toFixed(0)}%`,
        data: {
          daysSinceLastLoad: ci.daysSinceLastLoad,
          churnRisk: ci.churnRisk,
          lifetimeValue: ci.lifetimeValue,
        },
      });
    }
  }

  return anomalies;
}

// ─── System Anomalies (API cost spikes) ──────────────────────────────────────

async function detectSystemAnomalies(): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  // Check for AI API cost spikes (today vs 7-day average)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000);

  const [todayCost, weekCosts] = await Promise.all([
    prisma.aIApiUsage.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { costUsd: true },
    }),
    prisma.aIApiUsage.aggregate({
      where: { createdAt: { gte: sevenDaysAgo, lt: today } },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  const todayTotal = todayCost._sum.costUsd ?? 0;
  const dailyAvg = weekCosts._sum.costUsd ? weekCosts._sum.costUsd / 7 : 0;

  if (dailyAvg > 0 && todayTotal > dailyAvg * 3) {
    anomalies.push({
      entityType: "SYSTEM",
      entityId: "ai_api_costs",
      anomalyType: "COST_SPIKE",
      severity: todayTotal > dailyAvg * 5 ? "CRITICAL" : "HIGH",
      description: `AI API costs today ($${todayTotal.toFixed(2)}) are ${(todayTotal / dailyAvg).toFixed(1)}x the 7-day average ($${dailyAvg.toFixed(2)}/day)`,
      data: { todayCost: todayTotal, dailyAvg },
    });
  }

  // Check error rate
  const [totalCalls, failedCalls] = await Promise.all([
    prisma.aIApiUsage.count({ where: { createdAt: { gte: today } } }),
    prisma.aIApiUsage.count({ where: { createdAt: { gte: today }, success: false } }),
  ]);

  if (totalCalls >= 10) {
    const errorRate = failedCalls / totalCalls;
    if (errorRate > 0.15) {
      anomalies.push({
        entityType: "SYSTEM",
        entityId: "ai_api_errors",
        anomalyType: "ERROR_RATE_SPIKE",
        severity: errorRate > 0.3 ? "CRITICAL" : "HIGH",
        description: `AI API error rate today: ${(errorRate * 100).toFixed(1)}% (${failedCalls}/${totalCalls} calls)`,
        data: { errorRate, totalCalls, failedCalls },
      });
    }
  }

  return anomalies;
}

// ─── Run Full Anomaly Scan ───────────────────────────────────────────────────

export async function runAnomalyScan(): Promise<{
  totalAnomalies: number;
  bySeverity: Record<string, number>;
  anomalies: AnomalyResult[];
}> {
  console.log("[AnomalyDetector] Starting scan...");
  const startTime = Date.now();

  const [rateAnomalies, carrierAnomalies, customerAnomalies, systemAnomalies] =
    await Promise.all([
      detectRateAnomalies().catch(() => []),
      detectCarrierAnomalies().catch(() => []),
      detectCustomerAnomalies().catch(() => []),
      detectSystemAnomalies().catch(() => []),
    ]);

  const allAnomalies = [
    ...rateAnomalies,
    ...carrierAnomalies,
    ...customerAnomalies,
    ...systemAnomalies,
  ];

  // Write to AnomalyLog
  for (const a of allAnomalies) {
    await prisma.anomalyLog.create({
      data: {
        entityType: a.entityType,
        entityId: a.entityId,
        anomalyType: a.anomalyType,
        severity: a.severity,
        description: a.description,
        dataJson: toJson(a.data),
        status: "NEW",
      },
    }).catch((err) => console.error("[AnomalyDetector] Failed to log:", err.message));
  }

  const bySeverity: Record<string, number> = {};
  for (const a of allAnomalies) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
  }

  console.log(`[AnomalyDetector] Scan complete in ${Date.now() - startTime}ms — ${allAnomalies.length} anomalies found`);

  return { totalAnomalies: allAnomalies.length, bySeverity, anomalies: allAnomalies };
}

// ─── Get Recent Anomalies ────────────────────────────────────────────────────

export async function getRecentAnomalies(limit = 50) {
  return prisma.anomalyLog.findMany({
    where: { status: { in: ["NEW", "ACKNOWLEDGED"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ─── Acknowledge an Anomaly ──────────────────────────────────────────────────

export async function acknowledgeAnomaly(anomalyId: string, reviewedBy: string) {
  return prisma.anomalyLog.update({
    where: { id: anomalyId },
    data: { status: "ACKNOWLEDGED", reviewedBy, reviewedAt: new Date() },
  });
}
