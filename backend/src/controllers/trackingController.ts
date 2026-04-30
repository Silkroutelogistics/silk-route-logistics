import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { calculatePredictiveETA } from "../services/predictiveEtaService";
import { decodeHtmlEntities } from "../utils/htmlEntities";

// v3.8.d — Decode HTML entities at the public-tracking serialization
// boundary. Upstream `sanitizeInput` middleware (server.ts) escapes
// every string field on req.body for XSS defense, so values like
// `Dry Van 53'` are stored as `Dry Van 53&#x27;`. PDFKit decodes at its
// own boundary (pdfService.ts:295). React text nodes don't auto-decode,
// so the public /tracking page would render the raw entities. Decode is
// scoped to public-page output only — internal AE Console responses keep
// the escaped form. Architectural fix at the middleware lives in the
// Phase 6 backlog (regression-log).
const decodeOpt = (s: string | null | undefined): string | null =>
  s == null ? null : decodeHtmlEntities(s);

/**
 * Public tracking endpoint — no auth required.
 * Supports both legacy trackingToken (on Load) and new ShipperTrackingToken table.
 * Returns load status, last known location, milestone history, ETA, carrier first name only.
 */
export async function getPublicTracking(req: Request, res: Response) {
  const token = req.params.token as string;
  if (!token || token.length < 6) {
    res.status(400).json({ error: "Invalid tracking token" });
    return;
  }

  // Try new ShipperTrackingToken table first, then fallback to legacy trackingToken field
  let loadId: string | null = null;
  let accessLevel: string = "STATUS_ONLY";

  const shipperToken = await prisma.shipperTrackingToken.findUnique({
    where: { token },
  });

  if (shipperToken) {
    // Check expiry
    if (shipperToken.expiresAt && new Date(shipperToken.expiresAt) < new Date()) {
      res.status(410).json({ error: "Tracking link has expired" });
      return;
    }
    loadId = shipperToken.loadId;
    accessLevel = shipperToken.accessLevel;
  }

  // v3.8.i.1 — Typed allowlist (was `any`). Prisma.LoadSelect catches
  // typo-level field additions at compile time as a belt-and-suspenders
  // gate alongside the explicit res.json() construction below. Per
  // 2026-04-30 PII audit finding #6.
  const loadSelect: Prisma.LoadSelect = {
    id: true,
    referenceNumber: true,
    status: true,
    originCity: true,
    originState: true,
    destCity: true,
    destState: true,
    equipmentType: true,
    pickupDate: true,
    deliveryDate: true,
    actualPickupDatetime: true,
    actualDeliveryDatetime: true,
    commodity: true,
    weight: true,
    temperatureControlled: true,
    tempMin: true,
    tempMax: true,
    podUrl: true,
    // v3.8.i.1 — `carrier` join removed. Per CLAUDE.md §2 / T&T source-of-
    // truth doc §2: "Carrier name renders as '—'. Public should not see
    // which carrier is hauling — carrier solicitation prevention." The
    // pre-v3.8.i.1 select { firstName } was a quiet leak — only invisible
    // because no test loads had carriers assigned. Code now matches doc.
    customer: { select: { name: true } },
    checkCalls: {
      select: { status: true, city: true, state: true, etaUpdate: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    },
    loadStops: {
      orderBy: { stopNumber: "asc" },
      select: {
        stopNumber: true, stopType: true, city: true, state: true,
        appointmentDate: true, appointmentTime: true,
        actualArrival: true, actualDeparture: true, onTime: true,
      },
    },
    trackingEvents: {
      where: { OR: [{ latitude: { not: null } }, { eventType: "STATUS_CHANGE" }] },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { locationCity: true, locationState: true, createdAt: true, etaDestination: true },
    },
  };

  let load: any;
  if (loadId) {
    load = await prisma.load.findUnique({ where: { id: loadId }, select: loadSelect });
  } else {
    // Fallback lookups: trackingToken (legacy uuid) → shipperCode (6-char) → BOL → reference
    load = await prisma.load.findUnique({ where: { trackingToken: token }, select: loadSelect });
    if (!load) {
      load = await prisma.load.findFirst({ where: { shipperCode: token }, select: loadSelect });
    }
    if (!load) {
      const upper = token.toUpperCase().replace(/^BOL-/, "");
      load = await prisma.load.findFirst({ where: { bolNumber: upper }, select: loadSelect });
    }
    if (!load) {
      load = await prisma.load.findFirst({
        where: {
          OR: [
            { referenceNumber: token },
            { loadNumber: token },
            { shipperPoNumber: token },
          ],
        },
        select: loadSelect,
      });
    }
  }

  if (!load) {
    res.status(404).json({ error: "Shipment not found" });
    return;
  }

  // Build milestone history from status progression
  const milestones = buildMilestones(load);

  // Last known location — prefer tracking events, then check calls
  const latestEvent = load.trackingEvents?.[0] || null;
  const lastCheckCall = load.checkCalls[0] || null;
  const lastLocation = latestEvent?.locationCity
    ? { city: decodeOpt(latestEvent.locationCity), state: decodeOpt(latestEvent.locationState), updatedAt: latestEvent.createdAt }
    : lastCheckCall?.city
      ? { city: decodeOpt(lastCheckCall.city), state: decodeOpt(lastCheckCall.state), updatedAt: lastCheckCall.createdAt }
      : null;

  // Predictive ETA
  let predictiveEta = null;
  try {
    predictiveEta = await calculatePredictiveETA(load.id);
  } catch { /* non-blocking */ }

  const eta = latestEvent?.etaDestination || lastCheckCall?.etaUpdate || load.deliveryDate;

  // Build stops for FULL access
  const stops = accessLevel === "FULL" ? load.loadStops.map((s: any) => ({
    stopNumber: s.stopNumber,
    type: s.stopType,
    city: decodeOpt(s.city),
    state: decodeOpt(s.state),
    appointmentDate: s.appointmentDate,
    appointmentTime: s.appointmentTime,
    arrived: !!s.actualArrival,
    departed: !!s.actualDeparture,
    onTime: s.onTime,
  })) : undefined;

  // Calculate progress percentage
  const statusOrder = ["TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED"];
  const currentIdx = statusOrder.indexOf(load.status);
  const progressPct = currentIdx >= 0 ? Math.round((currentIdx / (statusOrder.length - 1)) * 100) : 0;

  res.json({
    referenceNumber: load.referenceNumber,
    status: load.status,
    progressPct,
    origin: { city: decodeOpt(load.originCity), state: decodeOpt(load.originState) },
    destination: { city: decodeOpt(load.destCity), state: decodeOpt(load.destState) },
    equipment: decodeOpt(load.equipmentType),
    commodity: decodeOpt(load.commodity),
    weight: load.weight,
    temperatureControlled: load.temperatureControlled || false,
    tempRange: load.temperatureControlled ? { min: load.tempMin, max: load.tempMax } : undefined,
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    actualPickup: load.actualPickupDatetime,
    actualDelivery: load.actualDeliveryDatetime,
    // v3.8.i.1 — `carrierFirstName` field removed from response. Layer-2
    // allowlist (this object) now matches Layer-1 (loadSelect above).
    // Frontend consumer at public/tracking.html:300 reads
    // `d.carrierFirstName || '—'` so absence renders em-dash gracefully.
    shipperName: decodeOpt(load.customer?.name) || null,
    lastLocation,
    estimatedDelivery: eta,
    predictiveEta: predictiveEta ? {
      optimistic: predictiveEta.optimistic,
      expected: predictiveEta.expected,
      pessimistic: predictiveEta.pessimistic,
      confidence: predictiveEta.confidence,
      method: predictiveEta.method,
    } : null,
    milestones,
    stops,
    podUrl: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"].includes(load.status) ? load.podUrl : null,
    checkCalls: accessLevel === "FULL" ? load.checkCalls.map((cc: any) => ({
      status: cc.status,
      city: decodeOpt(cc.city),
      state: decodeOpt(cc.state),
      timestamp: cc.createdAt,
    })) : undefined,
  });
}

function buildMilestones(load: any) {
  const milestones: Array<{ label: string; status: string; completed: boolean; timestamp?: Date }> = [];

  const statusOrder = [
    { key: "BOOKED", label: "Booked" },
    { key: "DISPATCHED", label: "Dispatched" },
    { key: "AT_PICKUP", label: "At Pickup" },
    { key: "LOADED", label: "Picked Up" },
    { key: "IN_TRANSIT", label: "In Transit" },
    { key: "AT_DELIVERY", label: "At Delivery" },
    { key: "DELIVERED", label: "Delivered" },
    { key: "POD_RECEIVED", label: "POD Received" },
    { key: "INVOICED", label: "Invoiced" },
  ];

  const currentIndex = statusOrder.findIndex((s) => s.key === load.status);

  for (let i = 0; i < statusOrder.length; i++) {
    milestones.push({
      label: statusOrder[i].label,
      status: statusOrder[i].key,
      completed: i <= currentIndex,
    });
  }

  return milestones;
}
