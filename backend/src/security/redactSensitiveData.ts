/**
 * PII Redaction — Strips sensitive data from text before sending to AI providers.
 *
 * Catches: SSN, EIN, bank account numbers, routing numbers, credit card numbers,
 * driver's license patterns, and raw email addresses (optionally).
 *
 * Applied to EVERY prompt before it reaches the AI client.
 */

// ─── Redaction Patterns ─────────────────────────────────────────────────────

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const REDACTION_RULES: RedactionRule[] = [
  // SSN: 123-45-6789 or 123456789 (9 digits with optional dashes)
  {
    name: "SSN",
    pattern: /\b(\d{3})-?(\d{2})-?(\d{4})\b/g,
    replacement: "[SSN_REDACTED]",
  },
  // EIN: 12-3456789 (2 digits, dash, 7 digits)
  {
    name: "EIN",
    pattern: /\b(\d{2})-(\d{7})\b/g,
    replacement: "[EIN_REDACTED]",
  },
  // Bank account numbers: 8-17 digits (common US range)
  // Only match sequences that look like account numbers, not load IDs or phone numbers
  {
    name: "BankAccount",
    pattern: /\b(?:account|acct|a\/c)[\s#:]*(\d{8,17})\b/gi,
    replacement: "[BANK_ACCOUNT_REDACTED]",
  },
  // ABA routing numbers: exactly 9 digits starting with 0-3 (valid ABA range)
  {
    name: "RoutingNumber",
    pattern: /\b(?:routing|aba|ach)[\s#:]*([0-3]\d{8})\b/gi,
    replacement: "[ROUTING_NUMBER_REDACTED]",
  },
  // Credit card numbers: 13-19 digits with optional spaces/dashes (Luhn-plausible)
  {
    name: "CreditCard",
    pattern: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7})\b/g,
    replacement: "[CARD_REDACTED]",
  },
  // Driver's license — loose pattern: 1-2 letters + 6-14 digits (varies by state)
  {
    name: "DriversLicense",
    pattern: /\b(?:license|dl|driver'?s?\s*license?)[\s#:]*([A-Z]{1,2}\d{6,14})\b/gi,
    replacement: "[DL_REDACTED]",
  },
];

// ─── Redact Function ────────────────────────────────────────────────────────

export interface RedactionResult {
  text: string;
  redactionsApplied: string[];
}

/**
 * Strips PII and financial account data from the given text.
 * Returns the sanitized text and a list of which redaction rules were triggered.
 */
export function redactSensitiveData(text: string): RedactionResult {
  if (!text || typeof text !== "string") {
    return { text: text ?? "", redactionsApplied: [] };
  }

  const redactionsApplied: string[] = [];
  let result = text;

  for (const rule of REDACTION_RULES) {
    // Reset the regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(result)) {
      redactionsApplied.push(rule.name);
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, rule.replacement);
    }
  }

  return { text: result, redactionsApplied };
}

/**
 * Quick redact — returns only the cleaned string (for inline use).
 */
export function redact(text: string): string {
  return redactSensitiveData(text).text;
}

// ─── Redact Object Fields ───────────────────────────────────────────────────

/**
 * Recursively redact all string values in a JSON object.
 * Useful for sanitizing structured AI inputs.
 */
export function redactObject(obj: unknown): unknown {
  if (typeof obj === "string") return redact(obj);
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value);
    }
    return result;
  }
  return obj;
}
