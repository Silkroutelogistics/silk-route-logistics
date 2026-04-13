import { prisma } from "../config/database";

// ─── Types ──────────────────────────────────────────────

interface CreateRoutingGuideInput {
  name: string;
  originState: string;
  originCity?: string;
  destState: string;
  destCity?: string;
  equipmentType: string;
  mode?: string;
  customerId?: string;
  effectiveDate?: string;
  expirationDate?: string;
  notes?: string;
  entries?: {
    carrierId: string;
    rank: number;
    targetRate?: number;
    rateType?: "FLAT" | "PER_MILE";
    fuelSurcharge?: number;
    transitDays?: number;
    notes?: string;
  }[];
}

interface RoutingGuideFilters {
  originState?: string;
  destState?: string;
  equipmentType?: string;
  customerId?: string;
  isActive?: boolean;
  search?: string;
  page: number;
  limit: number;
}

// ─── CRUD ───────────────────────────────────────────────

export async function createRoutingGuide(data: CreateRoutingGuideInput, createdById: string) {
  const { entries, ...guideData } = data;

  return prisma.routingGuide.create({
    data: {
      ...guideData,
      mode: guideData.mode || "FTL",
      effectiveDate: guideData.effectiveDate ? new Date(guideData.effectiveDate) : new Date(),
      expirationDate: guideData.expirationDate ? new Date(guideData.expirationDate) : undefined,
      createdById,
      entries: entries?.length
        ? {
            create: entries.map((e) => ({
              carrierId: e.carrierId,
              rank: e.rank,
              targetRate: e.targetRate,
              rateType: e.rateType || "FLAT",
              fuelSurcharge: e.fuelSurcharge || 0,
              transitDays: e.transitDays,
              notes: e.notes,
            })),
          }
        : undefined,
    },
    include: {
      entries: { include: { carrier: { select: { companyName: true, mcNumber: true, dotNumber: true, tier: true } } }, orderBy: { rank: "asc" } },
      customer: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function getRoutingGuides(filters: RoutingGuideFilters) {
  const where: any = { deletedAt: null };

  if (filters.originState) where.originState = filters.originState;
  if (filters.destState) where.destState = filters.destState;
  if (filters.equipmentType) where.equipmentType = filters.equipmentType;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { originCity: { contains: filters.search, mode: "insensitive" } },
      { destCity: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.routingGuide.findMany({
      where,
      include: {
        entries: {
          where: { isActive: true },
          include: { carrier: { select: { companyName: true, mcNumber: true, tier: true } } },
          orderBy: { rank: "asc" },
        },
        customer: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.routingGuide.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / filters.limit) };
}

export async function getRoutingGuide(id: string) {
  const guide = await prisma.routingGuide.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          carrier: {
            select: {
              id: true, companyName: true, mcNumber: true, dotNumber: true, tier: true,
              contactName: true, contactPhone: true, contactEmail: true,
              equipmentTypes: true, operatingRegions: true,
            },
          },
        },
        orderBy: { rank: "asc" },
      },
      customer: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!guide) throw new Error("Routing guide not found");
  return guide;
}

export async function updateRoutingGuide(id: string, data: Partial<CreateRoutingGuideInput>) {
  const { entries, ...guideData } = data;

  const updateData: any = { ...guideData };
  if (guideData.effectiveDate) updateData.effectiveDate = new Date(guideData.effectiveDate);
  if (guideData.expirationDate) updateData.expirationDate = new Date(guideData.expirationDate);

  // If entries provided, replace all entries
  if (entries) {
    await prisma.routingGuideEntry.deleteMany({ where: { routingGuideId: id } });
    await prisma.routingGuideEntry.createMany({
      data: entries.map((e) => ({
        routingGuideId: id,
        carrierId: e.carrierId,
        rank: e.rank,
        targetRate: e.targetRate,
        rateType: e.rateType || "FLAT",
        fuelSurcharge: e.fuelSurcharge || 0,
        transitDays: e.transitDays,
        notes: e.notes,
      })),
    });
  }

  return prisma.routingGuide.update({
    where: { id },
    data: updateData,
    include: {
      entries: { include: { carrier: { select: { companyName: true, mcNumber: true, tier: true } } }, orderBy: { rank: "asc" } },
      customer: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function deleteRoutingGuide(id: string) {
  return prisma.routingGuide.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ─── Lane Lookup (for waterfall integration) ────────────

export async function lookupRoutingGuide(originState: string, destState: string, equipmentType: string, customerId?: string) {
  const where: any = {
    originState,
    destState,
    equipmentType,
    isActive: true,
    deletedAt: null,
    OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }],
  };
  if (customerId) where.customerId = customerId;

  return prisma.routingGuide.findFirst({
    where,
    include: {
      entries: {
        where: { isActive: true },
        include: { carrier: { select: { id: true, userId: true, companyName: true, mcNumber: true, tier: true } } },
        orderBy: { rank: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ─── Entry Management ───────────────────────────────────

export async function addRoutingGuideEntry(routingGuideId: string, data: { carrierId: string; rank: number; targetRate?: number; transitDays?: number; notes?: string }) {
  return prisma.routingGuideEntry.create({
    data: { routingGuideId, ...data },
    include: { carrier: { select: { companyName: true, mcNumber: true, tier: true } } },
  });
}

export async function updateRoutingGuideEntry(entryId: string, data: { rank?: number; targetRate?: number; transitDays?: number; isActive?: boolean; notes?: string }) {
  return prisma.routingGuideEntry.update({
    where: { id: entryId },
    data,
    include: { carrier: { select: { companyName: true, mcNumber: true, tier: true } } },
  });
}

export async function removeRoutingGuideEntry(entryId: string) {
  return prisma.routingGuideEntry.delete({ where: { id: entryId } });
}

// ─── Stats ──────────────────────────────────────────────

export async function getRoutingGuideStats() {
  const [total, active, withEntries] = await Promise.all([
    prisma.routingGuide.count({ where: { deletedAt: null } }),
    prisma.routingGuide.count({ where: { deletedAt: null, isActive: true } }),
    prisma.routingGuide.count({
      where: { deletedAt: null, isActive: true, entries: { some: { isActive: true } } },
    }),
  ]);

  return { total, active, withEntries, coverageRate: total > 0 ? Math.round((withEntries / total) * 100) : 0 };
}
