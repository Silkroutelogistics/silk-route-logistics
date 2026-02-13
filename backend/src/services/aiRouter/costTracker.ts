import { prisma } from "../../config/database";

/**
 * Cost Tracker — Tracks AI API usage and costs with budget monitoring.
 *
 * Records every AI call to the AIApiUsage table and provides
 * aggregated cost dashboards, budget alerts, and per-feature cost attribution.
 */

interface UsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  queryType: string;
  source: string;
  success: boolean;
  errorType?: string;
  userId?: string;
}

// ─── Track a Single Usage Event ──────────────────────────────────────────────

export async function trackUsage(record: UsageRecord): Promise<void> {
  try {
    await prisma.aIApiUsage.create({
      data: {
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        costUsd: record.costUsd,
        latencyMs: record.latencyMs,
        queryType: record.queryType,
        source: record.source,
        success: record.success,
        errorType: record.errorType ?? null,
        userId: record.userId ?? null,
      },
    });
  } catch (err) {
    console.error("[CostTracker] Failed to record usage:", err);
  }
}

// ─── Get Cost Summary ────────────────────────────────────────────────────────

export async function getCostSummary(days = 30): Promise<{
  totalCost: number;
  totalCalls: number;
  successRate: number;
  avgLatency: number;
  byProvider: Array<{ provider: string; cost: number; calls: number }>;
  byModel: Array<{ model: string; cost: number; calls: number; avgLatency: number }>;
  byQueryType: Array<{ queryType: string; cost: number; calls: number }>;
  bySource: Array<{ source: string; cost: number; calls: number }>;
  dailyCosts: Array<{ date: string; cost: number; calls: number }>;
}> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [allUsage, aggregate] = await Promise.all([
    prisma.aIApiUsage.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aIApiUsage.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true },
      _count: true,
      _avg: { latencyMs: true },
    }),
  ]);

  const successCount = allUsage.filter((u) => u.success).length;

  // Group by provider
  const providerMap = new Map<string, { cost: number; calls: number }>();
  const modelMap = new Map<string, { cost: number; calls: number; totalLatency: number }>();
  const queryTypeMap = new Map<string, { cost: number; calls: number }>();
  const sourceMap = new Map<string, { cost: number; calls: number }>();
  const dailyMap = new Map<string, { cost: number; calls: number }>();

  for (const u of allUsage) {
    // Provider
    const pEntry = providerMap.get(u.provider) ?? { cost: 0, calls: 0 };
    pEntry.cost += u.costUsd;
    pEntry.calls++;
    providerMap.set(u.provider, pEntry);

    // Model
    const mEntry = modelMap.get(u.model) ?? { cost: 0, calls: 0, totalLatency: 0 };
    mEntry.cost += u.costUsd;
    mEntry.calls++;
    mEntry.totalLatency += u.latencyMs;
    modelMap.set(u.model, mEntry);

    // Query type
    const qEntry = queryTypeMap.get(u.queryType) ?? { cost: 0, calls: 0 };
    qEntry.cost += u.costUsd;
    qEntry.calls++;
    queryTypeMap.set(u.queryType, qEntry);

    // Source
    const sEntry = sourceMap.get(u.source) ?? { cost: 0, calls: 0 };
    sEntry.cost += u.costUsd;
    sEntry.calls++;
    sourceMap.set(u.source, sEntry);

    // Daily
    const dateKey = u.createdAt.toISOString().slice(0, 10);
    const dEntry = dailyMap.get(dateKey) ?? { cost: 0, calls: 0 };
    dEntry.cost += u.costUsd;
    dEntry.calls++;
    dailyMap.set(dateKey, dEntry);
  }

  return {
    totalCost: Math.round((aggregate._sum.costUsd ?? 0) * 100) / 100,
    totalCalls: aggregate._count,
    successRate: aggregate._count > 0 ? Math.round((successCount / aggregate._count) * 1000) / 1000 : 1,
    avgLatency: Math.round(aggregate._avg.latencyMs ?? 0),
    byProvider: [...providerMap.entries()].map(([provider, d]) => ({
      provider,
      cost: Math.round(d.cost * 100) / 100,
      calls: d.calls,
    })),
    byModel: [...modelMap.entries()].map(([model, d]) => ({
      model,
      cost: Math.round(d.cost * 100) / 100,
      calls: d.calls,
      avgLatency: d.calls > 0 ? Math.round(d.totalLatency / d.calls) : 0,
    })),
    byQueryType: [...queryTypeMap.entries()].map(([queryType, d]) => ({
      queryType,
      cost: Math.round(d.cost * 100) / 100,
      calls: d.calls,
    })),
    bySource: [...sourceMap.entries()].map(([source, d]) => ({
      source,
      cost: Math.round(d.cost * 100) / 100,
      calls: d.calls,
    })),
    dailyCosts: [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        cost: Math.round(d.cost * 100) / 100,
        calls: d.calls,
      })),
  };
}

// ─── Get Today's Spend ───────────────────────────────────────────────────────

export async function getTodaySpend(): Promise<{
  costUsd: number;
  calls: number;
  topModel: string | null;
}> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const result = await prisma.aIApiUsage.aggregate({
    where: { createdAt: { gte: today } },
    _sum: { costUsd: true },
    _count: true,
  });

  // Get top model by cost today
  const topModel = await prisma.aIApiUsage.groupBy({
    by: ["model"],
    where: { createdAt: { gte: today } },
    _sum: { costUsd: true },
    orderBy: { _sum: { costUsd: "desc" } },
    take: 1,
  });

  return {
    costUsd: Math.round((result._sum.costUsd ?? 0) * 100) / 100,
    calls: result._count,
    topModel: topModel[0]?.model ?? null,
  };
}

// ─── Budget Check ────────────────────────────────────────────────────────────

const MONTHLY_BUDGET_USD = parseFloat(process.env.AI_MONTHLY_BUDGET ?? "100");

export async function checkBudget(): Promise<{
  monthlyBudget: number;
  monthlySpend: number;
  percentUsed: number;
  projectedMonthly: number;
  overBudget: boolean;
  recommendation: string;
}> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const result = await prisma.aIApiUsage.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { costUsd: true },
  });

  const spent = result._sum.costUsd ?? 0;
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projected = (spent / dayOfMonth) * daysInMonth;
  const percentUsed = (spent / MONTHLY_BUDGET_USD) * 100;

  let recommendation = "On track — within budget";
  if (percentUsed > 90) recommendation = "CRITICAL — near budget limit. Switch to economy models.";
  else if (percentUsed > 75) recommendation = "WARNING — approaching budget. Consider throttling premium models.";
  else if (projected > MONTHLY_BUDGET_USD * 1.2) recommendation = "CAUTION — projected to exceed budget by month end";

  return {
    monthlyBudget: MONTHLY_BUDGET_USD,
    monthlySpend: Math.round(spent * 100) / 100,
    percentUsed: Math.round(percentUsed * 10) / 10,
    projectedMonthly: Math.round(projected * 100) / 100,
    overBudget: spent > MONTHLY_BUDGET_USD,
    recommendation,
  };
}
