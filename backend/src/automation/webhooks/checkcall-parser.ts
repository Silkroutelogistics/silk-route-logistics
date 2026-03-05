/**
 * Check-Call Parser — Haiku-powered carrier reply parsing.
 *
 * Extracts location, ETA, delay signals, and status from carrier check-call
 * replies with a pattern-matching fallback.
 *
 * Gate: Phase 1 (150+ loads/month). Below threshold, uses fallback only.
 */

import { callClaude, logAutomationEvent } from "../../ai/client";
import { sanitizeExternalMessage } from "../../security/sanitizeForLLM";
import { redact } from "../../security/redactSensitiveData";
import fs from "fs";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CheckCallData {
  currentCity: string | null;
  currentState: string | null;
  estimatedETA: string | null;
  delayDetected: boolean;
  delayReason: string | null;
  loadStatus: "LOADED" | "IN_TRANSIT" | "AT_DELIVERY" | "DELIVERED" | "ISSUE";
  notes: string;
  confidence: number;
  fallbackUsed: boolean;
  aiCostUsd: number;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const PROMPT_PATH = path.join(__dirname, "../../ai/prompts/checkcall-parser.md");
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  }
  return systemPrompt;
}

// ─── Pattern-Based Fallback ─────────────────────────────────────────────────

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

const STATE_CODES = new Set(Object.values(US_STATES));

function parseByPatterns(text: string): CheckCallData {
  const lower = text.toLowerCase();
  let city: string | null = null;
  let state: string | null = null;

  // Try to find "City, ST" pattern
  const cityStateMatch = text.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
  if (cityStateMatch && STATE_CODES.has(cityStateMatch[2])) {
    city = cityStateMatch[1].trim();
    state = cityStateMatch[2];
  }

  // Try state name match
  if (!state) {
    for (const [name, code] of Object.entries(US_STATES)) {
      if (lower.includes(name)) {
        state = code;
        break;
      }
    }
  }

  // Delay detection
  const delayKeywords = /\b(delay|late|behind|breakdown|flat tire|traffic|accident|weather|detention|stuck|waiting)\b/i;
  const delayDetected = delayKeywords.test(text);

  // Status detection
  let loadStatus: CheckCallData["loadStatus"] = "IN_TRANSIT";
  if (/\b(delivered|dropped|unloaded|signed)\b/i.test(text)) loadStatus = "DELIVERED";
  else if (/\b(at delivery|at receiver|at consignee|at dock)\b/i.test(text)) loadStatus = "AT_DELIVERY";
  else if (/\b(loaded|picked up|departed|leaving)\b/i.test(text)) loadStatus = "LOADED";
  else if (delayDetected) loadStatus = "ISSUE";

  return {
    currentCity: city,
    currentState: state,
    estimatedETA: null,
    delayDetected,
    delayReason: delayDetected ? "Delay keywords detected — review manually" : null,
    loadStatus,
    notes: "Parsed by fallback rules — manual review recommended",
    confidence: city && state ? 0.5 : 0.3,
    fallbackUsed: true,
    aiCostUsd: 0,
  };
}

// ─── Main Parser Function ───────────────────────────────────────────────────

export async function parseCheckCallReply(opts: {
  replyText: string;
  loadId: string;
  carrierId: string;
}): Promise<CheckCallData> {
  const sanitized = sanitizeExternalMessage(opts.replyText, 2000);
  const redacted = redact(sanitized);

  try {
    const result = await callClaude({
      model: "haiku",
      system: getSystemPrompt(),
      userMessage: redacted,
      functionName: "checkcall_parser",
      loadId: opts.loadId,
      carrierId: opts.carrierId,
      eventSourceId: `checkcall:${opts.loadId}:${Date.now()}`,
      maxTokens: 256,
    });

    const parsed = JSON.parse(result.content);

    const data: CheckCallData = {
      currentCity: parsed.currentCity ?? null,
      currentState: parsed.currentState ?? null,
      estimatedETA: parsed.estimatedETA ?? null,
      delayDetected: parsed.delayDetected ?? false,
      delayReason: parsed.delayReason ?? null,
      loadStatus: parsed.loadStatus ?? "IN_TRANSIT",
      notes: parsed.notes ?? "",
      confidence: 0.85,
      fallbackUsed: false,
      aiCostUsd: result.costUsd,
    };

    await logAutomationEvent({
      type: "checkcall_parsed",
      source: "webhook",
      entityType: "load",
      entityId: opts.loadId,
      data: {
        city: data.currentCity,
        state: data.currentState,
        delayDetected: data.delayDetected,
        carrierId: opts.carrierId,
        fallbackUsed: false,
      },
      actionTaken: data.delayDetected ? "delay_flagged" : "status_updated",
    });

    return data;
  } catch (err) {
    console.error("[CheckCallParser] AI call failed, using fallback:", err instanceof Error ? err.message : err);

    const fallback = parseByPatterns(opts.replyText);

    await logAutomationEvent({
      type: "checkcall_parsed",
      source: "webhook",
      entityType: "load",
      entityId: opts.loadId,
      data: {
        carrierId: opts.carrierId,
        fallbackUsed: true,
        error: err instanceof Error ? err.message : "Unknown",
      },
      actionTaken: "fallback_used",
    });

    return fallback;
  }
}
