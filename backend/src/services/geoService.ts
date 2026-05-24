// v3.8.aje — Offline IP geolocation via geoip-lite.
//
// Why geoip-lite specifically: zero per-request cost, no vendor invoice,
// no network dependency (the package ships a ~50MB binary DB at install
// time). Accurate at country level (>99% per MaxMind GeoLite2 source),
// mediocre at city level. Good enough for the "registered from US,
// verified from KR" fraud signal which is the main use case at this stage.
//
// What geoip-lite does NOT give us:
//   * VPN / datacenter / known-abuser ASN reputation — that needs a paid
//     API (ipinfo.io, ipapi.co, MaxMind hosted). Documented in CLAUDE.md
//     as Sprint C deferred until BKN-onboarding produces a case that
//     justifies the vendor invoice.
//   * Real-time accuracy — the binary DB is point-in-time. Refresh by
//     bumping the package version.
//
// Failure mode: localhost / private-network IPs (127.0.0.1, 10.x, 192.168.x,
// IPv6 link-local) return null. Production behind Render's load balancer
// sees real client IP via `app.set("trust proxy", 1)` at server.ts:35,
// so this is only an issue in local dev / E2E test contexts.

import geoip from "geoip-lite";
import { log } from "../lib/logger";

export interface GeoResult {
  country: string;       // ISO 3166-1 alpha-2 (e.g. "US", "CA", "KR")
  region: string | null; // state/province code (e.g. "MI")
  city: string | null;   // best-effort city name
  timezone: string | null;
}

/**
 * Resolve a client IP to country + region + city. Returns null when:
 *   - input is empty / null / undefined
 *   - input is a private-network or loopback address
 *   - the geoip-lite database has no entry (rare for public IPs)
 *
 * Never throws. Callers should treat null as "unknown geo" and proceed
 * without geo-mismatch signals on that request.
 */
export function resolveGeo(ip: string | null | undefined): GeoResult | null {
  if (!ip) return null;

  // Normalize: req.ip can carry IPv6-mapped IPv4 like "::ffff:1.2.3.4".
  // geoip-lite handles bare IPv4 + IPv6 directly but rejects the mapped
  // form, so strip the prefix.
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  try {
    const result = geoip.lookup(normalized);
    if (!result) return null;
    return {
      country: result.country,
      region: result.region || null,
      city: result.city || null,
      timezone: result.timezone || null,
    };
  } catch (err) {
    // Defensive — geoip-lite has thrown on malformed input in the past.
    log.warn({ ip: normalized, err }, "[geoService] resolveGeo failed");
    return null;
  }
}

/**
 * Convenience: pull country-only from an IP. Returns null when geo
 * resolution fails. Use this when the caller doesn't need region/city.
 */
export function resolveCountry(ip: string | null | undefined): string | null {
  return resolveGeo(ip)?.country || null;
}

/**
 * Extract the client IP from an Express request, accounting for
 * Render's load balancer (`app.set("trust proxy", 1)` at server.ts:35).
 *
 * Prefers `req.ip` which Express derives from x-forwarded-for + trust
 * proxy setting. Falls back to raw x-forwarded-for first hop, then
 * remoteAddress. Returns empty string if all fail (caller treats as null).
 */
export function extractClientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  if (req.ip) return req.ip;
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0]?.trim() || "";
  if (Array.isArray(xff) && xff[0]) return xff[0].split(",")[0]?.trim() || "";
  return req.socket?.remoteAddress || "";
}
