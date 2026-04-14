import { Request, Response } from "express";
import { prisma } from "../config/database";
import { calculatePredictiveETA } from "../services/predictiveEtaService";

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

  const loadSelect: any = {
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
    carrier: { select: { firstName: true } },
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
    ? { city: latestEvent.locationCity, state: latestEvent.locationState, updatedAt: latestEvent.createdAt }
    : lastCheckCall?.city
      ? { city: lastCheckCall.city, state: lastCheckCall.state, updatedAt: lastCheckCall.createdAt }
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
    city: s.city,
    state: s.state,
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
    origin: { city: load.originCity, state: load.originState },
    destination: { city: load.destCity, state: load.destState },
    equipment: load.equipmentType,
    commodity: load.commodity,
    weight: load.weight,
    temperatureControlled: load.temperatureControlled || false,
    tempRange: load.temperatureControlled ? { min: load.tempMin, max: load.tempMax } : undefined,
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    actualPickup: load.actualPickupDatetime,
    actualDelivery: load.actualDeliveryDatetime,
    carrierFirstName: load.carrier?.firstName || null,
    shipperName: load.customer?.name || null,
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
      city: cc.city,
      state: cc.state,
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
