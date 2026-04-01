/**
 * Frontend Environment Validation
 * Validates all NEXT_PUBLIC_ env vars at import time.
 * Provides typed access with sensible defaults.
 */

interface ClientEnv {
  /** Backend API URL */
  API_URL: string;
  /** Application display name */
  APP_NAME: string;
  /** Google Maps API key (optional) */
  GOOGLE_MAPS_API_KEY: string;
  /** Sentry DSN for error tracking (optional) */
  SENTRY_DSN: string;
  /** Maintenance mode flag */
  MAINTENANCE_MODE: boolean;
  /** Current environment */
  NODE_ENV: string;
}

function validateEnv(): ClientEnv {
  const env: ClientEnv = {
    API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
    APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Silk Route Logistics",
    GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
    MAINTENANCE_MODE: process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true",
    NODE_ENV: process.env.NODE_ENV || "development",
  };

  // Warn if critical env vars are missing in production builds
  if (typeof window !== "undefined" && env.NODE_ENV === "production") {
    if (env.API_URL.includes("localhost")) {
      console.warn("[ENV] NEXT_PUBLIC_API_URL is using localhost in production");
    }
  }

  return env;
}

export const clientEnv = validateEnv();

export const APP_VERSION = "2.1";
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
