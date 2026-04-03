import { prisma } from "../config/database";
import { RfpStatus, Prisma } from "@prisma/client";

// ─── Interfaces ─────────────────────────────────────────

interface Lane {
  originState: string;
  destState: string;
  equipmentType: string;
  estimatedVolume?: number;
}

interface LaneResponse {
  laneIndex: number;
  rate: number;
  flatRate?: number;
  fuelSurcharge?: number;
  notes?: string;
}

interface CreateRfpInput {
  customerId: string;
  title: string;
  description?: string;
  dueDate: string;
  lanes: Lane[];
  notes?: string;
  status?: RfpStatus;
}

interface RfpFilters {
  customerId?: string;
  status?: RfpStatus;
  page?: number;
  limit?: number;
}

// ─── Service Functions ──────────────────────────────────

/**
 * Create a new RFP with lanes array.
 */
export async function createRfp(data: CreateRfpInput, userId: string) {
  const dueDate = new Date(data.dueDate);
  if (dueDate <= new Date()) {
    throw new Error("Due date must be in the future");
  }

  if (!data.lanes || data.lanes.length === 0) {
    throw new Error("At least one lane is required");
  }

  // Normalize state codes
  const normalizedLanes = data.lanes.map((lane) => ({
    ...lane,
    originState: lane.originState.toUpperCase(),
    destState: lane.destState.toUpperCase(),
  }));

  return prisma.rfpBid.create({
    data: {
      customerId: data.customerId,
      title: data.title,
      description: data.description,
      status: data.status ?? "OPEN",
      dueDate,
      lanes: normalizedLanes as any,
      totalLanes: normalizedLanes.length,
      notes: data.notes,
      createdById: userId,
    },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

/**
 * List RFPs with pagination and filtering.
 */
export async function getRfps(filters: RfpFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, filters.limit ?? 25);

  const where: Prisma.RfpBidWhereInput = { deletedAt: null };

  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status) where.status = filters.status;

  const [rfps, total] = await Promise.all([
    prisma.rfpBid.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.rfpBid.count({ where }),
  ]);

  return { rfps, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single RFP by ID with full details.
 */
export async function getRfp(id: string) {
  const rfp = await prisma.rfpBid.findFirst({
    where: { id, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!rfp) throw new Error("RFP not found");
  return rfp;
}

/**
 * Submit rate responses for lanes in an RFP.
 */
export async function respondToRfp(id: string, responses: LaneResponse[], userId: string) {
  const rfp = await prisma.rfpBid.findFirst({
    where: { id, deletedAt: null },
  });

  if (!rfp) throw new Error("RFP not found");
  if (rfp.status !== "OPEN" && rfp.status !== "IN_REVIEW") {
    throw new Error(`Cannot respond to RFP with status "${rfp.status}"`);
  }

  // Validate lane indices
  const totalLanes = rfp.totalLanes;
  for (const r of responses) {
    if (r.laneIndex < 0 || r.laneIndex >= totalLanes) {
      throw new Error(`Invalid lane index ${r.laneIndex}. Must be 0-${totalLanes - 1}`);
    }
    if (r.rate <= 0) {
      throw new Error(`Rate must be positive for lane index ${r.laneIndex}`);
    }
  }

  // Merge with existing responses (replace by laneIndex)
  const existingResponses: LaneResponse[] = (rfp.responses as unknown as LaneResponse[] | null) ?? [];
  const responseMap = new Map<number, LaneResponse>();
  for (const r of existingResponses) responseMap.set(r.laneIndex, r);
  for (const r of responses) responseMap.set(r.laneIndex, r);

  const mergedResponses = Array.from(responseMap.values());
  const respondedLanes = mergedResponses.length;

  return prisma.rfpBid.update({
    where: { id },
    data: {
      responses: mergedResponses as any,
      respondedLanes,
      status: respondedLanes >= totalLanes ? "IN_REVIEW" : rfp.status,
    },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

/**
 * Award an RFP — marks as AWARDED and auto-creates contract rates
 * from the lane responses.
 */
export async function awardRfp(id: string, userId: string) {
  const rfp = await prisma.rfpBid.findFirst({
    where: { id, deletedAt: null },
  });

  if (!rfp) throw new Error("RFP not found");
  if (rfp.status === "AWARDED") throw new Error("RFP is already awarded");
  if (rfp.status === "DECLINED" || rfp.status === "EXPIRED") {
    throw new Error(`Cannot award RFP with status "${rfp.status}"`);
  }

  const responses: LaneResponse[] = (rfp.responses as unknown as LaneResponse[] | null) ?? [];
  const lanes: Lane[] = rfp.lanes as unknown as Lane[];

  if (responses.length === 0) {
    throw new Error("Cannot award RFP with no rate responses");
  }

  // Create contract rates from each responded lane
  const now = new Date();
  const oneYearOut = new Date(now);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  const contractRateData = responses.map((resp) => {
    const lane = lanes[resp.laneIndex];
    if (!lane) throw new Error(`Lane index ${resp.laneIndex} not found in RFP lanes`);

    return {
      customerId: rfp.customerId,
      originState: lane.originState.toUpperCase(),
      destState: lane.destState.toUpperCase(),
      equipmentType: lane.equipmentType,
      rate: resp.rate,
      flatRate: resp.flatRate,
      fuelSurcharge: resp.fuelSurcharge ?? 0,
      effectiveDate: now,
      expirationDate: oneYearOut,
      status: "ACTIVE" as const,
      volume: lane.estimatedVolume,
      notes: `Auto-created from RFP "${rfp.title}" (${rfp.id})${resp.notes ? ` — ${resp.notes}` : ""}`,
      createdById: userId,
    };
  });

  // Use a transaction to award + create rates atomically
  const [updatedRfp, ...createdRates] = await prisma.$transaction([
    prisma.rfpBid.update({
      where: { id },
      data: {
        status: "AWARDED",
        awardedAt: now,
        awardedById: userId,
      },
      include: {
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    ...contractRateData.map((d) => prisma.contractRate.create({ data: d })),
  ]);

  return {
    rfp: updatedRfp,
    contractRatesCreated: createdRates.length,
  };
}

/**
 * Soft delete an RFP.
 */
export async function softDeleteRfp(id: string) {
  const existing = await prisma.rfpBid.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("RFP not found");

  return prisma.rfpBid.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Cron job: expire RFPs whose dueDate has passed and are still OPEN.
 */
export async function expireRfps() {
  const now = new Date();

  const result = await prisma.rfpBid.updateMany({
    where: {
      status: "OPEN",
      dueDate: { lt: now },
      deletedAt: null,
    },
    data: { status: "EXPIRED" },
  });

  return { expired: result.count };
}
