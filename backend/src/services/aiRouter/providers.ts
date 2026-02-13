/**
 * AI Provider Definitions — Configuration for all supported AI providers.
 *
 * Each provider has cost parameters, rate limits, and capabilities.
 * The router uses this to select the best provider for each query type.
 */

export interface AIProvider {
  name: string;
  models: AIModel[];
  apiKeyEnv: string;
  baseUrl: string;
  enabled: boolean;
}

export interface AIModel {
  id: string;
  provider: string;
  displayName: string;
  costPer1kInput: number;   // USD per 1000 input tokens
  costPer1kOutput: number;  // USD per 1000 output tokens
  maxTokens: number;
  latencyMs: number;        // Estimated avg latency
  capabilities: string[];   // e.g., "chat", "completion", "vision", "embedding"
  tier: "economy" | "standard" | "premium";
}

export type QueryType =
  | "rate_prediction"
  | "carrier_match"
  | "email_classification"
  | "email_extraction"
  | "customer_insights"
  | "lane_analysis"
  | "risk_assessment"
  | "general_chat"
  | "document_analysis";

// ─── Provider Registry ───────────────────────────────────────────────────────

export const PROVIDERS: AIProvider[] = [
  {
    name: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    enabled: true,
    models: [
      {
        id: "gpt-4o",
        provider: "openai",
        displayName: "GPT-4o",
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
        maxTokens: 128000,
        latencyMs: 2000,
        capabilities: ["chat", "completion", "vision"],
        tier: "standard",
      },
      {
        id: "gpt-4o-mini",
        provider: "openai",
        displayName: "GPT-4o Mini",
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        maxTokens: 128000,
        latencyMs: 800,
        capabilities: ["chat", "completion"],
        tier: "economy",
      },
      {
        id: "gpt-4-turbo",
        provider: "openai",
        displayName: "GPT-4 Turbo",
        costPer1kInput: 0.01,
        costPer1kOutput: 0.03,
        maxTokens: 128000,
        latencyMs: 5000,
        capabilities: ["chat", "completion", "vision"],
        tier: "premium",
      },
    ],
  },
  {
    name: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
    enabled: true,
    models: [
      {
        id: "claude-3.5-sonnet",
        provider: "anthropic",
        displayName: "Claude 3.5 Sonnet",
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        maxTokens: 200000,
        latencyMs: 2000,
        capabilities: ["chat", "completion", "vision"],
        tier: "standard",
      },
      {
        id: "claude-3-haiku",
        provider: "anthropic",
        displayName: "Claude 3 Haiku",
        costPer1kInput: 0.00025,
        costPer1kOutput: 0.00125,
        maxTokens: 200000,
        latencyMs: 500,
        capabilities: ["chat", "completion"],
        tier: "economy",
      },
      {
        id: "claude-3-opus",
        provider: "anthropic",
        displayName: "Claude 3 Opus",
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
        maxTokens: 200000,
        latencyMs: 8000,
        capabilities: ["chat", "completion", "vision"],
        tier: "premium",
      },
    ],
  },
];

// ─── Query Type → Recommended Model Tier ─────────────────────────────────────

export const QUERY_TYPE_TIER: Record<QueryType, "economy" | "standard" | "premium"> = {
  rate_prediction: "economy",
  carrier_match: "economy",
  email_classification: "economy",
  email_extraction: "standard",
  customer_insights: "standard",
  lane_analysis: "standard",
  risk_assessment: "standard",
  general_chat: "standard",
  document_analysis: "premium",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAvailableProviders(): AIProvider[] {
  return PROVIDERS.filter((p) => {
    if (!p.enabled) return false;
    const key = process.env[p.apiKeyEnv];
    return key && key.length > 10;
  });
}

export function getModelById(modelId: string): AIModel | undefined {
  for (const provider of PROVIDERS) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model;
  }
  return undefined;
}

export function getModelsForTier(tier: "economy" | "standard" | "premium"): AIModel[] {
  const available = getAvailableProviders();
  return available.flatMap((p) => p.models.filter((m) => m.tier === tier));
}
