import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

const PORTAL_BASE = "https://silkroutelogistics.ai";

/**
 * Resolve the shipper notification email for a load.
 * Priority: load.contactEmail > customer.email
 */
async function resolveRecipient(load: any): Promise<string | null> {
  if (load.contactEmail) return load.contactEmail;
  if (load.customer?.email) return load.customer.email;
  if (load.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: load.customerId },
      select: { email: true },
    });
    return customer?.email || null;
  }
  return null;
}

/** Fetch load with all needed relations for notification emails. */
async function fetchLoadForNotify(loadId: string) {
  return prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: { select: { name: true, email: true, contactName: true } },
      carrier: { select: { company: true, firstName: true, lastName: true } },
      checkCalls: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
}

function carrierDisplayName(carrier: any): string {
  if (!carrier) return "Carrier TBD";
  return carrier.company || `${carrier.firstName || ""} ${carrier.lastName || ""}`.trim() || "Carrier";
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "TBD";
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function trackingLink(load: any): string {
  if (load.trackingToken) {
    return `<p style="text-align:center;margin:20px 0"><a href="${PORTAL_BASE}/track/${load.trackingToken}" style="display:inline-block;padding:12px 28px;background:#d4a574;color:#0f172a;text-decoration:none;border-radius:6px;font-weight:600">Track Shipment</a></p>`;
  }
  return "";
}

function loadInfoTable(load: any, extras?: { label: string; value: string }[]): string {
  const origin = `${load.originCity}, ${load.originState}`;
  const dest = `${load.destCity}, ${load.destState}`;
  const rows = [
    { label: "Reference", value: load.referenceNumber },
    { label: "Route", value: `${origin} &rarr; ${dest}` },
    { label: "Carrier", value: carrierDisplayName(load.carrier) },
    { label: "Equipment", value: load.equipmentType || "N/A" },
    ...(extras || []),
  ];
  const rowHtml = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:140px">${r.label}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${r.value}</td></tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rowHtml}</table>`;
}

// ─── 1. Pickup Notification ────────────────────────────────────

export async function sendPickupNotification(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipient(load);
  if (!to) return;

  const origin = `${load.originCity}, ${load.originState}`;
  const eta = formatDate(load.deliveryDate);

  const html = wrap(`
    <h2 style="color:#0f172a">Load ${load.referenceNumber} &mdash; Picked Up</h2>
    <p>Your shipment <strong>${load.referenceNumber}</strong> from <strong>${origin}</strong> has been picked up.</p>
    ${loadInfoTable(load, [{ label: "Est. Delivery", value: eta }])}
    <p>Carrier: <strong>${carrierDisplayName(load.carrier)}</strong>. Estimated delivery: <strong>${eta}</strong>.</p>
    <p>You will receive transit updates as the shipment progresses.</p>
    ${trackingLink(load)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because your contact email is associated with this shipment on Silk Route Logistics.</p>
  `);

  await sendEmail(to, `Load ${load.referenceNumber} — Picked Up`, html);
  log.info(`[ShipperLoadNotify] Pickup sent to ${to} for ${load.referenceNumber}`);
}

// ─── 2. In-Transit Update ──────────────────────────────────────

export async function sendInTransitUpdate(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipient(load);
  if (!to) return;

  const lastCC = load.checkCalls[0];
  const lastLocation = lastCC?.location || (lastCC?.city ? `${lastCC.city}, ${lastCC.state}` : "En route");
  const eta = formatDate(load.deliveryDate);

  // Calculate if on schedule
  const now = Date.now();
  const deliveryTime = load.deliveryDate?.getTime() || now;
  const isDelayed = now > deliveryTime;
  const etaStatus = isDelayed ? '<span style="color:#dc2626;font-weight:600">Delayed</span>' : '<span style="color:#22c55e;font-weight:600">On Schedule</span>';

  const html = wrap(`
    <h2 style="color:#0f172a">Load ${load.referenceNumber} &mdash; In Transit Update</h2>
    <p>Your shipment <strong>${load.referenceNumber}</strong> is in transit.</p>
    ${loadInfoTable(load, [
      { label: "Current Location", value: lastLocation },
      { label: "Est. Delivery", value: eta },
      { label: "ETA Status", value: etaStatus },
    ])}
    ${trackingLink(load)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because your contact email is associated with this shipment on Silk Route Logistics.</p>
  `);

  await sendEmail(to, `Load ${load.referenceNumber} — In Transit Update`, html);
  log.info(`[ShipperLoadNotify] InTransit sent to ${to} for ${load.referenceNumber}`);
}

// ─── 3. Delivery ETA Update (daily noon for IN_TRANSIT loads) ──

export async function sendDeliveryETAUpdate(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipient(load);
  if (!to) return;

  const lastCC = load.checkCalls[0];
  const lastLocation = lastCC?.location || (lastCC?.city ? `${lastCC.city}, ${lastCC.state}` : "En route");
  const eta = formatDate(load.deliveryDate);

  const now = Date.now();
  const deliveryTime = load.deliveryDate?.getTime() || now;
  const isDelayed = now > deliveryTime;
  const etaStatus = isDelayed ? '<span style="color:#dc2626;font-weight:600">Delayed</span>' : '<span style="color:#22c55e;font-weight:600">On Schedule</span>';

  const html = wrap(`
    <h2 style="color:#0f172a">Load ${load.referenceNumber} &mdash; Daily ETA Update</h2>
    <p>Here is your daily delivery ETA update for shipment <strong>${load.referenceNumber}</strong>.</p>
    ${loadInfoTable(load, [
      { label: "Current Location", value: lastLocation },
      { label: "Est. Delivery", value: eta },
      { label: "ETA Status", value: etaStatus },
    ])}
    ${trackingLink(load)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because your contact email is associated with this shipment on Silk Route Logistics.</p>
  `);

  await sendEmail(to, `Load ${load.referenceNumber} — In Transit Update`, html);
  log.info(`[ShipperLoadNotify] ETA update sent to ${to} for ${load.referenceNumber}`);
}

// ─── 4. Arrived at Delivery ────────────────────────────────────

export async function sendArrivedAtDelivery(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipient(load);
  if (!to) return;

  const dest = `${load.destCity}, ${load.destState}`;

  const html = wrap(`
    <h2 style="color:#0f172a">Load ${load.referenceNumber} &mdash; Arrived at Destination</h2>
    <p>Your shipment <strong>${load.referenceNumber}</strong> has arrived at <strong>${dest}</strong>.</p>
    ${loadInfoTable(load)}
    <p>Awaiting unload confirmation. You will be notified once delivery is complete.</p>
    ${trackingLink(load)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because your contact email is associated with this shipment on Silk Route Logistics.</p>
  `);

  await sendEmail(to, `Load ${load.referenceNumber} — Arrived at Destination`, html);
  log.info(`[ShipperLoadNotify] ArrivedAtDelivery sent to ${to} for ${load.referenceNumber}`);
}

// ─── 5. Delivered (with optional POD) ──────────────────────────

export async function sendDeliveredWithPOD(loadId: string, podUrl?: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipient(load);
  if (!to) return;

  const dest = `${load.destCity}, ${load.destState}`;
  const deliveredAt = (load.actualDeliveryDatetime || new Date()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const resolvedPodUrl = podUrl || load.podUrl;

  const podSection = resolvedPodUrl
    ? `<p style="text-align:center;margin:20px 0"><a href="${PORTAL_BASE}${resolvedPodUrl.startsWith("/") ? "" : "/"}${resolvedPodUrl}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View / Download POD</a></p>`
    : `<p style="color:#64748b">Proof of Delivery (POD) will be sent once validated.</p>`;

  const html = wrap(`
    <h2 style="color:#22c55e">Load ${load.referenceNumber} &mdash; Delivered &#x2713;</h2>
    <p>Your shipment <strong>${load.referenceNumber}</strong> has been delivered to <strong>${dest}</strong> on <strong>${deliveredAt}</strong>.</p>
    ${loadInfoTable(load, [{ label: "Delivered At", value: deliveredAt }])}
    ${podSection}
    ${trackingLink(load)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because your contact email is associated with this shipment on Silk Route Logistics.</p>
  `);

  await sendEmail(to, `Load ${load.referenceNumber} — Delivered ✓`, html);
  log.info(`[ShipperLoadNotify] Delivered sent to ${to} for ${load.referenceNumber}`);
}

// ─── 6. POD Uploaded Notification ──────────────────────────────

export async function sendPODToContact(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipient(load);
  if (!to) return;

  const podUrl = load.podUrl;
  if (!podUrl) return;

  const fullPodUrl = `${PORTAL_BASE}${podUrl.startsWith("/") ? "" : "/"}${podUrl}`;

  const html = wrap(`
    <h2 style="color:#0f172a">Load ${load.referenceNumber} &mdash; Proof of Delivery</h2>
    <p>The proof of delivery for your shipment <strong>${load.referenceNumber}</strong> is now available.</p>
    ${loadInfoTable(load)}
    <div style="text-align:center;margin:24px 0">
      <a href="${fullPodUrl}" style="display:inline-block;padding:14px 32px;background:#d4a574;color:#0f172a;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Download POD</a>
    </div>
    ${trackingLink(load)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You are receiving this email because your contact email is associated with this shipment on Silk Route Logistics.</p>
  `);

  await sendEmail(to, `Load ${load.referenceNumber} — Proof of Delivery`, html);
  log.info(`[ShipperLoadNotify] POD email sent to ${to} for ${load.referenceNumber}`);
}

// ─── Daily ETA Updates Cron Handler ────────────────────────────

export async function dailyETAUpdates() {
  const inTransitLoads = await prisma.load.findMany({
    where: {
      status: "IN_TRANSIT",
      deletedAt: null,
    },
    select: { id: true, referenceNumber: true },
  });

  log.info(`[ShipperLoadNotify] Daily ETA updates: ${inTransitLoads.length} in-transit loads`);

  let sent = 0;
  let errors = 0;
  for (const load of inTransitLoads) {
    try {
      await sendDeliveryETAUpdate(load.id);
      sent++;
    } catch (err: any) {
      errors++;
      log.error(`[ShipperLoadNotify] ETA update failed for ${load.referenceNumber}: ${err.message}`);
    }
  }

  log.info(`[ShipperLoadNotify] Daily ETA complete: ${sent} sent, ${errors} errors`);
}

// ─── CRM tracking-link fan-out on dispatch (v3.4.p) ─────────────
//
// When a load is dispatched (waterfall accept, loadboard bid accept,
// direct tender accept), fan out the shipper tracking URL to every
// customer contact flagged with receivesTrackingLink=true. Also logs
// to customerActivity + loadActivity so the CRM and T&T timelines stay
// in sync (Karpathy Rule 12).

export async function sendTrackingLinkToCrmContacts(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      loadNumber: true,
      referenceNumber: true,
      bolNumber: true,
      trackingToken: true,
      shipperCode: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      pickupDate: true,
      deliveryDate: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      carrier: { select: { company: true, firstName: true, lastName: true } },
    },
  });
  if (!load || !load.customerId) return { sent: 0, skipped: "no_customer" };

  const contacts = await prisma.customerContact.findMany({
    where: { customerId: load.customerId, receivesTrackingLink: true },
    select: { id: true, name: true, email: true },
  });

  const toSend = contacts.filter((c) => !!c.email);
  if (toSend.length === 0) return { sent: 0, skipped: "no_recipients" };

  // Use the existing trackingToken (shipper token seeded at load create)
  // or fall back to the short shipperCode (added in Track & Trace module).
  const token = load.trackingToken ?? load.shipperCode ?? null;
  if (!token) return { sent: 0, skipped: "no_token" };

  const trackingUrl = `${PORTAL_BASE}/track/${token}`;
  const origin = `${load.originCity}, ${load.originState}`;
  const dest = `${load.destCity}, ${load.destState}`;
  const carrierName = carrierDisplayName(load.carrier);

  const { logLoadActivity } = await import("./loadActivityService");
  const { logCustomerActivity } = await import("./customerActivityService");

  let sent = 0;
  for (const contact of toSend) {
    try {
      const html = wrap(`
        <h2 style="color:#0f172a">Load ${load.loadNumber ?? load.referenceNumber} — Dispatched</h2>
        <p>Hello ${contact.name},</p>
        <p>Your shipment with <strong>Silk Route Logistics</strong> has been dispatched. Use the link below to track it in real time.</p>
        ${loadInfoTable(load, [
          { label: "BOL", value: load.bolNumber || "—" },
          { label: "Pickup", value: formatDate(load.pickupDate) },
          { label: "Est. Delivery", value: formatDate(load.deliveryDate) },
        ])}
        <p>Carrier: <strong>${carrierName}</strong></p>
        <p style="text-align:center;margin:24px 0">
          <a href="${trackingUrl}" style="display:inline-block;padding:14px 32px;background:#BA7517;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Track Shipment</a>
        </p>
        <p style="color:#475569;font-size:13px">Tracking link: <a href="${trackingUrl}">${trackingUrl}</a></p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
          You are receiving this email because you are tagged as a tracking contact for ${load.customer?.name ?? "this account"} in Silk Route Logistics CRM.
          If this is incorrect, contact your SRL account rep.
        </p>
      `);

      await sendEmail(contact.email!, `Tracking: Load ${load.loadNumber ?? load.referenceNumber} · ${origin} → ${dest}`, html);
      sent++;

      await logLoadActivity({
        loadId: load.id,
        eventType: "tracking_link_sent",
        description: `Tracking link sent to ${contact.name}`,
        actorType: "SYSTEM",
        metadata: { contactId: contact.id, email: contact.email },
      });
      await logCustomerActivity({
        customerId: load.customerId,
        eventType: "tracking_link_sent",
        description: `Tracking link sent to ${contact.name} for load ${load.loadNumber ?? load.referenceNumber}`,
        actorType: "SYSTEM",
        metadata: { loadId: load.id, contactId: contact.id },
      });
    } catch (err) {
      log.error({ err, contactId: contact.id, loadId: load.id }, "[CRM TrackingLink] send failed");
    }
  }

  // Flip the tracking_link_sent flag on the load so the UI knows
  try {
    await prisma.load.update({ where: { id: load.id }, data: { trackingLinkSent: sent > 0 } });
  } catch {}

  return { sent };
}
