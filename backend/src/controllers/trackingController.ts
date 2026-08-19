import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { extractClientIp } from "../services/geoService";
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

    // Arc 6 Phase 5 — a tracking link that is opened leaves a trace.
    //
    // ShipperTrackingToken carries accessCount and lastAccessedAt and nothing
    // has ever written them (Pass 2 orphan-field triage, section D1), so nobody
    // could tell a link opened once from a link being scraped.
    //
    // That matters more than housekeeping here. §14 deliberately narrowed what
    // this endpoint returns on a STATUS_ONLY token (v3.8.ara) precisely BECAUSE
    // the QR outlives the paper: the link gets forwarded, photographed, and
    // scanned by dock workers and receivers who are not parties to the shipment.
    // Narrowing reduced what a leaked link discloses. It did not make leakage
    // visible. This does.
    //
    // A LOG LINE, NOT A COUNTER COLUMN. Writing accessCount would put a database
    // write on an unauthenticated public endpoint — a free lever for anyone
    // holding one token to generate load on the primary. The log carries token
    // identity, so "how often, from where, over what window" is answerable
    // without that. The two columns stay unwritten and are named in the triage
    // as such rather than quietly half-filled.
    //
    // The token is HASHED, never logged raw: it is a bearer credential, and a
    // log dump that contains it hands over live tracking access. Same 16-char
    // sha256 prefix convention as lib/authEvents and carrierController.
    try {
      log.info(
        {
          trackingTokenHash: crypto.createHash("sha256").update(token).digest("hex").slice(0, 16),
          loadId: shipperToken.loadId,
          accessLevel: shipperToken.accessLevel,
          ip: extractClientIp(req),
        },
        "[Tracking] public link opened",
      );
    } catch {
      // Telemetry must never fail a shipper's tracking lookup.
    }
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

  // v3.8.ara — STATUS_ONLY now actually means status-only.
  //
  // The BOL QR mints a STATUS_ONLY token (shipperTrackingTokenService), and
  // accessLevel DEFAULTS to STATUS_ONLY for any bare lookup — but pre-ara only
  // `stops` and `checkCalls` were gated on FULL. Everything else was returned to
  // anyone who scanned the QR or guessed a reference number: the CUSTOMER NAME,
  // the COMMODITY, the weight, the equipment, temperature spec, and a link to
  // the signed POD. A BOL travels through many hands (dock workers, lumpers,
  // receivers, anyone who photographs it), so that is a commercial-confidentiality
  // leak: it exposes who ships what, on which lane, in what volume.
  //
  // STATUS_ONLY now returns strictly the tracking function — where it is going,
  // where it is now, and when it should arrive:
  //     lane (origin/destination CITY + STATE), status, progress, milestones,
  //     scheduled + actual dates, last known city/state, ETA.
  // Withheld: customer/shipper name, commodity, weight, equipment, temperature,
  // stop-by-stop facility detail, check calls, and the POD document.
  //
  // NOTE: this deliberately REVERSES the §14 locked v3.7.k decision that
  // `shipperName` be visible on public /track. That decision reasoned the BOL
  // already prints the shipper beside the QR so redaction added nothing. Wasi
  // reversed it 2026-08-12: the QR outlives the paper it was printed on, and a
  // link that is forwarded or scanned by a stranger should not name the customer.
  // §14 updated in the same commit.
  const isFull = accessLevel === "FULL";

  res.json({
    referenceNumber: load.referenceNumber,
    status: load.status,
    progressPct,
    origin: { city: decodeOpt(load.originCity), state: decodeOpt(load.originState) },
    destination: { city: decodeOpt(load.destCity), state: decodeOpt(load.destState) },
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    actualPickup: load.actualPickupDatetime,
    actualDelivery: load.actualDeliveryDatetime,
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
    accessLevel,

    // ── Commercially sensitive — FULL-access links only ──────────────
    // v3.8.i.1 — `carrierFirstName` stays removed from the response entirely.
    shipperName: isFull ? (decodeOpt(load.customer?.name) || null) : undefined,
    equipment: isFull ? decodeOpt(load.equipmentType) : undefined,
    commodity: isFull ? decodeOpt(load.commodity) : undefined,
    weight: isFull ? load.weight : undefined,
    temperatureControlled: isFull ? (load.temperatureControlled || false) : undefined,
    tempRange: isFull && load.temperatureControlled ? { min: load.tempMin, max: load.tempMax } : undefined,
    stops,
    podUrl: isFull && ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"].includes(load.status)
      ? load.podUrl
      : null,
    checkCalls: isFull ? load.checkCalls.map((cc: any) => ({
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
