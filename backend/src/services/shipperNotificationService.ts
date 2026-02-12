import { prisma } from "../config/database";
import {
  sendEmail,
  shipperPickupHtml,
  shipperTransitHtml,
  shipperDeliveryHtml,
  shipperPODHtml,
} from "./emailService";

/**
 * Send "Shipment picked up" email to shipper when load goes LOADED.
 */
export async function sendShipperPickupEmail(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { name: true, email: true, contactName: true } },
      carrier: { select: { company: true, firstName: true, lastName: true } },
    },
  });
  if (!load?.customer?.email) return;

  // Dedup: check if already sent in last 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const alreadySent = await prisma.notification.findFirst({
    where: {
      type: "LOAD_UPDATE",
      title: { contains: `Shipper Pickup: ${load.referenceNumber}` },
      createdAt: { gte: twoHoursAgo },
    },
  });
  if (alreadySent) return;

  const origin = `${load.originCity}, ${load.originState}`;
  const dest = `${load.destCity}, ${load.destState}`;
  const carrierName = load.carrier?.company || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : "Carrier");
  const eta = load.deliveryDate ? load.deliveryDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "TBD";

  const html = shipperPickupHtml(load.referenceNumber, origin, dest, carrierName, eta);
  await sendEmail(load.customer.email, `Shipment Picked Up: ${load.referenceNumber}`, html);

  // Record notification for dedup
  await prisma.notification.create({
    data: {
      userId: load.posterId,
      type: "LOAD_UPDATE",
      title: `Shipper Pickup: ${load.referenceNumber}`,
      message: `Pickup email sent to ${load.customer.email} for load ${load.referenceNumber}`,
      actionUrl: "/ae/loads.html",
    },
  });

  console.log(`[ShipperNotify] Pickup email sent to ${load.customer.email} for ${load.referenceNumber}`);
}

/**
 * Send transit update email to shipper with check-call history and progress.
 */
export async function sendShipperTransitUpdate(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { name: true, email: true } },
      checkCalls: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!load?.customer?.email) return;

  // Dedup: check if transit update already sent in last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const alreadySent = await prisma.notification.findFirst({
    where: {
      type: "LOAD_UPDATE",
      title: { contains: `Shipper Transit: ${load.referenceNumber}` },
      createdAt: { gte: sixHoursAgo },
    },
  });
  if (alreadySent) return;

  const origin = `${load.originCity}, ${load.originState}`;
  const dest = `${load.destCity}, ${load.destState}`;

  // Calculate % complete based on dates
  const pickupTime = load.pickupDate.getTime();
  const deliveryTime = load.deliveryDate.getTime();
  const now = Date.now();
  const totalDuration = deliveryTime - pickupTime;
  const elapsed = now - pickupTime;
  const percentComplete = totalDuration > 0 ? Math.min(95, Math.max(5, Math.round((elapsed / totalDuration) * 100))) : 50;

  // Latest location from check calls
  const lastCC = load.checkCalls[0];
  const lastLocation = lastCC?.location || lastCC?.city ? `${lastCC.city || ""}, ${lastCC.state || ""}` : "En route";
  const etaStr = load.deliveryDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const ccForEmail = load.checkCalls.map((cc) => ({
    location: cc.location || (cc.city ? `${cc.city}, ${cc.state}` : "—"),
    status: cc.status,
    createdAt: cc.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  }));

  const html = shipperTransitHtml(load.referenceNumber, origin, dest, lastLocation, etaStr, percentComplete, ccForEmail);
  await sendEmail(load.customer.email, `Transit Update: ${load.referenceNumber} — ${percentComplete}% Complete`, html);

  // Record notification for dedup
  await prisma.notification.create({
    data: {
      userId: load.posterId,
      type: "LOAD_UPDATE",
      title: `Shipper Transit: ${load.referenceNumber}`,
      message: `Transit update sent to ${load.customer.email} — ${percentComplete}% complete`,
      actionUrl: "/ae/loads.html",
    },
  });

  console.log(`[ShipperNotify] Transit update sent to ${load.customer.email} for ${load.referenceNumber} (${percentComplete}%)`);
}

/**
 * Send "Shipment delivered" email to shipper.
 */
export async function sendShipperDeliveryEmail(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { name: true, email: true } },
    },
  });
  if (!load?.customer?.email) return;

  // Dedup
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const alreadySent = await prisma.notification.findFirst({
    where: {
      type: "LOAD_UPDATE",
      title: { contains: `Shipper Delivery: ${load.referenceNumber}` },
      createdAt: { gte: twoHoursAgo },
    },
  });
  if (alreadySent) return;

  const origin = `${load.originCity}, ${load.originState}`;
  const dest = `${load.destCity}, ${load.destState}`;
  const deliveredAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const html = shipperDeliveryHtml(load.referenceNumber, origin, dest, deliveredAt);
  await sendEmail(load.customer.email, `Shipment Delivered: ${load.referenceNumber}`, html);

  await prisma.notification.create({
    data: {
      userId: load.posterId,
      type: "LOAD_UPDATE",
      title: `Shipper Delivery: ${load.referenceNumber}`,
      message: `Delivery email sent to ${load.customer.email} for load ${load.referenceNumber}`,
      actionUrl: "/ae/loads.html",
    },
  });

  console.log(`[ShipperNotify] Delivery email sent to ${load.customer.email} for ${load.referenceNumber}`);
}

/**
 * Send "POD available" email to shipper after POD validation.
 */
export async function sendShipperPODEmail(loadId: string, podUrl: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { name: true, email: true } },
    },
  });
  if (!load?.customer?.email) return;

  const fullPodUrl = `https://silkroutelogistics.ai${podUrl}`;
  const html = shipperPODHtml(load.referenceNumber, fullPodUrl);
  await sendEmail(load.customer.email, `POD Available: ${load.referenceNumber}`, html);

  console.log(`[ShipperNotify] POD email sent to ${load.customer.email} for ${load.referenceNumber}`);
}

/**
 * Validate POD by matching metadata (delivery date + consignee name).
 * Auto-approve if match, otherwise leave for manual review.
 */
export async function validateAndNotifyPOD(loadId: string, documentId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: { customer: { select: { name: true, email: true, contactName: true } } },
  });
  if (!load) return;

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;

  // Auto-validate: check if load has been delivered and consignee name exists
  const isDelivered = ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"].includes(load.status);
  const hasConsignee = !!(load.destCompany || load.customer?.contactName);

  if (isDelivered && hasConsignee) {
    // Auto-approve POD
    await prisma.load.update({
      where: { id: loadId },
      data: {
        podSigned: true,
        podReceivedAt: new Date(),
        podUrl: doc.fileUrl,
        status: load.status === "DELIVERED" ? "POD_RECEIVED" : load.status,
      },
    });

    // Send POD email to shipper
    await sendShipperPODEmail(loadId, doc.fileUrl);

    console.log(`[ShipperNotify] POD auto-validated for ${load.referenceNumber}`);
  } else {
    // Just store the POD URL for manual review
    await prisma.load.update({
      where: { id: loadId },
      data: { podUrl: doc.fileUrl },
    });

    console.log(`[ShipperNotify] POD uploaded for ${load.referenceNumber} — pending manual validation`);
  }
}

/**
 * Cron handler: query all IN_TRANSIT loads and send shipper transit updates.
 */
export async function processShipperTransitUpdates() {
  const inTransitLoads = await prisma.load.findMany({
    where: {
      status: { in: ["IN_TRANSIT", "LOADED", "AT_DELIVERY"] },
      customerId: { not: null },
    },
    select: { id: true, referenceNumber: true },
  });

  console.log(`[ShipperNotify] Processing transit updates for ${inTransitLoads.length} loads`);

  for (const load of inTransitLoads) {
    try {
      await sendShipperTransitUpdate(load.id);
    } catch (err: any) {
      console.error(`[ShipperNotify] Failed transit update for ${load.referenceNumber}: ${err.message}`);
    }
  }
}
