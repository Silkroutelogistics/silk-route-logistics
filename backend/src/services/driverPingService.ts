import { prisma } from "../config/database";
import { log } from "../lib/logger";

/**
 * Recording a driver's consented position ping.
 *
 * THE GAP THIS CLOSES. `processGpsUpdate` walks the carrier's active loads and
 * calls `checkGeofence` **only when the position falls inside a stop's radius**.
 * A ping from the middle of a lane — which is where a driver is when we ask —
 * matched no zone and wrote nothing at all: no `LoadTrackingEvent`, no location
 * on the Track & Trace board, nothing for the Compass tracking factor to count.
 * The tap worked and produced silence. So the Arc 19 brief's "ping lands via
 * processGpsUpdate → T&T shows it" was true only for a driver already parked at
 * a dock, and the recording half had to be built. (§13.3 Item 225.)
 *
 * SOURCE LABELLING. `processGpsUpdate` passes the literal `"ELD"` to
 * `checkGeofence`, so a browser tap was recorded as telematics. That matters
 * beyond tidiness: Compass's tracking factor is telematics-activated, and a
 * carrier who has never connected an ELD should not accumulate ELD-sourced
 * events. A driver tap is recorded as `CARRIER_PORTAL` — the driver is acting
 * for the carrier, through a browser, at our request. It is the closest true
 * value in the existing enum, and it avoids a migration to add a sixth. Noted in
 * §13.3 as a candidate if the distinction ever needs to be reported on.
 */

/** Loads a ping may write to: assigned, moving, not yet finished. */
const PINGABLE_STATUSES = [
  "BOOKED", "CONFIRMED", "DISPATCHED", "AT_PICKUP",
  "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY",
] as const;

export interface PingResult {
  ok: boolean;
  reason?: string;
  geofenceHit?: boolean;
}

/**
 * Record one consented ping against one load.
 *
 * Always writes the position — that is the point, and the fix. Then hands the
 * same coordinates to the existing geofence machinery, so arriving at a stop
 * still triggers the status change it always did. The two are independent: the
 * position is the record, the geofence is the interpretation.
 */
export async function recordDriverPing(opts: {
  loadId: string;
  phone: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
}): Promise<PingResult> {
  const { loadId, phone, latitude, longitude } = opts;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, reason: "invalid coordinates" };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, reason: "coordinates out of range" };
  }

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, status: true, carrierId: true, driverPhoneVerified: true, referenceNumber: true },
  });
  if (!load) return { ok: false, reason: "load not found" };

  if (!PINGABLE_STATUSES.includes(load.status as any)) {
    // A link found in an old thread must not write to a delivered load.
    return { ok: false, reason: "this load is no longer in transit" };
  }

  // The token carries the number it was issued to. If the carrier has since
  // swapped drivers, the old driver's link stops writing — which is the whole
  // reason the token is phone-scoped rather than load-scoped alone.
  if (load.driverPhoneVerified && load.driverPhoneVerified !== phone) {
    return { ok: false, reason: "the driver on this load has changed" };
  }

  await prisma.loadTrackingEvent.create({
    data: {
      loadId,
      eventType: "LOCATION_UPDATE",
      latitude,
      longitude,
      // CARRIER_PORTAL, not ELD — see the header. A browser tap is not telematics.
      locationSource: "CARRIER_PORTAL",
      notes: `Driver position shared from the check-call link${
        opts.accuracyMeters ? ` (±${Math.round(opts.accuracyMeters)}m)` : ""
      }`,
    },
  });

  // Interpretation, separately and non-fatally: a geofence failure must not
  // discard a position we already recorded.
  let geofenceHit = false;
  try {
    const { createGeofenceZones, checkGeofenceZone, checkGeofence } = await import("./geofenceService");
    const zones = await createGeofenceZones(loadId);
    if (checkGeofenceZone(latitude, longitude, zones)) {
      geofenceHit = true;
      await checkGeofence(loadId, latitude, longitude, "CARRIER_PORTAL");
    }
  } catch (err) {
    log.error({ err, loadId }, "[DriverPing] geofence evaluation failed; position was still recorded");
  }

  log.info({ loadId, geofenceHit }, "[DriverPing] consented position recorded");
  return { ok: true, geofenceHit };
}
