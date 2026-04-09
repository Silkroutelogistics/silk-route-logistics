/**
 * Detention Tracking Service
 *
 * Computes facility dwell times from LoadStop arrival/departure timestamps.
 * Updates FacilityProfile with average wait times.
 * Flags high-detention facilities so carriers are warned before accepting loads.
 *
 * First-in-industry: no broker does this. Addresses carrier pain point #7
 * ($3.6B direct costs, $11.5B lost productivity — ATRI 2023).
 */

import { prisma } from "../config/database";
import { log } from "../lib/logger";

interface FacilityDwellStats {
  facilityKey: string; // "facilityName|address|city|state"
  facilityName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  avgDwellMinutes: number;
  maxDwellMinutes: number;
  totalStops: number;
  stopsOver2Hours: number;
  detentionRate: number; // % of stops exceeding 2hr free time
}

/**
 * Weekly cron: compute average dwell time per facility from LoadStop records.
 * Updates FacilityProfile table with rolling averages.
 */
export async function computeFacilityDwellTimes(): Promise<{
  facilitiesProcessed: number;
  highDetention: number;
  updated: number;
}> {
  // Get all LoadStops with both arrival AND departure timestamps (completed visits)
  const completedStops = await prisma.loadStop.findMany({
    where: {
      actualArrival: { not: null },
      actualDeparture: { not: null },
    },
    select: {
      facilityName: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      actualArrival: true,
      actualDeparture: true,
      stopType: true,
      dwellMinutes: true,
    },
  });

  if (completedStops.length === 0) {
    log.info("[Detention] No completed stops with arrival/departure timestamps found");
    return { facilitiesProcessed: 0, highDetention: 0, updated: 0 };
  }

  // Also pull CheckCall-based dwell: AT_PICKUP→LOADED and AT_DELIVERY→DELIVERED timestamps
  const checkCallDwell = await computeDwellFromCheckCalls();

  // Group by facility (name + city + state as key)
  const facilityMap = new Map<string, {
    name: string; address: string; city: string; state: string; zip: string;
    dwellMinutes: number[];
  }>();

  for (const stop of completedStops) {
    const key = `${(stop.facilityName || "").toLowerCase()}|${(stop.city || "").toLowerCase()}|${(stop.state || "").toLowerCase()}`;
    if (!facilityMap.has(key)) {
      facilityMap.set(key, {
        name: stop.facilityName || "",
        address: stop.address || "",
        city: stop.city || "",
        state: stop.state || "",
        zip: stop.zip || "",
        dwellMinutes: [],
      });
    }

    // Use stored dwellMinutes if available, otherwise compute from timestamps
    let dwell = stop.dwellMinutes;
    if (!dwell && stop.actualArrival && stop.actualDeparture) {
      dwell = Math.round(
        (new Date(stop.actualDeparture).getTime() - new Date(stop.actualArrival).getTime()) / 60000
      );
    }
    if (dwell && dwell > 0 && dwell < 2880) { // ignore > 48hr (likely data error)
      facilityMap.get(key)!.dwellMinutes.push(dwell);
    }
  }

  // Merge check-call-based dwell data
  for (const [key, dwellArr] of checkCallDwell) {
    if (facilityMap.has(key)) {
      facilityMap.get(key)!.dwellMinutes.push(...dwellArr);
    }
  }

  // Compute stats and upsert FacilityProfile
  let updated = 0;
  let highDetention = 0;
  const FREE_TIME_MINUTES = 120; // 2 hours industry standard

  for (const [, facility] of facilityMap) {
    if (facility.dwellMinutes.length < 2) continue; // need at least 2 data points

    const sorted = [...facility.dwellMinutes].sort((a, b) => a - b);
    const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
    const max = sorted[sorted.length - 1];
    const over2hr = sorted.filter((d) => d > FREE_TIME_MINUTES).length;
    const detentionRate = Math.round((over2hr / sorted.length) * 100);

    if (detentionRate > 50) highDetention++;

    // Upsert FacilityProfile
    await prisma.facilityProfile.upsert({
      where: {
        address_city_state: {
          address: facility.address,
          city: facility.city,
          state: facility.state,
        },
      },
      create: {
        facilityName: facility.name,
        address: facility.address,
        city: facility.city,
        state: facility.state,
        zip: facility.zip,
        avgWaitTime: avg,
        totalRatings: facility.dwellMinutes.length,
        lastRatedAt: new Date(),
      },
      update: {
        avgWaitTime: avg,
        totalRatings: facility.dwellMinutes.length,
        lastRatedAt: new Date(),
        ...(facility.name && { facilityName: facility.name }),
      },
    });

    updated++;
  }

  log.info(`[Detention] Processed ${facilityMap.size} facilities, ${highDetention} high-detention (>50% over 2hr), ${updated} profiles updated`);

  // Create SystemLog for audit trail
  await prisma.systemLog.create({
    data: {
      logType: "INTEGRATION",
      severity: highDetention > 0 ? "WARNING" : "INFO",
      source: "DetentionTracker",
      message: `Weekly detention scan: ${facilityMap.size} facilities, ${highDetention} high-detention, ${updated} updated`,
      details: { facilitiesProcessed: facilityMap.size, highDetention, updated },
    },
  });

  return { facilitiesProcessed: facilityMap.size, highDetention, updated };
}

/**
 * Compute dwell time from CheckCall status pairs:
 * AT_PICKUP createdAt → LOADED createdAt = pickup dwell
 * AT_DELIVERY createdAt → DELIVERED createdAt = delivery dwell
 */
async function computeDwellFromCheckCalls(): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();

  // Get all loads with check-calls that have status transitions
  const loads = await prisma.load.findMany({
    where: {
      status: { in: ["DELIVERED", "COMPLETED", "INVOICED"] },
    },
    select: {
      id: true,
      originCity: true,
      originState: true,
      shipperFacility: true,
      originAddress: true,
      destCity: true,
      destState: true,
      consigneeFacility: true,
      destAddress: true,
      checkCalls: {
        where: {
          status: { in: ["AT_PICKUP", "LOADED", "AT_DELIVERY", "DELIVERED"] },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: { status: true, createdAt: true },
      },
    },
    take: 500, // process in batches
  });

  for (const load of loads) {
    const calls = load.checkCalls;

    // Pickup dwell: AT_PICKUP → LOADED
    const atPickup = calls.find((c) => c.status === "AT_PICKUP");
    const loaded = calls.find((c) => c.status === "LOADED");
    if (atPickup && loaded) {
      const dwell = Math.round(
        (new Date(loaded.createdAt).getTime() - new Date(atPickup.createdAt).getTime()) / 60000
      );
      if (dwell > 0 && dwell < 2880) {
        const key = `${(load.shipperFacility || "").toLowerCase()}|${(load.originCity || "").toLowerCase()}|${(load.originState || "").toLowerCase()}`;
        if (!result.has(key)) result.set(key, []);
        result.get(key)!.push(dwell);
      }
    }

    // Delivery dwell: AT_DELIVERY → DELIVERED
    const atDelivery = calls.find((c) => c.status === "AT_DELIVERY");
    const delivered = calls.find((c) => c.status === "DELIVERED");
    if (atDelivery && delivered) {
      const dwell = Math.round(
        (new Date(delivered.createdAt).getTime() - new Date(atDelivery.createdAt).getTime()) / 60000
      );
      if (dwell > 0 && dwell < 2880) {
        const key = `${(load.consigneeFacility || "").toLowerCase()}|${(load.destCity || "").toLowerCase()}|${(load.destState || "").toLowerCase()}`;
        if (!result.has(key)) result.set(key, []);
        result.get(key)!.push(dwell);
      }
    }
  }

  return result;
}

/**
 * Get detention warning for a specific facility.
 * Returns null if facility is fine, or a warning object if high-detention.
 */
export async function getFacilityDetentionWarning(
  facilityName: string,
  city: string,
  state: string,
): Promise<{ avgWaitMinutes: number; detentionRisk: "LOW" | "MEDIUM" | "HIGH"; warning: string } | null> {
  const profile = await prisma.facilityProfile.findFirst({
    where: {
      city: { equals: city, mode: "insensitive" },
      state: { equals: state, mode: "insensitive" },
    },
  });

  if (!profile || profile.totalRatings < 3) return null; // not enough data

  const avg = profile.avgWaitTime;
  if (avg <= 120) return null; // under 2 hours = fine

  const risk = avg > 240 ? "HIGH" : avg > 180 ? "MEDIUM" : "LOW";
  const hrs = (avg / 60).toFixed(1);
  const warning = risk === "HIGH"
    ? `High detention risk: ${facilityName} averages ${hrs} hours wait time (${profile.totalRatings} visits). Consider requesting appointment or adding detention pay.`
    : `Moderate detention: ${facilityName} averages ${hrs} hours (${profile.totalRatings} visits).`;

  return { avgWaitMinutes: avg, detentionRisk: risk, warning };
}
