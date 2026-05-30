import { Router, Response } from "express";
import path from "path";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { upload } from "../config/upload";
import { uploadFile } from "../services/storageService";
import { nextShipmentNumber } from "../controllers/shipmentController";
import { sendPODToContact, sendPickupNotification, sendInTransitUpdate, sendArrivedAtDelivery, sendDeliveredWithPOD } from "../services/shipperLoadNotifyService";
import { sendShipperPickupEmail, sendShipperDeliveryEmail, sendShipperMilestoneEmail } from "../services/shipperNotificationService";
import { autoGenerateInvoice } from "../services/invoiceService";
import { onLoadDelivered } from "../services/integrationService";
import { onLoadStatusChange as aiOnLoadStatusChange, onCarrierResponse } from "../services/aiLearningLoop/feedbackCollector";
import { processGpsUpdate } from "../services/geofenceService";
import { logLoadActivity } from "../services/loadActivityService";
import { isValidExceptionCode, getExceptionReason } from "../services/exceptionTaxonomy";
import { broadcastSSE } from "./trackTraceSSE";
import { log } from "../lib/logger";
import { validateLoadStatusTransition } from "../lib/loadStateMachine";
import { actualEventStamps } from "../lib/loadEventStamps";

const router = Router();

router.use(authenticate);
router.use(authorize("CARRIER"));

// v3.8.ajx H1+C4 — SUSPENDED gate for carrier-side mutation endpoints.
//
// Pre-ajx the 5 write endpoints (/:id/status, /:id/documents, /:id/check-call,
// /:id/exceptions, /:id/exceptions/:excId/receipt) only checked load ownership
// (`load.carrierId !== req.user!.id` → 403). A carrier whose onboarding flipped
// to SUSPENDED mid-flight (insurance expired, FMCSA authority revoked, manual
// AE suspension via OverrideComplianceModal/admin) could still continue to
// mutate their active loads — upload POD, mark IN_TRANSIT, fire check calls —
// because the gate fired upstream on TENDER but not on per-load mutation.
//
// complianceMonitorService.ts auto-suspends in 4 branches (insurance-expiry
// L1424, monthly re-vetting L1553, authority-change L1662, safety-rating
// L1702). C4 closes the gap by enforcing the gate at carrier-action time:
// SUSPENDED → 403 with structured code so the carrier portal can surface
// "Your account is suspended. Contact compliance@silkroutelogistics.ai."
//
// Returns `false` when blocked (response already sent). Returns `true` when
// the carrier may proceed.
async function checkCarrierNotSuspended(req: AuthRequest, res: Response): Promise<boolean> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: { onboardingStatus: true },
  });
  if (profile?.onboardingStatus === "SUSPENDED") {
    res.status(403).json({
      error: "Your account is suspended. Contact compliance@silkroutelogistics.ai.",
      code: "CARRIER_SUSPENDED",
    });
    return false;
  }
  return true;
}

// GET /api/carrier-loads/available — Loads matching carrier's equipment/regions
router.get("/available", async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  if (profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({ error: "Carrier must be approved to view available loads" });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

  // Find POSTED loads matching carrier equipment
  const where: Record<string, unknown> = {
    status: "POSTED",
    carrierId: null,
    deletedAt: null,
  };

  // Filter by equipment type if carrier has preferences
  if (profile.equipmentTypes && profile.equipmentTypes.length > 0) {
    where.equipmentType = { in: profile.equipmentTypes };
  }

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, referenceNumber: true,
        originCity: true, originState: true, originZip: true,
        destCity: true, destState: true, destZip: true,
        equipmentType: true, weight: true, commodity: true,
        carrierRate: true, rate: true, distance: true,
        pickupDate: true, deliveryDate: true,
        pickupTimeStart: true, pickupTimeEnd: true,
        deliveryTimeStart: true, deliveryTimeEnd: true,
        specialInstructions: true,
        status: true, createdAt: true,
      },
    }),
    prisma.load.count({ where }),
  ]);

  // Enrich loads with facility detention warnings
  const { getFacilityDetentionWarning } = await import("../services/detentionTrackingService");
  const enrichedLoads = await Promise.all(
    loads.map(async (load) => {
      const pickupWarning = await getFacilityDetentionWarning("", load.originCity, load.originState);
      const deliveryWarning = await getFacilityDetentionWarning("", load.destCity, load.destState);
      return {
        ...load,
        detentionWarnings: {
          pickup: pickupWarning,
          delivery: deliveryWarning,
        },
      };
    })
  );

  res.json({ loads: enrichedLoads, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/carrier-loads/my-loads — Carrier's assigned loads
router.get("/my-loads", async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const status = req.query.status as string;

  const where: Record<string, unknown> = {
    carrierId: req.user!.id,
    deletedAt: null,
  };
  if (status && status !== "ALL") {
    where.status = status;
  }

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, referenceNumber: true,
        originCity: true, originState: true, originZip: true, originCompany: true,
        destCity: true, destState: true, destZip: true, destCompany: true,
        equipmentType: true, weight: true, commodity: true,
        carrierRate: true, rate: true, distance: true,
        pickupDate: true, deliveryDate: true,
        pickupTimeStart: true, pickupTimeEnd: true,
        deliveryTimeStart: true, deliveryTimeEnd: true,
        specialInstructions: true, status: true,
        driverName: true, driverPhone: true, truckNumber: true, trailerNumber: true,
        rateConfirmationPdfUrl: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.load.count({ where }),
  ]);

  res.json({ loads, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/carrier-loads/:id — Get single load detail
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({
    where: { id: req.params.id },
    include: {
      poster: { select: { firstName: true, lastName: true, company: true, phone: true, email: true } },
      carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { companyName: true, mcNumber: true, dotNumber: true } } } },
      customer: { select: { name: true, contactName: true, email: true, phone: true } },
      documents: { where: { docType: { in: ["RATE_CON", "BOL", "POD"] } } },
    },
  });

  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  // Carrier can only see their own loads or POSTED loads
  if (load.carrierId !== req.user!.id && load.status !== "POSTED") {
    res.status(403).json({ error: "Not authorized to view this load" });
    return;
  }

  res.json(load);
});

const acceptSchema = z.object({
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  truckNumber: z.string().optional(),
  trailerNumber: z.string().optional(),
});

// POST /api/carrier-loads/:id/accept — Accept a posted load
router.post("/:id/accept", validateBody(acceptSchema), async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile || profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({ error: "Carrier must be approved to accept loads" });
    return;
  }

  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.status !== "POSTED") {
    res.status(400).json({ error: "Load is no longer available (status: " + load.status + ")" });
    return;
  }

  const { driverName, driverPhone, truckNumber, trailerNumber } = req.body;

  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      carrierId: req.user!.id,
      status: "BOOKED",
      driverName: driverName || null,
      driverPhone: driverPhone || null,
      truckNumber: truckNumber || null,
      trailerNumber: trailerNumber || null,
    },
  });

  // Auto-create linked Shipment (same as tender acceptance path)
  const shipmentNumber = await nextShipmentNumber();
  await prisma.shipment.create({
    data: {
      shipmentNumber,
      loadId: load.id,
      status: "BOOKED",
      originCity: load.originCity,
      originState: load.originState,
      originZip: load.originZip,
      destCity: load.destCity,
      destState: load.destState,
      destZip: load.destZip,
      equipmentType: load.equipmentType,
      commodity: load.commodity,
      weight: load.weight,
      pieces: load.pieces,
      rate: load.carrierRate || load.rate,
      distance: load.distance,
      specialInstructions: load.specialInstructions,
      customerId: load.customerId,
      pickupDate: load.pickupDate,
      deliveryDate: load.deliveryDate,
    },
  });

  // Auto-decline any other active tenders for this load
  await prisma.loadTender.updateMany({
    where: { loadId: load.id, status: { in: ["OFFERED", "COUNTERED"] } },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  // Create notification for the poster/broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: "Load Accepted",
        message: `Load ${load.referenceNumber} has been accepted by carrier. Shipment ${shipmentNumber} created for tracking.`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }

  // Update CPP stats
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      cppTotalLoads: { increment: 1 },
      cppTotalMiles: { increment: load.distance || 0 },
    },
  });

  // AI Learning Loop: record carrier acceptance
  aiOnLoadStatusChange(load.id, "POSTED", "BOOKED", new Date()).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );
  onCarrierResponse(req.user!.id, load.id, "ACCEPTED", 0).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  res.json(updated);
});

// POST /api/carrier-loads/:id/decline — Decline a load tender
router.post("/:id/decline", async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  // Log the decline as a tender event if tender exists
  const tender = await prisma.loadTender.findFirst({
    where: { loadId: load.id, carrierId: { not: undefined } },
    orderBy: { createdAt: "desc" },
  });

  if (tender) {
    await prisma.loadTender.update({
      where: { id: tender.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
  }

  // AI Learning Loop: record carrier decline
  onCarrierResponse(req.user!.id, load.id, "DECLINED", 0).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Declined",
        message: `A carrier declined load ${load.referenceNumber}.`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  res.json({ success: true });
});

const updateDriverSchema = z.object({
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  truckNumber: z.string().optional(),
  trailerNumber: z.string().optional(),
});

// PATCH /api/carrier-loads/:id/driver — Update driver/truck info on assigned load
router.patch("/:id/driver", validateBody(updateDriverSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }

  const { driverName, driverPhone, truckNumber, trailerNumber } = req.body;
  const data: Record<string, unknown> = {};
  if (driverName !== undefined) data.driverName = driverName;
  if (driverPhone !== undefined) data.driverPhone = driverPhone;
  if (truckNumber !== undefined) data.truckNumber = truckNumber;
  if (trailerNumber !== undefined) data.trailerNumber = trailerNumber;

  const updated = await prisma.load.update({ where: { id: load.id }, data });
  res.json(updated);
});

// POST /api/carrier-loads/:id/status — Update load status (carrier-side)
const statusUpdateSchema = z.object({
  status: z.enum(["AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"]),
  note: z.string().optional(),
});

router.post("/:id/status", validateBody(statusUpdateSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!(await checkCarrierNotSuspended(req, res))) return;

  const { status, note } = req.body;
  const oldStatus = load.status;

  // v3.8.ajw C3 — Reject illegitimate transitions (BOOKED→DELIVERED skip,
  // backwards jumps, etc.). Carrier-side state machine canonicalized in
  // src/lib/loadStateMachine.ts. Returns 422 with the structured reason so
  // the carrier portal can surface a useful message ("Cannot jump from
  // BOOKED to DELIVERED. Next allowed: AT_PICKUP.") instead of a generic
  // 500 from downstream code that assumed the state machine was honored.
  const transition = validateLoadStatusTransition(oldStatus, status, "CARRIER");
  if (!transition.allowed) {
    res.status(422).json({
      error: transition.reason ?? "Invalid status transition",
      code: transition.code,
      from: oldStatus,
      to: status,
    });
    return;
  }

  // Build B (2026-05-30): AT_PICKUP is now the PRIMARY pickup-time signal
  // (arrival at shipper = the on-time-pickup moment); LOADED/IN_TRANSIT remain
  // fallbacks, never overwriting an earlier AT_PICKUP stamp. Replaces the prior
  // unconditional LOADED/IN_TRANSIT overwrite. See lib/loadEventStamps.ts.
  const data: Record<string, unknown> = { status, ...actualEventStamps(status, load) };

  const updated = await prisma.load.update({ where: { id: load.id }, data });

  // T&T activity + real-time board push
  await logLoadActivity({
    loadId: load.id,
    eventType: "status_change",
    description: `Status ${oldStatus} → ${status}`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { from: oldStatus, to: status, source: "carrier_portal" },
  });
  broadcastSSE({ type: "status_change", loadId: load.id, data: { from: oldStatus, to: status } });

  // AI Learning Loop: record carrier status change
  aiOnLoadStatusChange(load.id, oldStatus, status, new Date()).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  // Create check call for the status update
  try {
    await prisma.checkCall.create({
      data: {
        loadId: load.id,
        calledById: req.user!.id,
        status,
        notes: note || `Carrier updated status to ${status}`,
      },
    });
  } catch {
    // Non-critical, don't fail the request
  }

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Status Updated",
        message: `Load ${load.referenceNumber} status: ${status.replace(/_/g, " ")}`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  // v3.8.akc Item 158 — Shipment + shipper fan-out, MIGRATED from the
  // pre-akc dead route loadController.carrierUpdateStatus (PATCH
  // /api/loads/:id/carrier-status). That route was authorize("CARRIER")
  // only, had richer side effects (Shipment sync + shipper email cascade
  // + auto-invoice on DELIVERED + onLoadDelivered integration), and was
  // wired to a frontend mutation on /dashboard/loads that never fired in
  // production (the CarrierActions conditional render gates on
  // isCarrier(user?.role) but carriers route to /carrier/dashboard, not
  // /dashboard). Net effect pre-akc: carrier portal status updates went
  // through the canonical POST /api/carrier-loads/:id/status but missed
  // the shipper-notification + auto-invoice fan-outs that the dead route
  // was doing. akc merges the side effects into the canonical, then
  // deletes the dead route + dead controller + dead frontend mutation.

  // Shipment status sync — maps load statuses to ShipmentStatus enum.
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    const loadToShipmentStatus: Record<string, string> = {
      AT_PICKUP: "PICKED_UP", LOADED: "PICKED_UP",
      IN_TRANSIT: "IN_TRANSIT", AT_DELIVERY: "DELIVERED", DELIVERED: "DELIVERED",
    };
    const mappedStatus = loadToShipmentStatus[status] || status;
    const shipmentUpdate: Record<string, unknown> = { status: mappedStatus };
    if (["AT_PICKUP", "LOADED"].includes(status)) shipmentUpdate.actualPickup = new Date();
    if (status === "IN_TRANSIT") shipmentUpdate.lastLocationAt = new Date();
    if (["AT_DELIVERY", "DELIVERED"].includes(status)) shipmentUpdate.actualDelivery = new Date();
    await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentUpdate });
  }

  // Auto-invoice + integration + delivery email on DELIVERED.
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
    sendShipperDeliveryEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] delivery email error:"));
    onLoadDelivered(load.id).catch((e) => log.error({ err: e }, "[Integration] onLoadDelivered error:"));
  }

  // Pickup email on LOADED (single-event shipper notification).
  if (status === "LOADED") {
    sendShipperPickupEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] pickup email error:"));
  }

  // Milestone email — fires for every status change, batched-aware on receiver side.
  sendShipperMilestoneEmail(load.id, status).catch((e) => log.error({ err: e }, "[ShipperNotify] milestone email error:"));

  // CRM contact-email cascade per status — pickup arrival, in-transit,
  // delivery arrival, POD delivery. Each surfaces to the contact list
  // configured per customer (CRM CustomerContact[] with role tags).
  if (["AT_PICKUP", "LOADED"].includes(status)) {
    sendPickupNotification(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify]"));
  }
  if (status === "IN_TRANSIT") {
    sendInTransitUpdate(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify]"));
  }
  if (status === "AT_DELIVERY") {
    sendArrivedAtDelivery(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify]"));
  }
  if (status === "DELIVERED") {
    sendDeliveredWithPOD(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify]"));
  }

  res.json(updated);
});

// POST /api/carrier-loads/:id/documents — Upload a document (BOL, POD, etc.)
router.post("/:id/documents", upload.single("file"), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!(await checkCarrierNotSuspended(req, res))) return;
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const docType = (req.body.type || "OTHER").toUpperCase();
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const key = `documents/${uniqueSuffix}${ext}`;
  const fileUrl = await uploadFile(req.file.buffer, key, req.file.mimetype);

  const doc = await prisma.document.create({
    data: {
      loadId: load.id,
      docType,
      fileName: req.file.originalname,
      fileUrl,
      fileType: req.file.mimetype || "application/octet-stream",
      fileSize: req.file.size,
      entityType: "LOAD",
      entityId: load.id,
      userId: req.user!.id,
      uploadSource: "CARRIER_PORTAL",
    },
  });

  await logLoadActivity({
    loadId: load.id,
    eventType: "doc_uploaded",
    description: `${docType} uploaded by carrier`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { documentId: doc.id, docType },
  });
  broadcastSSE({ type: "board_refresh", loadId: load.id, data: { reason: "doc_uploaded" } });

  // If it's a POD, update the load
  if (docType === "POD") {
    // v3.8.ajt B3 — POD upload at AT_DELIVERY OR DELIVERED advances to
    // POD_RECEIVED. Pre-ajt only flipped from DELIVERED, but most carriers
    // upload POD immediately at delivery before manually marking DELIVERED
    // in the portal (the POD upload IS their proof of delivery). Result:
    // the load stayed at AT_DELIVERY with a POD uploaded but no status
    // signal that the delivery was complete. AT_DELIVERY + LOADED + DELIVERED
    // all now advance to POD_RECEIVED on POD upload; earlier statuses
    // (BOOKED/DISPATCHED/AT_PICKUP/IN_TRANSIT) stay unchanged — uploading
    // POD when you haven't reached the destination is likely an error and
    // we shouldn't auto-advance through the pipeline.
    const podAdvancingStatuses = ["AT_DELIVERY", "DELIVERED", "LOADED"];
    const newStatus = podAdvancingStatuses.includes(load.status) ? "POD_RECEIVED" : load.status;
    await prisma.load.update({
      where: { id: load.id },
      data: {
        podUrl: fileUrl,
        podReceivedAt: new Date(),
        status: newStatus,
        // Build B: if the carrier uploads POD (advancing to POD_RECEIVED)
        // without having flipped DELIVERED, the POD-upload time is a delivery
        // fallback for the on-time score. Never overwrites an existing stamp.
        ...actualEventStamps(newStatus, load),
      },
    });

    // v3.8.ajt B2 — Trigger autoGenerateInvoice when POD upload advances
    // the load to POD_RECEIVED. The autoGenerateInvoice service has
    // existed since pre-ajt but was never called from the POD upload
    // path — the audit caught it. Fire-and-forget; non-blocking so POD
    // upload response stays fast. Invoice creation is idempotent
    // (autoGenerateInvoice checks for existing invoice on this load
    // before creating).
    if (newStatus === "POD_RECEIVED") {
      const { autoGenerateInvoice } = require("../services/invoiceService");
      autoGenerateInvoice(load.id).catch((e: unknown) =>
        log.error({ err: e, loadId: load.id }, "[POD Upload] autoGenerateInvoice failed (non-fatal)"),
      );
    }

    // Notify broker
    if (load.posterId) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD",
          title: "POD Received",
          message: `POD uploaded for load ${load.referenceNumber}`,
          actionUrl: "/dashboard/loads",
        },
      });
    }

    // Notify shipper contact email about POD
    sendPODToContact(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] POD"));
  }

  res.json(doc);
});

// POST /api/carrier-loads/:id/check-call — Submit a check call from carrier
const checkCallSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  etaHours: z.number().optional(),
  notes: z.string().optional(),
});

router.post("/:id/check-call", validateBody(checkCallSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!(await checkCarrierNotSuspended(req, res))) return;

  const { city: ccCity, state: ccState, etaHours, notes } = req.body;
  const location = ccCity && ccState ? `${ccCity}, ${ccState}` : (ccCity || ccState || "");
  const etaDate = etaHours ? new Date(Date.now() + etaHours * 3600000) : undefined;

  const cc = await prisma.checkCall.create({
    data: {
      loadId: load.id,
      calledById: req.user!.id,
      status: load.status,
      location: location || undefined,
      city: ccCity || undefined,
      state: ccState || undefined,
      etaUpdate: etaDate,
      method: "CARRIER_PORTAL",
      notes: notes || `Carrier check-in from ${location || "unknown location"}`,
    },
  });

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Check Call Received",
        message: `Check call for ${load.referenceNumber}: ${location || "Location update"}${etaHours ? " — ETA " + etaHours + "h" : ""}`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  res.json(cc);
});

// ─── Post Capacity / Availability ────────────────────────────────────
// Carrier announces where they are and when they'll be available.
// Stored on CarrierProfile.preferredLanes JSON field as capacity posts.
router.post("/post-capacity", async (req: AuthRequest, res: Response) => {
  try {
    const { currentCity, currentState, availableDate, equipmentType, preferredDestStates, notes } = req.body;
    if (!currentCity || !currentState || !availableDate) {
      res.status(400).json({ error: "currentCity, currentState, and availableDate required" });
      return;
    }
    const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) { res.status(404).json({ error: "Carrier profile not found" }); return; }

    const capacityPost = {
      currentCity, currentState, availableDate, equipmentType: equipmentType || profile.equipmentTypes?.[0] || "Dry Van",
      preferredDestStates: preferredDestStates || [], notes: notes || "",
      postedAt: new Date().toISOString(), carrierId: req.user!.id, companyName: profile.companyName,
    };

    // Store as latest capacity post in preferredLanes JSON
    const existing = (profile.preferredLanes as any) || {};
    const capacityPosts = Array.isArray(existing.capacityPosts) ? existing.capacityPosts : [];
    capacityPosts.unshift(capacityPost);
    // Keep last 10 posts
    if (capacityPosts.length > 10) capacityPosts.length = 10;

    await prisma.carrierProfile.update({
      where: { userId: req.user!.id },
      data: { preferredLanes: { ...existing, capacityPosts, lastCapacityPost: capacityPost } },
    });

    res.json({ ok: true, capacityPost });
  } catch (err) {
    log.error({ err: err }, "[Capacity] Post error:");
    res.status(500).json({ error: "Failed to post capacity" });
  }
});

// ─── GPS Location Update (Geofence Check) ───────────────────────────
// Carrier app sends periodic location pings; service auto-detects
// arrival/departure at stops and triggers status changes.
router.post("/gps-update", async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      res.status(400).json({ error: "latitude and longitude required" });
      return;
    }
    const carrierId = req.user!.id;
    await processGpsUpdate(carrierId, Number(latitude), Number(longitude));
    res.json({ ok: true });
  } catch (err) {
    log.error({ err: err }, "[GPS] Update error:");
    res.status(500).json({ error: "Failed to process GPS update" });
  }
});

// ─── Carrier-side exception reporting ──────────────────────────────
// Mirrors AE-side /api/load-exceptions but scoped to the calling carrier.

const carrierExceptionSchema = z.object({
  category: z.string(),
  unitType: z.string().optional(),
  description: z.string().optional(),
  locationText: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
});

router.post("/:id/exceptions", validateBody(carrierExceptionSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  if (load.carrierId !== req.user!.id) { res.status(403).json({ error: "Not your load" }); return; }
  if (!(await checkCarrierNotSuspended(req, res))) return;

  const { category, unitType, description, locationText, locationLat, locationLng } = req.body;
  if (!isValidExceptionCode(category)) {
    res.status(400).json({ error: "Invalid exception category" });
    return;
  }
  const reason = getExceptionReason(category)!;

  const exception = await prisma.loadException.create({
    data: {
      loadId: load.id,
      category,
      unitType: unitType ?? reason.unitType,
      description: description ?? null,
      locationText: locationText ?? null,
      locationLat: locationLat ?? null,
      locationLng: locationLng ?? null,
      reportedById: req.user!.id,
      reportedByName: req.user!.email,
      reportedSource: "CARRIER_PORTAL",
    },
  });

  await logLoadActivity({
    loadId: load.id,
    eventType: "exception_logged",
    description: `Exception reported by carrier: ${reason.label}`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { exceptionId: exception.id, category, source: "carrier_portal" },
  });
  broadcastSSE({ type: "alert", loadId: load.id, data: { kind: "exception", exceptionId: exception.id, category, label: reason.label } });

  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Exception reported",
        message: `Carrier reported ${reason.label} on load ${load.referenceNumber}`,
        actionUrl: "/dashboard/track-trace",
      },
    });
  }

  res.status(201).json({ exception });
});

// POST /:id/exceptions/:excId/receipt — upload repair receipt for a specific exception
router.post("/:id/exceptions/:excId/receipt", upload.single("file"), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  if (load.carrierId !== req.user!.id) { res.status(403).json({ error: "Not your load" }); return; }
  if (!(await checkCarrierNotSuspended(req, res))) return;
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const exc = await prisma.loadException.findUnique({ where: { id: req.params.excId } });
  if (!exc || exc.loadId !== load.id) { res.status(404).json({ error: "Exception not found" }); return; }

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const key = `receipts/${uniqueSuffix}${ext}`;
  const fileUrl = await uploadFile(req.file.buffer, key, req.file.mimetype);

  const doc = await prisma.document.create({
    data: {
      loadId: load.id,
      docType: "RECEIPT_MECHANICAL",
      fileName: req.file.originalname,
      fileUrl,
      fileType: req.file.mimetype || "application/octet-stream",
      fileSize: req.file.size,
      entityType: "LOAD",
      entityId: load.id,
      userId: req.user!.id,
      uploadSource: "CARRIER_PORTAL",
      exceptionId: exc.id,
    },
  });

  await prisma.loadException.update({
    where: { id: exc.id },
    data: { receiptStatus: "UPLOADED" },
  });

  await logLoadActivity({
    loadId: load.id,
    eventType: "exception_receipt_uploaded",
    description: `Repair receipt uploaded by carrier`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { exceptionId: exc.id, documentId: doc.id },
  });
  broadcastSSE({ type: "alert", loadId: load.id, data: { kind: "exception_receipt", exceptionId: exc.id } });

  res.status(201).json({ document: doc });
});

export default router;
