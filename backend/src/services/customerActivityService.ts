import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export type ActorType = "USER" | "SYSTEM" | "CARRIER" | "DRIVER" | "SHIPPER";

export interface LogCustomerActivityInput {
  customerId: string;
  eventType: string;
  description: string;
  actorType?: ActorType;
  actorId?: string | null;
  actorName?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Single write path for customer lifecycle events. Mirrors loadActivityService
 * so the CRM Activity tab stays authoritative (Karpathy Rule 12 —
 * event-based state transitions).
 */
export async function logCustomerActivity(input: LogCustomerActivityInput) {
  return prisma.customerActivity.create({
    data: {
      customerId: input.customerId,
      eventType: input.eventType,
      description: input.description,
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      metadata: input.metadata,
    },
  });
}

export async function getCustomerActivity(customerId: string, limit = 200) {
  return prisma.customerActivity.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
