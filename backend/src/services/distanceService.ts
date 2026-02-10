import { env } from "../config/env";

interface DistanceResult {
  distanceMiles: number | null;
  durationMinutes: number | null;
  error: string | null;
}

export async function calculateDrivingDistance(
  origin: string,
  destination: string
): Promise<DistanceResult> {
  const apiKey = env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return { distanceMiles: null, durationMinutes: null, error: "Google Maps API key not configured" };
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", origin);
    url.searchParams.set("destinations", destination);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      return { distanceMiles: null, durationMinutes: null, error: `Google Maps API returned ${response.status}` };
    }

    const data = await response.json() as { status: string; rows?: { elements?: { status: string; distance: { value: number }; duration: { value: number } }[] }[] };

    if (data.status !== "OK") {
      return { distanceMiles: null, durationMinutes: null, error: `API status: ${data.status}` };
    }

    const element = data.rows?.[0]?.elements?.[0];

    if (!element || element.status !== "OK") {
      return { distanceMiles: null, durationMinutes: null, error: `Route not found: ${element?.status || "NO_RESULT"}` };
    }

    // distance.value is in meters; convert to miles
    const distanceMiles = Math.round(element.distance.value / 1609.34);
    const durationMinutes = Math.round(element.duration.value / 60);

    return { distanceMiles, durationMinutes, error: null };
  } catch (err) {
    return { distanceMiles: null, durationMinutes: null, error: `Distance calculation failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}
