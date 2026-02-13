import { prisma } from "../config/database";
import { env } from "../config/env";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────

export interface MileageOptions {
  equipment?: string;
  hazmat?: boolean;
  stops?: string[];
}

export interface MileageResult {
  practical_miles: number;
  shortest_miles: number | null;
  drive_time_hours: number;
  toll_cost: number | null;
  source: string;
  route_type: string;
  cached: boolean;
}

type ProviderName = "google" | "milemaker" | "pcmiler";

// ─── Helpers ─────────────────────────────────────────────

function normalizeLocation(loc: string): string {
  return loc.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashLocation(loc: string): string {
  return crypto.createHash("md5").update(normalizeLocation(loc)).digest("hex");
}

const CACHE_DAYS = 30;

// ─── Cache Layer ─────────────────────────────────────────

async function getCached(originHash: string, destHash: string, provider: string): Promise<MileageResult | null> {
  try {
    const cached = await prisma.mileageCache.findUnique({
      where: { originHash_destinationHash_provider: { originHash, destinationHash: destHash, provider } },
    });
    if (cached && cached.expiresAt > new Date()) {
      return {
        practical_miles: cached.practicalMiles,
        shortest_miles: cached.shortestMiles,
        drive_time_hours: cached.driveTimeHours,
        toll_cost: cached.tollCost,
        source: provider === "google" ? "google_estimated" : provider,
        route_type: cached.routeType,
        cached: true,
      };
    }
    // Expired — delete stale entry
    if (cached) {
      await prisma.mileageCache.delete({ where: { id: cached.id } }).catch(err => console.error('[Mileage] Cache error:', err.message));
    }
  } catch {
    // Cache miss or DB error — proceed to API
  }
  return null;
}

async function setCache(origin: string, destination: string, provider: string, result: MileageResult): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_DAYS);

    await prisma.mileageCache.upsert({
      where: {
        originHash_destinationHash_provider: {
          originHash: hashLocation(origin),
          destinationHash: hashLocation(destination),
          provider,
        },
      },
      create: {
        originHash: hashLocation(origin),
        destinationHash: hashLocation(destination),
        originText: origin,
        destinationText: destination,
        provider,
        practicalMiles: result.practical_miles,
        shortestMiles: result.shortest_miles,
        driveTimeHours: result.drive_time_hours,
        tollCost: result.toll_cost,
        routeType: result.route_type,
        expiresAt,
      },
      update: {
        practicalMiles: result.practical_miles,
        shortestMiles: result.shortest_miles,
        driveTimeHours: result.drive_time_hours,
        tollCost: result.toll_cost,
        routeType: result.route_type,
        cachedAt: new Date(),
        expiresAt,
      },
    });
  } catch (err) {
    console.error("[MileageCache] Failed to write cache:", err instanceof Error ? err.message : err);
  }
}

// ─── Google Provider ─────────────────────────────────────

async function googleCalculate(origin: string, destination: string): Promise<MileageResult> {
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Google Maps API returned ${response.status}`);
  }

  const data = await response.json() as {
    status: string;
    routes?: { legs?: { distance: { value: number }; duration: { value: number } }[] }[];
  };

  if (data.status !== "OK" || !data.routes?.[0]?.legs?.[0]) {
    throw new Error(`Google Maps: ${data.status}`);
  }

  const leg = data.routes[0].legs[0];
  const miles = Math.round(leg.distance.value / 1609.34);
  const hours = Math.round((leg.duration.value / 3600) * 10) / 10;

  return {
    practical_miles: miles,
    shortest_miles: null,
    drive_time_hours: hours,
    toll_cost: null,
    source: "google_estimated",
    route_type: "estimated",
    cached: false,
  };
}

// ─── MileMaker Provider (scaffold) ──────────────────────

async function milemakerCalculate(origin: string, destination: string, options?: MileageOptions): Promise<MileageResult> {
  const clientId = env.MILEMAKER_CLIENT_ID;
  const clientSecret = env.MILEMAKER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[Mileage] MileMaker credentials not configured — falling back to Google");
    return googleCalculate(origin, destination);
  }

  // Step 1: OAuth token
  const tokenRes = await fetch("https://api.milemaker.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenRes.ok) {
    throw new Error(`MileMaker OAuth failed: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json() as { access_token: string };

  // Step 2: Practical route
  const routeRes = await fetch("https://api.milemaker.com/v2/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      origin,
      destination,
      stops: options?.stops || [],
      vehicle_type: "truck",
      route_type: "practical",
      hazmat: options?.hazmat || false,
      equipment_type: options?.equipment || "dry_van",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!routeRes.ok) {
    throw new Error(`MileMaker route API failed: ${routeRes.status}`);
  }

  const routeData = await routeRes.json() as {
    practical_miles: number;
    shortest_miles?: number;
    drive_time_hours: number;
    toll_cost?: number;
  };

  return {
    practical_miles: Math.round(routeData.practical_miles),
    shortest_miles: routeData.shortest_miles ? Math.round(routeData.shortest_miles) : null,
    drive_time_hours: Math.round(routeData.drive_time_hours * 10) / 10,
    toll_cost: routeData.toll_cost ?? null,
    source: "milemaker",
    route_type: "practical",
    cached: false,
  };
}

// ─── PC*Miler Provider (scaffold) ───────────────────────

async function pcmilerCalculate(origin: string, destination: string, options?: MileageOptions): Promise<MileageResult> {
  const apiKey = env.PCMILER_API_KEY;

  if (!apiKey) {
    console.warn("[Mileage] PC*Miler API key not configured — falling back to Google");
    return googleCalculate(origin, destination);
  }

  const stops = [origin, ...(options?.stops || []), destination].join(";");

  const url = new URL("https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/route/routeReports");
  url.searchParams.set("stops", stops);
  url.searchParams.set("reports", "Mileage");
  url.searchParams.set("routeType", "Practical");
  url.searchParams.set("vehicleType", "Truck");
  url.searchParams.set("hazMatType", options?.hazmat ? "General" : "None");
  url.searchParams.set("dataVersion", "current");

  const response = await fetch(url.toString(), {
    headers: { "Authorization": apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`PC*Miler API returned ${response.status}`);
  }

  const data = await response.json() as Array<{
    ReportLines?: Array<{
      TMiles?: number;
      SMiles?: number;
      THours?: number;
      TollCost?: number;
    }>;
  }>;

  const report = data?.[0]?.ReportLines;
  if (!report || report.length === 0) {
    throw new Error("PC*Miler returned empty report");
  }

  // Sum all legs
  let totalMiles = 0;
  let shortestMiles = 0;
  let totalHours = 0;
  let totalTolls = 0;
  for (const line of report) {
    totalMiles += line.TMiles || 0;
    shortestMiles += line.SMiles || 0;
    totalHours += line.THours || 0;
    totalTolls += line.TollCost || 0;
  }

  return {
    practical_miles: Math.round(totalMiles),
    shortest_miles: shortestMiles > 0 ? Math.round(shortestMiles) : null,
    drive_time_hours: Math.round(totalHours * 10) / 10,
    toll_cost: totalTolls > 0 ? Math.round(totalTolls * 100) / 100 : null,
    source: "pcmiler",
    route_type: "practical",
    cached: false,
  };
}

// ─── Provider Map & Fallback Chain ───────────────────────

const providers: Record<ProviderName, (origin: string, dest: string, opts?: MileageOptions) => Promise<MileageResult>> = {
  google: googleCalculate,
  milemaker: milemakerCalculate,
  pcmiler: pcmilerCalculate,
};

const fallbackOrder: ProviderName[] = ["pcmiler", "milemaker", "google"];

// ─── Public API ──────────────────────────────────────────

export async function calculateMileage(
  origin: string,
  destination: string,
  options?: MileageOptions
): Promise<MileageResult> {
  const providerName = env.MILEAGE_PROVIDER;
  const originHash = hashLocation(origin);
  const destHash = hashLocation(destination);

  // Check cache first
  const cached = await getCached(originHash, destHash, providerName);
  if (cached) return cached;

  // Try configured provider
  try {
    const result = await providers[providerName](origin, destination, options);
    await setCache(origin, destination, providerName, result);
    return result;
  } catch (primaryErr) {
    console.error(`[Mileage] ${providerName} failed: ${primaryErr instanceof Error ? primaryErr.message : primaryErr}`);

    // Fallback chain
    for (const fallback of fallbackOrder) {
      if (fallback === providerName) continue;
      try {
        console.warn(`[Mileage] Falling back to ${fallback}`);
        const result = await providers[fallback](origin, destination, options);
        await setCache(origin, destination, fallback, result);
        return result;
      } catch (fbErr) {
        console.error(`[Mileage] ${fallback} also failed: ${fbErr instanceof Error ? fbErr.message : fbErr}`);
      }
    }

    throw new Error("All mileage providers failed");
  }
}

export function getProviderStatus(): { provider: ProviderName; configured: boolean; fallbacks: string[] } {
  const p = env.MILEAGE_PROVIDER;
  const configured =
    p === "google" ? !!env.GOOGLE_MAPS_API_KEY :
    p === "milemaker" ? !!(env.MILEMAKER_CLIENT_ID && env.MILEMAKER_CLIENT_SECRET) :
    p === "pcmiler" ? !!env.PCMILER_API_KEY :
    false;

  return {
    provider: p,
    configured,
    fallbacks: fallbackOrder.filter((f) => f !== p),
  };
}

export async function calculateBatch(
  pairs: { origin: string; destination: string; options?: MileageOptions }[]
): Promise<MileageResult[]> {
  // Process in parallel with concurrency limit of 5
  const results: MileageResult[] = [];
  const batchSize = 5;

  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((p) =>
        calculateMileage(p.origin, p.destination, p.options).catch((err): MileageResult => ({
          practical_miles: 0,
          shortest_miles: null,
          drive_time_hours: 0,
          toll_cost: null,
          source: "error",
          route_type: "error",
          cached: false,
        }))
      )
    );
    results.push(...batchResults);
  }

  return results;
}
