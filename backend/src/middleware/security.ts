import { Request, Response, NextFunction } from "express";

/**
 * Security headers middleware.
 * Sets headers that helmet may not cover or that we want to enforce explicitly.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

/**
 * Input sanitization middleware (v3.8.d.2 rewrite).
 *
 * Performs INPUT hygiene only — trim whitespace, strip null bytes, length-
 * cap to prevent DoS via huge strings. Does NOT HTML-entity-escape values
 * at write time, because XSS defense lives at the OUTPUT layer where the
 * appropriate escaping rules depend on the target context:
 *
 *   - HTML output → React auto-escapes JSX text nodes
 *   - PDF output → pdfService safe() decodes any legacy entities
 *   - JSON output → JSON encoding handles its own char-set
 *
 * The pre-v3.8.d.2 implementation HTML-escaped every req.body string,
 * causing values like `Dry Van 53'` to be stored as `Dry Van 53&#x27;`
 * in the DB. Every consumer then had to compensate with a decode pass
 * (pdfService safe(), trackingController decodeOpt()). Symptom surfaced
 * during v3.8.d /tracking diagnosis and v3.8.d.1 BOL renderer audit.
 * This rewrite removes the source of the encoding, trusting output-
 * layer escaping per OWASP guidance.
 *
 * /api/webhooks remains exempt — external services send raw payloads
 * (often with HTML, dollar signs, etc.) that should pass through
 * untouched for downstream parsing.
 */
const MAX_STRING_LENGTH = 10000;

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.path.startsWith("/api/webhooks")) {
    return next();
  }
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query) as typeof req.query;
  req.params = sanitizeObject(req.params) as typeof req.params;
  next();
}

function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj;
  if (typeof obj === "string") {
    return cleanString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }
  if (obj !== null && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }
  return obj;
}

function cleanString(str: string): string {
  let cleaned = str.trim();
  // Strip null bytes — PostgreSQL TEXT does not accept them and they
  // serve no legitimate purpose in user-submitted form data.
  cleaned = cleaned.replace(/\0/g, "");
  // Length cap — prevents DoS via huge string fields. 10k characters
  // covers any legitimate text-area input on the platform; specific
  // fields with stricter limits enforce them at the validator layer.
  if (cleaned.length > MAX_STRING_LENGTH) {
    cleaned = cleaned.slice(0, MAX_STRING_LENGTH);
  }
  return cleaned;
}
