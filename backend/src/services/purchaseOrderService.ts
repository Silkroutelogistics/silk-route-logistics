import { prisma } from "../config/database";

interface CreatePOInput {
  poNumber: string;
  customerId: string;
  tradingPartner?: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  lineItems?: { sku: string; description?: string; quantity: number; unitWeight?: number; dimensions?: string; freightClass?: string }[];
}

export async function createPurchaseOrder(data: CreatePOInput, createdById: string) {
  const { lineItems, ...poData } = data;
  return prisma.purchaseOrder.create({
    data: {
      ...poData,
      orderDate: poData.orderDate ? new Date(poData.orderDate) : new Date(),
      expectedDate: poData.expectedDate ? new Date(poData.expectedDate) : undefined,
      createdById,
      lineItems: lineItems?.length ? { create: lineItems.map((li) => ({ ...li, ordered: li.quantity })) } : undefined,
    },
    include: {
      lineItems: true,
      customer: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      loadLinks: true,
    },
  });
}

export async function getPurchaseOrders(filters: { customerId?: string; status?: string; search?: string; page: number; limit: number }) {
  const where: any = {};
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { poNumber: { contains: filters.search, mode: "insensitive" } },
      { tradingPartner: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        lineItems: true,
        customer: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { loadLinks: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / filters.limit) };
}

export async function getPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lineItems: true,
      customer: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      loadLinks: true,
    },
  });
  if (!po) throw new Error("Purchase order not found");
  return po;
}

export async function updatePurchaseOrder(id: string, data: Partial<CreatePOInput> & { status?: string }) {
  const { lineItems, ...poData } = data;
  const updateData: any = { ...poData };
  if (poData.orderDate) updateData.orderDate = new Date(poData.orderDate);
  if (poData.expectedDate) updateData.expectedDate = new Date(poData.expectedDate);

  if (lineItems) {
    await prisma.pOLineItem.deleteMany({ where: { purchaseOrderId: id } });
    await prisma.pOLineItem.createMany({
      data: lineItems.map((li) => ({ purchaseOrderId: id, ...li, ordered: li.quantity })),
    });
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: updateData,
    include: { lineItems: true, customer: { select: { id: true, name: true } }, loadLinks: true },
  });
}

export async function linkLoadToPO(purchaseOrderId: string, loadId: string) {
  return prisma.pOLoadLink.create({ data: { purchaseOrderId, loadId } });
}

export async function unlinkLoadFromPO(purchaseOrderId: string, loadId: string) {
  return prisma.pOLoadLink.deleteMany({ where: { purchaseOrderId, loadId } });
}

export async function updateLineItemShipped(lineItemId: string, shipped: number) {
  return prisma.pOLineItem.update({ where: { id: lineItemId }, data: { shipped } });
}

export async function updateLineItemReceived(lineItemId: string, received: number) {
  return prisma.pOLineItem.update({ where: { id: lineItemId }, data: { received } });
}
