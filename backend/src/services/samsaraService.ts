/**
 * Samsara ELD Integration — Phase 5
 * Connects to Samsara Fleet Management API to pull real-time GPS, HOS, and vehicle data.
 * API Docs: https://developers.samsara.com/reference
 * Auth: Bearer token (API token from Samsara dashboard)
 */
import { prisma } from "../config/database";
import { env } from "../config/env";
import { checkGeofence } from "./geofenceService";
import { broadcastSSE } from "../routes/trackTraceSSE";
import { log } from "../lib/logger";

const SAMSARA_BASE = "https://api.samsara.com";
const PROVIDER = "SAMSARA";

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.SAMSARA_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function isConfigured(): boolean {
  return !!env.SAMSARA_API_TOKEN;
}

interface SamsaraLocation {
  id: string;
  name: string;
  location?: {
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    time: string;
    reverseGeo?: { formattedLocation: string };
  };
  odometerMeters?: number;
  fuelPercent?: { value: number };
  engineState?: { value: string };
}

interface SamsaraHOS {
  driver: { id: string; name: string };
  currentDutyStatus: { dutyStatus: string };
  currentViolations?: Array<{ type: string }>;
  clocks: {
    drive?: { timeUntilBreakMs: number };
    shift?: { timeUntilBreakMs: number };
    cycle?: { timeUntilBreakMs: number };
  };
}

/**
 * Fetch all vehicle locations from Samsara.
 */
export async function fetchSamsaraVehicleLocations(): Promise<SamsaraLocation[]> {
  if (!isConfigured()) return [];

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(`${SAMSARA_BASE}/fleet/vehicles/locations`, {
      headers: getHeaders(),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      log.error(`[Samsara] Vehicle locations error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data: any = await res.json();
    return data.data || [];
  } catch (err: any) {
    log.error(`[Samsara] Vehicle locations fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Fetch HOS data for all drivers.
 */
export async function fetchSamsaraHOS(): Promise<SamsaraHOS[]> {
  if (!isConfigured()) return [];

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(`${SAMSARA_BASE}/fleet/drivers/hos/current`, {
      headers: getHeaders(),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      log.error(`[Samsara] HOS error: ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    return data.data || [];
  } catch (err: any) {
    log.error(`[Samsara] HOS fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Fetch vehicle stats (fuel, odometer, engine hours).
 */
export async function fetchSamsaraVehicleStats() {
  if (!isConfigured()) return [];

  try {
    const types = "engineStates,fuelPercents,obdOdometerMeters";
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(`${SAMSARA_BASE}/fleet/vehicles/stats?types=${types}`, {
      headers: getHeaders(),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) return [];
    const data: any = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Process Samsara vehicle locations: match to active loads, store as ELDEvent,
 * create LoadTrackingEvent, trigger geofence checks.
 */
export async function processSamsaraLocations() {
  if (!isConfigured()) {
    log.info("[Samsara] Not configured — skipping sync");
    return { processed: 0, matched: 0 };
  }

  const locations = await fetchSamsaraVehicleLocations();
  if (locations.length === 0) return { processed: 0, matched: 0 };

  let processed = 0;
  let matched = 0;

  for (const vehicle of locations) {
    if (!vehicle.location) continue;

    const loc = vehicle.location;
    const speedMph = (loc.speed || 0) * 0.621371; // km/h to mph
    const odometerMiles = vehicle.odometerMeters ? vehicle.odometerMeters * 0.000621371 : undefined;

    // Parse city/state from reverse geocode
    const geoStr = loc.reverseGeo?.formattedLocation || "";
    const geoMatch = geoStr.match(/([^,]+),\s*([A-Z]{2})/);
    const city = geoMatch?.[1]?.trim() || null;
    const state = geoMatch?.[2]?.trim() || null;

    // Store raw ELD event
    const eldEvent = await prisma.eLDEvent.create({
      data: {
        provider: PROVIDER,
        externalId: vehicle.id,
        eventType: "GPS_PING",
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        speedMph,
        heading: loc.heading,
        odometerMiles,
        fuelPct: vehicle.fuelPercent?.value,
        address: geoStr || null,
        city,
        state,
      },
    });
    processed++;

    // Update device mapping
    await prisma.eLDDeviceMapping.upsert({
      where: { provider_externalVehicleId: { provider: PROVIDER, externalVehicleId: vehicle.id } },
      update: {
        vehicleName: vehicle.name,
        lastSeenAt: new Date(),
        lastLatitude: loc.latitude,
        lastLongitude: loc.longitude,
      },
      create: {
        provider: PROVIDER,
        externalVehicleId: vehicle.id,
        vehicleName: vehicle.name,
        lastSeenAt: new Date(),
        lastLatitude: loc.latitude,
        lastLongitude: loc.longitude,
      },
    });

    // Match to active load via device mapping → carrier → load
    const mapping = await prisma.eLDDeviceMapping.findUnique({
      where: { provider_externalVehicleId: { provider: PROVIDER, externalVehicleId: vehicle.id } },
    });

    if (mapping?.carrierId) {
      const activeLoads = await prisma.load.findMany({
        where: {
          carrierId: mapping.carrierId,
          status: { in: ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] },
          deletedAt: null,
        },
        select: { id: true },
      });

      for (const load of activeLoads) {
        // Link ELD event to load
        await prisma.eLDEvent.update({
          where: { id: eldEvent.id },
          data: { loadId: load.id, processedAt: new Date() },
        });

        // Create tracking event
        await prisma.loadTrackingEvent.create({
          data: {
            loadId: load.id,
            eventType: "LOCATION_UPDATE",
            latitude: loc.latitude,
            longitude: loc.longitude,
            locationCity: city,
            locationState: state,
            locationSource: "ELD",
            notes: `Samsara: ${vehicle.name} at ${speedMph.toFixed(0)} mph`,
          },
        });

        // Run geofence check
        try {
          const events = await checkGeofence(load.id, loc.latitude, loc.longitude, "ELD");
          if (events.length > 0) {
            broadcastSSE({
              type: "geofence",
              loadId: load.id,
              data: { source: "SAMSARA", events },
            });
          }
        } catch { /* non-blocking */ }

        // Broadcast location update via SSE
        broadcastSSE({
          type: "location_update",
          loadId: load.id,
          data: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city,
            state,
            speedMph: speedMph.toFixed(0),
            source: "SAMSARA",
          },
        });

        matched++;
      }
    }
  }

  if (processed > 0) {
    log.info(`[Samsara] Synced ${processed} locations, ${matched} matched to loads`);
  }

  return { processed, matched };
}

/**
 * Process a Samsara webhook event (real-time push).
 */
export async function processSamsaraWebhook(eventType: string, payload: any) {
  if (eventType === "VehicleLocation") {
    const vehicle = payload.vehicle;
    const loc = payload.location;
    if (!vehicle || !loc) return;

    await prisma.eLDEvent.create({
      data: {
        provider: PROVIDER,
        externalId: vehicle.id,
        eventType: "GPS_PING",
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        speedMph: loc.speed ? loc.speed * 0.621371 : null,
        heading: loc.heading,
        payload: payload,
      },
    });
  } else if (eventType === "DriverHosViolation") {
    await prisma.eLDEvent.create({
      data: {
        provider: PROVIDER,
        eventType: "HOS_VIOLATION",
        driverId: payload.driver?.id,
        driverName: payload.driver?.name,
        payload: payload,
      },
    });
  }
}
