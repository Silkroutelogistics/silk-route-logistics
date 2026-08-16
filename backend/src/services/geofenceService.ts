/**
 * Geofence Detection Service — Track & Trace Phase 3
 * Checks GPS/ELD pings against stop lat/long coordinates.
 * Auto-triggers AT_PICKUP / AT_DELIVERY status when within radius.
 */
import { prisma } from "../config/database";
import { broadcastSSE } from "../routes/trackTraceSSE";
import { log } from "../lib/logger";
// v3.8.arn — shared detention constants so geofence-written rows carry the same
// billing shape as loadTracking-written ones (two writers, one table).
import {
  DETENTION_FREE_MINUTES,
  DETENTION_RATE_PER_HOUR,
  detentionCharge,
} from "../routes/loadTracking";
// The single owner of DETENTION_* and LAYOVER accessorial rows. lib/detentionLayover
// imports only a Prisma type, so this adds no cycle: nothing it pulls in reaches
// back here, and routes/loadTracking (imported above) does not import this module.
import { applyStopDwellCharges } from "../lib/detentionLayover";

const GEOFENCE_RADIUS_MILES = 1.0;

/**
 * Settle detention and layover for a stop this scan has just departed.
 *
 * Mirrors `settleDwellForStop` in routes/loadStops.ts, and exists for the same
 * reason. This service is the fourth writer of `actualDeparture` and was the
 * only one that wrote no accessorial. The alert engine selects on
 * `actualDeparture: null`, so the instant the departure branch fired, the stop
 * left that query forever and no "final" pass ever ran against it.
 *
 * The failure was permanent and it ran in the carrier's disfavour both ways:
 *
 *   - A five hour geofenced hold settled at $0. The ratified schedule owes $150.
 *   - Past the cap the ledger froze at whatever the engine had written on its
 *     last tick rather than at the real departure, and the provisional layover
 *     the engine writes against wall-clock could never be walked back.
 *
 * Routing departure through the single owner fixes amount and composition
 * together, exactly as the loadStops fix did.
 *
 * Never throws into the scan. Geofence detection runs over every active load on
 * a cron, and one stop's billing failure must not stop the rest of the sweep.
 */
async function settleGeofenceDeparture(args: {
  loadId: string;
  stopId: string;
  stopType: string;
  facilityName: string | null;
  arrivalAt: Date;
  departedAt: Date;
}): Promise<void> {
  try {
    await applyStopDwellCharges(prisma, {
      loadId: args.loadId,
      stopId: args.stopId,
      stopType: args.stopType,
      arrivalAt: args.arrivalAt,
      departedAt: args.departedAt,
      phase: "final",
      facilityName: args.facilityName,
    });
  } catch (err) {
    log.error(
      { err, stopId: args.stopId, loadId: args.loadId },
      "Dwell reconciliation failed after geofence departure"
    );
  }
}

/** Haversine formula: distance between two lat/lng points in miles */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Check a single GPS ping against all stops of a load.
 * Returns geofence events if the ping is within radius of any stop.
 */
export async function checkGeofence(
  loadId: string,
  latitude: number,
  longitude: number,
  source: string = "ELD"
) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      loadStops: { orderBy: { stopNumber: "asc" } },
    },
  });

  if (!load) return [];

  const events: any[] = [];

  for (const stop of load.loadStops) {
    if (!stop.latitude || !stop.longitude) continue;

    const distance = haversineDistance(
      latitude, longitude,
      Number(stop.latitude), Number(stop.longitude)
    );

    if (distance <= GEOFENCE_RADIUS_MILES) {
      // Determine if this is an entry (arrival) or exit (departure) event
      const isArrival = !stop.actualArrival;
      const _isDeparture = stop.actualArrival && !stop.actualDeparture;

      if (isArrival) {
        // Auto-set arrival
        await prisma.loadStop.update({
          where: { id: stop.id },
          data: { actualArrival: new Date() },
        });

        // Parallel write: new GeofenceEvent table (Lane 1 schema)
        await prisma.geofenceEvent.create({
          data: {
            loadId,
            eventType: stop.stopType === "PICKUP" ? "entered_origin" : "entered_destination",
            facilityName: stop.facilityName,
            lat: latitude,
            lng: longitude,
          },
        });

        // Open a detention record — timer starts the moment we enter the geofence
        await prisma.detentionRecord.create({
          data: {
            loadId,
            locationType: stop.stopType === "PICKUP" ? "origin" : "destination",
            facilityName: stop.facilityName,
            enteredAt: new Date(),
            // v3.8.arn — stamp the canonical rate at open time. Nothing is billable
            // until the stop closes, but the row now states the rate it bills at.
            billable: false,
            ratePerHour: DETENTION_RATE_PER_HOUR,
            totalCharge: 0,
          },
        });

        // Auto-advance load status
        const newStatus = stop.stopType === "PICKUP" ? "AT_PICKUP" : "AT_DELIVERY";
        const validTransitions: Record<string, string[]> = {
          AT_PICKUP: ["DISPATCHED", "BOOKED", "CONFIRMED", "TENDERED"],
          AT_DELIVERY: ["IN_TRANSIT", "LOADED"],
        };

        if (validTransitions[newStatus]?.includes(load.status)) {
          await prisma.load.update({
            where: { id: loadId },
            data: {
              status: newStatus as any,
              statusUpdatedAt: new Date(),
            },
          });

          // Record status change event
          await prisma.loadTrackingEvent.create({
            data: {
              loadId,
              stopId: stop.id,
              eventType: "STATUS_CHANGE",
              statusFrom: load.status as any,
              statusTo: newStatus as any,
              latitude,
              longitude,
              locationCity: stop.city,
              locationState: stop.state,
              locationSource: "GEOFENCE",
              notes: `Auto-detected arrival at ${stop.facilityName} via geofence (${distance.toFixed(2)} mi)`,
            },
          });

          events.push({
            type: "ARRIVAL",
            stopId: stop.id,
            stopType: stop.stopType,
            facility: stop.facilityName,
            distance,
            newStatus,
          });

          // Broadcast via SSE
          broadcastSSE({
            type: "geofence",
            loadId,
            data: { stopType: stop.stopType, facility: stop.facilityName, newStatus, distance: distance.toFixed(2) },
          });
        }

        // Record geofence event
        await prisma.loadTrackingEvent.create({
          data: {
            loadId,
            stopId: stop.id,
            eventType: "GEOFENCE",
            latitude,
            longitude,
            locationCity: stop.city,
            locationState: stop.state,
            locationSource: "GEOFENCE",
            notes: `Geofence entry: ${stop.facilityName} (${distance.toFixed(2)} mi radius)`,
          },
        });
      }
    } else if (stop.actualArrival && !stop.actualDeparture) {
      // Out-of-radius with prior arrival = departure event.
      //
      // One timestamp for the whole departure. The stop row, the DetentionRecord
      // and the accessorial ledger now all describe the same instant instead of
      // three separate `new Date()` calls drifting by however long the writes
      // between them took.
      const departedAt = new Date();

      await prisma.loadStop.update({
        where: { id: stop.id },
        data: { actualDeparture: departedAt },
      });

      // The line above removes this stop from the alert engine's query for good,
      // so this is the last pass that will ever price it. Settle first.
      await settleGeofenceDeparture({
        loadId,
        stopId: stop.id,
        stopType: stop.stopType,
        facilityName: stop.facilityName,
        arrivalAt: new Date(stop.actualArrival),
        departedAt,
      });

      await prisma.geofenceEvent.create({
        data: {
          loadId,
          eventType: stop.stopType === "PICKUP" ? "departed_origin" : "departed_destination",
          facilityName: stop.facilityName,
          lat: latitude,
          lng: longitude,
        },
      });

      // Close any open detention record for this stop type
      const openDetention = await prisma.detentionRecord.findFirst({
        where: {
          loadId,
          locationType: stop.stopType === "PICKUP" ? "origin" : "destination",
          departedAt: null,
        },
        orderBy: { enteredAt: "desc" },
      });
      if (openDetention) {
        const elapsedMinutes = Math.round(
          (departedAt.getTime() - new Date(openDetention.enteredAt).getTime()) / 60000
        );
        // v3.8.arn — close with the same billable/rate/charge math loadTracking uses,
        // so a detention record means the same thing whichever writer created it.
        const billable = elapsedMinutes >= DETENTION_FREE_MINUTES;
        const totalCharge = detentionCharge(
          billable ? elapsedMinutes - DETENTION_FREE_MINUTES : 0
        );
        await prisma.detentionRecord.update({
          where: { id: openDetention.id },
          data: {
            departedAt,
            elapsedMinutes,
            billable,
            ratePerHour: DETENTION_RATE_PER_HOUR,
            totalCharge,
          },
        });
      }

      broadcastSSE({
        type: "geofence",
        loadId,
        data: { stopType: stop.stopType, facility: stop.facilityName, event: "departed" },
      });
    }
  }

  return events;
}

// ─── TMW-level Geofence Architecture ───────────────────────────

export interface GeofenceZone {
  loadId: string;
  stopId: string;
  latitude: number;
  longitude: number;
  radiusMiles: number; // default 0.5
  stopType: "PICKUP" | "DELIVERY";
  triggered: boolean;
}

/**
 * Check if a GPS position is within any active geofence zone.
 */
export function checkGeofenceZone(lat: number, lng: number, zones: GeofenceZone[]): GeofenceZone | null {
  for (const zone of zones) {
    const distance = haversineDistance(lat, lng, zone.latitude, zone.longitude);
    if (distance <= zone.radiusMiles && !zone.triggered) {
      return zone;
    }
  }
  return null;
}

/**
 * Create geofence zones for a load's stops (called when load is dispatched).
 * Would geocode stop addresses to lat/lng using Google Maps.
 * For now, returns zones from stops that already have coordinates.
 * Full activation when ELD API keys are connected.
 */
export async function createGeofenceZones(loadId: string): Promise<GeofenceZone[]> {
  const stops = await prisma.loadStop.findMany({
    where: { loadId, latitude: { not: null }, longitude: { not: null } },
    orderBy: { stopNumber: "asc" },
  });

  return stops.map((stop) => ({
    loadId,
    stopId: stop.id,
    latitude: Number(stop.latitude),
    longitude: Number(stop.longitude),
    radiusMiles: GEOFENCE_RADIUS_MILES,
    stopType: stop.stopType as "PICKUP" | "DELIVERY",
    triggered: !!stop.actualArrival,
  }));
}

/**
 * Process incoming GPS update (from ELD webhook).
 * Finds active loads for the carrier, checks against geofence zones,
 * and auto-triggers status updates + check-calls + broker notifications.
 * This is the Maverick-equivalent auto-actualization pipeline.
 * Full activation when ELD API keys are connected.
 */
export async function processGpsUpdate(carrierId: string, lat: number, lng: number): Promise<void> {
  // Find active loads for this carrier
  const activeLoads = await prisma.load.findMany({
    where: {
      carrierId,
      status: { in: ["DISPATCHED", "IN_TRANSIT", "LOADED", "BOOKED", "CONFIRMED"] },
      deletedAt: null,
    },
    select: { id: true },
  });

  for (const load of activeLoads) {
    // Check against geofence zones for each load
    const zones = await createGeofenceZones(load.id);
    const triggered = checkGeofenceZone(lat, lng, zones);

    if (triggered) {
      // Delegate to existing checkGeofence which handles status updates,
      // tracking events, and SSE broadcasts
      await checkGeofence(load.id, lat, lng, "ELD");
    }
  }
}

/**
 * Scan all in-transit loads for geofence proximity.
 * Called by cron every 5 minutes.
 */
export async function scanGeofences() {
  const activeLoads = await prisma.load.findMany({
    where: {
      status: { in: ["DISPATCHED", "IN_TRANSIT", "LOADED", "BOOKED", "CONFIRMED"] },
      deletedAt: null,
    },
    include: {
      loadStops: {
        where: {
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: { stopNumber: "asc" },
      },
      trackingEvents: {
        where: {
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  let eventsDetected = 0;

  for (const load of activeLoads) {
    const lastLocation = load.trackingEvents[0];
    if (!lastLocation || !lastLocation.latitude || !lastLocation.longitude) continue;

    // Skip if location is stale (>1 hour old)
    const locationAge = Date.now() - new Date(lastLocation.createdAt).getTime();
    if (locationAge > 60 * 60 * 1000) continue;

    const events = await checkGeofence(
      load.id,
      Number(lastLocation.latitude),
      Number(lastLocation.longitude),
      String(lastLocation.locationSource || "ELD")
    );

    eventsDetected += events.length;
  }

  if (eventsDetected > 0) {
    log.info(`[Geofence] Detected ${eventsDetected} geofence events across ${activeLoads.length} loads`);
  }
}
