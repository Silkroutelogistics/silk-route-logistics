import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";
import { sendEmail, wrap } from "../services/emailService";

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

  // Exclude soft-deleted customers unless explicitly requested
  if (req.query.include_deleted !== "true") {
    where.deletedAt = null;
  }

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
  const customer = await prisma.customer.findFirst({
    where: {
      id: req.params.id,
      ...(req.query.include_deleted !== "true" ? { deletedAt: null } : {}),
    },
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
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.customer.count({ where: { status: "Active", deletedAt: null } }),
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
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!customer || customer.deletedAt) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const now = new Date();
  const deletedBy = req.user!.email || req.user!.id;

  // 1. Soft-delete the customer
  await prisma.customer.update({
    where: { id: customer.id },
    data: { deletedAt: now, deletedBy },
  });

  // 2. Cancel active loads for this customer (POSTED, TENDERED, BOOKED, DISPATCHED)
  const activeLoads = await prisma.load.findMany({
    where: {
      customerId: customer.id,
      status: { in: ["POSTED", "TENDERED", "BOOKED", "DISPATCHED"] },
      deletedAt: null,
    },
    select: { id: true, referenceNumber: true, carrierId: true },
  });

  for (const load of activeLoads) {
    await prisma.load.update({
      where: { id: load.id },
      data: {
        status: "CANCELLED",
        deletedAt: now,
        deletedBy,
        cancellationReason: `Customer ${customer.name} deleted`,
      },
    });

    // Notify assigned carrier if any
    if (load.carrierId) {
      await prisma.notification.create({
        data: {
          userId: load.carrierId,
          type: "LOAD_UPDATE",
          title: "Load Cancelled — Customer Removed",
          message: `Load ${load.referenceNumber} has been cancelled because the customer account was removed.`,
          actionUrl: "/carrier/dashboard/my-loads",
        },
      });
    }
  }

  // 3. Void unpaid invoices for this customer's loads
  await prisma.invoice.updateMany({
    where: {
      load: { customerId: customer.id },
      status: { notIn: ["PAID", "VOID"] },
      deletedAt: null,
    },
    data: { status: "VOID", deletedAt: now },
  });

  // 4. Release shipper credit utilization
  const credit = await prisma.shipperCredit.findUnique({ where: { customerId: customer.id } });
  if (credit) {
    await prisma.shipperCredit.update({
      where: { id: credit.id },
      data: {
        currentUtilized: 0,
        autoBlocked: false,
        blockedReason: null,
        blockedAt: null,
      },
    });
  }

  // 5. Deactivate linked shipper user account (if exists)
  if (customer.userId) {
    await prisma.user.update({
      where: { id: customer.userId },
      data: { isActive: false },
    });
  }

  // 6. Notify admins/brokers
  const employees = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "BROKER"] }, isActive: true },
    select: { id: true },
    take: 10,
  });
  if (employees.length > 0) {
    await prisma.notification.createMany({
      data: employees.map((e) => ({
        userId: e.id,
        type: "GENERAL" as const,
        title: "Customer Deleted",
        message: `${customer.name} has been removed by ${deletedBy}. ${activeLoads.length} load(s) cancelled, invoices voided.`,
        actionUrl: "/dashboard/crm",
      })),
    });
  }

  res.json({
    success: true,
    message: "Customer archived",
    details: {
      loadsCancelled: activeLoads.length,
      invoicesVoided: true,
      creditReleased: !!credit,
      userDeactivated: !!customer.userId,
    },
  });
}

export async function restoreCustomer(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || !customer.deletedAt) {
    res.status(404).json({ error: "Archived customer not found" });
    return;
  }

  // 1. Restore customer
  await prisma.customer.update({
    where: { id: customer.id },
    data: { deletedAt: null, deletedBy: null },
  });

  // 2. Reactivate linked shipper user account
  if (customer.userId) {
    await prisma.user.update({
      where: { id: customer.userId },
      data: { isActive: true },
    });
  }

  // 3. Restore voided invoices back to SUBMITTED (cancelled loads stay cancelled — broker must re-create)
  await prisma.invoice.updateMany({
    where: {
      load: { customerId: customer.id },
      status: "VOID",
      deletedAt: { not: null },
    },
    data: { status: "SUBMITTED", deletedAt: null },
  });

  // 4. Notify team
  const employees = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "BROKER"] }, isActive: true },
    select: { id: true },
    take: 10,
  });
  if (employees.length > 0) {
    await prisma.notification.createMany({
      data: employees.map((e) => ({
        userId: e.id,
        type: "GENERAL" as const,
        title: "Customer Restored",
        message: `${customer.name} has been restored. Shipper access reactivated. Note: cancelled loads must be re-created manually.`,
        actionUrl: "/dashboard/crm",
      })),
    });
  }

  res.json({ success: true, message: "Customer restored", userReactivated: !!customer.userId });
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
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const contacts = await prisma.customerContact.findMany({
    where: { customerId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(contacts);
}

export async function addCustomerContact(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
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

export async function bulkCreateCustomers(req: AuthRequest, res: Response) {
  const { customers } = req.body as {
    customers: {
      name: string; contactName?: string; email?: string; phone?: string;
      city?: string; state?: string; type?: string; industryType?: string;
    }[];
  };

  if (!Array.isArray(customers) || customers.length === 0) {
    res.status(400).json({ error: "customers array is required" });
    return;
  }

  // Get existing customer names for duplicate detection
  const existingNames = new Set(
    (await prisma.customer.findMany({
      where: { deletedAt: null },
      select: { name: true },
    })).map((c) => c.name.toLowerCase().trim())
  );

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of customers) {
    if (!row.name || !row.name.trim()) {
      errors.push("Skipped row with empty company name");
      continue;
    }

    if (existingNames.has(row.name.toLowerCase().trim())) {
      skipped++;
      continue;
    }

    try {
      const customer = await prisma.customer.create({
        data: {
          name: row.name.trim(),
          contactName: row.contactName || null,
          email: row.email || null,
          phone: row.phone || null,
          city: row.city || null,
          state: row.state || null,
          type: row.type || "SHIPPER",
          industryType: row.industryType || null,
          status: "Prospect",
        } as any,
      });

      // Auto-initialize ShipperCredit
      await prisma.shipperCredit.create({
        data: {
          customerId: customer.id,
          creditLimit: 50000,
          creditGrade: "B",
          paymentTerms: "NET30",
        },
      }).catch(() => {});

      existingNames.add(row.name.toLowerCase().trim());
      created++;
    } catch (err: any) {
      errors.push(`Failed to create "${row.name}": ${err.message || "Unknown error"}`);
    }
  }

  res.status(201).json({ created, skipped, errors });
}

export async function updateCustomerCredit(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const data = updateCreditSchema.parse(req.body);
  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
}

// ─── Mass Email Campaign ──────────────────────────────────

const MASS_EMAIL_TEMPLATES: Record<string, { subject: string; buildBody: (contactName: string, industryType: string) => string }> = {
  INTRO: {
    subject: "Introducing Silk Route Logistics — Your Freight Partner",
    buildBody: (contactName: string) => `
      <h2 style="color:#C9A84C">Silk Route Logistics Inc.</h2>
      <p>Hi ${contactName},</p>
      <p>I'm reaching out from Silk Route Logistics — a technology-driven freight brokerage based in Kalamazoo, MI.</p>
      <p>We specialize in FTL dry van freight across the Midwest and nationwide, with a focus on:</p>
      <ul>
        <li>Real-time shipment tracking via our shipper portal</li>
        <li>Competitive rates backed by AI-powered market intelligence</li>
        <li>35-point carrier compliance vetting (Compass Engine)</li>
        <li>Dedicated account management — not a call center</li>
      </ul>
      <p>I'd love the opportunity to learn about your shipping needs and see if we can add value. Would you be open to a brief call this week?</p>
      <p>Best regards,<br/>
      <strong>Wasi Haider</strong><br/>
      CEO, Silk Route Logistics Inc.<br/>
      MC# 01794414 | DOT# 4526880<br/>
      (269) 220-6760 | whaider@silkroutelogistics.ai<br/>
      silkroutelogistics.ai</p>`,
  },
  FOLLOW_UP: {
    subject: "Following Up — Silk Route Logistics",
    buildBody: (contactName: string, industryType: string) => `
      <p>Hi ${contactName},</p>
      <p>I wanted to follow up on my previous email about Silk Route Logistics. We recently helped ${industryType || "manufacturing"} companies reduce their freight costs by 8-12% while improving on-time delivery rates.</p>
      <p>If you're currently evaluating freight providers or have any upcoming shipping needs, I'd be happy to provide a no-obligation rate comparison on your top lanes.</p>
      <p>Just reply to this email or book a call at your convenience.</p>
      <p>Best regards,<br/>
      <strong>Wasi Haider</strong><br/>
      CEO, Silk Route Logistics Inc.<br/>
      (269) 220-6760 | whaider@silkroutelogistics.ai</p>`,
  },
  RATE_SHEET: {
    subject: "Silk Route Logistics — Rate Information",
    buildBody: (contactName: string) => `
      <p>Hi ${contactName},</p>
      <p>Thank you for your interest in Silk Route Logistics. Attached is our current rate information for the lanes most relevant to your operation.</p>
      <p>Key highlights:</p>
      <ul>
        <li>FTL Dry Van rates from $2.15/mile (Midwest lanes)</li>
        <li>No hidden fees — all-in rates published monthly</li>
        <li>Quick Pay available for carriers (Net-7 to same-day)</li>
        <li>Free real-time tracking portal for all shipments</li>
      </ul>
      <p>Let me know if you'd like a custom quote on specific lanes.</p>
      <p>Best regards,<br/>
      <strong>Wasi Haider</strong><br/>
      CEO, Silk Route Logistics Inc.<br/>
      (269) 220-6760 | whaider@silkroutelogistics.ai</p>`,
  },
};

const massEmailSchema = z.object({
  customerIds: z.array(z.string()).min(1, "At least one customer is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().optional(),
  templateType: z.enum(["INTRO", "RATE_SHEET", "FOLLOW_UP", "CUSTOM"]),
});

export async function sendMassEmail(req: AuthRequest, res: Response) {
  const { customerIds, subject, body, templateType } = massEmailSchema.parse(req.body);

  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds }, deletedAt: null },
    select: { id: true, name: true, contactName: true, email: true, industryType: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    if (!c.email) {
      skipped++;
      continue;
    }

    const fullName = c.contactName || c.name;
    const firstName = fullName.split(/\s+/)[0]; // Extract first name only
    let emailBody: string;

    if (templateType === "CUSTOM") {
      emailBody = (body || "")
        .replace(/\{contactName\}/g, firstName)
        .replace(/\{fullName\}/g, fullName);
    } else {
      const template = MASS_EMAIL_TEMPLATES[templateType];
      emailBody = template.buildBody(firstName, c.industryType || "");
    }

    const html = wrap(emailBody);

    try {
      await sendEmail(c.email, subject, html);
      sent++;

      await prisma.systemLog.create({
        data: {
          logType: "INTEGRATION",
          severity: "INFO",
          source: "MassEmailCampaign",
          message: `Campaign email sent to ${c.name} (${c.email}) — template: ${templateType}`,
          details: { customerId: c.id, subject, templateType },
        },
      });
    } catch (err: any) {
      failed++;
      await prisma.systemLog.create({
        data: {
          logType: "INTEGRATION",
          severity: "ERROR",
          source: "MassEmailCampaign",
          message: `Failed to send campaign email to ${c.name} (${c.email}): ${err.message || "Unknown error"}`,
          details: { customerId: c.id, subject, templateType },
        },
      });
    }

    // 500ms delay between sends to avoid rate limits
    if (i < customers.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  res.json({ sent, failed, skipped });
}
