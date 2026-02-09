import cron from "node-cron";
import { prisma } from "../config/database";
import { sendPreTracingEmail, sendLateAlertEmail } from "./emailService";

/**
 * Pre-tracing: runs every hour.
 * Sends emails to carriers at 48h and 24h before pickup.
 * Dedup via Notification table (type "PRE_TRACING").
 */
async function runPreTracing() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Find shipments with pickup in the next 48 hours that are BOOKED or DISPATCHED
  const shipments = await prisma.shipment.findMany({
    where: {
      status: { in: ["BOOKED", "DISPATCHED"] },
      pickupDate: { lte: in48h, gte: now },
      loadId: { not: null },
    },
    include: {
      load: {
        include: {
          carrier: { select: { id: true, email: true, firstName: true, lastName: true, company: true } },
        },
      },
    },
  });

  for (const shipment of shipments) {
    if (!shipment.load?.carrier) continue;

    const hoursUntilPickup = (shipment.pickupDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const window = hoursUntilPickup <= 24 ? "24H" : "48H";

    // Check if we already sent a notification for this window
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: shipment.load.carrier.id,
        type: "LOAD_UPDATE",
        title: { contains: `Pre-Tracing ${window}` },
        createdAt: { gte: twoHoursAgo },
      },
    });
    if (alreadySent) continue;

    const carrier = shipment.load.carrier;
    const origin = `${shipment.originCity}, ${shipment.originState}`;
    const dest = `${shipment.destCity}, ${shipment.destState}`;

    // In-app notification
    await prisma.notification.create({
      data: {
        userId: carrier.id,
        type: "LOAD_UPDATE",
        title: `Pre-Tracing ${window}: ${shipment.load.referenceNumber}`,
        message: `Pickup in ~${Math.round(hoursUntilPickup)}h. ${origin} → ${dest}. Are you on time?`,
        actionUrl: "/dashboard/loads",
      },
    });

    // Email
    await sendPreTracingEmail(
      carrier.email,
      carrier.firstName || carrier.company || "Carrier",
      shipment.load.referenceNumber,
      origin,
      dest,
      shipment.pickupDate,
      hoursUntilPickup,
    );

    console.log(`[PreTracing] Sent ${window} alert to ${carrier.email} for ${shipment.load.referenceNumber}`);
  }
}

/**
 * Late detection: runs every 30 minutes.
 * Flags IN_TRANSIT shipments with no location update in 4+ hours.
 */
async function runLateDetection() {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const staleShipments = await prisma.shipment.findMany({
    where: {
      status: "IN_TRANSIT",
      OR: [
        { lastLocationAt: { lt: fourHoursAgo } },
        { lastLocationAt: null },
      ],
      loadId: { not: null },
    },
    include: {
      load: {
        include: {
          poster: { select: { id: true, email: true, firstName: true, lastName: true } },
          carrier: { select: { id: true, email: true, firstName: true, lastName: true, company: true } },
        },
      },
    },
  });

  for (const shipment of staleShipments) {
    if (!shipment.load?.poster) continue;

    const hoursSinceUpdate = shipment.lastLocationAt
      ? (now.getTime() - shipment.lastLocationAt.getTime()) / (1000 * 60 * 60)
      : 999;

    // Dedup: check if late alert already sent in last 4 hours
    const dedup = await prisma.notification.findFirst({
      where: {
        userId: shipment.load.poster.id,
        type: "LOAD_UPDATE",
        title: { contains: "Late Alert" },
        message: { contains: shipment.shipmentNumber },
        createdAt: { gte: fourHoursAgo },
      },
    });
    if (dedup) continue;

    // Mark shipment as late (update status note via lastLocation)
    const broker = shipment.load.poster;

    // In-app notification to broker
    await prisma.notification.create({
      data: {
        userId: broker.id,
        type: "LOAD_UPDATE",
        title: `Late Alert: ${shipment.shipmentNumber}`,
        message: `Shipment ${shipment.shipmentNumber} (Load ${shipment.load.referenceNumber}) has not moved in ${Math.round(hoursSinceUpdate)}h. Last location: ${shipment.lastLocation || "Unknown"}.`,
        actionUrl: "/dashboard/tracking",
      },
    });

    // Email
    await sendLateAlertEmail(
      broker.email,
      broker.firstName || "Broker",
      shipment.load.referenceNumber,
      shipment.shipmentNumber,
      shipment.lastLocation,
      hoursSinceUpdate,
    );

    console.log(`[LateDetection] Alert sent for ${shipment.shipmentNumber} — ${Math.round(hoursSinceUpdate)}h stale`);
  }
}

export function startSchedulers() {
  // Pre-tracing: every hour at :00
  cron.schedule("0 * * * *", async () => {
    console.log("[Scheduler] Running pre-tracing check...");
    try { await runPreTracing(); } catch (e) { console.error("[PreTracing] Error:", e); }
  });

  // Late detection: every 30 minutes at :00 and :30
  cron.schedule("0,30 * * * *", async () => {
    console.log("[Scheduler] Running late detection check...");
    try { await runLateDetection(); } catch (e) { console.error("[LateDetection] Error:", e); }
  });

  console.log("[Scheduler] Pre-tracing (hourly) and late detection (30min) started");
}
