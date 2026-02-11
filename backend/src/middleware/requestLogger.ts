import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "./auth";

let requestCount = 0;

export function getRequestCount(): number {
  return requestCount;
}

export function requestLogger(req: AuthRequest, res: Response, next: NextFunction) {
  // Skip logging for health check routes
  if (req.path.startsWith("/api/health") || req.path === "/health") {
    return next();
  }

  const startTime = Date.now();

  requestCount++;

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // Fire-and-forget: log to database without awaiting
    prisma.systemLog
      .create({
        data: {
          logType: "API_CALL",
          severity: res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARNING" : "INFO",
          source: "requestLogger",
          endpoint: `${req.method} ${req.path}`,
          message: `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            userAgent: req.headers["user-agent"] || null,
          },
          userId: req.user?.id || null,
          ipAddress: req.ip || req.socket.remoteAddress || null,
          durationMs: duration,
        },
      })
      .catch((err: unknown) => {
        console.error("Failed to log API request:", err);
      });
  });

  next();
}
