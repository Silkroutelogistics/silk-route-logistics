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
 * Input sanitization middleware.
 * Trims and escapes all string values in req.body, req.query, and req.params
 * to prevent XSS and injection attacks.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query) as typeof req.query;
  req.params = sanitizeObject(req.params) as typeof req.params;
  next();
}

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return escapeHtml(obj.trim());
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
