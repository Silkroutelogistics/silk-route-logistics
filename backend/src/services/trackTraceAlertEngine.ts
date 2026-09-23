/**
 * Track & Trace Alert Engine — Phase 3
 * Calculates ETA vs appointment, assigns GREEN/YELLOW/RED/CRITICAL alert levels.
 * Detects no-update situations. Integrates with existing RiskLog.
 */
import { prisma } from "../config/database";
import { sendShipperDelayNotification } from "./shipperNotificationService";
import { createNotification } from "./notificationService";
import { broadcastSSE } from "../routes/trackTraceSSE";
import { log } from "../lib/logger";
import {
  applyStopDwellCharges,
  LAYOVER_RATE_PER_DAY,
  DETENTION_CAP_PER_STOP,
} from "../lib/detentionLayover";

/** How far back a located report still counts as current, for R3/R4. */
export const NO_DATA_LOOKBACK_HOURS = 6;

export interface AlertResult {
  loadId: string;
  level: "GREEN" | "YELLOW" | "RED" | "CRITICAL";
  /**
   * R4 — WHAT the alert is about, kept apart from how loud it is.
   *   LATE              a located report puts the load behind its appointment
   *   NO_TRACKING_DATA  nobody has told us where it is
   * The second is a gap in OUR data, never a statement about the freight, and
   * it must never reach the customer (R3).
   */
  kind?: "LATE" | "NO_TRACKING_DATA";
  reason: string;
  eta?: Date | null;
  appointmentTime?: Date | null;
  bufferHours?: number;
}

/**
 * Assess alert level for a single load based on ETA vs appointment.
 */
/**
 * R3 — a customer is told about a DELAY only on located evidence.
 *
 * A check call with no city, state or location is a carrier saying "still
 * rolling" and nothing more; it cannot place the freight, so it cannot
 * support a claim that the freight is late. SRL-121494 had four check calls,
 * all inside 24 seconds and all with null location, and the customer was sent
 * six CRITICAL DELAY emails on the strength of them.
 */
export function hasLocatedReport(
  checkCall: { location?: string | null; city?: string | null; state?: string | null; createdAt?: Date } | null | undefined,
  trackingEvent: { createdAt?: Date } | null | undefined,
  lookbackHours: number,
): boolean {
  const since = Date.now() - lookbackHours * 3600_000;
  if (trackingEvent?.createdAt && new Date(trackingEvent.createdAt).getTime() >= since) return true;
  if (!checkCall?.createdAt) return false;
  if (new Date(checkCall.createdAt).getTime() < since) return false;
  return Boolean(checkCall.location || checkCall.city || checkCall.state);
}

export function assessAlertLevel(
  eta: Date | null,
  appointmentDate: Date | null,
  appointmentTime: string | null,
  lastUpdateAt: Date | null,
  loadStatus: string
): AlertResult & { level: string; reason: string } {
  // NO TRACKING DATA. This is the absence of a report, not evidence of a
  // delay, so R3 keeps it off the customer's mail entirely and R4 stops it
  // escalating: the reason no longer carries an hour count, because a number
  // that grows every scan defeats its own dedup and reads to an AE as though
  // the situation is worsening when all that has happened is more silence.
  // SRL-121494 produced a CRITICAL every hour from 33h to 39h on that basis.
  if (lastUpdateAt) {
    const hoursSinceUpdate = (Date.now() - new Date(lastUpdateAt).getTime()) / (1000 * 60 * 60);
    const inTransitStatuses = ["IN_TRANSIT", "LOADED", "DISPATCHED"];
    if (inTransitStatuses.includes(loadStatus) && hoursSinceUpdate >= 6) {
      return {
        loadId: "",
        level: "CRITICAL",
        kind: "NO_TRACKING_DATA",
        reason: "No location report on an in-transit load",
        eta,
        bufferHours: -hoursSinceUpdate,
      };
    }
  }

  // If no appointment or no ETA, default GREEN
  if (!appointmentDate || !eta) {
    return { loadId: "", level: "GREEN", reason: "No appointment or ETA to compare", eta };
  }

  // Calculate deadline from appointment date + time
  const apptDateStr = new Date(appointmentDate).toISOString().split("T")[0];
  const timeStr = appointmentTime || "23:59";
  const deadline = new Date(`${apptDateStr}T${timeStr}:00`);
  const etaDate = new Date(eta);

  const bufferMs = deadline.getTime() - etaDate.getTime();
  const bufferHours = bufferMs / (1000 * 60 * 60);

  if (bufferHours < -0.5) {
    // ETA past appointment by more than 30 min
    return {
      loadId: "",
      level: "RED",
        kind: "LATE",
      reason: `ETA is ${Math.abs(Math.round(bufferHours))}h past delivery appointment`,
      eta,
      appointmentTime: deadline,
      bufferHours,
    };
  } else if (bufferHours < 2) {
    // Less than 2 hour buffer
    return {
      loadId: "",
      level: "YELLOW",
        kind: "LATE",
      reason: `ETA has less than ${Math.round(bufferHours * 60)}min buffer before appointment`,
      eta,
      appointmentTime: deadline,
      bufferHours,
    };
  }

  return {
    loadId: "",
    level: "GREEN",
    reason: `ETA is ${Math.round(bufferHours)}h before appointment`,
    eta,
    appointmentTime: deadline,
    bufferHours,
  };
}

/**
 * Scan all active loads and generate alert events.
 * Called by cron every 15 minutes.
 */
export async function runAlertScanner() {
  const activeLoads = await prisma.load.findMany({
    where: {
      status: {
        in: [
          "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
          "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
        ],
      },
      deletedAt: null,
    },
    include: {
      loadStops: {
        where: { stopType: "DELIVERY" },
        orderBy: { stopNumber: "desc" },
        take: 1,
      },
      trackingEvents: {
        // The engine's own writes must not count as the carrier's last update.
        // It writes ALERT rows below and TEMPERATURE rows in the reefer pass,
        // and with no filter the newest of those became lastUpdateAt, so the
        // CRITICAL no-update rule reset itself on every scan: fire at six
        // hours, write an ALERT, and the next scan read that ALERT as an
        // update thirty minutes old. Phase 0 of the mandatory-ELD arc.
        where: { eventType: { notIn: ["ALERT", "TEMPERATURE"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      checkCalls: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
      customer: { select: { id: true, name: true } },
    },
  });

  let yellowCount = 0;
  let redCount = 0;
  let criticalCount = 0;

  for (const load of activeLoads) {
    const lastDelivery = load.loadStops[0];
    const lastEvent = load.trackingEvents[0];
    const lastCheckCall = load.checkCalls[0];

    // Get best available ETA
    const eta = lastEvent?.etaDestination || lastCheckCall?.etaUpdate || null;

    // Get latest update time (from tracking event or check call)
    const lastUpdateAt = lastEvent?.createdAt || lastCheckCall?.createdAt || null;

    const alert = assessAlertLevel(
      eta,
      lastDelivery?.appointmentDate || load.deliveryDate,
      lastDelivery?.appointmentTime || load.deliveryTimeStart,
      lastUpdateAt,
      load.status
    );
    alert.loadId = load.id;

    // Skip GREEN — no action needed
    if (alert.level === "GREEN") continue;

    // Dedup. A LATE alert may repeat every 30 minutes because the ETA it
    // stands on genuinely moves. NO_TRACKING_DATA cannot: nothing has changed
    // except how long the silence has lasted, so R4 caps it at once per load
    // per 12 hours. SRL-121494 produced one every hour for seven hours.
    const dedupMs =
      alert.kind === "NO_TRACKING_DATA" ? 12 * 60 * 60 * 1000 : 30 * 60 * 1000;
    const recentAlert = await prisma.loadTrackingEvent.findFirst({
      where: {
        loadId: load.id,
        eventType: "ALERT",
        alertLevel: alert.level as any,
        createdAt: { gte: new Date(Date.now() - dedupMs) },
      },
    });
    if (recentAlert) continue;

    // Record alert event
    await prisma.loadTrackingEvent.create({
      data: {
        loadId: load.id,
        eventType: "ALERT",
        alertLevel: alert.level as any,
        latitude: lastEvent?.latitude || null,
        longitude: lastEvent?.longitude || null,
        locationCity: lastEvent?.locationCity || lastCheckCall?.city || null,
        locationState: lastEvent?.locationState || lastCheckCall?.state || null,
        locationSource: "AE_MANUAL",
        etaDestination: eta,
        notes: alert.reason,
      },
    });

    // Track counts and broadcast via SSE
    if (alert.level === "YELLOW") yellowCount++;
    if (alert.level === "RED") redCount++;
    if (alert.level === "CRITICAL") criticalCount++;

    broadcastSSE({
      type: "alert",
      loadId: load.id,
      data: { level: alert.level, reason: alert.reason, loadNumber: load.loadNumber || load.referenceNumber },
    });

    // Notify AE for YELLOW+
    if (load.posterId) {
      await createNotification(
        load.posterId,
        "LOAD_UPDATE",
        `${alert.level} Alert: ${load.loadNumber || load.referenceNumber}`,
        alert.reason,
        { actionUrl: "/dashboard/tracking" }
      );
    }

    // Auto-notify shipper for RED and CRITICAL — but only for a LATE alert
    // standing on a located report (R3). NO_TRACKING_DATA is a gap in our own
    // data; telling a customer their freight is critically delayed because
    // nobody filed a check call is a claim we cannot support, and it is what
    // reached logistics@beekeepersnaturals.com six times for SRL-121494.
    const located = hasLocatedReport(lastCheckCall, lastEvent, NO_DATA_LOOKBACK_HOURS);
    const tellCustomer = alert.kind !== "NO_TRACKING_DATA" && located;
    if (alert.level === "RED" || alert.level === "CRITICAL") {
      if (tellCustomer) await sendShipperDelayNotification(load, alert, lastDelivery);

      // Escalate check-calls to every 60 minutes for RED/CRITICAL
      await prisma.checkCallSchedule.updateMany({
        where: {
          loadId: load.id,
          status: { in: ["PENDING", "SENT"] },
        },
        data: {
          type: "PRE_DELIVERY",
          scheduledTime: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    }
  }

  // ─── Auto-Layover on an open stop ──────────────────────────────────────
  // This writer used to fire on its own 24h rule and write a flat $250 LAYOVER
  // row on the same stopId that loadTracking would later bill detention
  // against, so a long hold collected both for one span of hours. It no longer
  // decides anything: it hands the dwell to the reconciler and writes only what
  // comes back. Layover starts at the cap conversion (arrival + 7h) and bills
  // day one there, so a stop that has capped is already worth $500 and there is
  // no band where a held carrier accrues nothing. The reconciler also writes the
  // detention leg on this pass once it has capped, because past the cap that
  // figure is frozen — that is what keeps the mid-hold quote from disagreeing
  // with the ledger.
  const stopsWithDetention = await prisma.loadStop.findMany({
    where: {
      actualArrival: { not: null },
      actualDeparture: null,
      load: {
        status: { in: ["AT_PICKUP", "AT_DELIVERY"] },
        deletedAt: null,
      },
    },
    include: { load: { select: { id: true, loadNumber: true, referenceNumber: true, posterId: true } } },
  });

  for (const stop of stopsWithDetention) {
    const arrivalAt = new Date(stop.actualArrival!);
    const dwellHrs = (Date.now() - arrivalAt.getTime()) / (1000 * 60 * 60);

    const { layoverChanged, layoverDays } = await applyStopDwellCharges(prisma, {
      loadId: stop.load.id,
      stopId: stop.id,
      stopType: stop.stopType,
      arrivalAt,
      departedAt: new Date(),
      phase: "in_progress",
      facilityName: stop.facilityName,
    });

    if (layoverChanged) {
      const amount = layoverDays * LAYOVER_RATE_PER_DAY;
      const dayLabel = `${layoverDays} day${layoverDays === 1 ? "" : "s"}`;

      if (stop.load.posterId) {
        await createNotification(
          stop.load.posterId,
          "LOAD_UPDATE",
          `Auto-Layover: ${stop.load.loadNumber || stop.load.referenceNumber}`,
          `${Math.round(dwellHrs)}h at ${stop.facilityName || "stop"}. Detention hit the $${DETENTION_CAP_PER_STOP} cap and converted to layover: ${dayLabel} at $${LAYOVER_RATE_PER_DAY}/day ($${amount}).`,
          { actionUrl: "/dashboard/tracking" }
        );
      }

      broadcastSSE({
        type: "accessorial",
        loadId: stop.load.id,
        data: { type: "LAYOVER", amount, days: layoverDays, facility: stop.facilityName },
      });
    }
  }

  // ─── Temperature Deviation Alerts (reefer loads) ───
  let tempAlerts = 0;
  const reeferLoads = activeLoads.filter((l) => l.temperatureControlled && l.tempMin != null && l.tempMax != null);
  for (const load of reeferLoads) {
    const lastEvent = load.trackingEvents[0];
    if (!lastEvent?.temperatureF) continue;

    const temp = Number(lastEvent.temperatureF);
    const min = Number(load.tempMin);
    const max = Number(load.tempMax);

    if (temp < min || temp > max) {
      // Check dedup
      const recentTempAlert = await prisma.loadTrackingEvent.findFirst({
        where: {
          loadId: load.id,
          eventType: "TEMPERATURE",
          alertLevel: { in: ["RED", "CRITICAL"] },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
      });
      if (recentTempAlert) continue;

      const deviation = temp < min ? min - temp : temp - max;
      const level = deviation > 10 ? "CRITICAL" : "RED";
      const reason = `Temperature ${temp}°F is ${deviation.toFixed(1)}°F ${temp < min ? "below" : "above"} range (${min}-${max}°F)`;

      await prisma.loadTrackingEvent.create({
        data: {
          loadId: load.id,
          eventType: "TEMPERATURE",
          alertLevel: level as any,
          temperatureF: temp,
          latitude: lastEvent.latitude,
          longitude: lastEvent.longitude,
          locationCity: lastEvent.locationCity,
          locationState: lastEvent.locationState,
          locationSource: "AE_MANUAL",
          notes: reason,
        },
      });

      if (load.posterId) {
        await createNotification(
          load.posterId,
          "LOAD_UPDATE",
          `TEMP ${level}: ${load.loadNumber || load.referenceNumber}`,
          reason,
          { actionUrl: "/dashboard/tracking" }
        );
      }

      broadcastSSE({
        type: "alert",
        loadId: load.id,
        data: { level, reason, loadNumber: load.loadNumber || load.referenceNumber, type: "TEMPERATURE" },
      });

      tempAlerts++;
    }
  }

  if (yellowCount + redCount + criticalCount + tempAlerts > 0) {
    log.info(`[AlertEngine] Alerts: ${yellowCount} YELLOW, ${redCount} RED, ${criticalCount} CRITICAL, ${tempAlerts} TEMP`);
  }
}
