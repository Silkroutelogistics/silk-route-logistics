import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";

export async function createCustomer(req: AuthRequest, res: Response) {
  const data = createCustomerSchema.parse(req.body);
  const customer = await prisma.customer.create({ data: data as any });

  // Auto-initialize ShipperCredit with default $50K limit
  await prisma.shipperCredit.create({
    data: {
      customerId: customer.id,
      creditLimit: data.creditLimit ?? 50000,
      creditGrade: "B",
      paymentTerms: "NET30",
    },
  }).catch(() => {}); // Ignore if already exists (unique constraint)

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
      include: {
        _count: { select: { shipments: true } },
        contacts: { orderBy: { isPrimary: "desc" }, take: 5 },
      },
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
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] },
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

// ─── Customer Contacts ──────────────────────────────────

const createContactSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const updateContactSchema = createContactSchema.partial();

const updateCreditSchema = z.object({
  creditStatus: z.enum(["NOT_CHECKED", "APPROVED", "CONDITIONAL", "DENIED", "PENDING_REVIEW"]).optional(),
  creditLimit: z.number().positive().optional(),
  creditCheckDate: z.string().transform((s) => new Date(s)).optional(),
});

export async function getCustomerContacts(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const contacts = await prisma.customerContact.findMany({
    where: { customerId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(contacts);
}

export async function addCustomerContact(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const data = createContactSchema.parse(req.body);

  // If this contact is primary, unset other primary contacts for this customer
  if (data.isPrimary) {
    await prisma.customerContact.updateMany({
      where: { customerId: req.params.id, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const contact = await prisma.customerContact.create({
    data: {
      ...data,
      customer: { connect: { id: req.params.id } },
    } as any,
  });
  res.status(201).json(contact);
}

export async function updateCustomerContact(req: AuthRequest, res: Response) {
  const contact = await prisma.customerContact.findFirst({
    where: { id: req.params.cid, customerId: req.params.id },
  });
  if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

  const data = updateContactSchema.parse(req.body);

  // If setting as primary, unset other primary contacts
  if (data.isPrimary) {
    await prisma.customerContact.updateMany({
      where: { customerId: req.params.id, isPrimary: true, id: { not: req.params.cid } },
      data: { isPrimary: false },
    });
  }

  const updated = await prisma.customerContact.update({
    where: { id: req.params.cid },
    data,
  });
  res.json(updated);
}

export async function deleteCustomerContact(req: AuthRequest, res: Response) {
  const contact = await prisma.customerContact.findFirst({
    where: { id: req.params.cid, customerId: req.params.id },
  });
  if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

  await prisma.customerContact.delete({ where: { id: req.params.cid } });
  res.status(204).send();
}

export async function updateCustomerCredit(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const data = updateCreditSchema.parse(req.body);
  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
}
