import { prisma } from "../config/database";
import {
  sendEmail,
  wrap,
  shipperPickupHtml,
  shipperTransitHtml,
  shipperDeliveryHtml,
  shipperPODHtml,
} from "./emailService";
import { log } from "../lib/logger";

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
      actionUrl: "/dashboard/loads",
    },
  });

  log.info(`[ShipperNotify] Pickup email sent to ${load.customer.email} for ${load.referenceNumber}`);
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
      actionUrl: "/dashboard/loads",
    },
  });

  log.info(`[ShipperNotify] Transit update sent to ${load.customer.email} for ${load.referenceNumber} (${percentComplete}%)`);
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
      actionUrl: "/dashboard/loads",
    },
  });

  log.info(`[ShipperNotify] Delivery email sent to ${load.customer.email} for ${load.referenceNumber}`);
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

  log.info(`[ShipperNotify] POD email sent to ${load.customer.email} for ${load.referenceNumber}`);
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

    log.info(`[ShipperNotify] POD auto-validated for ${load.referenceNumber}`);
  } else {
    // Just store the POD URL for manual review
    await prisma.load.update({
      where: { id: loadId },
      data: { podUrl: doc.fileUrl },
    });

    log.info(`[ShipperNotify] POD uploaded for ${load.referenceNumber} — pending manual validation`);
  }
}

/**
 * Send milestone email to shipper on each status change.
 * Triggered from loadController on any status update.
 */
export async function sendShipperMilestoneEmail(loadId: string, newStatus: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { name: true, email: true } },
      carrier: { select: { firstName: true, company: true } },
    },
  });
  if (!load?.customer?.email) return;

  const milestoneLabels: Record<string, string> = {
    BOOKED: "Carrier Assigned",
    DISPATCHED: "Dispatched",
    AT_PICKUP: "At Pickup",
    LOADED: "Picked Up",
    IN_TRANSIT: "In Transit",
    AT_DELIVERY: "At Delivery",
    DELIVERED: "Delivered",
    POD_RECEIVED: "POD Received",
    INVOICED: "Invoiced",
  };

  const label = milestoneLabels[newStatus];
  if (!label) return; // Not a trackable milestone

  const trackingUrl = load.trackingToken
    ? `https://silkroutelogistics.ai/track/${load.trackingToken}`
    : null;

  const origin = `${load.originCity}, ${load.originState}`;
  const dest = `${load.destCity}, ${load.destState}`;
  const carrierName = load.carrier?.company || load.carrier?.firstName || "Carrier";

  const body = `
    <h2 style="color:#1e293b;margin:0 0 8px">Shipment Update: ${label}</h2>
    <p style="color:#64748b;margin:0 0 20px">Your shipment <strong>${load.referenceNumber}</strong> has reached a new milestone.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:140px">Status</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#d4a574">${label}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Reference</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${load.referenceNumber}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Route</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Carrier</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${carrierName}</td></tr>
      <tr><td style="padding:8px 12px;color:#64748b">Est. Delivery</td>
          <td style="padding:8px 12px">${load.deliveryDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td></tr>
    </table>
    ${trackingUrl ? `<p style="text-align:center"><a href="${trackingUrl}" style="display:inline-block;padding:12px 28px;background:#d4a574;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Track Shipment</a></p>` : ""}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because you have an active shipment with Silk Route Logistics.</p>
  `;

  await sendEmail(load.customer.email, `Shipment ${label}: ${load.referenceNumber}`, wrap(body));
  log.info(`[ShipperNotify] Milestone email "${label}" sent to ${load.customer.email} for ${load.referenceNumber}`);
}

/**
 * Send delay alert email to shipper for RED/CRITICAL loads.
 * Called by trackTraceAlertEngine when ETA exceeds appointment.
 */
export async function sendShipperDelayNotification(
  load: any,
  alert: { level: string; reason: string; eta?: Date | null; bufferHours?: number },
  deliveryStop: any
) {
  // Resolve shipper email from customer or poster
  let shipperEmail: string | null = null;
  if (load.customer?.email) {
    shipperEmail = load.customer.email;
  } else if (load.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: load.customerId },
      select: { email: true },
    });
    shipperEmail = customer?.email || null;
  }

  if (!shipperEmail) return;

  // Dedup: check if delay notification already sent in last 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const alreadySent = await prisma.notification.findFirst({
    where: {
      type: "LOAD_UPDATE",
      title: { contains: `Shipper Delay ${alert.level}: ${load.referenceNumber || load.loadNumber}` },
      createdAt: { gte: twoHoursAgo },
    },
  });
  if (alreadySent) return;

  const refNum = load.referenceNumber || load.loadNumber || load.id;
  const origin = `${load.originCity || ""}, ${load.originState || ""}`;
  const dest = deliveryStop
    ? `${deliveryStop.city || load.destCity || ""}, ${deliveryStop.state || load.destState || ""}`
    : `${load.destCity || ""}, ${load.destState || ""}`;
  const etaStr = alert.eta
    ? new Date(alert.eta).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Unknown";
  const apptStr = deliveryStop?.appointmentDate
    ? `${new Date(deliveryStop.appointmentDate).toLocaleDateString("en-US", { dateStyle: "medium" })} ${deliveryStop.appointmentTime || ""}`
    : load.deliveryDate
      ? load.deliveryDate.toLocaleDateString("en-US", { dateStyle: "medium" })
      : "N/A";

  const levelColor = alert.level === "CRITICAL" ? "#dc2626" : "#ef4444";
  const levelLabel = alert.level === "CRITICAL" ? "CRITICAL DELAY" : "DELAY ALERT";

  const body = `
    <div style="background:${levelColor};color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;text-align:center">
      <h2 style="margin:0;font-size:18px">${levelLabel}: Shipment ${refNum}</h2>
    </div>
    <div style="padding:20px">
      <p style="color:#64748b;margin:0 0 16px">${alert.reason}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:160px">Reference</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${refNum}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Route</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${origin} &rarr; ${dest}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Scheduled Delivery</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${apptStr}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Current ETA</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:${levelColor};font-weight:600">${etaStr}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b">Status</td>
            <td style="padding:8px 12px;color:${levelColor};font-weight:600">${alert.level}</td></tr>
      </table>
      <p style="color:#64748b;font-size:14px">Our team has been notified and is actively working to minimize the delay. We will keep you updated as new information becomes available.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because you have an active shipment with Silk Route Logistics.</p>
    </div>
  `;

  await sendEmail(shipperEmail, `${levelLabel}: Shipment ${refNum}`, wrap(body));

  // Record notification for dedup
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: `Shipper Delay ${alert.level}: ${refNum}`,
        message: `Delay alert sent to ${shipperEmail} — ${alert.reason}`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }

  log.info(`[ShipperNotify] ${alert.level} delay alert sent to ${shipperEmail} for ${refNum}`);
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

  log.info(`[ShipperNotify] Processing transit updates for ${inTransitLoads.length} loads`);

  for (const load of inTransitLoads) {
    try {
      await sendShipperTransitUpdate(load.id);
    } catch (err: any) {
      log.error(`[ShipperNotify] Failed transit update for ${load.referenceNumber}: ${err.message}`);
    }
  }
}
