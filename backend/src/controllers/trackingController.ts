import { Request, Response } from "express";
import { prisma } from "../config/database";

/**
 * Public tracking endpoint — no auth required.
 * Returns load status, last known location, milestone history, ETA, carrier first name only.
 */
export async function getPublicTracking(req: Request, res: Response) {
  const token = req.params.token as string;
  if (!token || token.length < 10) {
    res.status(400).json({ error: "Invalid tracking token" });
    return;
  }

  const load: any = await prisma.load.findUnique({
    where: { trackingToken: token },
    select: {
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
      carrier: { select: { firstName: true } },
      customer: { select: { name: true } },
      checkCalls: {
        select: { status: true, city: true, state: true, etaUpdate: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!load) {
    res.status(404).json({ error: "Shipment not found" });
    return;
  }

  // Build milestone history from status progression
  const milestones = buildMilestones(load);

  // Last known location from most recent check call
  const lastCheckCall = load.checkCalls[0] || null;
  const lastLocation = lastCheckCall
    ? { city: lastCheckCall.city, state: lastCheckCall.state, updatedAt: lastCheckCall.createdAt }
    : null;

  // Estimated delivery
  const eta = lastCheckCall?.etaUpdate || load.deliveryDate;

  res.json({
    referenceNumber: load.referenceNumber,
    status: load.status,
    origin: { city: load.originCity, state: load.originState },
    destination: { city: load.destCity, state: load.destState },
    equipment: load.equipmentType,
    commodity: load.commodity,
    weight: load.weight,
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    actualPickup: load.actualPickupDatetime,
    actualDelivery: load.actualDeliveryDatetime,
    carrierFirstName: load.carrier?.firstName || null,
    shipperName: load.customer?.name || null,
    lastLocation,
    estimatedDelivery: eta,
    milestones,
    checkCalls: load.checkCalls.map((cc) => ({
      status: cc.status,
      city: cc.city,
      state: cc.state,
      timestamp: cc.createdAt,
    })),
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
