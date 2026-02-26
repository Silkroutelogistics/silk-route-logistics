import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Request ID / Correlation ID Middleware
 * Generates a unique ID for each request and propagates it through:
 * - Response header: X-Request-ID
 * - req.requestId (available to all downstream handlers)
 * - Sentry breadcrumbs (if configured)
 *
 * If the client sends X-Request-ID, it is preserved (for upstream correlation).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = req.headers["x-request-id"] as string | undefined;
  const requestId = existing || crypto.randomUUID();

  // Attach to request for downstream use
  (req as any).requestId = requestId;

  // Include in response headers for client-side correlation
  res.setHeader("X-Request-ID", requestId);

  next();
}
