import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export type ActorType = "USER" | "SYSTEM" | "CARRIER" | "DRIVER" | "SHIPPER";

export interface LogLoadActivityInput {
  loadId: string;
  eventType: string;
  description: string;
  actorType?: ActorType;
  actorId?: string | null;
  actorName?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append an activity entry to a load's timeline.
 *
 * Why: Rule 12 (Event-Based State Transitions) — every meaningful load event
 *  must be observable and auditable. This is the single write path used by
 *  routes, controllers, and automations to avoid scattered inserts.
 */
export async function logLoadActivity(input: LogLoadActivityInput) {
  return prisma.loadActivity.create({
    data: {
      loadId: input.loadId,
      eventType: input.eventType,
      description: input.description,
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      metadata: input.metadata,
    },
  });
}

/**
 * Record a Load lifecycle transition and mirror it to SystemLog so the
 * event is traceable from the global log too (Karpathy rule 12).
 */
export async function logLoadTransition(params: {
  loadId: string;
  from: string;
  to: string;
  actorId?: string | null;
  actorName?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await logLoadActivity({
    loadId: params.loadId,
    eventType: "status_change",
    description: `Status ${params.from} → ${params.to}`,
    actorType: params.actorId ? "USER" : "SYSTEM",
    actorId: params.actorId,
    actorName: params.actorName,
    metadata: { from: params.from, to: params.to, ...(params.metadata as object | undefined) },
  });

  try {
    await prisma.systemLog.create({
      data: {
        logType: "INFO" as any,
        severity: "INFO" as any,
        source: "load.lifecycle",
        userId: params.actorId ?? undefined,
        message: `Load ${params.loadId}: ${params.from} → ${params.to}`,
        details: { loadId: params.loadId, from: params.from, to: params.to } as Prisma.InputJsonValue,
      },
    });
  } catch {
    // SystemLog failures should never block the activity log write
  }
}

export async function getLoadActivity(loadId: string, limit = 200) {
  return prisma.loadActivity.findMany({
    where: { loadId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
