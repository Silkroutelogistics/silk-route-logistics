import { prisma } from "../config/database";
import { ContractRateStatus, Prisma } from "@prisma/client";

// ─── Interfaces ─────────────────────────────────────────

interface CreateContractRateInput {
  customerId: string;
  originState: string;
  destState: string;
  equipmentType: string;
  rate: number;
  flatRate?: number;
  fuelSurcharge?: number;
  minWeight?: number;
  maxWeight?: number;
  effectiveDate: string;
  expirationDate: string;
  status?: ContractRateStatus;
  volume?: number;
  notes?: string;
}

interface ContractRateFilters {
  customerId?: string;
  originState?: string;
  destState?: string;
  equipmentType?: string;
  status?: ContractRateStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
  page?: number;
  limit?: number;
}

// ─── Service Functions ──────────────────────────────────

/**
 * Create a new contract rate. Validates dates and checks for overlapping
 * rates on the same lane for the same customer.
 */
export async function createContractRate(data: CreateContractRateInput, userId: string) {
  const effective = new Date(data.effectiveDate);
  const expiration = new Date(data.expirationDate);

  if (expiration <= effective) {
    throw new Error("Expiration date must be after effective date");
  }

  // Check for overlapping active rates on the same lane for the same customer
  const overlapping = await prisma.contractRate.findFirst({
    where: {
      customerId: data.customerId,
      originState: data.originState.toUpperCase(),
      destState: data.destState.toUpperCase(),
      equipmentType: data.equipmentType,
      status: { in: ["ACTIVE", "DRAFT"] },
      deletedAt: null,
      effectiveDate: { lte: expiration },
      expirationDate: { gte: effective },
    },
  });

  if (overlapping) {
    throw new Error(
      `Overlapping contract rate exists for ${data.originState}→${data.destState} (${data.equipmentType}) ` +
      `from ${overlapping.effectiveDate.toISOString().slice(0, 10)} to ${overlapping.expirationDate.toISOString().slice(0, 10)}`
    );
  }

  return prisma.contractRate.create({
    data: {
      customerId: data.customerId,
      originState: data.originState.toUpperCase(),
      destState: data.destState.toUpperCase(),
      equipmentType: data.equipmentType,
      rate: data.rate,
      flatRate: data.flatRate,
      fuelSurcharge: data.fuelSurcharge ?? 0,
      minWeight: data.minWeight,
      maxWeight: data.maxWeight,
      effectiveDate: effective,
      expirationDate: expiration,
      status: data.status ?? "ACTIVE",
      volume: data.volume,
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
 * List contract rates with pagination and filtering.
 */
export async function getContractRates(filters: ContractRateFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, filters.limit ?? 25);

  const where: Prisma.ContractRateWhereInput = { deletedAt: null };

  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.originState) where.originState = filters.originState.toUpperCase();
  if (filters.destState) where.destState = filters.destState.toUpperCase();
  if (filters.equipmentType) where.equipmentType = filters.equipmentType;
  if (filters.status) where.status = filters.status;
  if (filters.effectiveFrom || filters.effectiveTo) {
    where.effectiveDate = {};
    if (filters.effectiveFrom) where.effectiveDate.gte = new Date(filters.effectiveFrom);
    if (filters.effectiveTo) where.effectiveDate.lte = new Date(filters.effectiveTo);
  }

  const [rates, total] = await Promise.all([
    prisma.contractRate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.contractRate.count({ where }),
  ]);

  return { rates, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single contract rate by ID.
 */
export async function getContractRate(id: string) {
  const rate = await prisma.contractRate.findFirst({
    where: { id, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!rate) throw new Error("Contract rate not found");
  return rate;
}

/**
 * Update a contract rate.
 */
export async function updateContractRate(id: string, data: Partial<CreateContractRateInput>) {
  const existing = await prisma.contractRate.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("Contract rate not found");

  const updateData: any = {};
  if (data.rate !== undefined) updateData.rate = data.rate;
  if (data.flatRate !== undefined) updateData.flatRate = data.flatRate;
  if (data.fuelSurcharge !== undefined) updateData.fuelSurcharge = data.fuelSurcharge;
  if (data.minWeight !== undefined) updateData.minWeight = data.minWeight;
  if (data.maxWeight !== undefined) updateData.maxWeight = data.maxWeight;
  if (data.effectiveDate) updateData.effectiveDate = new Date(data.effectiveDate);
  if (data.expirationDate) updateData.expirationDate = new Date(data.expirationDate);
  if (data.status) updateData.status = data.status;
  if (data.volume !== undefined) updateData.volume = data.volume;
  if (data.notes !== undefined) updateData.notes = data.notes;

  return prisma.contractRate.update({
    where: { id },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

/**
 * Soft delete a contract rate.
 */
export async function softDeleteContractRate(id: string) {
  const existing = await prisma.contractRate.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("Contract rate not found");

  return prisma.contractRate.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Check if a contract rate exists for a specific lane + customer.
 * Returns the best active rate (lowest per-mile rate) if one exists.
 * Used by the auto-quote engine.
 */
export async function checkContractRate(
  originState: string,
  destState: string,
  equipmentType: string,
  customerId?: string,
) {
  const now = new Date();

  const where: Prisma.ContractRateWhereInput = {
    originState: originState.toUpperCase(),
    destState: destState.toUpperCase(),
    equipmentType,
    status: "ACTIVE",
    deletedAt: null,
    effectiveDate: { lte: now },
    expirationDate: { gte: now },
  };

  if (customerId) where.customerId = customerId;

  const rate = await prisma.contractRate.findFirst({
    where,
    orderBy: { rate: "asc" }, // Best (lowest) rate first
    include: {
      customer: { select: { id: true, name: true } },
    },
  });

  return rate;
}

/**
 * Cron job: expire contract rates whose expirationDate has passed.
 */
export async function expireContractRates() {
  const now = new Date();

  const result = await prisma.contractRate.updateMany({
    where: {
      status: "ACTIVE",
      expirationDate: { lt: now },
      deletedAt: null,
    },
    data: { status: "EXPIRED" },
  });

  return { expired: result.count };
}
