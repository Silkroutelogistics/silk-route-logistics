import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";

export async function createCustomer(req: AuthRequest, res: Response) {
  const data = createCustomerSchema.parse(req.body);
  const customer = await prisma.customer.create({ data: data as any });
  res.status(201).json(customer);
}

export async function getCustomers(req: AuthRequest, res: Response) {
  const query = customerQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { contactName: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { shipments: true } } },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.count({ where }),
  ]);

  // Compute total revenue per customer
  const enriched = await Promise.all(
    customers.map(async (c) => {
      const agg = await prisma.shipment.aggregate({
        where: { customerId: c.id },
        _sum: { rate: true },
      });
      return {
        ...c,
        totalShipments: c._count.shipments,
        totalRevenue: agg._sum.rate || 0,
      };
    })
  );

  res.json({ customers: enriched, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getCustomerById(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      shipments: { orderBy: { createdAt: "desc" }, take: 10, include: { driver: true } },
    },
  });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const agg = await prisma.shipment.aggregate({
    where: { customerId: customer.id },
    _sum: { rate: true },
    _count: true,
  });

  res.json({
    ...customer,
    totalShipments: agg._count,
    totalRevenue: agg._sum.rate || 0,
    avgShipmentValue: agg._count > 0 ? (agg._sum.rate || 0) / agg._count : 0,
  });
}

export async function getCustomerStats(req: AuthRequest, res: Response) {
  const [total, active, revenue, shipments] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: "Active" } }),
    prisma.shipment.aggregate({ _sum: { rate: true } }),
    prisma.shipment.count(),
  ]);

  res.json({
    totalCustomers: total,
    activeCustomers: active,
    totalRevenue: revenue._sum.rate || 0,
    totalShipments: shipments,
  });
}

export async function updateCustomer(req: AuthRequest, res: Response) {
  const data = updateCustomerSchema.parse(req.body);
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
  res.json(customer);
}

export async function deleteCustomer(req: AuthRequest, res: Response) {
  await prisma.customer.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
