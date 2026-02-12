import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { prisma } from "../config/database";

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
  }).catch(() => {}); // Fire-and-forget

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
          }).catch(() => {});
        }
      }).catch(() => {});
    console.error("[ErrorHandler] ALERT: 10+ errors in the last hour");
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // Log the full error server-side (always)
  if (isProduction) {
    console.error(`[ERROR] ${err.message}`);
  } else {
    console.error(err);
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
  logErrorToDb(err, _req, status, status >= 500 ? "UNHANDLED" : "AUTH");
  res.status(status).json({
    error: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
