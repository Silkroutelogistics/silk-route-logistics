import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

/**
 * A caller's transaction client, or the shared singleton.
 *
 * This service used to construct its own `new PrismaClient()`. That cost a
 * second connection pool, skipped the `$extends` wrapper every other service
 * goes through — and, the part that matters, made it STRUCTURALLY IMPOSSIBLE
 * for an activity write to join a caller's transaction. A private client opens
 * its own connection, so a write made from inside `prisma.$transaction(...)`
 * commits independently and survives the rollback.
 *
 * No caller does that today: every one of the call sites is outside any
 * transaction, and withTenderController's is deliberately post-commit. So this
 * is latent-capability work, not an outage fix, and it is worth saying so
 * plainly. What it prevents is the next refactor — wrapping a multi-write
 * handler in a transaction without noticing that its activity row would not be
 * in it, and getting a feed entry for something that never happened.
 */
export type ActivityDb = Prisma.TransactionClient | typeof prisma;

export type ActorType = "USER" | "SYSTEM" | "CARRIER" | "DRIVER" | "SHIPPER";

export interface LogLoadActivityInput {
  loadId: string;
  eventType: string;
  description: string;
  actorType?: ActorType;
  actorId?: string | null;
  actorName?: string | null;
  metadata?: Prisma.InputJsonValue;
  /**
   * The tender this event belongs to, when it belongs to one.
   *
   * Omit for load-level events (check calls, documents, geofence). Supply it
   * for anything that happened TO a tender, so a load carrying several tenders
   * can answer "what happened to this one" — see LoadActivity.tenderId in
   * schema.prisma for why this lives here rather than in a separate table.
   */
  tenderId?: string | null;
}

/**
 * Append an activity entry to a load's timeline.
 *
 * Why: Rule 12 (Event-Based State Transitions) — every meaningful load event
 *  must be observable and auditable. This is the single write path used by
 *  routes, controllers, and automations to avoid scattered inserts.
 */
export async function logLoadActivity(input: LogLoadActivityInput, db: ActivityDb = prisma) {
  return db.loadActivity.create({
    data: {
      loadId: input.loadId,
      eventType: input.eventType,
      description: input.description,
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      metadata: input.metadata,
      tenderId: input.tenderId ?? null,
    },
  });
}

/**
 * Read one tender's transition history, newest first.
 *
 * Deliberately narrower than `getLoadActivity`: a load in a waterfall carries
 * several tenders, and the drawer's "Tender History" is asking about one of
 * them. Served by the composite (tender_id, created_at) index.
 */
export async function getTenderActivity(tenderId: string, limit = 100) {
  return prisma.loadActivity.findMany({
    where: { tenderId },
    orderBy: { createdAt: "desc" },
    take: limit,
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
}, db: ActivityDb = prisma) {
  await logLoadActivity({
    loadId: params.loadId,
    eventType: "status_change",
    description: `Status ${params.from} → ${params.to}`,
    actorType: params.actorId ? "USER" : "SYSTEM",
    actorId: params.actorId,
    actorName: params.actorName,
    metadata: { from: params.from, to: params.to, ...(params.metadata as object | undefined) },
  }, db);

  // The SystemLog mirror stays on the SHARED client even when the caller
  // supplied a transaction, and the `catch` below is exactly why.
  //
  // In Postgres a failed statement aborts the entire transaction. Catching the
  // error does not undo that: every subsequent query in the same transaction
  // fails with "current transaction is aborted", including the caller's own
  // work. So a swallowed failure that is harmless on a standalone client
  // becomes a silent killer of somebody else's writes the moment it runs on a
  // shared tx — and it would surface far from here, as an unrelated handler
  // failing for no visible reason.
  //
  // This mirror is out-of-band observability. It must never be able to take
  // down the thing it is observing.
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
