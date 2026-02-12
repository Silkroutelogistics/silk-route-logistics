import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { getAllCronJobs, runRegisteredJob, toggleCronJob } from "../services/cronRegistryService";
import { getRequestCount } from "../middleware/requestLogger";

// ──────────────────────────────────────────────────
// Enhanced Health Check
// ──────────────────────────────────────────────────

export async function enhancedHealth(_req: AuthRequest, res: Response) {
  const components: Record<string, { status: string; details?: any }> = {};

  // Database
  let dbLatency = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
    components.database = { status: "healthy", details: { latencyMs: dbLatency } };
  } catch (e: any) {
    components.database = { status: "unhealthy", details: { error: e.message } };
  }

  // Memory
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  components.memory = {
    status: heapUsedMB < 512 ? "healthy" : heapUsedMB < 768 ? "degraded" : "unhealthy",
    details: {
      rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${heapUsedMB} MB`,
      heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      external: `${(mem.external / 1024 / 1024).toFixed(1)} MB`,
    },
  };

  // Cron jobs
  const crons = await getAllCronJobs().catch(() => []);
  const activeCrons = crons.filter((c) => c.enabled).length;
  const failedCrons = crons.filter((c) => c.lastStatus === "FAILED");
  const lastCronRuns: Record<string, string | null> = {};
  for (const c of crons.slice(0, 10)) {
    lastCronRuns[c.jobName] = c.lastRun?.toISOString() || null;
  }
  components.crons = {
    status: failedCrons.length === 0 ? "healthy" : "degraded",
    details: { total: crons.length, active: activeCrons, failed: failedCrons.length, lastRuns: lastCronRuns },
  };

  // Error rate (last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentErrors = await prisma.errorLog.count({ where: { createdAt: { gte: oneHourAgo } } }).catch(() => 0);
  components.errors = {
    status: recentErrors < 5 ? "healthy" : recentErrors < 10 ? "degraded" : "unhealthy",
    details: { lastHour: recentErrors, threshold: 10 },
  };

  // Overall status
  const statuses = Object.values(components).map((c) => c.status);
  const overallStatus = statuses.includes("unhealthy") ? "degraded" : statuses.includes("degraded") ? "degraded" : "healthy";

  // DB counts
  const [userCount, loadCount, invoiceCount, carrierCount] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.load.count().catch(() => 0),
    prisma.invoice.count().catch(() => 0),
    prisma.carrierProfile.count().catch(() => 0),
  ]);

  res.json({
    status: overallStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    node: process.version,
    environment: process.env.NODE_ENV || "development",
    totalRequests: getRequestCount(),
    components,
    counts: { users: userCount, loads: loadCount, invoices: invoiceCount, carriers: carrierCount },
  });
}

// ──────────────────────────────────────────────────
// Cron Job Management
// ──────────────────────────────────────────────────

export async function listCronJobs(_req: AuthRequest, res: Response) {
  const jobs = await getAllCronJobs();
  res.json({ jobs, total: jobs.length });
}

export async function manualRunCron(req: AuthRequest, res: Response) {
  const { name } = req.params;
  const result = await runRegisteredJob(name);

  // Log the manual trigger in audit trail
  await prisma.auditTrail.create({
    data: {
      entityType: "CronJob",
      entityId: name,
      action: "UPDATE",
      changedFields: { action: "manual_trigger", result: result.success ? "SUCCESS" : "FAILED" },
      performedById: req.user!.id,
      ipAddress: req.ip || "unknown",
    },
  }).catch(() => {});

  if (result.success) {
    res.json({ message: `Job ${name} completed successfully`, duration: result.duration });
  } else {
    res.status(result.error === "Job is disabled" ? 400 : 500).json({ error: result.error, duration: result.duration });
  }
}

export async function toggleCron(req: AuthRequest, res: Response) {
  const { name } = req.params;
  try {
    const result = await toggleCronJob(name);

    await prisma.auditTrail.create({
      data: {
        entityType: "CronJob",
        entityId: name,
        action: "UPDATE",
        changedFields: { action: "toggle", enabled: result.enabled },
        performedById: req.user!.id,
        ipAddress: req.ip || "unknown",
      },
    }).catch(() => {});

    res.json({ jobName: name, enabled: result.enabled });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
}

// ──────────────────────────────────────────────────
// Error Log Management
// ──────────────────────────────────────────────────

export async function getErrorLogs(req: AuthRequest, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const since = req.query.since ? new Date(req.query.since as string) : undefined;
  const errorType = req.query.errorType as string | undefined;

  const where: any = {};
  if (since) where.createdAt = { gte: since };
  if (errorType) where.errorType = errorType;

  const [errors, total] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.errorLog.count({ where }),
  ]);

  // Error rate stats
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [lastHour, lastDay] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: oneDayAgo } } }),
  ]);

  res.json({
    errors,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: { lastHour, lastDay, alertThreshold: 10, alertActive: lastHour >= 10 },
  });
}

export async function getErrorStats(_req: AuthRequest, res: Response) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [byType, byDay, total24h, totalWeek] = await Promise.all([
    prisma.errorLog.groupBy({
      by: ["errorType"],
      where: { createdAt: { gte: oneWeekAgo } },
      _count: true,
      orderBy: { _count: { errorType: "desc" } },
    }),
    prisma.errorLog.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: oneWeekAgo } },
      _count: true,
    }),
    prisma.errorLog.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: oneWeekAgo } } }),
  ]);

  res.json({
    byType: byType.map((t) => ({ type: t.errorType, count: t._count })),
    total24h,
    totalWeek,
    alertThreshold: 10,
  });
}
