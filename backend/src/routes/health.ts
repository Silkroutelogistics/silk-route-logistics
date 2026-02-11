import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { authenticate, authorize } from "../middleware/auth";
import { getRequestCount } from "../middleware/requestLogger";

const router = Router();

// GET / - Basic health check (no auth required)
router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// GET /detailed - Detailed health check (ADMIN only)
router.get("/detailed", authenticate, authorize("ADMIN"), async (_req: Request, res: Response) => {
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let dbLatencyMs: number | null = null;

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  const memoryUsage = process.memoryUsage();

  res.json({
    status: dbStatus === "connected" ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
    },
    node: process.version,
    environment: env.NODE_ENV,
    totalRequests: getRequestCount(),
  });
});

export default router;
