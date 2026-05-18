/**
 * Order Builder backend (v3.5)
 *
 * Supports the draft → quote_sent → quote_approved → order_created →
 * load_created lifecycle. Persists the full form snapshot as JSONB so
 * partial drafts don't require every Load field to be nullable.
 */

import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { logCustomerActivity } from "../services/customerActivityService";
import { logLoadActivity } from "../services/loadActivityService";
import { buildWaterfall, startWaterfall } from "../services/waterfallEngineService";
import { createCheckCallSchedule } from "../services/checkCallAutomation";
import { buildLineItems, LineItemCreateInput } from "../controllers/loadController";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

const AE_ROLES = ["BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE"] as const;

// ─── List / get ───────────────────────────────────────────

// GET /orders?status=draft — list caller's orders
router.get("/", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  // v3.8.d.3 — when status=draft is requested, exclude already-
  // converted orders (loadId !== null). The convert flow stamps
  // status to "load_created", so they shouldn't appear here under
  // normal flow, but the defensive filter prevents surprise re-
  // entries from any future code path that PATCHes status without
  // clearing loadId.
  const draftFilter = status === "draft" ? { loadId: null } : {};
  const orders = await prisma.order.findMany({
    where: {
      createdById: req.user!.id,
      ...(status ? { status } : {}),
      ...draftFilter,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  res.json({ orders });
});

router.get("/:id", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  // v3.8.d.3 — surface the converted load's reference number so the
  // Order Builder can render a "View load" deep-link in its converted-
  // banner gate. order.loadId is the FK; we need referenceNumber +
  // loadNumber to render the public-facing identifier.
  let loadReferenceNumber: string | null = null;
  let loadNumber: string | null = null;
  if (order.loadId) {
    const load = await prisma.load.findUnique({
      where: { id: order.loadId },
      select: { referenceNumber: true, loadNumber: true },
    });
    loadReferenceNumber = load?.referenceNumber ?? null;
    loadNumber = load?.loadNumber ?? null;
  }
  res.json({ order: { ...order, loadReferenceNumber, loadNumber } });
});

// ─── Create / update / auto-save ──────────────────────────

router.post("/", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body ?? {};
    const order = await prisma.order.create({
      data: {
        customerId: body.customerId ?? null,
        status: body.status ?? "draft",
        formData: (body.formData ?? {}) as any,
        customerRate: body.customerRate ?? null,
        targetCost: body.targetCost ?? null,
        equipmentType: body.equipmentType ?? null,
        originCity: body.originCity ?? null,
        originState: body.originState ?? null,
        destCity: body.destCity ?? null,
        destState: body.destState ?? null,
        pickupDate: body.pickupDate ? new Date(body.pickupDate) : null,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        dispatchMethod: body.dispatchMethod ?? null,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ order });
  } catch (err) {
    log.error({ err }, "[Orders] create error");
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.patch("/:id", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body ?? {};
    const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Order not found" });
    if (existing.createdById && existing.createdById !== req.user!.id) {
      const role = req.user?.role ?? "";
      if (!["ADMIN", "CEO", "OPERATIONS"].includes(role)) {
        return res.status(403).json({ error: "Not your order" });
      }
    }

    const data: any = {};
    if (body.customerId !== undefined)     data.customerId = body.customerId ?? null;
    if (body.formData !== undefined)       data.formData = body.formData;
    if (body.customerRate !== undefined)   data.customerRate = body.customerRate;
    if (body.targetCost !== undefined)     data.targetCost = body.targetCost;
    if (body.equipmentType !== undefined)  data.equipmentType = body.equipmentType;
    if (body.originCity !== undefined)     data.originCity = body.originCity;
    if (body.originState !== undefined)    data.originState = body.originState;
    if (body.destCity !== undefined)       data.destCity = body.destCity;
    if (body.destState !== undefined)      data.destState = body.destState;
    if (body.pickupDate !== undefined)     data.pickupDate = body.pickupDate ? new Date(body.pickupDate) : null;
    if (body.deliveryDate !== undefined)   data.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
    if (body.dispatchMethod !== undefined) data.dispatchMethod = body.dispatchMethod;
    if (body.status !== undefined)         data.status = body.status;

    const order = await prisma.order.update({ where: { id: req.params.id }, data });
    res.json({ order });
  } catch (err) {
    log.error({ err }, "[Orders] patch error");
    res.status(500).json({ error: "Failed to update order" });
  }
});

// ─── Quote send ────────────────────────────────────────────

router.post("/:id/send-quote", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { customer: { select: { id: true, name: true, email: true, contactName: true } } },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.customerId) return res.status(400).json({ error: "Order has no customer" });

    const now = new Date();
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "quote_sent", quoteSentAt: now },
    });

    // Email the customer contact (best-effort)
    try {
      const { sendEmail, wrap } = await import("../services/emailService");
      if (order.customer?.email) {
        const lane = `${order.originCity ?? "—"}, ${order.originState ?? ""} → ${order.destCity ?? "—"}, ${order.destState ?? ""}`;
        const html = wrap(`
          <h2 style="color:#0f172a;margin-top:0">Freight Quote · ${order.orderNumber}</h2>
          <p>Hello ${order.customer.contactName ?? order.customer.name ?? "there"},</p>
          <p>Thank you for the opportunity. Please find our quote below.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:160px">Lane</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${lane}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Equipment</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${order.equipmentType ?? "—"}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Pickup</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${order.pickupDate ? new Date(order.pickupDate).toLocaleDateString() : "TBD"}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Delivery</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : "TBD"}</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Rate</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong style="color:#BA7517">$${(order.customerRate ?? 0).toLocaleString()}</strong></td></tr>
          </table>
          <p>Reply to this email to approve, or contact us at <a href="mailto:whaider@silkroutelogistics.ai">whaider@silkroutelogistics.ai</a> with any questions.</p>
          <p style="color:#94a3b8;font-size:12px;margin-top:20px">
            Silk Route Logistics · MC# 1794414 · USDOT# 4526880
          </p>
        `);
        await sendEmail(order.customer.email, `Quote ${order.orderNumber} · ${lane}`, html);
      }
    } catch (err) {
      log.error({ err, orderId: order.id }, "[Orders] quote email failed");
    }

    await logCustomerActivity({
      customerId: order.customerId,
      eventType: "quote_sent",
      description: `Quote ${order.orderNumber} sent${order.customerRate ? ` at $${order.customerRate.toLocaleString()}` : ""}`,
      actorType: "USER",
      actorId: req.user?.id,
      actorName: req.user?.email,
      metadata: { orderId: order.id },
    });

    res.json({ order: updated });
  } catch (err) {
    log.error({ err }, "[Orders] send-quote error");
    res.status(500).json({ error: "Failed to send quote" });
  }
});

// ─── Approve quote (AE marks approved) ────────────────────

router.post("/:id/approve-quote", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: "quote_approved", quoteApprovedAt: new Date() },
  });
  if (order.customerId) {
    await logCustomerActivity({
      customerId: order.customerId,
      eventType: "quote_approved",
      description: `Quote ${order.orderNumber} approved`,
      actorType: "USER",
      actorId: req.user?.id,
      actorName: req.user?.email,
      metadata: { orderId: order.id },
    });
  }
  res.json({ order: updated });
});


export default router;
