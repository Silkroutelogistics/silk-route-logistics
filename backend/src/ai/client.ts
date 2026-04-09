/**
 * Centralized AI Client — All automation AI calls go through this module.
 *
 * Integrates security modules (PII redaction, sanitization, circuit breaker)
 * with the Anthropic SDK and cost tracking. Uses the existing aiRouter for
 * general queries, but provides direct Anthropic access for automation tasks
 * that need specific model selection (Haiku/Sonnet/Opus).
 *
 * Usage:
 *   import { callClaude } from "../ai/client";
 *   const result = await callClaude({ model: "haiku", ... });
 */

import { redact } from "../security/redactSensitiveData";
import { sanitizeForLLM } from "../security/sanitizeForLLM";
import { checkLimits, CircuitBreakerError } from "../security/circuitBreaker";
import { trackUsage } from "../services/aiRouter/costTracker";
import { prisma } from "../config/database";
import { log } from "../lib/logger";

// ─── Model Configuration ────────────────────────────────────────────────────

type ModelTier = "haiku" | "sonnet" | "opus";

interface ModelConfig {
  id: string;
  inputPer1M: number;
  outputPer1M: number;
}

const MODELS: Record<ModelTier, ModelConfig> = {
  haiku: { id: "claude-haiku-4-5-20251001", inputPer1M: 1.0, outputPer1M: 5.0 },
  sonnet: { id: "claude-sonnet-4-5-20250514", inputPer1M: 3.0, outputPer1M: 15.0 },
  opus: { id: "claude-opus-4-6-20250715", inputPer1M: 5.0, outputPer1M: 25.0 },
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClaudeCallOptions {
  model: ModelTier;
  system: string;
  userMessage: string;
  functionName: string;
  loadId?: string;
  carrierId?: string;
  maxTokens?: number;
  temperature?: number;
  parentTaskId?: string;
  chainDepth?: number;
  eventSourceId?: string;
  /** Skip PII redaction (e.g., when input is already internal structured data) */
  skipRedaction?: boolean;
  /** Skip sanitization (e.g., trusted internal data) */
  skipSanitize?: boolean;
}

export interface ClaudeCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  model: string;
}

// ─── Main Call Function ─────────────────────────────────────────────────────

export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // 1. Circuit breaker checks (rate limit, chain depth, dedup, budget)
  const limitsResult = await checkLimits({
    functionName: opts.functionName,
    parentTaskId: opts.parentTaskId,
    chainDepth: opts.chainDepth ?? 0,
    eventSourceId: opts.eventSourceId,
  });

  if (limitsResult.warnings.length > 0) {
    log.warn({ data: limitsResult.warnings }, `[AIClient] Warnings for ${opts.functionName}:`);
  }

  // 2. Security: redact PII and sanitize input
  let processedMessage = opts.userMessage;
  if (!opts.skipRedaction) {
    processedMessage = redact(processedMessage);
  }
  if (!opts.skipSanitize) {
    processedMessage = sanitizeForLLM(processedMessage, {
      maxLength: 8000,
      stripHtml: true,
      wrapAsUntrusted: false,
    });
  }

  // 3. Call Anthropic API
  const modelConfig = MODELS[opts.model];
  const startTime = Date.now();

  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 30000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelConfig.id,
        system: opts.system,
        messages: [{ role: "user", content: processedMessage }],
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.2,
      }),
      signal: ac.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as any;
    const latencyMs = Date.now() - startTime;
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costUsd =
      (inputTokens * modelConfig.inputPer1M + outputTokens * modelConfig.outputPer1M) / 1_000_000;

    const content = data.content?.[0]?.text ?? "";

    // 4. Track usage
    await trackUsage({
      provider: "anthropic",
      model: modelConfig.id,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      queryType: opts.functionName,
      source: "automation",
      success: true,
      userId: undefined,
    });

    return { content, inputTokens, outputTokens, costUsd, latencyMs, model: modelConfig.id };
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    // Track failure
    await trackUsage({
      provider: "anthropic",
      model: modelConfig.id,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs,
      queryType: opts.functionName,
      source: "automation",
      success: false,
      errorType: err instanceof Error ? err.message.slice(0, 100) : "Unknown error",
    });

    throw err;
  }
}

// ─── Log Automation Event ───────────────────────────────────────────────────

export async function logAutomationEvent(event: {
  type: string;
  source: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
  actionTaken: string;
}): Promise<void> {
  try {
    await prisma.automationEvent.create({
      data: {
        type: event.type,
        source: event.source,
        entityType: event.entityType,
        entityId: event.entityId,
        data: (event.data ?? {}) as any,
        actionTaken: event.actionTaken,
      },
    });
  } catch (err) {
    log.error({ err: err }, "[AIClient] Failed to log automation event:");
  }
}
