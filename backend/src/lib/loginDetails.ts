/**
 * B3a (2026-09-17) — the structured half of a LOGIN audit row.
 *
 * A LOGIN row in audit_logs carried a prose note ("Carrier login via OTP"), an
 * ip and a user agent, and nothing a query could switch on: not which factors
 * were used, not which channel the code went out on, not anything that
 * survives a browser update as "the same device". This builds the JSON that
 * now rides in AuditLog.details beside them.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 *   · ip — audit_logs.ipAddress is the source. Copying it into details is a
 *     second answer to one question (§13.3 two-surface class).
 *   · anything a browser can influence but the server cannot verify beyond
 *     the User-Agent string. deviceHash is a *family* hash, and the header
 *     says so where it is read.
 *
 * DEVICE HASH
 *
 * sha256(browserFamily + "|" + osFamily), first 16 hex. Families only — no
 * version numbers — so a browser auto-update does not read as a new device.
 * The trade is that two machines running the same browser family on the same
 * OS family hash alike; that is the honest ceiling of a header-only signal,
 * and B5 flags it as NEW_DEVICE rather than "new machine" for that reason.
 * A missing UA hashes as Unknown|Unknown, so a header-less client can never
 * trip NEW_DEVICE — recorded here rather than left to surprise a reader.
 */

import crypto from "crypto";
import { resolveGeo } from "../services/geoService";

export type OtpChannel = "EMAIL" | "EMAIL+SMS";

/**
 * v3.8.bcl — where the sign-in came from, resolved at write time from the
 * request IP (geoip-lite, offline). The IP itself lives in audit_logs.ipAddress
 * and is deliberately NOT repeated here; the row carries the place, the column
 * carries the address. Null when the IP is private, loopback or unknown to the
 * database — an unresolvable origin is recorded as unknown, never guessed.
 */
export type LoginGeo = {
  city: string | null;
  region: string | null;
  country: string;
  lat: number | null;
  lon: number | null;
};

// A type alias, not an interface: Prisma's InputJsonObject wants an implicit
// index signature, which interfaces do not carry.
export type LoginDetails = {
  authMethod: "PASSWORD";
  /** Which channel(s) the email-OTP step went out on for this login. */
  otpChannel: OtpChannel;
  /** True only when the TOTP step ran and passed. Email OTP alone is false. */
  mfaUsed: boolean;
  /** sha256(browser family | OS family), 16 hex chars. No versions. */
  deviceHash: string;
  /** The human form of the same two families, e.g. "Chrome on Windows". */
  device: string;
  userAgent: string | null;
  geo: LoginGeo | null;
};

/** Order matters: Edge and Opera carry "Chrome" in their UA, Android carries "Linux". */
export function uaFamilies(ua: string | null | undefined): { browser: string; os: string } {
  const s = (ua || "").slice(0, 512);
  if (!s) return { browser: "Unknown", os: "Unknown" };
  const browser =
    /Edg(e|A|iOS)?\//.test(s) ? "Edge" :
    /OPR\/|Opera/.test(s) ? "Opera" :
    /SamsungBrowser/.test(s) ? "Samsung" :
    /Firefox\/|FxiOS/.test(s) ? "Firefox" :
    /CriOS|Chrome\//.test(s) ? "Chrome" :
    /Safari\//.test(s) && /Version\//.test(s) ? "Safari" :
    /MSIE|Trident\//.test(s) ? "IE" :
    "Other";
  const os =
    /Windows NT/.test(s) ? "Windows" :
    /iPhone|iPad|iPod/.test(s) ? "iOS" :
    /Android/.test(s) ? "Android" :
    /Mac OS X|Macintosh/.test(s) ? "macOS" :
    /CrOS/.test(s) ? "ChromeOS" :
    /Linux/.test(s) ? "Linux" :
    "Other";
  return { browser, os };
}

export function deviceHashFor(ua: string | null | undefined): string {
  const { browser, os } = uaFamilies(ua);
  return crypto.createHash("sha256").update(`${browser}|${os}`).digest("hex").slice(0, 16);
}

export function loginGeoFor(ip: string | null | undefined): LoginGeo | null {
  const g = resolveGeo(ip);
  if (!g || !g.country) return null;
  return { city: g.city, region: g.region, country: g.country, lat: g.lat, lon: g.lon };
}

export function buildLoginDetails(args: {
  userAgent: string | null | undefined;
  /** The client IP the row's ipAddress column also carries. Resolved, not stored. */
  ip?: string | null;
  otpChannel: OtpChannel;
  mfaUsed: boolean;
}): LoginDetails {
  const { browser, os } = uaFamilies(args.userAgent);
  return {
    authMethod: "PASSWORD",
    otpChannel: args.otpChannel,
    mfaUsed: args.mfaUsed,
    deviceHash: deviceHashFor(args.userAgent),
    device: `${browser} on ${os}`,
    userAgent: args.userAgent ? args.userAgent.slice(0, 512) : null,
    geo: loginGeoFor(args.ip),
  };
}
