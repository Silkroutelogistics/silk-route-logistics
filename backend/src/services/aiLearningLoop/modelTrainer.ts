import { prisma } from "../../config/database";
import { runRateLearningCycle } from "../rateIntelligenceService";
import { runCarrierLearningCycle } from "../carrierIntelligenceService";
import { runLaneLearningCycle } from "../laneOptimizerService";
import { runCustomerLearningCycle } from "../customerIntelligenceService";
import { runComplianceForecastCycle } from "../complianceForecastService";
import { processQueue } from "./feedbackCollector";

/**
 * Model Trainer — Orchestrator for all AI learning cycles.
 *
 * Runs daily, weekly, or on-demand to retrain every intelligence model
 * in the system. Coordinates order-of-operations (drain queue first,
 * then train rate → carrier → lane → customer → compliance).
 */

interface TrainingResult {
  service: string;
  success: boolean;
  durationMs: number;
  summary: Record<string, unknown>;
  error?: string;
}

// ─── Full Training Cycle ─────────────────────────────────────────────────────

export async function runFullTrainingCycle(): Promise<{
  totalDurationMs: number;
  results: TrainingResult[];
  queueStats: { processed: number; failed: number; dead: number };
}> {
  const startTime = Date.now();
  console.log("[ModelTrainer] Starting full training cycle...");

  // Step 1: Drain the feedback queue so data is current
  let queueStats = { processed: 0, failed: 0, dead: 0 };
  try {
    queueStats = await processQueue();
    console.log(`[ModelTrainer] Queue drained: ${queueStats.processed} processed, ${queueStats.failed} failed, ${queueStats.dead} dead`);
  } catch (err) {
    console.error("[ModelTrainer] Queue drain failed:", err);
  }

  // Step 2: Run each learning cycle in sequence (order matters — rates first)
  const results: TrainingResult[] = [];

  const cycles: Array<{ name: string; fn: () => Promise<unknown> }> = [
    { name: "rate_intelligence", fn: runRateLearningCycle },
    { name: "carrier_intelligence", fn: runCarrierLearningCycle },
    { name: "lane_optimizer", fn: runLaneLearningCycle },
    { name: "customer_intelligence", fn: runCustomerLearningCycle },
    { name: "compliance_forecast", fn: runComplianceForecastCycle },
  ];

  for (const cycle of cycles) {
    const cycleStart = Date.now();
    try {
      const summary = await cycle.fn();
      results.push({
        service: cycle.name,
        success: true,
        durationMs: Date.now() - cycleStart,
        summary: summary as Record<string, unknown>,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        service: cycle.name,
        success: false,
        durationMs: Date.now() - cycleStart,
        summary: {},
        error: errorMsg,
      });
      console.error(`[ModelTrainer] ${cycle.name} failed:`, errorMsg);
    }
  }

  const totalDurationMs = Date.now() - startTime;

  // Log the master training cycle
  await prisma.aILearningCycle.create({
    data: {
      serviceName: "model_trainer",
      cycleType: "FULL",
      dataPointsProcessed: results.reduce(
        (sum, r) => sum + ((r.summary as any)?.dataPoints ?? (r.summary as any)?.dataPointsProcessed ?? 0),
        0
      ),
      modelsUpdated: results.filter((r) => r.success).length,
      durationMs: totalDurationMs,
      improvements: JSON.parse(JSON.stringify(
        results.map((r) => ({ service: r.service, success: r.success, duration: r.durationMs }))
      )),
      status: results.every((r) => r.success) ? "COMPLETED" : "PARTIAL",
      completedAt: new Date(),
    },
  });

  console.log(`[ModelTrainer] Full cycle complete in ${totalDurationMs}ms — ${results.filter((r) => r.success).length}/${results.length} services succeeded`);

  return { totalDurationMs, results, queueStats };
}

// ─── Get Training History ────────────────────────────────────────────────────

export async function getTrainingHistory(limit = 20) {
  return prisma.aILearningCycle.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

// ─── Get Latest Training Status ──────────────────────────────────────────────

export async function getLatestTrainingStatus() {
  const latest = await prisma.aILearningCycle.findFirst({
    where: { serviceName: "model_trainer" },
    orderBy: { startedAt: "desc" },
  });

  const perService = await prisma.aILearningCycle.findMany({
    where: { serviceName: { not: "model_trainer" } },
    orderBy: { startedAt: "desc" },
    distinct: ["serviceName"],
  });

  return {
    lastFullCycle: latest,
    serviceStatus: perService.map((s) => ({
      service: s.serviceName,
      lastRun: s.startedAt,
      status: s.status,
      dataPoints: s.dataPointsProcessed,
      duration: s.durationMs,
    })),
  };
}
