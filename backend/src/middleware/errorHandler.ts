import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import * as Sentry from "@sentry/node";
import { prisma } from "../config/database";
import { trackError } from "../services/sentryAlertService";
import { log } from "../lib/logger";

const isProduction = process.env.NODE_ENV === "production";

// Track error count for alerting
let recentErrorCount = 0;
let lastAlertCheck = Date.now();

function logErrorToDb(err: Error, req: Request, statusCode: number, errorType: string) {
  const userId = (req as any).user?.id || null;
  prisma.errorLog.create({
    data: {
      errorType,
      message: err.message?.slice(0, 500),
      stackTrace: err.stack?.slice(0, 2000),
      endpoint: `${req.method} ${req.path}`,
      method: req.method,
      userId,
      ipAddress: req.ip || req.socket.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"]?.slice(0, 500),
      statusCode,
    },
  }).catch(err => log.error({ err: err }, '[ErrorHandler] Alert failed:'));

  // Track error rate for alerting
  recentErrorCount++;
  const now = Date.now();
  if (now - lastAlertCheck > 60 * 60 * 1000) {
    // Reset hourly counter
    recentErrorCount = 1;
    lastAlertCheck = now;
  } else if (recentErrorCount === 10) {
    // Alert admin on 10th error in 1 hour
    prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
      .then((admins) => {
        for (const admin of admins) {
          prisma.notification.create({
            data: {
              userId: admin.id,
              type: "SYSTEM_ERROR",
              title: "HIGH ERROR RATE ALERT",
              message: `10+ errors in the last hour. Latest: ${err.message?.slice(0, 100)}`,
              actionUrl: "/admin/monitoring",
            },
          }).catch(err => log.error({ err: err }, '[ErrorHandler] Alert failed:'));
        }
      }).catch(err => log.error({ err: err }, '[ErrorHandler] Alert failed:'));
    log.error("[ErrorHandler] ALERT: 10+ errors in the last hour");
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // Log the full error server-side (always)
  if (isProduction) {
    log.error(`[ERROR] ${err.message}`);
  } else {
    log.error(err);
  }

  // Validation errors — safe to return details
  if (err instanceof ZodError) {
    logErrorToDb(err, _req, 400, "VALIDATION");
    res.status(400).json({
      error: "Validation error",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // CORS errors
  if (err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  // Payload too large (body-parser limit exceeded)
  if ((err as any).type === "entity.too.large") {
    res.status(413).json({ error: "Request payload too large" });
    return;
  }

  // JSON parse errors
  if ((err as any).type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }

  // Multer file upload errors
  if (err.message?.includes("Only PDF, JPEG, and PNG files are allowed")) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Default: generic message in production, detailed in development
  const status = (err as any).status || (err as any).statusCode || 500;
  const errorType = status >= 500 ? "UNHANDLED" : "AUTH";
  logErrorToDb(err, _req, status, errorType);

  // Track for spike detection (emails admins on rapid error bursts)
  trackError(errorType, `${_req.method} ${_req.path}`, err.message || "Unknown error");

  // Capture 5xx errors to Sentry with request context
  if (status >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag("error.type", errorType);
      scope.setTag("http.method", _req.method);
      scope.setTag("http.route", _req.path);
      scope.setExtra("endpoint", `${_req.method} ${_req.path}`);
      scope.setExtra("statusCode", status);
      scope.setExtra("recentErrorCount", recentErrorCount);
      Sentry.captureException(err);
    });
  }

  res.status(status).json({
    error: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
