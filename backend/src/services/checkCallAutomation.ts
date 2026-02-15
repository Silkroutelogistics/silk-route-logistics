import { prisma } from "../config/database";
import { env } from "../config/env";
import { autoGenerateInvoice } from "./invoiceService";

/**
 * C.2 — Check-Call Automation
 * Creates check-call schedule when load is assigned, sends texts via OpenPhone, handles responses.
 */

function setTime(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const RESPONSE_MAP: Record<string, { status: string; label: string }> = {
  "1": { status: "AT_PICKUP", label: "At Pickup" },
  "2": { status: "LOADED", label: "Loaded" },
  "3": { status: "IN_TRANSIT", label: "In Transit" },
  "4": { status: "AT_DELIVERY", label: "At Delivery" },
  "5": { status: "DELIVERED", label: "Delivered" },
};

/**
 * Create check-call schedule for a load when carrier is assigned.
 * Schedule: 2hrs before pickup, at pickup, midpoint, 2hrs before delivery, at delivery
 */
export async function createCheckCallSchedule(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      carrier: { select: { phone: true, carrierProfile: { select: { contactPhone: true } } } },
      customer: { select: { id: true, rating: true } },
    },
  });
  if (!load || !load.carrier) return;

  const carrierPhone = load.carrier.phone || load.carrier.carrierProfile?.contactPhone || null;
  const pickup = new Date(load.pickupDate);
  const delivery = new Date(load.deliveryDate);
  const transitMs = delivery.getTime() - pickup.getTime();
  const transitDays = Math.ceil(transitMs / (24 * 60 * 60 * 1000));

  // Determine customer tier — Preferred/Cornerstone/Platinum = expedited
  const customerRating = load.customer?.rating || 0;
  const isExpedited = customerRating >= 3; // rating 3+ = Preferred or higher

  // Delete any existing schedule for this load
  await prisma.checkCallSchedule.deleteMany({ where: { loadId } });

  const schedules: { type: string; scheduledTime: Date }[] = [];

  // Common: pre-pickup and pickup confirmation
  schedules.push({ type: "PRE_PICKUP", scheduledTime: new Date(pickup.getTime() - 2 * 60 * 60 * 1000) });
  schedules.push({ type: "PICKUP_30MIN", scheduledTime: new Date(pickup.getTime() - 30 * 60 * 1000) });
  schedules.push({ type: "PICKUP_CONFIRM", scheduledTime: pickup });

  // Transit check calls — depends on tier
  for (let day = 1; day < transitDays; day++) {
    const transitDay = new Date(pickup.getTime() + day * 24 * 60 * 60 * 1000);
    if (isExpedited) {
      // Expedited: carrier check 8:30 AM, shipper update 9 AM, carrier check 3:30 PM, shipper update 4 PM
      schedules.push({ type: "CARRIER_CHECK_AM", scheduledTime: setTime(transitDay, 8, 30) });
      schedules.push({ type: "TRANSIT_AM", scheduledTime: setTime(transitDay, 9, 0) });
      schedules.push({ type: "CARRIER_CHECK_PM", scheduledTime: setTime(transitDay, 15, 30) });
      schedules.push({ type: "TRANSIT_PM", scheduledTime: setTime(transitDay, 16, 0) });
    } else {
      // Standard: carrier check at 1:30 PM, shipper update at 2 PM
      schedules.push({ type: "TRANSIT_DAILY", scheduledTime: setTime(transitDay, 13, 30) });
    }
  }

  // Common: pre-delivery and POD requests
  schedules.push({ type: "PRE_DELIVERY", scheduledTime: new Date(delivery.getTime() - 2 * 60 * 60 * 1000) });
  schedules.push({ type: "POD_REQUEST_30MIN", scheduledTime: new Date(delivery.getTime() + 30 * 60 * 1000) });
  schedules.push({ type: "POD_REQUEST_1HR", scheduledTime: new Date(delivery.getTime() + 60 * 60 * 1000) });

  const futureSchedules = schedules.filter((s) => s.scheduledTime > new Date());

  if (futureSchedules.length === 0) return;

  await prisma.checkCallSchedule.createMany({
    data: futureSchedules.map((s) => ({
      loadId,
      scheduledTime: s.scheduledTime,
      type: s.type,
      status: "PENDING",
      carrierPhone,
    })),
  });

  console.log(`[CheckCall] Created ${futureSchedules.length} ${isExpedited ? 'EXPEDITED' : 'STANDARD'} check calls for load ${load.referenceNumber}`);
}

/**
 * Cron job: every 15 minutes, send texts for due check calls.
 */
export async function processDueCheckCalls() {
  const now = new Date();

  // Find due check calls (scheduled time has passed, still PENDING)
  const due = await prisma.checkCallSchedule.findMany({
    where: {
      status: "PENDING",
      scheduledTime: { lte: now },
    },
    include: {
      load: { select: { id: true, referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
    },
    take: 50,
  });

  for (const cc of due) {
    const msg = `SRL Check-Call: Load #${cc.load.referenceNumber} (${cc.load.originCity}, ${cc.load.originState} → ${cc.load.destCity}, ${cc.load.destState}). Reply: 1=At Pickup, 2=Loaded, 3=In Transit, 4=At Delivery, 5=Delivered`;

    if (cc.carrierPhone) {
      await sendCheckCallText(cc.carrierPhone, msg);
    }

    await prisma.checkCallSchedule.update({
      where: { id: cc.id },
      data: { status: "SENT", sentAt: now },
    });

    console.log(`[CheckCall] Sent check call for load ${cc.load.referenceNumber} (${cc.type})`);
  }

  // Process missed check calls (SENT > 30 min without response)
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const missed = await prisma.checkCallSchedule.findMany({
    where: {
      status: "SENT",
      sentAt: { lte: thirtyMinAgo },
      respondedAt: null,
    },
    include: {
      load: {
        select: {
          id: true,
          referenceNumber: true,
          posterId: true,
          poster: { select: { email: true, firstName: true } },
        },
      },
    },
    take: 50,
  });

  for (const cc of missed) {
    if (cc.retryCount === 0) {
      // First miss: AMBER alert to AE, auto-retry
      await prisma.notification.create({
        data: {
          userId: cc.load.posterId,
          type: "LOAD_UPDATE",
          title: `Check-Call Missed: Load #${cc.load.referenceNumber}`,
          message: `Carrier has not responded to ${cc.type} check-call. Auto-retrying.`,
          actionUrl: `/ae/loads.html`,
        },
      });

      // Retry text
      if (cc.carrierPhone) {
        const retryMsg = `SRL REMINDER: Load #${cc.load.referenceNumber} — please respond with your status. 1=At Pickup, 2=Loaded, 3=In Transit, 4=At Delivery, 5=Delivered`;
        await sendCheckCallText(cc.carrierPhone, retryMsg);
      }

      await prisma.checkCallSchedule.update({
        where: { id: cc.id },
        data: { retryCount: 1, sentAt: now },
      });

      console.log(`[CheckCall] AMBER: Retry sent for load ${cc.load.referenceNumber} (${cc.type})`);
    } else {
      // Second miss: RED alert — carrier unresponsive
      await prisma.notification.create({
        data: {
          userId: cc.load.posterId,
          type: "LOAD_UPDATE",
          title: `URGENT: Carrier Unresponsive — Load #${cc.load.referenceNumber}`,
          message: `Carrier has not responded to check-call after retry. Manual intervention required.`,
          actionUrl: `/ae/loads.html`,
        },
      });

      await prisma.checkCallSchedule.update({
        where: { id: cc.id },
        data: { status: "ESCALATED", escalatedAt: now },
      });

      console.log(`[CheckCall] RED: Carrier unresponsive on load ${cc.load.referenceNumber} (${cc.type})`);
    }
  }
}

/**
 * Handle check-call response from carrier (via OpenPhone webhook)
 */
export async function handleCheckCallResponse(fromPhone: string, responseText: string) {
  // Normalize phone: strip everything except digits
  const normalizedPhone = fromPhone.replace(/\D/g, "");
  const responseNum = responseText.trim().charAt(0);
  const mapping = RESPONSE_MAP[responseNum];

  if (!mapping) return null;

  // Find the most recent SENT check call for this phone
  const schedule = await prisma.checkCallSchedule.findFirst({
    where: {
      carrierPhone: { contains: normalizedPhone.slice(-10) },
      status: { in: ["SENT"] },
    },
    orderBy: { sentAt: "desc" },
    include: { load: { select: { id: true, referenceNumber: true, status: true } } },
  });

  if (!schedule) return null;

  // Update the check-call schedule
  await prisma.checkCallSchedule.update({
    where: { id: schedule.id },
    data: {
      status: "RESPONDED",
      respondedAt: new Date(),
      response: responseNum,
      responseText: mapping.label,
    },
  });

  // Create a check call record
  await prisma.checkCall.create({
    data: {
      loadId: schedule.loadId,
      status: mapping.status,
      driverStatus: mapping.status === "AT_PICKUP" ? "AT_PICKUP"
        : mapping.status === "AT_DELIVERY" ? "AT_DELIVERY"
        : mapping.status === "LOADED" ? "LOADED"
        : "ON_SCHEDULE",
      method: "SMS_AUTO",
      notes: `Auto check-call response: ${mapping.label}`,
    },
  });

  // Update load status if appropriate
  const currentStatus = schedule.load.status;
  const statusOrder = ["POSTED", "TENDERED", "BOOKED", "CONFIRMED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"];
  const currentIdx = statusOrder.indexOf(currentStatus);
  const newIdx = statusOrder.indexOf(mapping.status);

  if (newIdx > currentIdx) {
    await prisma.load.update({
      where: { id: schedule.loadId },
      data: { status: mapping.status as any, statusUpdatedAt: new Date() },
    });
  }

  console.log(`[CheckCall] Response received for load ${schedule.load.referenceNumber}: ${mapping.label}`);

  // If delivered, trigger full delivery pipeline (invoice, AP, CPP, etc.)
  if (mapping.status === "DELIVERED") {
    // Auto-generate invoice
    autoGenerateInvoice(schedule.loadId).catch((e) =>
      console.error("[CheckCall] autoGenerateInvoice error:", e.message)
    );

    // Integration: AP, credit, CPP
    import("./integrationService").then(({ onLoadDelivered }) =>
      onLoadDelivered(schedule.loadId).catch((e) =>
        console.error("[CheckCall] onLoadDelivered error:", e.message)
      )
    );

    // Prompt POD upload
    const load = await prisma.load.findUnique({
      where: { id: schedule.loadId },
      select: { carrierId: true },
    });
    if (load?.carrierId) {
      await prisma.notification.create({
        data: {
          userId: load.carrierId,
          type: "POD_RECEIVED",
          title: `Upload POD: Load #${schedule.load.referenceNumber}`,
          message: "Load marked as delivered. Please upload the Proof of Delivery document.",
          actionUrl: `/carrier/loads.html`,
        },
      });
    }
  }

  return { loadId: schedule.loadId, status: mapping.status, label: mapping.label };
}

/**
 * Send text via OpenPhone API (or log in mock mode)
 */
async function sendCheckCallText(to: string, message: string) {
  // For now, always log. When OpenPhone API is configured, send real text.
  console.log(`[CheckCall][SMS] To: ${to} | ${message}`);

  // OpenPhone API integration would go here:
  // POST https://api.openphone.com/v1/messages
  // { from: OPENPHONE_NUMBER, to: to, content: message }
}
