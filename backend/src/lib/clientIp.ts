/**
 * WHO IS ACTUALLY CALLING? The one place that answers it.
 *
 * WHY THIS EXISTS. `app.set("trust proxy", 1)` (server.ts) trusts exactly one
 * hop, which is right: Render's load balancer is the only proxy the app can
 * vouch for. But production sits behind TWO — client → Cloudflare → Render → app
 * (`Server: cloudflare` + `CF-RAY` + `x-render-origin-server: Render`). So
 * Express skips the one hop it trusts and lands on the address Cloudflare
 * connected from, not the client's.
 *
 * That is not theoretical. Every signing IP on production was an edge address:
 *
 *     bcaAgreedFromIp = 172.71.254.101   (Cloudflare 172.64.0.0/13)
 *     bcaAgreedFromIp = 104.22.64.131    (Cloudflare 104.16.0.0/13)
 *     bcaAgreedFromIp = 172.69.17.162    (Cloudflare 172.64.0.0/13)
 *
 * Those are the attribution IPs printed on executed Broker-Carrier Agreements.
 *
 * WHY NOT JUST RAISE THE HOP COUNT. `trust proxy: 2` would take the second entry
 * of X-Forwarded-For from the right — but the app cannot verify that Cloudflare
 * is really the second hop. Anything that reaches Render directly, bypassing
 * Cloudflare, would have its own forged XFF entry trusted. Raising the count
 * trades a wrong IP for a spoofable one.
 *
 * WHAT THIS DOES INSTEAD. Trust `cf-connecting-ip` ONLY when the connection
 * demonstrably came from Cloudflare — that is, when `req.ip`, the address Render
 * vouches for, is inside Cloudflare's published ranges. A client connecting
 * directly can send any `cf-connecting-ip` it likes and it is ignored, because
 * their `req.ip` is not an edge address. The header is believed exactly when the
 * transport proves who set it.
 *
 * X-Forwarded-For IS NEVER READ HERE OR ANYWHERE. It is client-writable, and
 * every prior call site read it FIRST with `req.ip` only as a fallback — so a
 * request carrying a forged header had that header persisted as the signer's
 * address. `xffDrift.test.ts` fails CI if a raw read reappears outside this file.
 */

/**
 * Cloudflare's published edge ranges.
 *
 * Source: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
 * Fetched: 2026-08-31 12:58 UTC
 *
 * Vendored deliberately rather than fetched at runtime: a network call on the
 * request path would fail open (treat a Cloudflare request as direct, dropping
 * to the edge IP) exactly when the network is unwell. Cloudflare changes these
 * rarely and announces it; re-fetch when they do, and update the date above.
 */
export const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/** Minimal request shape, so callers need not be full Express requests in tests. */
export interface IpBearingRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * Express hands back IPv4-mapped IPv6 (`::ffff:203.0.113.7`) when the socket is
 * dual-stack. Strip it, or every v4 comparison silently fails and a Cloudflare
 * request reads as direct.
 */
function normalize(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  return ip;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** Expand to a 128-bit BigInt. Returns null on anything unparseable. */
function ipv6ToBig(ip: string): bigint | null {
  if (!ip.includes(":")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const toGroups = (s: string): string[] => (s === "" ? [] : s.split(":"));
  let head = toGroups(halves[0]);
  let tail = halves.length === 2 ? toGroups(halves[1]) : [];

  // A trailing dotted-quad (e.g. ::ffff:1.2.3.4) occupies two groups.
  const last = tail.length ? tail[tail.length - 1] : head.length ? head[head.length - 1] : "";
  if (last.includes(".")) {
    const v4 = ipv4ToInt(last);
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    if (tail.length) tail = [...tail.slice(0, -1), hi, lo];
    else head = [...head.slice(0, -1), hi, lo];
  }

  const missing = 8 - (head.length + tail.length);
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;

  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << 16n) + BigInt(parseInt(g, 16));
  }
  return n;
}

/** Is this address inside one of Cloudflare's published edge ranges? */
export function isCloudflareIp(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const ip = normalize(raw);

  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    for (const cidr of CLOUDFLARE_IPV4) {
      const [base, bitsStr] = cidr.split("/");
      const baseInt = ipv4ToInt(base);
      const bits = Number(bitsStr);
      if (baseInt === null) continue;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((v4 & mask) >>> 0 === (baseInt & mask) >>> 0) return true;
    }
    return false;
  }

  const v6 = ipv6ToBig(ip);
  if (v6 === null) return false;
  for (const cidr of CLOUDFLARE_IPV6) {
    const [base, bitsStr] = cidr.split("/");
    const baseBig = ipv6ToBig(base);
    const bits = Number(bitsStr);
    if (baseBig === null) continue;
    const mask = ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits);
    if ((v6 & mask) === (baseBig & mask)) return true;
  }
  return false;
}

function firstHeader(req: IpBearingRequest, name: string): string | null {
  const v = req.headers?.[name];
  if (Array.isArray(v)) return v[0]?.trim() || null;
  if (typeof v === "string") return v.trim() || null;
  return null;
}

/**
 * The calling client's address, or null if it cannot be determined.
 *
 * Believes `cf-connecting-ip` only when `req.ip` is a Cloudflare edge address —
 * i.e. when the transport itself proves Cloudflare set the header. Returns
 * `req.ip` otherwise, and falls back to the raw socket address when Express has
 * not populated `req.ip` at all.
 */
export function clientIp(req: IpBearingRequest): string | null {
  const edge = req.ip || req.socket?.remoteAddress || null;
  if (!edge) return null;

  if (isCloudflareIp(edge)) {
    const cf = firstHeader(req, "cf-connecting-ip");
    // A Cloudflare request missing the header is odd but not a reason to invent
    // one; the edge address is still the truest thing available.
    if (cf) return normalize(cf);
  }
  return normalize(edge);
}

/** The calling client's user agent, length-capped so a row cannot be flooded. */
export function clientUserAgent(req: IpBearingRequest): string | null {
  const ua = firstHeader(req, "user-agent");
  return ua ? ua.slice(0, 400) : null;
}
