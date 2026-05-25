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

// ─── Order Templates (v3.8.akm §13.3 Item 180.2) ──────────
// Named + reusable formData presets per customer for repeat-lane
// workflows. Different from POST /:id/duplicate (one-shot clone):
// templates persist indefinitely + show up in the Section 1 picker.
// IMPORTANT — these routes are registered BEFORE the dynamic /:id
// route below because Express resolves in registration order; if
// /templates landed AFTER /:id, GET /orders/templates would match
// /:id with :id="templates" and 404.

// GET /orders/templates — list templates. Optional ?customerId filter.
router.get("/templates", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const customerId = (req.query.customerId as string | undefined) || undefined;
    const templates = await prisma.orderTemplate.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
      take: 200,
    });
    res.json({ templates });
  } catch (err) {
    log.error({ err }, "[OrderTemplates] list error");
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// POST /orders/templates — create a template from current formData snapshot.
router.post("/templates", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const { name, customerId, formData } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Template name required" });
    }
    if (!customerId || typeof customerId !== "string") {
      return res.status(400).json({ error: "customerId required" });
    }
    const trimmedName = name.trim().slice(0, 120);

    // Verify customer exists. Schema CASCADE handles future delete cleanup
    // but a 404-shape error is friendlier than a P2003 FK violation.
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Unique (customerId, name) constraint per schema — surface P2002 as
    // a friendly 409 so the UI can prompt for a different name instead
    // of showing a 500.
    try {
      const tpl = await prisma.orderTemplate.create({
        data: {
          name: trimmedName,
          customerId,
          formData: (formData ?? {}) as any,
          createdById: req.user!.id,
        },
      });
      res.status(201).json({ template: tpl });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res.status(409).json({ error: `A template named "${trimmedName}" already exists for this customer. Pick a different name.` });
      }
      throw err;
    }
  } catch (err) {
    log.error({ err }, "[OrderTemplates] create error");
    res.status(500).json({ error: "Failed to create template" });
  }
});

// DELETE /orders/templates/:id — remove a template.
router.delete("/templates/:id", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.orderTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    log.error({ err, id: req.params.id }, "[OrderTemplates] delete error");
    res.status(500).json({ error: "Failed to delete template" });
  }
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
    // Sprint 59.b (v3.8.act) Item 176 — loadId whitelist for the 3 non-
    // tender dispatch paths (Waterfall / Load Board / DAT) restored in
    // the Order Builder footer. Those paths POST /api/loads and need
    // to back-link loadId onto the source Order draft. Tender path uses
    // POST /api/loads/with-tender which sets loadId atomically inside
    // its own transaction (withTenderController:223) and does NOT go
    // through this PATCH whitelist.
    if (body.loadId !== undefined)         data.loadId = body.loadId;

    const order = await prisma.order.update({ where: { id: req.params.id }, data });
    res.json({ order });
  } catch (err) {
    log.error({ err }, "[Orders] patch error");
    res.status(500).json({ error: "Failed to update order" });
  }
});

// ─── Quote send ────────────────────────────────────────────

/**
 * v3.8.akl §13.3 Item 180.5 — Quote email HTML builder extracted from
 * the inline send-quote handler so both the send endpoint AND the new
 * GET /:id/quote-preview endpoint can call it. Pre-akl the HTML was
 * built inline in the send handler with no preview path — AE had to
 * click Send to see what landed in the customer's inbox.
 *
 * Brand-chrome canonical note: this builder still uses the pre-akf
 * navy `#0f172a` + slate `#e2e8f0` + whaider@ reply-target. Item 87
 * sweep at v3.8.akf covered emailTemplates.ts + routes/email.ts but
 * did NOT reach this inline orders.ts builder. Migration to skill
 * canonical (`#0A2540` + `#E2EAF2` + operations@) banked as a separate
 * follow-up. The akl atomic explicitly preserves the existing HTML
 * verbatim so the preview === send equivalence test passes; refactor
 * for accuracy now, brand-sweep later.
 */
async function buildQuoteEmail(order: {
  orderNumber: string;
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  equipmentType: string | null;
  pickupDate: Date | null;
  deliveryDate: Date | null;
  customerRate: number | null;
  customer: { name: string | null; contactName: string | null; email: string | null } | null;
}): Promise<{ subject: string; html: string; lane: string }> {
  const { wrap } = await import("../services/emailService");
  const lane = `${order.originCity ?? "—"}, ${order.originState ?? ""} → ${order.destCity ?? "—"}, ${order.destState ?? ""}`;
  const html = wrap(`
    <h2 style="color:#0f172a;margin-top:0">Freight Quote · ${order.orderNumber}</h2>
    <p>Hello ${order.customer?.contactName ?? order.customer?.name ?? "there"},</p>
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
  return { subject: `Quote ${order.orderNumber} · ${lane}`, html, lane };
}

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
      const { sendEmail } = await import("../services/emailService");
      if (order.customer?.email) {
        const { subject, html } = await buildQuoteEmail(order);
        await sendEmail(order.customer.email, subject, html);
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

// v3.8.akl §13.3 Item 180.5 — Quote preview endpoint. Returns the
// exact HTML + subject that send-quote would dispatch, without
// actually sending or mutating order.status. AE opens this in a
// modal before clicking Send so they can catch typos / rate errors
// before they reach the customer inbox.
router.get("/:id/quote-preview", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { customer: { select: { id: true, name: true, email: true, contactName: true } } },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.customerId) return res.status(400).json({ error: "Order has no customer — set customer before previewing quote" });

    const { subject, html, lane } = await buildQuoteEmail(order);
    res.json({
      subject,
      html,
      lane,
      recipientEmail: order.customer?.email ?? null,
      recipientName: order.customer?.contactName ?? order.customer?.name ?? null,
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    log.error({ err }, "[Orders] quote-preview error");
    res.status(500).json({ error: "Failed to build quote preview" });
  }
});

// v3.8.akl §13.3 Item 180.1 — Duplicate this order action. AE running
// repeat lanes (weekly BKN Detroit → Chicago) was re-keying 30+ fields
// per draft. This endpoint clones the source order's customerId + full
// formData snapshot into a brand-new draft row with a fresh
// orderNumber + cleared loadId/status + reset quote timestamps. AE
// then resumes the new draft + adjusts the dated fields (pickup,
// delivery, rate) without rebuilding the lane + freight + refs.
router.post("/:id/duplicate", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const source = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ error: "Source order not found" });

    // orderNumber auto-generates via Prisma schema default (cuid()),
    // matching the canonical POST / create path. Top-level scalar
    // fields cloned from source; formData JSONB cloned verbatim
    // (carries line items, special instructions, PO numbers, etc).
    // Reset workflow timestamps + load linkage on the duplicate so
    // the new draft starts fresh (quote not sent, load not created).
    const duplicate = await prisma.order.create({
      data: {
        customerId: source.customerId,
        status: "draft",
        originCity: source.originCity,
        originState: source.originState,
        destCity: source.destCity,
        destState: source.destState,
        equipmentType: source.equipmentType,
        pickupDate: source.pickupDate,
        deliveryDate: source.deliveryDate,
        customerRate: source.customerRate,
        targetCost: source.targetCost,
        dispatchMethod: source.dispatchMethod,
        formData: (source.formData ?? {}) as any,
        createdById: req.user!.id,
      },
    });

    if (source.customerId) {
      await logCustomerActivity({
        customerId: source.customerId,
        eventType: "order_duplicated",
        description: `Duplicated order ${source.orderNumber} → ${duplicate.orderNumber}`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { sourceOrderId: source.id, duplicateOrderId: duplicate.id },
      });
    }

    res.status(201).json({ order: duplicate });
  } catch (err) {
    log.error({ err, sourceId: req.params.id }, "[Orders] duplicate error");
    res.status(500).json({ error: "Failed to duplicate order" });
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
