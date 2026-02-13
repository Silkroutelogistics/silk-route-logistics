import { prisma } from "../../config/database";
import { Prisma } from "@prisma/client";

/**
 * A/B Tester — Controlled experiment framework for AI model variants.
 *
 * Lets us compare two rate-prediction strategies, two matching algorithms,
 * or two recommendation approaches side by side with statistical rigor.
 *
 * Uses SystemMetric to track per-variant metrics and AILearningLog for
 * assignment logging.
 */

const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

interface Experiment {
  id: string;
  name: string;
  variants: string[];
  trafficSplit: number[]; // e.g., [50, 50] or [70, 30]
  status: "RUNNING" | "CONCLUDED";
  startedAt: Date;
}

// In-memory experiment registry (seeded at startup)
const experiments = new Map<string, Experiment>();

// ─── Register an Experiment ──────────────────────────────────────────────────

export function registerExperiment(
  name: string,
  variants: string[],
  trafficSplit?: number[]
): Experiment {
  const split = trafficSplit ?? variants.map(() => Math.round(100 / variants.length));
  const experiment: Experiment = {
    id: `exp_${name}_${Date.now()}`,
    name,
    variants,
    trafficSplit: split,
    status: "RUNNING",
    startedAt: new Date(),
  };

  experiments.set(name, experiment);
  console.log(`[ABTester] Registered experiment: ${name} — variants: ${variants.join(", ")}`);
  return experiment;
}

// ─── Assign a Variant ────────────────────────────────────────────────────────

export function assignVariant(experimentName: string, entityId: string): string {
  const exp = experiments.get(experimentName);
  if (!exp || exp.status !== "RUNNING") {
    return "control"; // Default if no experiment
  }

  // Deterministic assignment based on entityId hash
  const hash = simpleHash(entityId + exp.id);
  const bucket = hash % 100;

  let cumulative = 0;
  for (let i = 0; i < exp.variants.length; i++) {
    cumulative += exp.trafficSplit[i];
    if (bucket < cumulative) {
      return exp.variants[i];
    }
  }

  return exp.variants[0];
}

// ─── Record Experiment Outcome ───────────────────────────────────────────────

export async function recordOutcome(
  experimentName: string,
  variant: string,
  metric: string,
  value: number,
  entityId?: string
): Promise<void> {
  await prisma.aILearningLog.create({
    data: {
      serviceName: "ab_tester",
      eventType: "EXPERIMENT_OUTCOME",
      dataJson: toJson({
        experiment: experimentName,
        variant,
        metric,
        value,
        entityId: entityId ?? null,
      }),
      outcome: variant,
      confidence: value,
    },
  }).catch((err) => console.error("[ABTester] Failed to record:", err.message));
}

// ─── Get Experiment Results ──────────────────────────────────────────────────

export async function getExperimentResults(experimentName: string): Promise<{
  experiment: string;
  variants: Array<{
    name: string;
    sampleSize: number;
    avgMetric: number;
    conversionRate: number;
  }>;
  winner: string | null;
  confident: boolean;
}> {
  const logs = await prisma.aILearningLog.findMany({
    where: {
      serviceName: "ab_tester",
      eventType: "EXPERIMENT_OUTCOME",
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  // Filter to this experiment
  const expLogs = logs.filter((l) => {
    const data = l.dataJson as Record<string, unknown>;
    return data?.experiment === experimentName;
  });

  // Group by variant
  const variantMap = new Map<string, { values: number[]; conversions: number }>();

  for (const log of expLogs) {
    const data = log.dataJson as Record<string, unknown>;
    const variant = String(data.variant ?? "unknown");
    const value = Number(data.value ?? 0);

    if (!variantMap.has(variant)) {
      variantMap.set(variant, { values: [], conversions: 0 });
    }
    const entry = variantMap.get(variant)!;
    entry.values.push(value);
    if (value > 0) entry.conversions++;
  }

  const variants = [...variantMap.entries()].map(([name, data]) => ({
    name,
    sampleSize: data.values.length,
    avgMetric:
      data.values.length > 0
        ? Math.round((data.values.reduce((s, v) => s + v, 0) / data.values.length) * 100) / 100
        : 0,
    conversionRate:
      data.values.length > 0
        ? Math.round((data.conversions / data.values.length) * 1000) / 1000
        : 0,
  }));

  // Determine winner (simple: highest avg metric with min 30 samples)
  const eligible = variants.filter((v) => v.sampleSize >= 30);
  let winner: string | null = null;
  let confident = false;

  if (eligible.length >= 2) {
    eligible.sort((a, b) => b.avgMetric - a.avgMetric);
    winner = eligible[0].name;
    // Simple significance: >10% lift with >30 samples each
    const lift = (eligible[0].avgMetric - eligible[1].avgMetric) / Math.max(0.01, eligible[1].avgMetric);
    confident = lift > 0.1;
  }

  return { experiment: experimentName, variants, winner, confident };
}

// ─── List Active Experiments ─────────────────────────────────────────────────

export function listExperiments(): Experiment[] {
  return [...experiments.values()];
}

// ─── Conclude an Experiment ──────────────────────────────────────────────────

export function concludeExperiment(experimentName: string): boolean {
  const exp = experiments.get(experimentName);
  if (!exp) return false;
  exp.status = "CONCLUDED";
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
