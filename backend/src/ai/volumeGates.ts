/**
 * Volume-Gated Deployment — AI features activate based on load volume, NOT calendar dates.
 *
 * Checks the rolling 30-day load count and determines which AI features
 * should be active. Below the threshold, the system uses manual workflows.
 *
 * Gates:
 *   Gate 0: 0-150   loads/month → Manual operations only (cron jobs OK, no AI)
 *   Gate 1: 150-450 loads/month → AI-assisted tools (email classifier, OCR, check-call, briefing)
 *   Gate 2: 450-900 loads/month → Intelligent automation (rate quoting, load matching, exceptions)
 *   Gate 3: 900+    loads/month → Autonomous operations (auto-dispatch, voice agent)
 */

import { prisma } from "../config/database";

// ─── Gate Definitions ───────────────────────────────────────────────────────

export enum Gate {
  MANUAL = 0,
  AI_TOOLS = 1,
  INTELLIGENT_AUTOMATION = 2,
  AUTONOMOUS = 3,
}

export const GATE_THRESHOLDS: Record<Gate, number> = {
  [Gate.MANUAL]: 0,
  [Gate.AI_TOOLS]: 150,
  [Gate.INTELLIGENT_AUTOMATION]: 450,
  [Gate.AUTONOMOUS]: 900,
};

// Which features are available at each gate
export const GATE_FEATURES: Record<Gate, string[]> = {
  [Gate.MANUAL]: [
    "fmcsa_monitor",
    "insurance_checker",
    "scorecard_calc",
    "rate_card_gen",
  ],
  [Gate.AI_TOOLS]: [
    "email_classifier",
    "checkcall_parser",
    "document_ocr",
    "morning_briefing",
    "ai_usage_dashboard",
  ],
  [Gate.INTELLIGENT_AUTOMATION]: [
    "rate_quoting",
    "load_matching",
    "exception_detection",
    "quick_pay_evaluator",
    "carrier_outreach",
  ],
  [Gate.AUTONOMOUS]: [
    "auto_dispatch",
    "auto_quick_pay",
    "voice_agent",
    "predictive_cashflow",
    "auto_qbr",
  ],
};

// ─── Load Volume Check ──────────────────────────────────────────────────────

let cachedVolume: { count: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 300_000; // 5 minutes

/**
 * Get the rolling 30-day load count. Cached for 5 minutes.
 */
export async function getMonthlyLoadCount(): Promise<number> {
  const now = Date.now();
  if (cachedVolume && now - cachedVolume.timestamp < CACHE_TTL_MS) {
    return cachedVolume.count;
  }

  const thirtyDaysAgo = new Date(now - 30 * 86_400_000);
  const count = await prisma.load.count({
    where: { createdAt: { gte: thirtyDaysAgo } },
  });

  cachedVolume = { count, timestamp: now };
  return count;
}

/**
 * Determine the current deployment gate based on load volume.
 */
export async function getCurrentGate(): Promise<Gate> {
  const count = await getMonthlyLoadCount();

  if (count >= GATE_THRESHOLDS[Gate.AUTONOMOUS]) return Gate.AUTONOMOUS;
  if (count >= GATE_THRESHOLDS[Gate.INTELLIGENT_AUTOMATION]) return Gate.INTELLIGENT_AUTOMATION;
  if (count >= GATE_THRESHOLDS[Gate.AI_TOOLS]) return Gate.AI_TOOLS;
  return Gate.MANUAL;
}

/**
 * Check if a specific feature is unlocked at the current volume.
 */
export async function isFeatureUnlocked(featureName: string): Promise<boolean> {
  const currentGate = await getCurrentGate();

  for (let gate = Gate.MANUAL; gate <= currentGate; gate++) {
    if (GATE_FEATURES[gate as Gate]?.includes(featureName)) {
      return true;
    }
  }
  return false;
}

/**
 * Get full gate status for dashboard display.
 */
export async function getGateStatus(): Promise<{
  currentVolume: number;
  currentGate: Gate;
  gateName: string;
  unlockedFeatures: string[];
  nextGate: { gate: Gate; name: string; threshold: number; loadsNeeded: number } | null;
  allGates: Array<{
    gate: Gate;
    name: string;
    threshold: number;
    unlocked: boolean;
    features: string[];
  }>;
}> {
  const volume = await getMonthlyLoadCount();
  const gate = await getCurrentGate();

  const gateNames: Record<Gate, string> = {
    [Gate.MANUAL]: "Manual Operations",
    [Gate.AI_TOOLS]: "AI-Assisted Tools",
    [Gate.INTELLIGENT_AUTOMATION]: "Intelligent Automation",
    [Gate.AUTONOMOUS]: "Autonomous Operations",
  };

  // Collect all unlocked features
  const unlocked: string[] = [];
  for (let g = Gate.MANUAL; g <= gate; g++) {
    unlocked.push(...(GATE_FEATURES[g as Gate] ?? []));
  }

  // Next gate info
  const nextGateLevel = gate < Gate.AUTONOMOUS ? ((gate + 1) as Gate) : null;
  const nextGate = nextGateLevel !== null
    ? {
        gate: nextGateLevel,
        name: gateNames[nextGateLevel],
        threshold: GATE_THRESHOLDS[nextGateLevel],
        loadsNeeded: GATE_THRESHOLDS[nextGateLevel] - volume,
      }
    : null;

  return {
    currentVolume: volume,
    currentGate: gate,
    gateName: gateNames[gate],
    unlockedFeatures: unlocked,
    nextGate,
    allGates: [Gate.MANUAL, Gate.AI_TOOLS, Gate.INTELLIGENT_AUTOMATION, Gate.AUTONOMOUS].map((g) => ({
      gate: g,
      name: gateNames[g as Gate],
      threshold: GATE_THRESHOLDS[g as Gate],
      unlocked: g <= gate,
      features: GATE_FEATURES[g as Gate],
    })),
  };
}

// ─── Clear Cache (for testing) ──────────────────────────────────────────────

export function clearVolumeCache(): void {
  cachedVolume = null;
}
