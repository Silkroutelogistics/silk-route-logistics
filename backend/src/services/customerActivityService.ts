// Same private-client defect as loadActivityService, found by sweeping for
// `new PrismaClient` rather than trusting that the reported one was the only
// one. Fixing a class member and leaving its sibling is how a closed item
// reopens as a backlog row six weeks later.
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

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
