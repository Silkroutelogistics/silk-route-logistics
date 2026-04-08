/**
 * URL Safety — prevents SSRF (Server-Side Request Forgery) attacks.
 *
 * Use before making outbound HTTP requests to user-supplied URLs
 * (webhooks, carrier API endpoints, external integrations).
 */

import { URL } from "url";
import dns from "dns";
import { promisify } from "util";

const dnsResolve = promisify(dns.resolve4);

/** Private/reserved IP ranges that should never be targeted by outbound requests */
const PRIVATE_RANGES = [
  /^127\./,                         // Loopback
  /^10\./,                          // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,    // Class B private
  /^192\.168\./,                    // Class C private
  /^0\./,                           // Current network
  /^169\.254\./,                    // Link-local
  /^224\./,                         // Multicast
  /^255\./,                         // Broadcast
];

function isPrivateIP(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

export interface UrlCheckResult {
  safe: boolean;
  reason?: string;
  resolvedIP?: string;
}

/**
 * Validate a URL is safe for outbound requests.
 * Blocks: private IPs, localhost, non-HTTP schemes, DNS rebinding.
 */
export async function isUrlSafe(urlStr: string): Promise<UrlCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  // Only allow HTTP/HTTPS
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname;

  // Block localhost variants
  if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0") {
    return { safe: false, reason: "Localhost URLs are not allowed" };
  }

  // Check if hostname is a direct IP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      return { safe: false, reason: "Private IP addresses are not allowed" };
    }
    return { safe: true, resolvedIP: hostname };
  }

  // Resolve DNS and check the IP
  try {
    const ips = await dnsResolve(hostname);
    for (const ip of ips) {
      if (isPrivateIP(ip)) {
        return { safe: false, reason: `Hostname resolves to private IP (${ip})` };
      }
    }
    return { safe: true, resolvedIP: ips[0] };
  } catch {
    return { safe: false, reason: `Cannot resolve hostname: ${hostname}` };
  }
}
