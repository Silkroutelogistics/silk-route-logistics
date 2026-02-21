import { prisma } from "../config/database";
import { DelayReasonCode } from "@prisma/client";

export async function createDelay(data: {
  loadId: string;
  reasonCode: DelayReasonCode;
  description?: string;
  delayMinutes: number;
  reportedById: string;
}) {
  return prisma.loadDelay.create({
    data,
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function getDelaysByLoadId(loadId: string) {
  return prisma.loadDelay.findMany({
    where: { loadId },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { reportedAt: "desc" },
  });
}

export async function updateDelay(
  id: string,
  data: {
    reasonCode?: DelayReasonCode;
    description?: string;
    delayMinutes?: number;
    resolvedAt?: Date | null;
  }
) {
  return prisma.loadDelay.update({
    where: { id },
    data,
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function deleteDelay(id: string) {
  return prisma.loadDelay.delete({ where: { id } });
}

export async function getDelayById(id: string) {
  return prisma.loadDelay.findUnique({
    where: { id },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
      load: { select: { id: true, referenceNumber: true, loadNumber: true } },
    },
  });
}
