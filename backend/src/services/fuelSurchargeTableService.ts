import { prisma } from "../config/database";

interface CreateFuelTableInput {
  name: string;
  type?: string;
  currency?: string;
  effectiveDate: string;
  expirationDate?: string;
  notes?: string;
  tiers?: { fuelPriceMin: number; fuelPriceMax: number; surchargeRate: number; surchargeType?: string }[];
}

export async function createFuelTable(data: CreateFuelTableInput, createdById: string) {
  const { tiers, ...tableData } = data;
  return prisma.fuelSurchargeTable.create({
    data: {
      ...tableData,
      type: tableData.type || "DOE_NATIONAL",
      currency: tableData.currency || "USD",
      effectiveDate: new Date(tableData.effectiveDate),
      expirationDate: tableData.expirationDate ? new Date(tableData.expirationDate) : undefined,
      createdById,
      tiers: tiers?.length ? { create: tiers.map((t) => ({ ...t, surchargeType: (t.surchargeType || "PERCENTAGE") as any })) } : undefined,
    },
    include: { tiers: { orderBy: { fuelPriceMin: "asc" } }, createdBy: { select: { firstName: true, lastName: true } } },
  });
}

export async function getFuelTables(activeOnly = false) {
  return prisma.fuelSurchargeTable.findMany({
    where: activeOnly ? { isActive: true } : {},
    include: { tiers: { orderBy: { fuelPriceMin: "asc" } }, createdBy: { select: { firstName: true, lastName: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getFuelTable(id: string) {
  const table = await prisma.fuelSurchargeTable.findUnique({
    where: { id },
    include: { tiers: { orderBy: { fuelPriceMin: "asc" } }, createdBy: { select: { firstName: true, lastName: true } } },
  });
  if (!table) throw new Error("Fuel surcharge table not found");
  return table;
}

export async function updateFuelTable(id: string, data: Partial<CreateFuelTableInput> & { isActive?: boolean }) {
  const { tiers, ...tableData } = data;
  const updateData: any = { ...tableData };
  if (tableData.effectiveDate) updateData.effectiveDate = new Date(tableData.effectiveDate);
  if (tableData.expirationDate) updateData.expirationDate = new Date(tableData.expirationDate);

  if (tiers) {
    await prisma.fuelSurchargeTier.deleteMany({ where: { tableId: id } });
    await prisma.fuelSurchargeTier.createMany({
      data: tiers.map((t) => ({ tableId: id, ...t, surchargeType: (t.surchargeType || "PERCENTAGE") as any })),
    });
  }

  return prisma.fuelSurchargeTable.update({ where: { id }, data: updateData, include: { tiers: { orderBy: { fuelPriceMin: "asc" } } } });
}

export async function deleteFuelTable(id: string) {
  return prisma.fuelSurchargeTable.update({ where: { id }, data: { isActive: false } });
}

// CSV import: parse "fuelPriceMin,fuelPriceMax,surchargeRate" rows
export function parseFuelCSV(csvContent: string): { fuelPriceMin: number; fuelPriceMax: number; surchargeRate: number }[] {
  const lines = csvContent.trim().split("\n").slice(1); // skip header
  return lines.map((line) => {
    const [min, max, rate] = line.split(",").map((v) => parseFloat(v.trim()));
    if (isNaN(min) || isNaN(max) || isNaN(rate)) throw new Error(`Invalid CSV row: ${line}`);
    return { fuelPriceMin: min, fuelPriceMax: max, surchargeRate: rate };
  });
}

// Lookup surcharge rate for a given fuel price
export async function lookupFuelSurcharge(fuelPrice: number, tableId?: string) {
  const where: any = tableId ? { id: tableId } : { isActive: true };
  const table = await prisma.fuelSurchargeTable.findFirst({
    where,
    include: { tiers: { orderBy: { fuelPriceMin: "asc" } } },
    orderBy: { effectiveDate: "desc" },
  });
  if (!table) return null;

  const tier = table.tiers.find((t) => fuelPrice >= t.fuelPriceMin && fuelPrice <= t.fuelPriceMax);
  return tier ? { tableName: table.name, surchargeRate: tier.surchargeRate, surchargeType: tier.surchargeType } : null;
}
