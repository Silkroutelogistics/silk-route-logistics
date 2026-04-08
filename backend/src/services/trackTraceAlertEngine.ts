/**
 * Track & Trace Alert Engine — Phase 3
 * Calculates ETA vs appointment, assigns GREEN/YELLOW/RED/CRITICAL alert levels.
 * Detects no-update situations. Integrates with existing RiskLog.
 */
import { prisma } from "../config/database";
import { sendShipperDelayNotification } from "./shipperNotificationService";
import { createNotification } from "./notificationService";
import { broadcastSSE } from "../routes/trackTraceSSE";

export interface AlertResult {
  loadId: string;
  level: "GREEN" | "YELLOW" | "RED" | "CRITICAL";
  reason: string;
  eta?: Date | null;
  appointmentTime?: Date | null;
  bufferHours?: number;
}

/**
 * Assess alert level for a single load based on ETA vs appointment.
 */
export function assessAlertLevel(
  eta: Date | null,
  appointmentDate: Date | null,
  appointmentTime: string | null,
  lastUpdateAt: Date | null,
  loadStatus: string
): AlertResult & { level: string; reason: string } {
  // Check for no-update CRITICAL (6+ hours with no location data)
  if (lastUpdateAt) {
    const hoursSinceUpdate = (Date.now() - new Date(lastUpdateAt).getTime()) / (1000 * 60 * 60);
    const inTransitStatuses = ["IN_TRANSIT", "LOADED", "DISPATCHED"];
    if (inTransitStatuses.includes(loadStatus) && hoursSinceUpdate >= 6) {
      return {
        loadId: "",
        level: "CRITICAL",
        reason: `No location update for ${Math.round(hoursSinceUpdate)}h on in-transit load`,
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

    // Dedup: check if we already logged this alert level in the last 30 minutes
    const recentAlert = await prisma.loadTrackingEvent.findFirst({
      where: {
        loadId: load.id,
        eventType: "ALERT",
        alertLevel: alert.level as any,
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
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

    // Auto-notify shipper for RED and CRITICAL
    if (alert.level === "RED" || alert.level === "CRITICAL") {
      await sendShipperDelayNotification(load, alert, lastDelivery);

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

  // ─── Auto-Layover: detention > 24hrs → create LAYOVER accessorial ───
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
    const dwellMs = Date.now() - new Date(stop.actualArrival!).getTime();
    const dwellHrs = dwellMs / (1000 * 60 * 60);
    if (dwellHrs >= 24) {
      // Check if LAYOVER already created
      const existingLayover = await prisma.loadAccessorial.findFirst({
        where: { loadId: stop.load.id, stopId: stop.id, type: "LAYOVER" as any },
      });
      if (!existingLayover) {
        await prisma.loadAccessorial.create({
          data: {
            loadId: stop.load.id,
            stopId: stop.id,
            type: "LAYOVER" as any,
            notes: `Auto-layover: ${Math.round(dwellHrs)}h detention at ${stop.facilityName || "stop"}`,
            amount: 350,
            quantity: 1,
            unit: "flat",
            rate: 350,
            billedTo: "SHIPPER",
            status: "PENDING" as any,
          },
        });

        if (stop.load.posterId) {
          await createNotification(
            stop.load.posterId,
            "LOAD_UPDATE",
            `Auto-Layover: ${stop.load.loadNumber || stop.load.referenceNumber}`,
            `Detention exceeded 24hrs at ${stop.facilityName || "stop"}. Layover accessorial ($350) auto-created.`,
            { actionUrl: "/dashboard/tracking" }
          );
        }

        broadcastSSE({
          type: "accessorial",
          loadId: stop.load.id,
          data: { type: "LAYOVER", amount: 350, facility: stop.facilityName },
        });
      }
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
    console.log(`[AlertEngine] Alerts: ${yellowCount} YELLOW, ${redCount} RED, ${criticalCount} CRITICAL, ${tempAlerts} TEMP`);
  }
}
