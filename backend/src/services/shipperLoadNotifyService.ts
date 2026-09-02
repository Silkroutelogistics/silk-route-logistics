import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";
import { resolveOperationalRecipients } from "./customerRecipientResolver";

const PORTAL_BASE = "https://silkroutelogistics.ai";

// go-live audit R4: shipper-facing emails reply to operations@ (a monitored
// inbox), not the noreply@ From address — so a shipper's reply doesn't vanish.
const SHIPPER_REPLY_TO = { replyTo: "operations@silkroutelogistics.ai" };
function sendShipperEmail(to: string, subject: string, html: string, attachments?: any[]) {
  return sendEmail(to, subject, html, attachments, SHIPPER_REPLY_TO);
}

/**
 * Who receives operational mail for this load.
 *
 * Was `load.contactEmail > customer.email > a second query for customer.email`.
 * That last fallthrough is what addressed operational mail with the BILLING
 * address, because customers.email is also the invoice recipient (13.3 Item
 * 8.3). The resolver keeps contactEmail first and stops before customers.email.
 */
async function resolveRecipients(load: any): Promise<string[]> {
  const list = await resolveOperationalRecipients(load.id);
  return list.map((r) => r.email);
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

// Sections 1, 2, 4 and 5 -- sendPickupNotification, sendInTransitUpdate,
// sendArrivedAtDelivery and sendDeliveredWithPOD -- were deleted in v3.8.ays.
//
// They had ZERO callers anywhere in backend/src, e2e or scripts. loadController
// records why in its own comment at the status-change site: they duplicated the
// milestone email, so a shipper received two or three messages per milestone,
// and the go-live audit removed the call sites without removing the functions.
// Four dead senders resolving recipients their own way is four places for the
// next drift to hide, which is the defect this arc exists to close.

// ─── 3. Delivery ETA Update (daily noon for IN_TRANSIT loads) ──

export async function sendDeliveryETAUpdate(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipients(load);
  if (to.length === 0) return;

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

  for (const addr of to) {
    await sendShipperEmail(addr, `Load ${load.referenceNumber} — In Transit Update`, html);
  }
  log.info(`[ShipperLoadNotify] ETA update sent to ${to.join(", ")} for ${load.referenceNumber}`);
}

// ─── 6. POD Uploaded Notification ──────────────────────────────

export async function sendPODToContact(loadId: string) {
  const load = await fetchLoadForNotify(loadId);
  if (!load) return;
  const to = await resolveRecipients(load);
  if (to.length === 0) return;

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

  for (const addr of to) {
    await sendShipperEmail(addr, `Load ${load.referenceNumber} — Proof of Delivery`, html);
  }
  log.info(`[ShipperLoadNotify] POD email sent to ${to.join(", ")} for ${load.referenceNumber}`);
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
      trackingLinkSent: true,
    },
  });
  if (!load || !load.customerId) return { sent: 0, skipped: "no_customer" };

  // SEND ONCE PER LOAD.
  //
  // `trackingLinkSent` was written at the end of this function and read by
  // nobody, so calling twice mailed the customer's operations and AP contacts
  // twice about one load. That became reachable the moment a second trigger
  // existed: v3.8 commit 11e fires this at CONFIRMED on the direct path while
  // the auto-dispatch paths still fire at accept, and an auto-dispatched load
  // whose rate confirmation is later signed would hit both.
  //
  // The flag it already maintained is the guard; nothing new to keep in sync.
  if (load.trackingLinkSent) return { sent: 0, skipped: "already_sent" };

  // Eligibility is the resolver s call, not this file s. The query that used
  // to sit here filtered receivesTrackingLink and NOTHING ELSE -- so a contact an
  // AE had marked do-not-contact still received tracking links, which is the
  // same class of defect as the incident this arc closes. requireTrackingLink
  // keeps the historical behaviour that tracking links go to tagged CRM
  // contacts only and never to Load.contactEmail.
  const toSend = (await resolveOperationalRecipients(loadId, { requireTrackingLink: true }))
    .map((r) => ({ id: r.contactId ?? null, name: r.name ?? "there", email: r.email }));
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

      await sendShipperEmail(contact.email, `Tracking: Load ${load.loadNumber ?? load.referenceNumber} · ${origin} → ${dest}`, html);
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
