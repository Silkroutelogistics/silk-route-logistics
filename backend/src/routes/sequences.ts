import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { prisma } from "../config/database";
import { buildEmail, buildEmailSync } from "../email/builder";
import { z } from "zod";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER"));

// ─── Preview a draft (no DB write) ────────────────────────────
const draftSchema = z.object({
  customerId: z.string(),
  touchNumber: z.number().int().min(1).max(6),
});

router.post("/draft", async (req: AuthRequest, res: Response) => {
  const { customerId, touchNumber } = draftSchema.parse(req.body);
  const built = await buildEmail({ customerId, touchNumber });
  res.json({
    subject: built.subject,
    bodyPlainText: built.bodyPlainText,
    bodyHtml: built.bodyHtml,
    templateAngle: built.templateAngle,
    to: built.to,
  });
});

// ─── Generate and queue a draft (creates Communication with status DRAFT) ──
router.post("/queue-draft", async (req: AuthRequest, res: Response) => {
  const { customerId, touchNumber } = draftSchema.parse(req.body);
  const built = await buildEmail({ customerId, touchNumber });

  const comm = await prisma.communication.create({
    data: {
      type: "EMAIL_OUTBOUND",
      direction: "OUTBOUND",
      entityType: "SHIPPER",
      entityId: customerId,
      from: "whaider@silkroutelogistics.ai",
      to: built.to,
      subject: built.subject,
      body: built.bodyPlainText,
      userId: req.user!.id,
      metadata: {
        status: "DRAFT",
        touchNumber,
        templateAngle: built.templateAngle,
        bodyHtml: built.bodyHtml,
      },
    },
  });

  res.json({ id: comm.id, subject: built.subject, bodyPlainText: built.bodyPlainText, bodyHtml: built.bodyHtml });
});

// ─── Queue view: get all due follow-ups ────────────────────────
router.get("/queue", async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const endOfTomorrow = new Date(endOfToday.getTime() + 86_400_000);
  const endOfWeek = new Date(endOfToday.getTime() + 7 * 86_400_000);

  const customers = await prisma.customer.findMany({
    where: {
      sequenceStatus: "ACTIVE",
      nextTouchDueAt: { not: null, lte: endOfWeek },
      deletedAt: null,
    },
    select: {
      id: true, name: true, contactName: true, email: true, industryType: true,
      currentTouch: true, nextTouchDueAt: true, lastTouchSentAt: true,
      sequenceStatus: true, sequenceCluster: true,
      personalizedHook: true, personalizedRelevance: true,
    },
    orderBy: { nextTouchDueAt: "asc" },
  });

  // Bucket into overdue / today / tomorrow / thisWeek
  const overdue: typeof customers = [];
  const today: typeof customers = [];
  const tomorrow: typeof customers = [];
  const thisWeek: typeof customers = [];

  for (const c of customers) {
    const due = c.nextTouchDueAt!;
    if (due < now) overdue.push(c);
    else if (due <= endOfToday) today.push(c);
    else if (due <= endOfTomorrow) tomorrow.push(c);
    else thisWeek.push(c);
  }

  // Also fetch any DRAFT communications for these customers
  const customerIds = customers.map((c) => c.id);
  const drafts = customerIds.length > 0
    ? await prisma.communication.findMany({
        where: {
          entityType: "SHIPPER",
          entityId: { in: customerIds },
          type: "EMAIL_OUTBOUND",
          metadata: { path: ["status"], equals: "DRAFT" },
        },
        select: { id: true, entityId: true, subject: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const draftsByCustomer = new Map<string, typeof drafts>();
  for (const d of drafts) {
    if (!draftsByCustomer.has(d.entityId)) draftsByCustomer.set(d.entityId, []);
    draftsByCustomer.get(d.entityId)!.push(d);
  }

  res.json({
    counts: { overdue: overdue.length, today: today.length, tomorrow: tomorrow.length, thisWeek: thisWeek.length },
    overdue: overdue.map((c) => ({ ...c, drafts: draftsByCustomer.get(c.id) || [] })),
    today: today.map((c) => ({ ...c, drafts: draftsByCustomer.get(c.id) || [] })),
    tomorrow: tomorrow.map((c) => ({ ...c, drafts: draftsByCustomer.get(c.id) || [] })),
    thisWeek: thisWeek.map((c) => ({ ...c, drafts: draftsByCustomer.get(c.id) || [] })),
  });
});

// ─── Skip a touch ─────────────────────────────────────────────
const skipSchema = z.object({ customerId: z.string(), reason: z.string().optional() });

router.post("/skip-touch", async (req: AuthRequest, res: Response) => {
  const { customerId, reason } = skipSchema.parse(req.body);
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { currentTouch: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const nextTouch = (customer.currentTouch || 1) + 1;
  const cadenceDays = [0, 3, 4, 7, 7, 9]; // days between touches
  const nextDue = nextTouch <= 6 ? new Date(Date.now() + (cadenceDays[nextTouch - 1] || 7) * 86_400_000) : null;

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      currentTouch: nextTouch,
      nextTouchDueAt: nextDue,
      sequenceStatus: nextTouch > 6 ? "COMPLETED" : "ACTIVE",
    },
  });

  // Log the skip
  await prisma.communication.create({
    data: {
      type: "NOTE",
      direction: "OUTBOUND",
      entityType: "SHIPPER",
      entityId: customerId,
      body: `Touch ${customer.currentTouch || 1} skipped${reason ? `: ${reason}` : ""}`,
      userId: req.user!.id,
      metadata: { action: "SKIP", skippedTouch: customer.currentTouch || 1 },
    },
  });

  res.json({ ok: true, nextTouch, nextTouchDueAt: nextDue });
});

// ─── Pause/resume sequence ──────────────────────────────────────
const pauseSchema = z.object({ customerId: z.string(), action: z.enum(["PAUSE", "RESUME", "STOP"]), reason: z.string().optional() });

router.post("/pause", async (req: AuthRequest, res: Response) => {
  const { customerId, action, reason } = pauseSchema.parse(req.body);

  const statusMap = { PAUSE: "PAUSED", RESUME: "ACTIVE", STOP: "STOPPED" } as const;
  const newStatus = statusMap[action];

  // If resuming, recalculate nextTouchDueAt
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { currentTouch: true } });
  const nextTouch = (customer?.currentTouch || 0) + 1;
  const cadenceDays = [0, 3, 4, 7, 7, 9];
  const nextDue = action === "RESUME" && nextTouch <= 6
    ? new Date(Date.now() + (cadenceDays[nextTouch - 1] || 7) * 86_400_000)
    : undefined;

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      sequenceStatus: newStatus,
      ...(nextDue ? { nextTouchDueAt: nextDue } : {}),
      ...(action !== "RESUME" ? { nextTouchDueAt: null } : {}),
    },
  });

  await prisma.communication.create({
    data: {
      type: "NOTE",
      direction: "OUTBOUND",
      entityType: "SHIPPER",
      entityId: customerId,
      body: `Sequence ${action.toLowerCase()}ed${reason ? `: ${reason}` : ""}`,
      userId: req.user!.id,
      metadata: { action: `SEQUENCE_${action}`, reason },
    },
  });

  res.json({ ok: true, status: newStatus });
});

export default router;
