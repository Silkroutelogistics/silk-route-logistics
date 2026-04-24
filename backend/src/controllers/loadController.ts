import { Response } from "express";
import { z } from "zod";
import { PackageType } from "@prisma/client";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createLoadSchema, updateLoadStatusSchema, loadQuerySchema } from "../validators/load";
import { autoGenerateInvoice } from "../services/invoiceService";
import { calculateMileage } from "../services/mileageService";
import { sendShipperPickupEmail, sendShipperDeliveryEmail, sendShipperMilestoneEmail } from "../services/shipperNotificationService";
import { sendPickupNotification, sendInTransitUpdate, sendArrivedAtDelivery, sendDeliveredWithPOD } from "../services/shipperLoadNotifyService";
import { onLoadDelivered, onLoadDispatched, enforceShipperCredit, onLoadCancelledOrTONU } from "../services/integrationService";
import { refreshBOLTrackingTokenExpiry } from "../services/shipperTrackingTokenService";
import { complianceCheck } from "../services/complianceMonitorService";
import { onLoadAssigned } from "../services/loadComplianceService";
import { notifyMatchedCarriers } from "../services/carrierOutreachService";
import { notifyLoadStatusChange } from "../services/notificationService";
import { logLoadCreation, diffLoadChanges, logLoadChanges, logStatusChange, getLoadAuditHistory } from "../services/loadAuditService";
import { onLoadStatusChange as aiOnLoadStatusChange } from "../services/aiLearningLoop/feedbackCollector";
import { log } from "../lib/logger";

async function generateLoadNumber(): Promise<string> {
  // Ensure sequence exists (idempotent) — safe static SQL, no user input
  await prisma.$executeRaw`CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 121472`;
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('load_number_seq') as nextval`;
  if (!result || result.length === 0) {
    throw new Error("Failed to generate load number: sequence returned no result");
  }
  const num = Number(result[0].nextval);
  return `SRL-${num}`;
}

const RELEASED_VALUE_BASIS_VALUES = ["PER_POUND", "PER_PIECE", "TOTAL", "NVD"] as const;
type ReleasedValueBasisLiteral = (typeof RELEASED_VALUE_BASIS_VALUES)[number];

function parseReleasedValueBasis(raw: unknown): ReleasedValueBasisLiteral | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw === "string" && (RELEASED_VALUE_BASIS_VALUES as readonly string[]).includes(raw)) {
    return raw as ReleasedValueBasisLiteral;
  }
  throw new Error(
    `Invalid releasedValueBasis: expected one of ${RELEASED_VALUE_BASIS_VALUES.join(", ")} or null`,
  );
}

function parseNonNegativeInt(raw: unknown, field: string): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid ${field}: must be a non-negative integer`);
  }
  return n;
}

// v3.8.a — LoadLineItem validation + Prisma-shape builder.
// See LoadLineItem schema for field contracts. Throws on invalid input;
// caller catches and returns 400.
const PACKAGE_TYPE_VALUES: PackageType[] = [
  "PLT", "SKID", "CTN", "BOX", "DRUM", "BALE", "BUNDLE", "CRATE", "ROLL", "OTHER",
];

interface LineItemCreateInput {
  lineNumber: number;
  pieces: number;
  packageType: PackageType;
  description: string;
  weight: number;
  dimensionsLength: number | null;
  dimensionsWidth: number | null;
  dimensionsHeight: number | null;
  freightClass: string | null;
  nmfcCode: string | null;
  hazmat: boolean;
  hazmatUnNumber: string | null;
  hazmatClass: string | null;
  hazmatEmergencyContact: string | null;
  hazmatPlacardRequired: boolean | null;
  stackable: boolean;
  turnable: boolean;
}

function buildLineItems(raw: unknown): LineItemCreateInput[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    throw new Error("Invalid lineItems: must be an array");
  }
  if (raw.length === 0) return null;

  return raw.map((item: Record<string, unknown>, idx: number) => {
    const lineNumber = idx + 1;
    const pieces = typeof item.pieces === "number" ? item.pieces : parseInt(String(item.pieces), 10);
    if (!Number.isFinite(pieces) || !Number.isInteger(pieces) || pieces <= 0) {
      throw new Error(`Invalid lineItems[${idx}].pieces: must be a positive integer`);
    }
    if (typeof item.packageType !== "string" || !(PACKAGE_TYPE_VALUES as readonly string[]).includes(item.packageType)) {
      throw new Error(
        `Invalid lineItems[${idx}].packageType: expected one of ${PACKAGE_TYPE_VALUES.join(", ")}`,
      );
    }
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) {
      throw new Error(`Invalid lineItems[${idx}].description: must be a non-empty string`);
    }
    const weight = typeof item.weight === "number" ? item.weight : parseFloat(String(item.weight));
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Invalid lineItems[${idx}].weight: must be a positive number`);
    }

    const optNumber = (v: unknown, field: string): number | null => {
      if (v === undefined || v === null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid lineItems[${idx}].${field}: must be a non-negative number`);
      }
      return n;
    };
    const optStr = (v: unknown): string | null => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const optBool = (v: unknown): boolean | null => {
      if (v === undefined || v === null) return null;
      return Boolean(v);
    };

    return {
      lineNumber,
      pieces,
      packageType: item.packageType as PackageType,
      description,
      weight,
      dimensionsLength: optNumber(item.dimensionsLength, "dimensionsLength"),
      dimensionsWidth: optNumber(item.dimensionsWidth, "dimensionsWidth"),
      dimensionsHeight: optNumber(item.dimensionsHeight, "dimensionsHeight"),
      freightClass: optStr(item.freightClass),
      nmfcCode: optStr(item.nmfcCode),
      hazmat: Boolean(item.hazmat ?? false),
      hazmatUnNumber: optStr(item.hazmatUnNumber),
      hazmatClass: optStr(item.hazmatClass),
      hazmatEmergencyContact: optStr(item.hazmatEmergencyContact),
      hazmatPlacardRequired: optBool(item.hazmatPlacardRequired),
      stackable: item.stackable === undefined ? true : Boolean(item.stackable),
      turnable: item.turnable === undefined ? true : Boolean(item.turnable),
    };
  });
}

export async function createLoad(req: AuthRequest, res: Response) {
  const raw = req.body; // Already validated by validateBody middleware

  // v3.7.o — BOL v2.9 field validation (before credit check so 400s return
  // fast without DB roundtrip).
  let releasedValueBasis: ReleasedValueBasisLiteral | null | undefined;
  let piecesTendered: number | null | undefined;
  let piecesReceived: number | null | undefined;
  let lineItems: LineItemCreateInput[] | null;
  try {
    releasedValueBasis = parseReleasedValueBasis(raw.releasedValueBasis);
    piecesTendered = parseNonNegativeInt(raw.piecesTendered, "piecesTendered");
    piecesReceived = parseNonNegativeInt(raw.piecesReceived, "piecesReceived");
    lineItems = buildLineItems(raw.lineItems);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  // Enforce shipper credit limit if customer is specified
  if (raw.customerId) {
    const creditCheck = await enforceShipperCredit(raw.customerId);
    if (!creditCheck.allowed) {
      res.status(403).json({ error: `Shipper credit blocked: ${creditCheck.reason}` });
      return;
    }
  }

  // Map frontend field names → Prisma schema field names
  const pickupContact = raw.pickupContact || {};
  const deliveryContact = raw.deliveryContact || {};
  const dims = raw.dimensions || {};

  const data: Record<string, unknown> = {
    customerId: raw.customerId || undefined,
    status: raw.status || "POSTED",

    // Route
    originCompany: raw.originName || raw.originCompany || undefined,
    originAddress: raw.originAddress || undefined,
    originCity: raw.originCity,
    originState: raw.originState,
    originZip: raw.originZip,
    originContactName: pickupContact.name || raw.contactName || undefined,
    originContactPhone: pickupContact.phone || raw.contactPhone || undefined,
    destCompany: raw.destinationName || raw.destCompany || undefined,
    destAddress: raw.destAddress || raw.destinationAddress || undefined,
    destCity: raw.destinationCity || raw.destCity,
    destState: raw.destinationState || raw.destState,
    destZip: raw.destinationZip || raw.destZip,
    destContactName: deliveryContact.name || undefined,
    destContactPhone: deliveryContact.phone || undefined,
    shipperFacility: raw.shipperName || raw.shipperFacility || undefined,
    consigneeFacility: raw.consigneeName || raw.consigneeFacility || undefined,

    // Schedule
    pickupDate: raw.pickupDate,
    pickupTimeStart: raw.pickupTimeType === "APPOINTMENT" ? raw.pickupTime :
                     raw.pickupTimeType === "WINDOW" ? raw.pickupWindowOpen : undefined,
    pickupTimeEnd: raw.pickupTimeType === "WINDOW" ? raw.pickupWindowClose : undefined,
    deliveryDate: raw.deliveryDate,
    deliveryTimeStart: raw.deliveryTimeType === "APPOINTMENT" ? raw.deliveryTime :
                       raw.deliveryTimeType === "WINDOW" ? raw.deliveryWindowOpen : undefined,
    deliveryTimeEnd: raw.deliveryTimeType === "WINDOW" ? raw.deliveryWindowClose : undefined,

    // Freight
    weight: raw.weight || undefined,
    pieces: raw.pieces || undefined,
    equipmentType: raw.equipmentType,
    commodity: raw.commodity || undefined,
    freightClass: raw.freightClass || undefined,
    stackable: raw.stackable ?? true,
    distance: raw.miles || raw.distance || undefined,

    // Financials
    rate: raw.customerRate || raw.rate || 0,
    customerRate: raw.customerRate || undefined,
    carrierRate: raw.carrierRate || undefined,
    rateType: raw.rateType || "FLAT",

    // Hazmat
    hazmat: raw.hazmat || false,
    hazmatUnNumber: raw.hazmatUN || undefined,
    hazmatClass: raw.hazmatClass || undefined,

    // Temperature
    temperatureControlled: raw.temperature != null || raw.temperatureControlled || false,
    tempMin: raw.tempMin || (raw.temperature != null ? raw.temperature : undefined),
    tempMax: raw.tempMax || undefined,

    // Dimensions
    dimensionsLength: dims.length || raw.length || undefined,
    dimensionsWidth: dims.width || raw.width || undefined,
    dimensionsHeight: dims.height || raw.height || undefined,

    // Cross-border
    customsRequired: raw.crossBorder || raw.customsRequired || false,
    borderCrossingPoint: raw.borderCrossing || undefined,
    customsBrokerName: raw.customsBroker || undefined,
    bondType: raw.bondNumber || raw.bondType || undefined,

    // Accessorials & Instructions
    accessorials: raw.accessorials || undefined,
    specialInstructions: raw.specialInstructions || undefined,
    pickupInstructions: raw.pickupNotes || undefined,
    deliveryInstructions: raw.deliveryNotes || undefined,

    // TMW-level reference fields
    poNumbers: raw.poNumbers || undefined,
    proNumber: raw.proNumber || undefined,
    bolNumber: raw.bolNumber || undefined,
    sealNumber: raw.sealNumber || undefined,
    appointmentNumber: raw.appointmentNumber || undefined,
    additionalRefs: raw.additionalRefs || undefined,

    // Freight classification (TMW)
    nmfcCode: raw.nmfcCode || undefined,
    declaredValue: raw.declaredValue || undefined,
    releasedValueDeclared:
      typeof raw.releasedValueDeclared === "boolean" ? raw.releasedValueDeclared : undefined,
    releasedValueBasis,

    // Pickup / delivery actuals (v3.7.o)
    piecesTendered,
    piecesReceived,

    // Loading details (TMW)
    loadingType: raw.loadingType || undefined,
    turnable: raw.turnable ?? undefined,

    // Dock/Facility
    dockAssignment: raw.dockAssignment || undefined,
    driverInstructions: raw.driverInstructions || undefined,

    // Driver/Equipment
    driverName: raw.driverName || undefined,
    driverPhone: raw.driverPhone || undefined,
    truckNumber: raw.truckNumber || undefined,
    trailerNumber: raw.trailerNumber || undefined,

    // Financial (TMW)
    codAmount: raw.codAmount || undefined,
    paymentTermsLoad: raw.paymentTermsLoad || undefined,

    // Shipper contact email for load notifications
    contactEmail: raw.contactEmail || undefined,

    // Waterfall Dispatch (v3.4.j)
    dispatchMethod: raw.dispatchMethod || undefined,
    visibility: raw.visibility || (raw.dispatchMethod ? undefined : "waterfall"),
    waterfallMode: raw.waterfallMode || undefined,
    directTenderCarrierId: raw.directTenderCarrierId || undefined,
  };

  // Remove undefined values
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }

  const refNumber = await generateLoadNumber();
  const load = await prisma.load.create({
    data: {
      ...data,
      referenceNumber: refNumber,
      loadNumber: refNumber,
      posterId: req.user!.id,
      ...(lineItems ? { lineItems: { create: lineItems } } : {}),
    } as any,
  });

  // Field-level audit: log creation with all initial values
  logLoadCreation(load.id, req.user!.id, data).catch((e) =>
    log.error({ err: e }, "[LoadAudit] create log error:")
  );

  // AI Carrier Outreach: email + in-app notify top matched carriers
  if (load.status === "POSTED" && load.equipmentType) {
    notifyMatchedCarriers(load.id).catch((e) =>
      log.error({ err: e }, "[CarrierOutreach]")
    );
  }

  // AI Learning Loop: record new load creation event
  aiOnLoadStatusChange(load.id, "NEW", load.status, new Date()).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  res.status(201).json(load);
}


export async function getLoads(req: AuthRequest, res: Response) {
  const query = loadQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  // Soft-delete filter: exclude archived loads unless ?include_deleted=true
  if (req.query.include_deleted !== "true") {
    where.deletedAt = null;
  }

  // Role-based scoping: CARRIER only sees loads assigned to them or available for tendering
  if (req.user!.role === "CARRIER") {
    where.OR = [
      { carrierId: req.user!.id },
      { status: { in: ["POSTED", "TENDERED"] } },
    ];
  }
  // SHIPPER only sees their own loads
  if (req.user!.role === "SHIPPER") {
    where.posterId = req.user!.id;
  }

  if (query.status) {
    where.status = query.status;
  } else if (query.activeOnly) {
    where.status = { notIn: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED"] };
  }
  if (query.originState) where.originState = query.originState;
  if (query.destState) where.destState = query.destState;
  if (query.equipmentType) where.equipmentType = query.equipmentType;
  if (query.minRate || query.maxRate) {
    where.rate = {};
    if (query.minRate) (where.rate as Record<string, number>).gte = query.minRate;
    if (query.maxRate) (where.rate as Record<string, number>).lte = query.maxRate;
  }
  if (query.search) {
    where.OR = [
      { referenceNumber: { contains: query.search, mode: "insensitive" } },
      { commodity: { contains: query.search, mode: "insensitive" } },
      { originCity: { contains: query.search, mode: "insensitive" } },
      { destCity: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      include: {
        poster: { select: { id: true, company: true, firstName: true, lastName: true } },
        carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.load.count({ where }),
  ]);

  res.json({ loads, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function getLoadById(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({
    where: { id: req.params.id, deletedAt: null },
    include: {
      poster: { select: { id: true, company: true, firstName: true, lastName: true, phone: true } },
      carrier: { select: { id: true, company: true, firstName: true, lastName: true, phone: true } },
      tenders: {
        include: { carrier: { include: { user: { select: { company: true, firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      documents: true,
      messages: { include: { sender: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
      delays: { include: { reportedBy: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { reportedAt: "desc" } },
    },
  });

  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  res.json(load);
}

// Valid load status transitions — state machine enforcement
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PLANNED", "POSTED", "CANCELLED"],
  PLANNED: ["POSTED", "CANCELLED"],
  POSTED: ["TENDERED", "BOOKED", "CANCELLED"],
  TENDERED: ["CONFIRMED", "BOOKED", "POSTED", "CANCELLED"],
  CONFIRMED: ["BOOKED", "DISPATCHED", "CANCELLED"],
  BOOKED: ["DISPATCHED", "CANCELLED", "TONU"],
  DISPATCHED: ["AT_PICKUP", "CANCELLED", "TONU"],
  AT_PICKUP: ["LOADED", "PICKED_UP", "CANCELLED", "TONU"],
  LOADED: ["IN_TRANSIT", "PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["AT_DELIVERY"],
  AT_DELIVERY: ["DELIVERED"],
  DELIVERED: ["POD_RECEIVED", "INVOICED", "COMPLETED"],
  POD_RECEIVED: ["INVOICED", "COMPLETED"],
  INVOICED: ["COMPLETED"],
  COMPLETED: [],
  TONU: [],
  CANCELLED: [],
};

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export async function updateLoadStatus(req: AuthRequest, res: Response) {
  const { status } = updateLoadStatusSchema.parse(req.body);

  // Authorization: check user can update this load
  const existing = await prisma.load.findUnique({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) { res.status(404).json({ error: "Load not found" }); return; }

  // Validate status transition
  if (!isValidTransition(existing.status, status)) {
    res.status(400).json({
      error: `Invalid status transition: ${existing.status} → ${status}`,
      allowed: VALID_TRANSITIONS[existing.status] || [],
    });
    return;
  }

  const isPoster = existing.posterId === req.user!.id;
  const isAssignedCarrier = existing.carrierId === req.user!.id;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isPoster && !isAssignedCarrier && !isEmployee) {
    res.status(403).json({ error: "Not authorized to update this load" });
    return;
  }

  const load = await prisma.load.update({
    where: { id: req.params.id },
    data: { status, statusUpdatedAt: new Date(), statusUpdatedById: req.user!.id, ...(status === "BOOKED" ? { carrierId: req.user!.id } : {}) },
  });

  // Field-level audit: log status transition
  logStatusChange(load.id, req.user!.id, existing.status, status).catch((e) =>
    log.error({ err: e }, "[LoadAudit] status change log error:")
  );

  // AI Learning Loop: record status change for feedback collection
  aiOnLoadStatusChange(load.id, existing.status, status, new Date()).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  // Sync linked shipment status
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    const shipmentUpdate: Record<string, unknown> = { status };
    if (status === "PICKED_UP") shipmentUpdate.actualPickup = new Date();
    if (status === "DELIVERED") shipmentUpdate.actualDelivery = new Date();
    await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentUpdate });
  }

  // AI Carrier Outreach: when a load transitions to POSTED, notify matched carriers
  if (status === "POSTED" && load.equipmentType) {
    notifyMatchedCarriers(load.id).catch((e) =>
      log.error({ err: e }, "[CarrierOutreach]")
    );
  }

  // Auto-generate invoice and notify when delivered
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
    sendShipperDeliveryEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] delivery email error:"));
    // Integration: create AP, update shipper credit, recalc CPP
    onLoadDelivered(load.id).catch((e) => log.error({ err: e }, "[Integration] onLoadDelivered error:"));
    // Phase 5E.a: refresh ShipperTrackingToken expiry to actualDeliveryDatetime + 180d.
    // Never shortens an existing longer expiry.
    refreshBOLTrackingTokenExpiry(load.id).catch((e) => log.error({ err: e, loadId: load.id }, "[tracking-token] delivery refresh failed"));

    if (load.posterId) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD_UPDATE",
          title: "Load Delivered",
          message: `Load ${load.referenceNumber} has been delivered successfully. Invoice auto-generated.`,
          actionUrl: "/dashboard/loads",
        },
      });
    }
  }

  // Create check-call schedule when dispatched
  if (status === "DISPATCHED") {
    onLoadDispatched(load.id).catch((e) => log.error({ err: e }, "[Integration] onLoadDispatched error:"));
  }

  // Shipper pickup notification on LOADED
  if (status === "LOADED") {
    sendShipperPickupEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] pickup email error:"));
  }

  // TONU / CANCELLED cleanup: reverse credit, void AP, cancel tenders, reverse fund
  if (status === "TONU" || status === "CANCELLED") {
    const reason = req.body.reason || req.body.cancellationReason;
    onLoadCancelledOrTONU(load.id, reason).catch((e) =>
      log.error({ err: e }, `[Integration] onLoadCancelledOrTONU error:`)
    );

    // Notify the assigned carrier
    if (load.carrierId) {
      await prisma.notification.create({
        data: {
          userId: load.carrierId,
          type: "LOAD_UPDATE",
          title: status === "TONU" ? "Load TONU — Truck Order Not Used" : "Load Cancelled",
          message: `Load ${load.referenceNumber} has been ${status === "TONU" ? "marked TONU" : "cancelled"}${reason ? `: ${reason}` : ""}. Please check your dashboard.`,
          actionUrl: "/carrier/dashboard/my-loads",
        },
      });
    }
  }

  // Notify carrier on DISPATCHED
  if (status === "DISPATCHED" && load.carrierId) {
    await prisma.notification.create({
      data: {
        userId: load.carrierId,
        type: "LOAD_UPDATE",
        title: "Load Dispatched",
        message: `Load ${load.referenceNumber} has been dispatched. Please confirm pickup.`,
        actionUrl: "/carrier/dashboard/my-loads",
      },
    });
  }

  // Notify poster on AT_PICKUP and AT_DELIVERY
  if (status === "AT_PICKUP" && load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: "Carrier At Pickup",
        message: `Carrier has arrived at pickup for load ${load.referenceNumber}.`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }
  if (status === "AT_DELIVERY" && load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: "Carrier At Delivery",
        message: `Carrier has arrived at delivery for load ${load.referenceNumber}.`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }

  // In-app notification for both poster and carrier on every status change
  notifyLoadStatusChange(load.id, status).catch((e) => log.error({ err: e }, "[NotificationService] notifyLoadStatusChange error:"));

  // Shipper milestone tracking email (fires on every status change)
  sendShipperMilestoneEmail(load.id, status).catch((e) => log.error({ err: e }, "[ShipperNotify] milestone email error:"));

  // Contact email load milestone notifications
  if (["BOOKED", "DISPATCHED"].includes(status)) {
    // Shipper should know when a carrier is assigned and when load is dispatched
    sendPickupNotification(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify]"));
  }
  if (["AT_PICKUP", "LOADED", "PICKED_UP"].includes(status)) {
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

  res.json(load);
}

export async function carrierUpdateStatus(req: AuthRequest, res: Response) {
  const { status } = updateLoadStatusSchema.parse(req.body);
  const allowedStatuses = ["AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"];
  if (!allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Carriers can only update to: AT_PICKUP, LOADED, PICKED_UP, IN_TRANSIT, AT_DELIVERY, DELIVERED" });
    return;
  }

  const load = await prisma.load.findUnique({ where: { id: req.params.id, deletedAt: null } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized — this load is not assigned to you" });
    return;
  }

  const updated = await prisma.load.update({
    where: { id: req.params.id },
    data: { status, statusUpdatedAt: new Date(), statusUpdatedById: req.user!.id },
  });

  // Sync linked shipment
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    // Map load statuses to shipment statuses
    const loadToShipmentStatus: Record<string, string> = {
      AT_PICKUP: "PICKED_UP", LOADED: "PICKED_UP", PICKED_UP: "PICKED_UP",
      IN_TRANSIT: "IN_TRANSIT", AT_DELIVERY: "DELIVERED", DELIVERED: "DELIVERED",
    };
    const mappedStatus = loadToShipmentStatus[status] || status;
    const shipmentUpdate: Record<string, unknown> = { status: mappedStatus };
    if (["AT_PICKUP", "LOADED", "PICKED_UP"].includes(status)) shipmentUpdate.actualPickup = new Date();
    if (status === "IN_TRANSIT") shipmentUpdate.lastLocationAt = new Date();
    if (["AT_DELIVERY", "DELIVERED"].includes(status)) shipmentUpdate.actualDelivery = new Date();
    await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentUpdate });
  }

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: `Load ${status.replace("_", " ")}`,
        message: `Carrier updated load ${load.referenceNumber} to ${status}.`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }

  // If delivered, trigger auto-invoice + shipper email + integration
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
    sendShipperDeliveryEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] delivery email error:"));
    // Integration: create AP, update shipper credit, recalc CPP
    onLoadDelivered(load.id).catch((e) => log.error({ err: e }, "[Integration] onLoadDelivered error:"));
  }

  // Shipper pickup notification on LOADED
  if (status === "LOADED") {
    sendShipperPickupEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] pickup email error:"));
  }

  // Shipper milestone tracking email
  sendShipperMilestoneEmail(load.id, status).catch((e) => log.error({ err: e }, "[ShipperNotify] milestone email error:"));

  // Contact email load milestone notifications
  if (["AT_PICKUP", "LOADED", "PICKED_UP"].includes(status)) {
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
}

export async function updateLoad(req: AuthRequest, res: Response) {
  const existing = await prisma.load.findUnique({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) { res.status(404).json({ error: "Load not found" }); return; }

  const isPoster = existing.posterId === req.user!.id;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isPoster && !isEmployee) {
    res.status(403).json({ error: "Not authorized to update this load" });
    return;
  }

  // Prevent editing loads that are completed/cancelled
  if (["COMPLETED", "CANCELLED", "TONU"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot edit a load with status ${existing.status}` });
    return;
  }

  const {
    originCity, originState, originZip, originAddress, originCompany,
    destCity, destState, destZip, destAddress, destCompany,
    shipperFacility, consigneeFacility,
    weight, pieces, pallets, equipmentType, commodity, freightClass,
    rate, customerRate, carrierRate, distance,
    pickupDate, deliveryDate, pickupTimeStart, pickupTimeEnd,
    deliveryTimeStart, deliveryTimeEnd,
    hazmat, hazmatClass, hazmatUnNumber,
    temperatureControlled, tempMin, tempMax,
    specialInstructions, notes, contactName, contactPhone,
    customerId, carrierId,
    // TMW-level fields
    poNumbers, bolNumber, sealNumber, appointmentNumber, additionalRefs,
    nmfcCode, declaredValue, loadingType, turnable,
    driverName, driverPhone, truckNumber, trailerNumber,
    dockAssignment, driverInstructions,
    codAmount, paymentTermsLoad, contactEmail,
    // v3.7.o — BOL v2.9 fields
    proNumber, releasedValueDeclared,
  } = req.body;

  // v3.7.o — validate enum / int fields. Undefined means "not present in
  // PATCH body" (skip update); null means "clear the column".
  let releasedValueBasis: ReleasedValueBasisLiteral | null | undefined;
  let piecesTendered: number | null | undefined;
  let piecesReceived: number | null | undefined;
  // v3.8.a — full-replace semantics (D8). Undefined means "lineItems key
  // absent from PATCH body" (don't touch existing rows); a present array
  // (even empty) triggers delete-all + recreate.
  const lineItemsRaw = req.body.lineItems;
  const lineItemsKeyPresent = lineItemsRaw !== undefined;
  let lineItems: LineItemCreateInput[] | null = null;
  try {
    releasedValueBasis = parseReleasedValueBasis(req.body.releasedValueBasis);
    piecesTendered = parseNonNegativeInt(req.body.piecesTendered, "piecesTendered");
    piecesReceived = parseNonNegativeInt(req.body.piecesReceived, "piecesReceived");
    if (lineItemsKeyPresent) {
      lineItems = buildLineItems(lineItemsRaw);
    }
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const data: Record<string, unknown> = {};
  if (contactEmail !== undefined) data.contactEmail = contactEmail;
  if (originCity !== undefined) data.originCity = originCity;
  if (originState !== undefined) data.originState = originState;
  if (originZip !== undefined) data.originZip = originZip;
  if (originAddress !== undefined) data.originAddress = originAddress;
  if (originCompany !== undefined) data.originCompany = originCompany;
  if (destCity !== undefined) data.destCity = destCity;
  if (destState !== undefined) data.destState = destState;
  if (destZip !== undefined) data.destZip = destZip;
  if (destAddress !== undefined) data.destAddress = destAddress;
  if (destCompany !== undefined) data.destCompany = destCompany;
  if (shipperFacility !== undefined) data.shipperFacility = shipperFacility;
  if (consigneeFacility !== undefined) data.consigneeFacility = consigneeFacility;
  if (weight !== undefined) data.weight = weight;
  if (pieces !== undefined) data.pieces = pieces;
  if (pallets !== undefined) data.pallets = pallets;
  if (equipmentType !== undefined) data.equipmentType = equipmentType;
  if (commodity !== undefined) data.commodity = commodity;
  if (freightClass !== undefined) data.freightClass = freightClass;
  if (rate !== undefined) data.rate = rate;
  if (customerRate !== undefined) data.customerRate = customerRate;
  if (carrierRate !== undefined) data.carrierRate = carrierRate;
  if (distance !== undefined) data.distance = distance;
  if (pickupDate !== undefined) data.pickupDate = new Date(pickupDate);
  if (deliveryDate !== undefined) data.deliveryDate = new Date(deliveryDate);
  if (pickupTimeStart !== undefined) data.pickupTimeStart = pickupTimeStart;
  if (pickupTimeEnd !== undefined) data.pickupTimeEnd = pickupTimeEnd;
  if (deliveryTimeStart !== undefined) data.deliveryTimeStart = deliveryTimeStart;
  if (deliveryTimeEnd !== undefined) data.deliveryTimeEnd = deliveryTimeEnd;
  if (hazmat !== undefined) data.hazmat = hazmat;
  if (hazmatClass !== undefined) data.hazmatClass = hazmatClass;
  if (hazmatUnNumber !== undefined) data.hazmatUnNumber = hazmatUnNumber;
  if (temperatureControlled !== undefined) data.temperatureControlled = temperatureControlled;
  if (tempMin !== undefined) data.tempMin = tempMin;
  if (tempMax !== undefined) data.tempMax = tempMax;
  if (specialInstructions !== undefined) data.specialInstructions = specialInstructions;
  if (notes !== undefined) data.notes = notes;
  if (contactName !== undefined) data.contactName = contactName;
  if (contactPhone !== undefined) data.contactPhone = contactPhone;

  // TMW-level fields
  if (poNumbers !== undefined) data.poNumbers = poNumbers;
  if (proNumber !== undefined) data.proNumber = proNumber;
  if (bolNumber !== undefined) data.bolNumber = bolNumber;
  if (sealNumber !== undefined) data.sealNumber = sealNumber;
  if (appointmentNumber !== undefined) data.appointmentNumber = appointmentNumber;
  if (additionalRefs !== undefined) data.additionalRefs = additionalRefs;
  if (nmfcCode !== undefined) data.nmfcCode = nmfcCode;
  if (declaredValue !== undefined) data.declaredValue = declaredValue;
  if (typeof releasedValueDeclared === "boolean") data.releasedValueDeclared = releasedValueDeclared;
  if (releasedValueBasis !== undefined) data.releasedValueBasis = releasedValueBasis;
  if (piecesTendered !== undefined) data.piecesTendered = piecesTendered;
  if (piecesReceived !== undefined) data.piecesReceived = piecesReceived;
  if (loadingType !== undefined) data.loadingType = loadingType;
  if (turnable !== undefined) data.turnable = turnable;
  if (driverName !== undefined) data.driverName = driverName;
  if (driverPhone !== undefined) data.driverPhone = driverPhone;
  if (truckNumber !== undefined) data.truckNumber = truckNumber;
  if (trailerNumber !== undefined) data.trailerNumber = trailerNumber;
  if (dockAssignment !== undefined) data.dockAssignment = dockAssignment;
  if (driverInstructions !== undefined) data.driverInstructions = driverInstructions;
  if (codAmount !== undefined) data.codAmount = codAmount;
  if (paymentTermsLoad !== undefined) data.paymentTermsLoad = paymentTermsLoad;

  if (customerId !== undefined) {
    // Prevent changing customer on invoiced/completed loads (breaks credit tracking)
    if (["INVOICED", "COMPLETED", "POD_RECEIVED"].includes(existing.status) && customerId !== existing.customerId) {
      res.status(400).json({ error: "Cannot change customer on invoiced or completed loads" });
      return;
    }
    data.customerId = customerId;
  }
  if (carrierId !== undefined) {
    // Compliance gate: check carrier before direct assignment
    const carrierProfile = await prisma.carrierProfile.findFirst({ where: { userId: carrierId } });
    if (carrierProfile) {
      const compliance = await complianceCheck(carrierProfile.id);
      if (!compliance.allowed) {
        res.status(403).json({ error: "Carrier is non-compliant", blocked_reasons: compliance.blocked_reasons });
        return;
      }
    }
    data.carrierId = carrierId;

    // Fire post-assignment load-level compliance scan (non-blocking)
    onLoadAssigned(req.params.id, carrierId).catch((e) =>
      log.error({ err: e }, "[Compass] onLoadAssigned compliance scan error:")
    );
  }

  // Recalculate margin fields if rates changed (guard against division by zero)
  const finalCustRate = (customerRate ?? existing.customerRate ?? rate ?? existing.rate) as number;
  const finalCarrRate = (carrierRate ?? existing.carrierRate) as number | null;
  const finalDist = (distance ?? existing.distance) as number | null;
  if (finalCarrRate && finalCarrRate > 0) {
    data.grossMargin = finalCustRate - finalCarrRate;
    if (finalCustRate > 0) {
      data.marginPercent = Math.round(((finalCustRate - finalCarrRate) / finalCustRate) * 10000) / 100;
    }
    if ((data.grossMargin as number) < 0) {
      log.warn(`[Load] Negative margin on load ${req.params.id}: customer=$${finalCustRate} carrier=$${finalCarrRate}`);
    }
  }
  if (finalDist && finalDist > 0) {
    if (finalCustRate > 0) data.revenuePerMile = Math.round((finalCustRate / finalDist) * 100) / 100;
    if (finalCarrRate && finalCarrRate > 0) data.costPerMile = Math.round((finalCarrRate / finalDist) * 100) / 100;
    if (data.revenuePerMile && data.costPerMile) data.marginPerMile = Math.round(((data.revenuePerMile as number) - (data.costPerMile as number)) * 100) / 100;
  }

  // Field-level audit: diff old vs new and log changes
  const fieldChanges = diffLoadChanges(existing as Record<string, any>, data);
  if (fieldChanges.length > 0) {
    logLoadChanges(existing.id, req.user!.id, fieldChanges, "UPDATE").catch((e) =>
      log.error({ err: e }, "[LoadAudit] update diff log error:")
    );
  }

  // v3.8.a — full-replace lineItems when the key is present in the PATCH
  // body. Atomic within the single .update() call: deleteMany runs before
  // create, so any prior lineItems are wiped and replaced with the new
  // set. Absent key → existing lineItems untouched (PATCH semantics).
  if (lineItemsKeyPresent) {
    (data as Record<string, unknown>).lineItems = {
      deleteMany: {},
      ...(lineItems && lineItems.length > 0 ? { create: lineItems } : {}),
    };
  }

  const load = await prisma.load.update({ where: { id: req.params.id }, data });

  // Sync critical field changes to linked shipment (keep shipment in sync with load)
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    const shipmentSync: Record<string, unknown> = {};
    if (data.originCity) shipmentSync.originCity = data.originCity;
    if (data.originState) shipmentSync.originState = data.originState;
    if (data.originZip) shipmentSync.originZip = data.originZip;
    if (data.destCity) shipmentSync.destCity = data.destCity;
    if (data.destState) shipmentSync.destState = data.destState;
    if (data.destZip) shipmentSync.destZip = data.destZip;
    if (data.weight) shipmentSync.weight = data.weight;
    if (data.pieces) shipmentSync.pieces = data.pieces;
    if (data.equipmentType) shipmentSync.equipmentType = data.equipmentType;
    if (data.commodity) shipmentSync.commodity = data.commodity;
    if (data.pickupDate) shipmentSync.pickupDate = data.pickupDate;
    if (data.deliveryDate) shipmentSync.deliveryDate = data.deliveryDate;
    if (data.specialInstructions) shipmentSync.specialInstructions = data.specialInstructions;
    if (data.rate || data.carrierRate) shipmentSync.rate = data.carrierRate || data.rate;
    if (data.distance) shipmentSync.distance = data.distance;
    if (data.customerId) shipmentSync.customerId = data.customerId;

    if (Object.keys(shipmentSync).length > 0) {
      await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentSync });
    }
  }

  res.json(load);
}

export async function deleteLoad(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load || load.deletedAt) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.posterId !== req.user!.id && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const now = new Date();
  const deletedBy = req.user!.email || req.user!.id;
  const reason = req.body?.reason || null;

  await Promise.all([
    prisma.load.update({
      where: { id: load.id },
      data: {
        deletedAt: now,
        deletedBy,
        cancellationReason: reason,
        status: "CANCELLED",
      },
    }),
    prisma.loadTender.updateMany({ where: { loadId: load.id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.checkCall.updateMany({ where: { loadId: load.id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.invoice.updateMany({ where: { loadId: load.id, deletedAt: null }, data: { deletedAt: now } }),
  ]);

  // Full cleanup: reverse credit, void AP, reverse fund entries
  onLoadCancelledOrTONU(load.id, reason).catch((e) =>
    log.error({ err: e }, `[Integration] deleteLoad cleanup error:`)
  );

  res.json({ success: true, message: "Load archived" });
}

export async function restoreLoad(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load || !load.deletedAt) {
    res.status(404).json({ error: "Archived load not found" });
    return;
  }

  await Promise.all([
    prisma.load.update({ where: { id: load.id }, data: { deletedAt: null, deletedBy: null } }),
    prisma.loadTender.updateMany({ where: { loadId: load.id }, data: { deletedAt: null } }),
    prisma.checkCall.updateMany({ where: { loadId: load.id }, data: { deletedAt: null } }),
    prisma.invoice.updateMany({ where: { loadId: load.id }, data: { deletedAt: null } }),
  ]);

  res.json({ success: true, message: "Load restored" });
}

const distanceQuerySchema = z.object({
  originCity: z.string().min(1),
  originState: z.string().length(2),
  originZip: z.string().min(3).max(10),
  destCity: z.string().min(1),
  destState: z.string().length(2),
  destZip: z.string().min(3).max(10),
});

export async function getDistance(req: AuthRequest, res: Response) {
  const query = distanceQuerySchema.parse(req.query);
  const origin = `${query.originCity}, ${query.originState} ${query.originZip}`;
  const destination = `${query.destCity}, ${query.destState} ${query.destZip}`;

  const result = await calculateMileage(origin, destination);

  res.json({
    distanceMiles: result.practical_miles,
    durationMinutes: Math.round(result.drive_time_hours * 60),
    mileage: result,
  });
}

export async function getLoadAudit(req: AuthRequest, res: Response) {
  const loadId = req.params.id;

  // Verify load exists
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  const history = await getLoadAuditHistory(loadId);
  res.json({ loadId, history });
}
