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
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

const AE_ROLES = ["BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE"] as const;

// ─── List / get ───────────────────────────────────────────

// GET /orders?status=draft — list caller's orders
router.get("/", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const orders = await prisma.order.findMany({
    where: {
      createdById: req.user!.id,
      ...(status ? { status } : {}),
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
  res.json({ order });
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

// ─── Convert to load ──────────────────────────────────────
// Creates a Load record from the order's form_data, sets dispatch
// method + visibility, triggers the appropriate dispatch flow, and
// stamps the order status to load_created.

router.post("/:id/convert-to-load", authorize(...AE_ROLES) as any, async (req: AuthRequest, res: Response) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.loadId) return res.status(409).json({ error: "Order already converted", loadId: order.loadId });

    const form = (order.formData ?? {}) as Record<string, any>;

    // Required validation
    const missing: string[] = [];
    if (!order.customerId) missing.push("customer");
    if (!form.originCity || !form.originState) missing.push("origin");
    if (!form.destCity || !form.destState) missing.push("destination");
    if (!order.pickupDate) missing.push("pickup date");
    if (!order.deliveryDate) missing.push("delivery date");
    if (!form.equipmentType) missing.push("equipment");
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    // Generate a load/reference number
    const refNumber = `L${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
    const bolNumber = `BOL-${Date.now().toString().slice(-8)}`;

    const dispatchMethod = (form.dispatchMethod ?? "waterfall") as string;
    const visibility =
      dispatchMethod === "loadboard"     ? "open"
    : dispatchMethod === "direct_tender" ? "reserved"
    : dispatchMethod === "dat"           ? "dat"
    :                                      "waterfall";

    const priority = form.shipmentPriority ?? "standard";
    const isHot = priority === "hot" || (form.cargoValue && Number(form.cargoValue) > 100000);
    const checkCallProtocol = form.checkCallProtocol ?? (isHot ? "expedited" : "standard");

    const load = await prisma.load.create({
      data: {
        referenceNumber: refNumber,
        loadNumber: refNumber,
        bolNumber,
        customerId: order.customerId!,
        posterId: req.user!.id,
        orderId: order.id,

        // Route
        originCity: form.originCity,
        originState: form.originState,
        originZip: form.originZip ?? "",
        originAddress: form.originAddress ?? null,
        originCompany: form.originCompany ?? null,
        originContactName: form.originContactName ?? null,
        originContactPhone: form.originContactPhone ?? null,
        originFacilityId: form.originFacilityId ?? null,
        originLat: form.originLat ?? null,
        originLng: form.originLng ?? null,
        destCity: form.destCity,
        destState: form.destState,
        destZip: form.destZip ?? "",
        destAddress: form.destAddress ?? null,
        destCompany: form.destCompany ?? null,
        destContactName: form.destContactName ?? null,
        destContactPhone: form.destContactPhone ?? null,
        destFacilityId: form.destFacilityId ?? null,
        destLat: form.destLat ?? null,
        destLng: form.destLng ?? null,

        // Schedule
        pickupDate: order.pickupDate!,
        deliveryDate: order.deliveryDate!,
        pickupTimeStart: form.pickupTimeStart ?? null,
        pickupTimeEnd: form.pickupTimeEnd ?? null,
        deliveryTimeStart: form.deliveryTimeStart ?? null,
        deliveryTimeEnd: form.deliveryTimeEnd ?? null,

        // Freight
        mode: form.mode ?? "FTL",
        equipmentType: form.equipmentType,
        commodity: form.commodity ?? null,
        freightClass: form.freightClass ?? null,
        nmfcCode: form.nmfcCode ?? null,
        weight: form.weight ? Number(form.weight) : null,
        pieces: form.pieces ? parseInt(form.pieces) : null,
        pallets: form.pallets ? parseInt(form.pallets) : null,
        dimensionsLength: form.length ? Number(form.length) : null,
        dimensionsWidth: form.width ? Number(form.width) : null,
        dimensionsHeight: form.height ? Number(form.height) : null,
        stackable: !!form.stackable,
        hazmat: !!form.hazmat,
        temperatureControlled: !!form.temperatureControlled,
        tempMin: form.tempMin ? Number(form.tempMin) : null,
        tempMax: form.tempMax ? Number(form.tempMax) : null,
        tempMode: form.tempMode ?? null,
        customsRequired: !!form.customsRequired,
        driverMode: form.driverMode ?? "solo",
        liveOrDrop: form.liveOrDrop ?? "live",
        cargoValue: form.cargoValue ? Number(form.cargoValue) : null,
        dockAssignment: form.dockAssignment ?? null,

        // Financials
        rate: Number(order.customerRate ?? form.rate ?? 0),
        customerRate: order.customerRate,
        carrierRate: order.targetCost,
        targetCarrierCost: order.targetCost,
        fuelSurcharge: form.fuelSurcharge ? Number(form.fuelSurcharge) : 0,
        fuelSurchargeAmount: form.fuelSurchargeAmount ? Number(form.fuelSurchargeAmount) : null,
        accessorials: form.accessorials ?? undefined,
        lumperEstimate: form.lumperEstimate ? Number(form.lumperEstimate) : null,
        distance: form.distance ? Number(form.distance) : null,

        // Refs
        poNumbers: form.poNumbers ?? [],
        appointmentNumber: form.appointmentNumber ?? null,

        // Instructions
        specialInstructions: form.specialInstructions ?? null,
        driverInstructions: form.driverInstructions ?? null,
        notes: form.internalNotes ?? null,

        // Dispatch
        dispatchMethod,
        visibility,
        waterfallMode: form.waterfallMode ?? "full_auto",
        directTenderCarrierId: form.directTenderCarrierId ?? null,
        checkCallProtocol,
        shipmentPriority: priority,
        isHotLoad: isHot,
        urgencyLevel: isHot ? "EXPEDITED" : "STANDARD",
        trackingLinkAutoSend: form.trackingLinkAutoSend !== false,

        status: "POSTED",
      } as any,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "load_created", loadId: load.id },
    });

    // Activity logs (Rule 12)
    await logLoadActivity({
      loadId: load.id,
      eventType: "load_created",
      description: `Load created from order ${order.orderNumber} · dispatched via ${dispatchMethod}`,
      actorType: "USER",
      actorId: req.user?.id,
      actorName: req.user?.email,
      metadata: { orderId: order.id, dispatchMethod, priority, isHot },
    });
    if (order.customerId) {
      await logCustomerActivity({
        customerId: order.customerId,
        eventType: "load_created",
        description: `Load ${load.loadNumber ?? load.referenceNumber} created · ${form.originCity}, ${form.originState} → ${form.destCity}, ${form.destState} · $${(order.customerRate ?? 0).toLocaleString()}`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { loadId: load.id, orderId: order.id },
      });
    }

    // Check call auto-schedule
    try { await createCheckCallSchedule(load.id); } catch (err) { log.error({ err }, "[Orders] check call schedule failed"); }

    // Dispatch routing
    if (dispatchMethod === "waterfall" && (form.waterfallMode ?? "full_auto") === "full_auto") {
      try {
        const wf = await buildWaterfall(load.id, { mode: "full_auto", createdById: req.user?.id });
        await startWaterfall(wf.id);
      } catch (err) {
        log.error({ err, loadId: load.id }, "[Orders] waterfall auto-start failed");
      }
    }

    // Tracking link fan-out
    if (form.trackingLinkAutoSend !== false) {
      try {
        const { sendTrackingLinkToCrmContacts } = await import("../services/shipperLoadNotifyService");
        await sendTrackingLinkToCrmContacts(load.id);
      } catch (err) {
        log.error({ err }, "[Orders] tracking link fan-out failed");
      }
    }

    res.status(201).json({ load, order: { ...order, status: "load_created", loadId: load.id } });
  } catch (err: any) {
    log.error({ err }, "[Orders] convert-to-load error");
    res.status(500).json({ error: err?.message ?? "Failed to convert order" });
  }
});

export default router;
