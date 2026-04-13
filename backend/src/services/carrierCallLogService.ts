import { prisma } from "../config/database";

interface CreateCallLogInput {
  loadId: string;
  carrierId: string;
  contactName?: string;
  contactPhone?: string;
  callType?: string;
  outcome: string;
  offeredRate?: number;
  counterRate?: number;
  declineReason?: string;
  callDuration?: number;
  notes?: string;
  followUpDate?: string;
}

export async function createCallLog(data: CreateCallLogInput, calledById: string) {
  return prisma.carrierCallLog.create({
    data: {
      ...data,
      callType: data.callType || "OUTBOUND",
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
      calledById,
    },
    include: {
      carrier: { select: { companyName: true, mcNumber: true, contactName: true, contactPhone: true } },
      calledBy: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function getCallLogsByLoad(loadId: string) {
  return prisma.carrierCallLog.findMany({
    where: { loadId },
    include: {
      carrier: { select: { companyName: true, mcNumber: true, contactName: true, contactPhone: true, tier: true } },
      calledBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCallLogsByCarrier(carrierId: string, page = 1, limit = 25) {
  const [items, total] = await Promise.all([
    prisma.carrierCallLog.findMany({
      where: { carrierId },
      include: {
        calledBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.carrierCallLog.count({ where: { carrierId } }),
  ]);
  return { items, total, totalPages: Math.ceil(total / limit) };
}

export async function getCallLogStats(loadId?: string) {
  const where: any = {};
  if (loadId) where.loadId = loadId;

  const outcomes = await prisma.carrierCallLog.groupBy({
    by: ["outcome"],
    where,
    _count: true,
  });

  const total = outcomes.reduce((sum, o) => sum + o._count, 0);
  const booked = outcomes.find((o) => o.outcome === "BOOKED")?._count || 0;
  const declined = outcomes.filter((o) => o.outcome.startsWith("DECLINED")).reduce((sum, o) => sum + o._count, 0);
  const noAnswer = outcomes.find((o) => o.outcome === "NO_ANSWER")?._count || 0;

  return { total, booked, declined, noAnswer, conversionRate: total > 0 ? Math.round((booked / total) * 100) : 0, breakdown: outcomes };
}

// Check if carrier was already called for this load (prevents duplicate calls)
export async function wasCarrierCalled(loadId: string, carrierId: string) {
  const existing = await prisma.carrierCallLog.findFirst({
    where: { loadId, carrierId },
    orderBy: { createdAt: "desc" },
  });
  return existing;
}

export async function getFollowUps(userId?: string) {
  const where: any = {
    followUpDate: { lte: new Date() },
    outcome: { in: ["CALLBACK_REQUESTED", "INTERESTED", "VOICEMAIL"] },
  };
  if (userId) where.calledById = userId;

  return prisma.carrierCallLog.findMany({
    where,
    include: {
      carrier: { select: { companyName: true, mcNumber: true, contactPhone: true } },
      calledBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { followUpDate: "asc" },
    take: 50,
  });
}
