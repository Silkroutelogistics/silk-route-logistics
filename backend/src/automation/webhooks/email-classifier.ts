/**
 * Email Classifier — Haiku-powered inbound email classification.
 *
 * Classifies inbound emails into categories (quote request, status inquiry,
 * check-call reply, document submission, etc.) with a rule-based fallback.
 *
 * Gate: Phase 1 (150+ loads/month). Below threshold, uses fallback only.
 */

import { callClaude, logAutomationEvent } from "../../ai/client";
import { sanitizeEmail } from "../../security/sanitizeForLLM";
import { redact } from "../../security/redactSensitiveData";
import { CircuitBreakerError } from "../../security/circuitBreaker";
import fs from "fs";
import path from "path";
import { log } from "../../lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EmailCategory =
  | "QUOTE_REQUEST"
  | "STATUS_INQUIRY"
  | "CHECK_CALL_REPLY"
  | "DOCUMENT_SUBMISSION"
  | "RATE_CONFIRMATION"
  | "INVOICE_INQUIRY"
  | "CARRIER_APPLICATION"
  | "COMPLAINT"
  | "GENERAL";

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  summary: string;
  urgency: "critical" | "high" | "normal" | "low";
  suggestedAction: string;
  fallbackUsed: boolean;
  aiCostUsd: number;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const PROMPT_PATH = path.join(__dirname, "../../ai/prompts/email-classifier.md");
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  }
  return systemPrompt;
}

// ─── Rule-Based Fallback ────────────────────────────────────────────────────

const KEYWORD_RULES: Array<{ keywords: RegExp; category: EmailCategory; urgency: "critical" | "high" | "normal" | "low" }> = [
  { keywords: /\b(quote|rate|pricing|price|how much|cost|estimate)\b/i, category: "QUOTE_REQUEST", urgency: "normal" },
  { keywords: /\b(where is|status|eta|tracking|update|when.*deliver|when.*arrive)\b/i, category: "STATUS_INQUIRY", urgency: "normal" },
  { keywords: /\b(check.?call|location|currently at|heading to|en route|I('?m| am) (at|in|near))\b/i, category: "CHECK_CALL_REPLY", urgency: "normal" },
  { keywords: /\b(bol|pod|proof of delivery|bill of lading|insurance cert|w-?9|attached|document|certificate)\b/i, category: "DOCUMENT_SUBMISSION", urgency: "normal" },
  { keywords: /\b(rate confirmation|rate con|accept|decline|counter.?offer)\b/i, category: "RATE_CONFIRMATION", urgency: "high" },
  { keywords: /\b(invoice|payment|billing|remit|pay|amount due|past due|overdue)\b/i, category: "INVOICE_INQUIRY", urgency: "normal" },
  { keywords: /\b(haul for|sign up|onboard|new carrier|register|apply|application)\b/i, category: "CARRIER_APPLICATION", urgency: "low" },
  { keywords: /\b(complaint|damage|claim|missing|lost|broken|unhappy|issue|problem)\b/i, category: "COMPLAINT", urgency: "high" },
];

function classifyByRules(subject: string, body: string): ClassificationResult {
  const text = `${subject} ${body}`.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.test(text)) {
      return {
        category: rule.category,
        confidence: 0.5,
        summary: `Rule-based: matched ${rule.category} keywords`,
        urgency: rule.urgency,
        suggestedAction: `Route to AE for ${rule.category.toLowerCase().replace(/_/g, " ")} handling`,
        fallbackUsed: true,
        aiCostUsd: 0,
      };
    }
  }

  return {
    category: "GENERAL",
    confidence: 0.3,
    summary: "No keyword matches — classified as general",
    urgency: "low",
    suggestedAction: "Review manually",
    fallbackUsed: true,
    aiCostUsd: 0,
  };
}

// ─── Main Classification Function ───────────────────────────────────────────

export async function classifyEmail(opts: {
  subject: string;
  body: string;
  sender: string;
  emailId?: string;
}): Promise<ClassificationResult> {
  const sanitizedBody = sanitizeEmail(opts.body);
  const redactedSubject = redact(opts.subject);

  const redactedSender = redact(opts.sender);
  const userMessage = `From: ${redactedSender}\nSubject: ${redactedSubject}\n\n${sanitizedBody}`;

  try {
    const result = await callClaude({
      model: "haiku",
      system: getSystemPrompt(),
      userMessage,
      functionName: "email_classifier",
      eventSourceId: opts.emailId,
      maxTokens: 256,
    });

    // Parse AI response
    const parsed = JSON.parse(result.content);

    const classification: ClassificationResult = {
      category: parsed.category ?? "GENERAL",
      confidence: parsed.confidence ?? 0.7,
      summary: parsed.summary ?? "",
      urgency: parsed.urgency ?? "normal",
      suggestedAction: parsed.suggestedAction ?? "Review manually",
      fallbackUsed: false,
      aiCostUsd: result.costUsd,
    };

    // Log automation event
    await logAutomationEvent({
      type: "email_classified",
      source: "webhook",
      entityType: "email",
      entityId: opts.emailId ?? "unknown",
      data: {
        category: classification.category,
        confidence: classification.confidence,
        sender: opts.sender,
        fallbackUsed: false,
      },
      actionTaken: classification.suggestedAction,
    });

    return classification;
  } catch (err) {
    // Fallback to rule-based classification
    log.error({ err }, "[EmailClassifier] AI call failed, using fallback:");

    const fallback = classifyByRules(opts.subject, opts.body);

    await logAutomationEvent({
      type: "email_classified",
      source: "webhook",
      entityType: "email",
      entityId: opts.emailId ?? "unknown",
      data: {
        category: fallback.category,
        confidence: fallback.confidence,
        sender: opts.sender,
        fallbackUsed: true,
        error: err instanceof Error ? err.message : "Unknown",
      },
      actionTaken: fallback.suggestedAction,
    });

    return fallback;
  }
}
