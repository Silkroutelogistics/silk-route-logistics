/**
 * Log Redaction Utility
 * Strips sensitive data from objects before logging to prevent credential leakage.
 * Used by request logger, audit trail, and error handler.
 */

const SENSITIVE_KEYS = new Set([
  "password", "newpassword", "currentpassword", "passwordhash",
  "token", "accesstoken", "refreshtoken", "temptoken",
  "authorization", "cookie",
  "code", "otp",
  "apikey", "apisecret", "secret",
  "ssn", "ein", "taxid",
  "creditcard", "cardnumber", "cvv", "expiry",
  "bankaccount", "routingnumber", "accountnumber",
  "encryptionkey",
]);

const SENSITIVE_PATTERNS = [
  /^bearer\s+.+$/i,         // Bearer tokens
  /^\d{8}$/,                 // 8-digit OTP codes
  /^eyJ[A-Za-z0-9_-]+\./,   // JWT tokens (start with eyJ)
];

export function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_LIMIT]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactString(obj);
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "string" && isSensitiveValue(value)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactObject(value, depth + 1);
    }
  }
  return result;
}

function redactString(value: string): string {
  if (isSensitiveValue(value)) return "[REDACTED]";
  return value;
}

function isSensitiveValue(value: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Redact request body for logging
 * Returns a safe copy with all sensitive fields masked
 */
export function redactRequestBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  return redactObject(body);
}
