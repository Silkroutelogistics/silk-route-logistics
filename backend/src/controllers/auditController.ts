import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

const auditQuerySchema = z.object({
  userId: z.string().optional(),
  entity: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export async function getAuditLogs(req: AuthRequest, res: Response) {
  const query = auditQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.userId) where.userId = query.userId;
  if (query.entity) where.entity = query.entity;
  if (query.action) where.action = query.action;
  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) (where.createdAt as Record<string, Date>).gte = new Date(query.startDate);
    if (query.endDate) (where.createdAt as Record<string, Date>).lte = new Date(query.endDate);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getAuditStats(req: AuthRequest, res: Response) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [byAction, byEntity, recentLogs] = await Promise.all([
    // Counts by action type
    prisma.auditLog.groupBy({
      by: ["action"],
      _count: { action: true },
    }),
    // Counts by entity
    prisma.auditLog.groupBy({
      by: ["entity"],
      _count: { entity: true },
    }),
    // Recent logs for timeline (last 30 days)
    prisma.auditLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Group recent logs by day for timeline
  const timeline: Record<string, number> = {};
  for (const log of recentLogs) {
    const day = log.createdAt.toISOString().split("T")[0];
    timeline[day] = (timeline[day] || 0) + 1;
  }

  res.json({
    byAction: byAction.map((a) => ({ action: a.action, count: a._count.action })),
    byEntity: byEntity.map((e) => ({ entity: e.entity, count: e._count.entity })),
    timeline: Object.entries(timeline).map(([date, count]) => ({ date, count })),
  });
}
