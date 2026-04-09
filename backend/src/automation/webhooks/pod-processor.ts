/**
 * POD/Document Processor — Sonnet vision-powered document data extraction.
 *
 * Extracts structured data from uploaded BOLs, PODs, and insurance certs
 * using Claude's vision capabilities. Fallback creates a manual data entry task.
 *
 * Gate: Phase 1 (150+ loads/month). Below threshold, creates manual task only.
 */

import { logAutomationEvent } from "../../ai/client";
import { trackUsage } from "../../services/aiRouter/costTracker";
import { checkLimits } from "../../security/circuitBreaker";
import fs from "fs";
import path from "path";
import { log } from "../../lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DocumentType = "BOL" | "POD" | "INSURANCE_CERT" | "RATE_CONFIRMATION" | "UNKNOWN";

export interface DocumentExtractionResult {
  documentType: DocumentType;
  confidence: number;
  extractedData: Record<string, unknown>;
  warnings: string[];
  fallbackUsed: boolean;
  aiCostUsd: number;
  requiresManualReview: boolean;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const PROMPT_PATH = path.join(__dirname, "../../ai/prompts/document-ocr.md");
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  }
  return systemPrompt;
}

// ─── Manual Fallback ────────────────────────────────────────────────────────

function createManualTask(loadId: string, documentUrl: string, reason: string): DocumentExtractionResult {
  return {
    documentType: "UNKNOWN",
    confidence: 0,
    extractedData: {
      manualReviewRequired: true,
      documentUrl,
      loadId,
      reason,
    },
    warnings: [`Manual data entry required: ${reason}`],
    fallbackUsed: true,
    aiCostUsd: 0,
    requiresManualReview: true,
  };
}

// ─── Main Extraction Function ───────────────────────────────────────────────

/**
 * Process an uploaded document using Sonnet vision.
 *
 * @param imageBase64 - Base64-encoded image data
 * @param mediaType - MIME type (image/jpeg, image/png, application/pdf)
 */
export async function processDocument(opts: {
  imageBase64: string;
  mediaType: string;
  loadId: string;
  carrierId?: string;
  documentUrl?: string;
}): Promise<DocumentExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return createManualTask(opts.loadId, opts.documentUrl ?? "", "ANTHROPIC_API_KEY not configured");
  }

  try {
    // Circuit breaker check
    await checkLimits({
      functionName: "document_ocr",
      eventSourceId: `doc:${opts.loadId}:${Date.now()}`,
    });

    const startTime = Date.now();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 45000); // Longer timeout for vision

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        system: getSystemPrompt(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: opts.mediaType,
                  data: opts.imageBase64,
                },
              },
              {
                type: "text",
                text: "Extract all structured data from this freight document. Return JSON only.",
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
      signal: ac.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic Vision API error ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as any;
    const latencyMs = Date.now() - startTime;
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costUsd = (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000; // Sonnet pricing

    const content = data.content?.[0]?.text ?? "";

    // Track usage
    await trackUsage({
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      queryType: "document_ocr",
      source: "automation",
      success: true,
    });

    // Parse response
    const parsed = JSON.parse(content);

    const result: DocumentExtractionResult = {
      documentType: parsed.documentType ?? "UNKNOWN",
      confidence: parsed.confidence ?? 0.7,
      extractedData: parsed.extractedData ?? {},
      warnings: parsed.warnings ?? [],
      fallbackUsed: false,
      aiCostUsd: costUsd,
      requiresManualReview: (parsed.confidence ?? 0.7) < 0.7,
    };

    await logAutomationEvent({
      type: "document_processed",
      source: "webhook",
      entityType: "load",
      entityId: opts.loadId,
      data: {
        documentType: result.documentType,
        confidence: result.confidence,
        carrierId: opts.carrierId,
        warningCount: result.warnings.length,
        fallbackUsed: false,
      },
      actionTaken: result.requiresManualReview ? "manual_review_flagged" : "data_extracted",
    });

    return result;
  } catch (err) {
    log.error({ err }, "[PODProcessor] AI call failed, creating manual task:");

    await logAutomationEvent({
      type: "document_processed",
      source: "webhook",
      entityType: "load",
      entityId: opts.loadId,
      data: {
        carrierId: opts.carrierId,
        fallbackUsed: true,
        error: err instanceof Error ? err.message : "Unknown",
      },
      actionTaken: "manual_task_created",
    });

    return createManualTask(opts.loadId, opts.documentUrl ?? "", err instanceof Error ? err.message : "AI processing failed");
  }
}
