import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";
import { sendEmail, wrap } from "../services/emailService";
import { EMAIL_SIGNATURE } from "../services/emailSequenceService";

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
  if (query.industry) where.industryType = { contains: query.industry, mode: "insensitive" };
  if (query.city) where.city = { contains: query.city, mode: "insensitive" };
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
        _count: { select: { shipments: true, loads: true } },
        contacts: { orderBy: { isPrimary: "desc" }, take: 5 },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.count({ where }),
  ]);

  // v3.5.c — Compute revenue and load count from the loads table. The
  // legacy shipments table is almost always empty (loads is the canonical
  // freight record). Prefer customerRate; fall back to rate.
  const enriched = await Promise.all(
    customers.map(async (c) => {
      const loadAgg = await prisma.load.aggregate({
        where: { customerId: c.id, deletedAt: null },
        _sum: { customerRate: true, rate: true },
        _count: true,
      });
      const loadRevenue = (loadAgg._sum.customerRate ?? 0) || (loadAgg._sum.rate ?? 0);
      const shipmentAgg = await prisma.shipment.aggregate({
        where: { customerId: c.id },
        _sum: { rate: true },
      });
      const totalRevenue = loadRevenue + (shipmentAgg._sum.rate ?? 0);
      return {
        ...c,
        totalShipments: c._count.shipments,
        totalLoads: loadAgg._count ?? c._count.loads ?? 0,
        totalRevenue,
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
      accountRep: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  // Communication is linked via (entityType, entityId), not a Prisma relation,
  // so we fetch it in parallel with the shipment rollup.
  const [agg, communications] = await Promise.all([
    prisma.shipment.aggregate({
      where: { customerId: customer.id },
      _sum: { rate: true },
      _count: true,
    }),
    prisma.communication.findMany({
      where: { entityType: "SHIPPER", entityId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
  ]);

  res.json({
    ...customer,
    communications,
    totalShipments: agg._count,
    totalRevenue: agg._sum.rate || 0,
    avgShipmentValue: agg._count > 0 ? (agg._sum.rate || 0) / agg._count : 0,
  });
}

// Unified Lead Hunter activity feed: merges Communication events (calls/emails/notes)
// with SystemLog entries (stage transitions, imports) into a single reverse-chron feed.
// ?customerId= scopes to a single prospect (used by the drawer Activity tab).
export async function getActivityFeed(req: AuthRequest, res: Response) {
  const limit = Math.min(200, parseInt((req.query.limit as string) || "100"));
  const type = req.query.type as string | undefined; // "call" | "email" | "note" | "stage_change" | "import"
  const customerId = req.query.customerId as string | undefined;

  const wantComm = !type || ["call", "email", "note"].includes(type);
  const wantSys = !type || ["stage_change", "import"].includes(type);

  const commWhere: Record<string, unknown> = { entityType: "SHIPPER" };
  if (customerId) commWhere.entityId = customerId;

  // Filter SystemLog by customerId via a raw JSON-path match on details.customerId.
  // Prisma's Json filter syntax is limited, so for the scoped case we use a narrow
  // `string_contains` on the serialized details field.
  const sysWhere: Record<string, unknown> = {
    source: {
      in: [
        "LeadHunter.bulkUpdateStage",
        "LeadHunter.updateCustomer",
        "LeadHunter.bulkImport",
      ],
    },
  };
  if (customerId) {
    sysWhere.details = { path: ["customerId"], equals: customerId };
  }

  const [comms, sysLogs, customers] = await Promise.all([
    wantComm
      ? prisma.communication.findMany({
          where: commWhere,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        })
      : Promise.resolve([]),
    wantSys
      ? prisma.systemLog.findMany({
          where: sysWhere as any,
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    prisma.customer.findMany({
      where: { deletedAt: null, ...(customerId ? { id: customerId } : {}) },
      select: { id: true, name: true, contactName: true },
    }),
  ]);

  const nameById = new Map(customers.map((c) => [c.id, { name: c.name, contactName: c.contactName }]));

  type FeedEvent = {
    id: string;
    kind: "call" | "email" | "note" | "stage_change" | "import";
    timestamp: string;
    customerId: string | null;
    customerName: string | null;
    actor: string;
    summary: string;
    detail: string | null;
  };

  const events: FeedEvent[] = [];

  for (const c of comms) {
    const kind: FeedEvent["kind"] =
      c.type.startsWith("CALL") ? "call" :
      c.type.startsWith("EMAIL") ? "email" : "note";
    if (type && type !== kind) continue;
    const person = nameById.get(c.entityId);
    events.push({
      id: `comm:${c.id}`,
      kind,
      timestamp: c.createdAt.toISOString(),
      customerId: c.entityId,
      customerName: person?.name ?? null,
      actor: c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() || c.user.email || "—" : "—",
      summary: c.subject || c.body?.slice(0, 80) || `${kind} logged`,
      detail: c.body,
    });
  }

  for (const s of sysLogs) {
    const details = (s.details as Record<string, unknown>) || {};
    const kind: FeedEvent["kind"] =
      s.source === "LeadHunter.bulkImport" ? "import" : "stage_change";
    if (type && type !== kind) continue;
    const customerId = (details.customerId as string) || null;
    const person = customerId ? nameById.get(customerId) : null;
    events.push({
      id: `log:${s.id}`,
      kind,
      timestamp: s.createdAt.toISOString(),
      customerId,
      customerName: person?.name ?? null,
      actor: (details.actor as string) || "—",
      summary: s.message,
      detail: details.from && details.to ? `${details.from} → ${details.to}` : null,
    });
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json({ events: events.slice(0, limit), total: events.length });
}

export async function getCustomerIndustries(_req: AuthRequest, res: Response) {
  const rows = await prisma.customer.findMany({
    where: { deletedAt: null, industryType: { not: null } },
    select: { industryType: true },
    distinct: ["industryType"],
    orderBy: { industryType: "asc" },
  });
  res.json(rows.map((r) => r.industryType).filter((v): v is string => !!v));
}

export async function getCustomerStats(req: AuthRequest, res: Response) {
  const [total, active, revenue, shipments, stageGroups] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.customer.count({ where: { status: "Active", deletedAt: null } }),
    prisma.shipment.aggregate({ _sum: { rate: true } }),
    prisma.shipment.count(),
    prisma.customer.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const pipeline = { lead: 0, contacted: 0, qualified: 0, proposal: 0, won: 0 };
  for (const g of stageGroups) {
    const n = g._count._all;
    switch (g.status) {
      case "Prospect": pipeline.lead += n; break;
      case "Contacted": pipeline.contacted += n; break;
      case "Qualified": pipeline.qualified += n; break;
      case "Proposal": pipeline.proposal += n; break;
      case "Active": pipeline.won += n; break;
    }
  }

  const wonPlusLost = pipeline.won + pipeline.lead + pipeline.contacted + pipeline.qualified + pipeline.proposal;
  const winRate = wonPlusLost > 0 ? (pipeline.won / wonPlusLost) * 100 : 0;

  res.json({
    totalCustomers: total,
    activeCustomers: active,
    totalRevenue: revenue._sum.rate || 0,
    totalShipments: shipments,
    pipeline,
    winRate,
  });
}

export async function updateCustomer(req: AuthRequest, res: Response) {
  const data = updateCustomerSchema.parse(req.body);

  // Capture the pre-update status so we can log a transition if it changed.
  const prior = data.status != null
    ? await prisma.customer.findUnique({ where: { id: req.params.id }, select: { status: true } })
    : null;

  const customer = await prisma.customer.update({ where: { id: req.params.id }, data: data as any });

  if (prior && data.status && prior.status !== data.status) {
    await prisma.systemLog.create({
      data: {
        logType: "STATUS_CHANGE",
        severity: "INFO",
        source: "LeadHunter.updateCustomer",
        message: `Customer ${customer.id}: ${prior.status} → ${data.status}`,
        details: {
          customerId: customer.id,
          from: prior.status,
          to: data.status,
          actor: req.user!.email || req.user!.id,
        },
      },
    });
  }

  res.json(customer);
}

const VALID_PIPELINE_STATUSES = ["Prospect", "Contacted", "Qualified", "Proposal", "Active"] as const;

const bulkStageSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids array is required"),
  status: z.enum(VALID_PIPELINE_STATUSES),
});

export async function bulkUpdateStage(req: AuthRequest, res: Response) {
  const { ids, status } = bulkStageSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, status: true },
    });

    if (existing.length === 0) return { updated: 0, transitions: [] as { id: string; from: string; to: string }[] };

    const update = await tx.customer.updateMany({
      where: { id: { in: existing.map((c) => c.id) } },
      data: { status },
    });

    // Log transitions for audit trail (CLAUDE.md rule 12)
    const transitions = existing
      .filter((c) => c.status !== status)
      .map((c) => ({ id: c.id, from: c.status, to: status }));

    if (transitions.length > 0) {
      await tx.systemLog.createMany({
        data: transitions.map((t) => ({
          logType: "STATUS_CHANGE" as const,
          severity: "INFO" as const,
          source: "LeadHunter.bulkUpdateStage",
          message: `Customer ${t.id}: ${t.from} → ${t.to}`,
          details: { customerId: t.id, from: t.from, to: t.to, actor: req.user!.email || req.user!.id },
        })),
      });
    }

    return { updated: update.count, transitions };
  });

  res.json({ updated: result.updated, changed: result.transitions.length });
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

  // Index existing customers by normalized email (primary key) and by name (fallback for rows with no email)
  const existingRows = await prisma.customer.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of existingRows) {
    if (row.email) byEmail.set(row.email.toLowerCase().trim(), row.id);
    byName.set(row.name.toLowerCase().trim(), row.id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of customers) {
    const name = row.name?.trim();
    if (!name) {
      errors.push("Skipped row with empty company name");
      continue;
    }
    const email = row.email?.trim().toLowerCase() || null;

    // Prefer email match; fall back to name match only when row has no email
    const existingId = email ? byEmail.get(email) : byName.get(name.toLowerCase());

    try {
      if (existingId) {
        // Update only non-empty fields so the import never erases existing data
        const patch: Record<string, unknown> = {};
        if (row.contactName) patch.contactName = row.contactName;
        if (row.phone) patch.phone = row.phone;
        if (row.city) patch.city = row.city;
        if (row.state) patch.state = row.state;
        if (row.industryType) patch.industryType = row.industryType;
        if (email) patch.email = email;
        if (Object.keys(patch).length === 0) {
          skipped++;
          continue;
        }
        await prisma.customer.update({ where: { id: existingId }, data: patch });
        updated++;
      } else {
        const customer = await prisma.customer.create({
          data: {
            name,
            contactName: row.contactName || null,
            email: email,
            phone: row.phone || null,
            city: row.city || null,
            state: row.state || null,
            type: row.type || "SHIPPER",
            industryType: row.industryType || null,
            status: "Prospect",
          } as any,
        });

        await prisma.shipperCredit.create({
          data: {
            customerId: customer.id,
            creditLimit: 50000,
            creditGrade: "B",
            paymentTerms: "NET30",
          },
        }).catch(() => {});

        if (email) byEmail.set(email, customer.id);
        byName.set(name.toLowerCase(), customer.id);
        created++;
      }
    } catch (err: any) {
      errors.push(`Failed to upsert "${name}": ${err.message || "Unknown error"}`);
    }
  }

  // One summary audit row per import batch — no per-prospect noise
  await prisma.systemLog.create({
    data: {
      logType: "INTEGRATION",
      severity: "INFO",
      source: "LeadHunter.bulkImport",
      message: `Imported ${created} new, updated ${updated} existing prospects from CSV`,
      details: {
        created,
        updated,
        skipped,
        errorCount: errors.length,
        total: customers.length,
        actor: req.user!.email || req.user!.id,
      },
    },
  });

  res.status(201).json({ created, updated, skipped, errors });
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
      <p>Hi ${contactName},</p>
      <p>I hope this message finds you well. My name is Wasih Haider, and I'm the founder of <strong>Silk Route Logistics</strong> — a technology-driven freight brokerage based in Kalamazoo, Michigan.</p>
      <p>Inspired by the ancient Silk Road that connected civilizations through trade, we built SRL to connect shippers and carriers across North America with the same principles: <strong>trust, transparency, and reliability</strong>.</p>
      <p>What makes us different:</p>
      <ul style="line-height:1.8">
        <li><strong>AI-Powered Operations</strong> — Our proprietary platform uses artificial intelligence for rate predictions, carrier matching, and real-time tracking — giving you enterprise-grade visibility without the enterprise price tag</li>
        <li><strong>Compass Compliance Engine</strong> — Every carrier in our network passes a 35-point safety and compliance vetting process before hauling a single load</li>
        <li><strong>Self-Service Shipper Portal</strong> — Track shipments, view invoices, request quotes, and manage documents 24/7 from your own dashboard at silkroutelogistics.ai</li>
        <li><strong>Dedicated Account Team</strong> — You'll always speak to someone who knows your business. No call centers, no ticket queues</li>
      </ul>
      <p>I'd genuinely love to learn about your shipping operations and explore whether we can add value. Even if the timing isn't right, I'm happy to provide a <strong>free, no-obligation freight audit</strong> on your top lanes.</p>
      <p>Would you be open to a brief 10-minute call this week?</p>
      <p>Best regards,</p>
      ${EMAIL_SIGNATURE}`,
  },
  FOLLOW_UP: {
    subject: "Following Up — Silk Route Logistics",
    buildBody: (contactName: string, industryType: string) => `
      <p>Hi ${contactName},</p>
      <p>I wanted to follow up on my previous email about Silk Route Logistics. We recently helped ${industryType || "manufacturing"} companies reduce their freight costs by 8-12% while improving on-time delivery rates.</p>
      <p>If you're currently evaluating freight providers or have any upcoming shipping needs, I'd be happy to provide a no-obligation rate comparison on your top lanes.</p>
      <p>Just reply to this email or book a call at your convenience.</p>
      <p>Best regards,</p>
      ${EMAIL_SIGNATURE}`,
  },
  CAPACITY: {
    subject: "Freight capacity when you need it — Silk Route Logistics",
    buildBody: (contactName: string, industryType: string) => `
      <p>Hi ${contactName},</p>
      <p>I know finding reliable freight capacity can be a headache — especially during peak seasons or when you need last-minute trucks${industryType ? ` for ${industryType} shipments` : ""}.</p>
      <p>At Silk Route Logistics, we maintain a vetted carrier network across all 48 states with:</p>
      <ul style="line-height:1.8">
        <li><strong>Same-day truck coverage</strong> — Dry van, flatbed, reefer, and specialized</li>
        <li><strong>98% pickup rate</strong> — When we commit to a load, it gets picked up</li>
        <li><strong>Real-time GPS tracking</strong> — Full visibility from pickup to delivery, no check-call phone tag</li>
        <li><strong>Dedicated point of contact</strong> — You deal with me directly, not a rotating desk</li>
      </ul>
      <p>If you ever find yourself short on capacity or want a backup option for critical loads, I'd love to be that call you make.</p>
      <p>Happy to start with a single trial load so you can see how we operate — no long-term commitment required.</p>
      <p>Best regards,</p>
      ${EMAIL_SIGNATURE}`,
  },
};

const massEmailSchema = z.object({
  customerIds: z.array(z.string()).min(1, "At least one customer is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().optional(),
  templateType: z.enum(["INTRO", "CAPACITY", "FOLLOW_UP", "CUSTOM"]),
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
      await sendEmail(c.email, subject, html, undefined, { replyTo: "whaider@silkroutelogistics.ai", fromName: "Wasih Haider" });
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

      // Log as Communication for Lead Hunter conversation trail
      await prisma.communication.create({
        data: {
          type: "EMAIL_OUTBOUND",
          direction: "OUTBOUND",
          entityType: "SHIPPER",
          entityId: c.id,
          from: "whaider@silkroutelogistics.ai",
          to: c.email,
          subject,
          body: `[Mass email — template: ${templateType}]`,
          userId: req.user!.id,
          metadata: { templateType, source: "MassEmailCampaign" },
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
