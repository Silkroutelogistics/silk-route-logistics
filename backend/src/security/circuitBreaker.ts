/**
 * Circuit Breaker — Prevents runaway AI loops, enforces rate limits,
 * deduplicates events, and enforces monthly cost caps.
 *
 * Every AI call path must pass through checkLimits() before reaching the API.
 */

import { prisma } from "../config/database";

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_CHAIN_DEPTH = parseInt(process.env.AI_MAX_CHAIN_DEPTH ?? "3", 10);
const HOURLY_RATE_LIMIT = parseInt(process.env.AI_HOURLY_RATE_LIMIT ?? "100", 10);
const DEDUP_WINDOW_MS = parseInt(process.env.AI_DEDUP_WINDOW_MS ?? "300000", 10); // 5 min
const MONTHLY_BUDGET_USD = parseFloat(process.env.AI_MONTHLY_BUDGET ?? "50");
const BUDGET_ALERT_THRESHOLD = 0.8; // 80%
const BUDGET_HARD_STOP = 1.0; // 100%

// ─── In-Memory State ────────────────────────────────────────────────────────

// Hourly call counter: resets every hour
let hourlyCallCount = 0;
let hourlyResetTime = Date.now() + 3_600_000;

// Event deduplication cache: eventKey → timestamp
const recentEvents = new Map<string, number>();

// Periodic cleanup of dedup cache (every 10 minutes)
setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  recentEvents.forEach((ts, key) => {
    if (ts < cutoff) recentEvents.delete(key);
  });
}, 600_000);

// ─── Errors ─────────────────────────────────────────────────────────────────

export class CircuitBreakerError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "CircuitBreakerError";
    this.code = code;
  }
}

// ─── Check Limits ───────────────────────────────────────────────────────────

export interface CheckLimitsInput {
  functionName: string;
  parentTaskId?: string;
  chainDepth?: number;
  eventSourceId?: string; // For deduplication (e.g., email ID, load ID + event type)
}

export interface CheckLimitsResult {
  allowed: boolean;
  warnings: string[];
}

/**
 * Validates all circuit breaker conditions before an AI call.
 * Throws CircuitBreakerError if any limit is exceeded.
 */
export async function checkLimits(input: CheckLimitsInput): Promise<CheckLimitsResult> {
  const warnings: string[] = [];

  // 1. Chain depth check — prevent recursive AI loops
  const depth = input.chainDepth ?? 0;
  if (depth >= MAX_CHAIN_DEPTH) {
    throw new CircuitBreakerError(
      `AI chain depth ${depth} exceeds max ${MAX_CHAIN_DEPTH} for ${input.functionName}. ` +
        "Possible recursive loop detected.",
      "CHAIN_DEPTH_EXCEEDED"
    );
  }

  // 2. Hourly rate limit
  const now = Date.now();
  if (now > hourlyResetTime) {
    hourlyCallCount = 0;
    hourlyResetTime = now + 3_600_000;
  }
  if (hourlyCallCount >= HOURLY_RATE_LIMIT) {
    throw new CircuitBreakerError(
      `Hourly AI rate limit (${HOURLY_RATE_LIMIT} calls/hour) exceeded. ` +
        `Current: ${hourlyCallCount}. Function: ${input.functionName}`,
      "HOURLY_RATE_LIMIT"
    );
  }

  // 3. Event deduplication
  if (input.eventSourceId) {
    const dedupKey = `${input.functionName}:${input.eventSourceId}`;
    const lastSeen = recentEvents.get(dedupKey);
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
      throw new CircuitBreakerError(
        `Duplicate event detected for ${input.functionName} with source ${input.eventSourceId}. ` +
          `Last processed ${Math.round((now - lastSeen) / 1000)}s ago (window: ${DEDUP_WINDOW_MS / 1000}s).`,
        "DUPLICATE_EVENT"
      );
    }
    recentEvents.set(dedupKey, now);
  }

  // 4. Monthly budget check
  try {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const result = await prisma.aIApiUsage.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
    });

    const monthlySpend = result._sum.costUsd ?? 0;
    const percentUsed = monthlySpend / MONTHLY_BUDGET_USD;

    if (percentUsed >= BUDGET_HARD_STOP) {
      throw new CircuitBreakerError(
        `Monthly AI budget ($${MONTHLY_BUDGET_USD}) exceeded. ` +
          `Spent: $${monthlySpend.toFixed(2)}. Function: ${input.functionName}`,
        "BUDGET_EXCEEDED"
      );
    }

    if (percentUsed >= BUDGET_ALERT_THRESHOLD) {
      warnings.push(
        `AI budget at ${(percentUsed * 100).toFixed(1)}% ` +
          `($${monthlySpend.toFixed(2)}/$${MONTHLY_BUDGET_USD})`
      );
    }
  } catch (err) {
    // If budget check fails (DB issue), log warning but don't block
    if (err instanceof CircuitBreakerError) throw err;
    console.error("[CircuitBreaker] Budget check failed:", err);
    warnings.push("Budget check unavailable — proceeding with caution");
  }

  // 5. Increment hourly counter (only after all checks pass)
  hourlyCallCount++;

  return { allowed: true, warnings };
}

// ─── Get Current Status ─────────────────────────────────────────────────────

export function getCircuitBreakerStatus(): {
  hourlyCallCount: number;
  hourlyRateLimit: number;
  maxChainDepth: number;
  dedupWindowMs: number;
  monthlyBudgetUsd: number;
  activeDeduplicationKeys: number;
} {
  return {
    hourlyCallCount,
    hourlyRateLimit: HOURLY_RATE_LIMIT,
    maxChainDepth: MAX_CHAIN_DEPTH,
    dedupWindowMs: DEDUP_WINDOW_MS,
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    activeDeduplicationKeys: recentEvents.size,
  };
}

// ─── Reset (for testing) ────────────────────────────────────────────────────

export function resetCircuitBreaker(): void {
  hourlyCallCount = 0;
  hourlyResetTime = Date.now() + 3_600_000;
  recentEvents.clear();
}
