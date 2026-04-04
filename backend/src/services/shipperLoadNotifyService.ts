import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";

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
    return `<p style="text-align:center;margin:20px 0"><a href="${PORTAL_BASE}/tracking/${load.trackingToken}" style="display:inline-block;padding:12px 28px;background:#d4a574;color:#0f172a;text-decoration:none;border-radius:6px;font-weight:600">Track Shipment</a></p>`;
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
  console.log(`[ShipperLoadNotify] Pickup sent to ${to} for ${load.referenceNumber}`);
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
  console.log(`[ShipperLoadNotify] InTransit sent to ${to} for ${load.referenceNumber}`);
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
  console.log(`[ShipperLoadNotify] ETA update sent to ${to} for ${load.referenceNumber}`);
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
  console.log(`[ShipperLoadNotify] ArrivedAtDelivery sent to ${to} for ${load.referenceNumber}`);
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
  console.log(`[ShipperLoadNotify] Delivered sent to ${to} for ${load.referenceNumber}`);
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
  console.log(`[ShipperLoadNotify] POD email sent to ${to} for ${load.referenceNumber}`);
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

  console.log(`[ShipperLoadNotify] Daily ETA updates: ${inTransitLoads.length} in-transit loads`);

  let sent = 0;
  let errors = 0;
  for (const load of inTransitLoads) {
    try {
      await sendDeliveryETAUpdate(load.id);
      sent++;
    } catch (err: any) {
      errors++;
      console.error(`[ShipperLoadNotify] ETA update failed for ${load.referenceNumber}: ${err.message}`);
    }
  }

  console.log(`[ShipperLoadNotify] Daily ETA complete: ${sent} sent, ${errors} errors`);
}
