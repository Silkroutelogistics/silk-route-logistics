import {
  AIModel,
  QueryType,
  QUERY_TYPE_TIER,
  getAvailableProviders,
  getModelsForTier,
  getModelById,
} from "./providers";
import { trackUsage } from "./costTracker";

/**
 * AI Router — Intelligent multi-provider routing with automatic fallback.
 *
 * Selects the best model for each query type based on:
 *   - Required capability tier (economy/standard/premium)
 *   - Provider availability (API key present)
 *   - Cost optimization (prefer cheaper when quality is comparable)
 *   - Automatic fallback if primary provider fails
 *
 * All calls are tracked through the cost tracker for budget monitoring.
 */

export interface AIRouterRequest {
  queryType: QueryType;
  messages: Array<{ role: string; content: string }>;
  preferredProvider?: string;
  preferredModel?: string;
  maxTokens?: number;
  temperature?: number;
  userId?: string;
  source?: string;
}

export interface AIRouterResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  fallback: boolean;
}

// ─── Select Model ────────────────────────────────────────────────────────────

function selectModel(queryType: QueryType, preferredModel?: string): AIModel[] {
  // If user specifies a model, try it first
  if (preferredModel) {
    const model = getModelById(preferredModel);
    if (model) {
      const fallbacks = getModelsForTier(QUERY_TYPE_TIER[queryType]).filter(
        (m) => m.id !== preferredModel
      );
      return [model, ...fallbacks];
    }
  }

  // Otherwise, select by tier for query type
  const tier = QUERY_TYPE_TIER[queryType];
  const models = getModelsForTier(tier);

  if (models.length === 0) {
    // Fallback to any available model
    const allModels = getAvailableProviders().flatMap((p) => p.models);
    return allModels.sort((a, b) => a.costPer1kInput - b.costPer1kInput);
  }

  // Sort by cost (cheapest first within the tier)
  return models.sort((a, b) => a.costPer1kInput - b.costPer1kInput);
}

// ─── Call OpenAI ─────────────────────────────────────────────────────────────

async function callOpenAI(
  model: AIModel,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ─── Call Anthropic ──────────────────────────────────────────────────────────

async function callAnthropic(
  model: AIModel,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Convert messages: Anthropic needs system separate
  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await fetch(`https://api.anthropic.com/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.id,
      system: systemMsg?.content ?? "",
      messages: userMessages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;
  return {
    content: data.content?.[0]?.text ?? "",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ─── Provider Call Dispatcher ────────────────────────────────────────────────

async function callProvider(
  model: AIModel,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  switch (model.provider) {
    case "openai":
      return callOpenAI(model, messages, maxTokens, temperature);
    case "anthropic":
      return callAnthropic(model, messages, maxTokens, temperature);
    default:
      throw new Error(`Unknown provider: ${model.provider}`);
  }
}

// ─── Main Router Function ────────────────────────────────────────────────────

export async function routeAIQuery(req: AIRouterRequest): Promise<AIRouterResponse> {
  const models = selectModel(req.queryType, req.preferredModel);

  if (models.length === 0) {
    throw new Error("No AI models available. Check API keys.");
  }

  let lastError: Error | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const startTime = Date.now();

    try {
      const result = await callProvider(
        model,
        req.messages,
        req.maxTokens ?? 2000,
        req.temperature ?? 0.3
      );

      const latencyMs = Date.now() - startTime;
      const costUsd =
        (result.inputTokens * model.costPer1kInput +
          result.outputTokens * model.costPer1kOutput) /
        1000;

      // Track usage
      await trackUsage({
        provider: model.provider,
        model: model.id,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        latencyMs,
        queryType: req.queryType,
        source: req.source ?? "ai_router",
        success: true,
        userId: req.userId,
      });

      return {
        content: result.content,
        model: model.id,
        provider: model.provider,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        latencyMs,
        fallback: i > 0,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const latencyMs = Date.now() - startTime;

      console.error(
        `[AIRouter] ${model.provider}/${model.id} failed (attempt ${i + 1}/${models.length}):`,
        lastError.message
      );

      // Track the failure
      await trackUsage({
        provider: model.provider,
        model: model.id,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        queryType: req.queryType,
        source: req.source ?? "ai_router",
        success: false,
        errorType: lastError.message.slice(0, 100),
        userId: req.userId,
      });

      // Try next model
      continue;
    }
  }

  throw new Error(
    `All AI providers failed for ${req.queryType}. Last error: ${lastError?.message}`
  );
}

// ─── Convenience Wrappers ────────────────────────────────────────────────────

export async function quickAI(
  prompt: string,
  queryType: QueryType = "general_chat",
  systemPrompt?: string
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const result = await routeAIQuery({ queryType, messages });
  return result.content;
}
