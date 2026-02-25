/**
 * Motive (KeepTruckin) ELD Integration — Phase 5
 * Connects to Motive Fleet Management API for GPS, HOS, and vehicle data.
 * API Docs: https://developer.gomotive.com/reference
 * Auth: API key (X-Api-Key header)
 */
import { prisma } from "../config/database";
import { env } from "../config/env";
import { checkGeofence } from "./geofenceService";
import { broadcastSSE } from "../routes/trackTraceSSE";

const MOTIVE_BASE = "https://api.gomotive.com/v1";
const PROVIDER = "MOTIVE";

function getHeaders(): Record<string, string> {
  return {
    "X-Api-Key": env.MOTIVE_API_KEY || "",
    "Content-Type": "application/json",
  };
}

function isConfigured(): boolean {
  return !!env.MOTIVE_API_KEY;
}

interface MotiveVehicle {
  vehicle: {
    id: number;
    number: string;
    make?: string;
    model?: string;
    current_location?: {
      lat: number;
      lon: number;
      bearing: number;
      speed: number;
      located_at: string;
      description: string;
    };
    current_driver?: {
      id: number;
      first_name: string;
      last_name: string;
      phone?: string;
    };
    eld_device?: { id: number; model: string };
  };
}

interface MotiveDriverLog {
  log: {
    driver_id: number;
    driver_name: string;
    date: string;
    total_driving_duration: number;
    total_on_duty_duration: number;
    total_sleeper_duration: number;
    total_off_duty_duration: number;
    violations: Array<{ type: string; start_time: string }>;
  };
}

/**
 * Fetch all vehicle locations from Motive.
 */
export async function fetchMotiveVehicleLocations(): Promise<MotiveVehicle[]> {
  if (!isConfigured()) return [];

  try {
    const res = await fetch(`${MOTIVE_BASE}/vehicles?per_page=100`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      console.error(`[Motive] Vehicle locations error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data: any = await res.json();
    return data.vehicles || [];
  } catch (err: any) {
    console.error(`[Motive] Vehicle locations fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Fetch driver HOS logs from Motive.
 */
export async function fetchMotiveDriverLogs(): Promise<MotiveDriverLog[]> {
  if (!isConfigured()) return [];

  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(`${MOTIVE_BASE}/driver_daily_logs?date=${today}&per_page=100`, {
      headers: getHeaders(),
    });

    if (!res.ok) return [];
    const data: any = await res.json();
    return data.driver_daily_logs || [];
  } catch {
    return [];
  }
}

/**
 * Process Motive vehicle locations: match to active loads, store as ELDEvent,
 * create LoadTrackingEvent, trigger geofence checks.
 */
export async function processMotiveLocations() {
  if (!isConfigured()) {
    console.log("[Motive] Not configured — skipping sync");
    return { processed: 0, matched: 0 };
  }

  const vehicles = await fetchMotiveVehicleLocations();
  if (vehicles.length === 0) return { processed: 0, matched: 0 };

  let processed = 0;
  let matched = 0;

  for (const entry of vehicles) {
    const v = entry.vehicle;
    if (!v.current_location) continue;

    const loc = v.current_location;
    const speedMph = loc.speed || 0;

    // Parse city/state from description
    const descMatch = loc.description?.match(/([^,]+),\s*([A-Z]{2})/);
    const city = descMatch?.[1]?.trim() || null;
    const state = descMatch?.[2]?.trim() || null;

    // Store raw ELD event
    const eldEvent = await prisma.eLDEvent.create({
      data: {
        provider: PROVIDER,
        externalId: String(v.id),
        eventType: "GPS_PING",
        vehicleId: String(v.id),
        vehicleName: v.number,
        driverId: v.current_driver ? String(v.current_driver.id) : null,
        driverName: v.current_driver ? `${v.current_driver.first_name} ${v.current_driver.last_name}` : null,
        latitude: loc.lat,
        longitude: loc.lon,
        speedMph,
        heading: loc.bearing,
        city,
        state,
        address: loc.description,
      },
    });
    processed++;

    // Update device mapping
    await prisma.eLDDeviceMapping.upsert({
      where: { provider_externalVehicleId: { provider: PROVIDER, externalVehicleId: String(v.id) } },
      update: {
        vehicleName: v.number,
        driverName: v.current_driver ? `${v.current_driver.first_name} ${v.current_driver.last_name}` : null,
        driverPhone: v.current_driver?.phone || null,
        lastSeenAt: new Date(),
        lastLatitude: loc.lat,
        lastLongitude: loc.lon,
      },
      create: {
        provider: PROVIDER,
        externalVehicleId: String(v.id),
        vehicleName: v.number,
        driverName: v.current_driver ? `${v.current_driver.first_name} ${v.current_driver.last_name}` : null,
        driverPhone: v.current_driver?.phone || null,
        lastSeenAt: new Date(),
        lastLatitude: loc.lat,
        lastLongitude: loc.lon,
      },
    });

    // Match to active load
    const mapping = await prisma.eLDDeviceMapping.findUnique({
      where: { provider_externalVehicleId: { provider: PROVIDER, externalVehicleId: String(v.id) } },
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
        await prisma.eLDEvent.update({
          where: { id: eldEvent.id },
          data: { loadId: load.id, processedAt: new Date() },
        });

        await prisma.loadTrackingEvent.create({
          data: {
            loadId: load.id,
            eventType: "LOCATION_UPDATE",
            latitude: loc.lat,
            longitude: loc.lon,
            locationCity: city,
            locationState: state,
            locationSource: "ELD",
            notes: `Motive: ${v.number}${v.current_driver ? ` (${v.current_driver.first_name})` : ""} at ${speedMph.toFixed(0)} mph`,
          },
        });

        // Run geofence check
        try {
          const events = await checkGeofence(load.id, loc.lat, loc.lon, "ELD");
          if (events.length > 0) {
            broadcastSSE({
              type: "geofence",
              loadId: load.id,
              data: { source: "MOTIVE", events },
            });
          }
        } catch { /* non-blocking */ }

        broadcastSSE({
          type: "location_update",
          loadId: load.id,
          data: {
            latitude: loc.lat,
            longitude: loc.lon,
            city,
            state,
            speedMph: speedMph.toFixed(0),
            source: "MOTIVE",
          },
        });

        matched++;
      }
    }
  }

  if (processed > 0) {
    console.log(`[Motive] Synced ${processed} locations, ${matched} matched to loads`);
  }

  return { processed, matched };
}

/**
 * Process a Motive webhook event.
 */
export async function processMotiveWebhook(eventType: string, payload: any) {
  if (eventType === "vehicle_location_update" || eventType === "location") {
    const vehicle = payload.vehicle || payload;
    const loc = vehicle.current_location || payload.location;
    if (!loc) return;

    await prisma.eLDEvent.create({
      data: {
        provider: PROVIDER,
        externalId: String(vehicle.id),
        eventType: "GPS_PING",
        vehicleId: String(vehicle.id),
        vehicleName: vehicle.number || vehicle.name,
        latitude: loc.lat || loc.latitude,
        longitude: loc.lon || loc.longitude,
        speedMph: loc.speed,
        heading: loc.bearing || loc.heading,
        payload: payload,
      },
    });
  } else if (eventType === "hos_violation") {
    await prisma.eLDEvent.create({
      data: {
        provider: PROVIDER,
        eventType: "HOS_VIOLATION",
        driverId: String(payload.driver_id || ""),
        driverName: payload.driver_name,
        payload: payload,
      },
    });
  }
}
