/**
 * Geofence Detection Service — Track & Trace Phase 3
 * Checks GPS/ELD pings against stop lat/long coordinates.
 * Auto-triggers AT_PICKUP / AT_DELIVERY status when within radius.
 */
import { prisma } from "../config/database";
import { broadcastSSE } from "../routes/trackTraceSSE";

const GEOFENCE_RADIUS_MILES = 1.0;

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
      const isDeparture = stop.actualArrival && !stop.actualDeparture;

      if (isArrival) {
        // Auto-set arrival
        await prisma.loadStop.update({
          where: { id: stop.id },
          data: { actualArrival: new Date() },
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
    }
  }

  return events;
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
    console.log(`[Geofence] Detected ${eventsDetected} geofence events across ${activeLoads.length} loads`);
  }
}
