/**
 * v3.8.bcm — unusual-activity flags on a carrier LOGIN row.
 *
 * Three flags, each a comparison against that user's OWN prior LOGIN rows —
 * the rows bcg/bcl write, read back through the (userId, action, createdAt)
 * index bcf added for exactly this query.
 *
 *   NEW_DEVICE         no prior row carries this deviceHash. Never fires for
 *                      a missing user agent: that hash is the Unknown|Unknown
 *                      sentinel and every UA-less client shares it.
 *   NEW_COUNTRY        prior rows name at least one country and none is this
 *                      one. Unresolved geo (null) neither fires nor counts.
 *   IMPOSSIBLE_TRAVEL  against the most recent prior row WITH coordinates:
 *                      more than 500 km away AND faster than 900 km/h.
 *                      Both, not either — 300 km in five minutes is a
 *                      city-level lookup landing on a different block of the
 *                      same metro, not a flight (amendment, 2026-09-17).
 *
 * A first-ever login has nothing to compare against and carries no flags;
 * flagging everyone once would teach an AE that the flags mean nothing.
 *
 * Flags are DEDUCTIONS, never verdicts (§14): a flagged login still logs in.
 * They are evidence for the Audit Log and the Security Signals card, and a
 * human decides. withLoginFlags never throws — a failure to compute a flag
 * must not be able to prevent the LOGIN row it decorates.
 */

import { prisma } from "../config/database";
import { log } from "./logger";
import { deviceHashFor, type LoginDetails, type LoginGeo } from "./loginDetails";

export type LoginFlag = "NEW_DEVICE" | "NEW_COUNTRY" | "IMPOSSIBLE_TRAVEL";

/** The two thresholds, both required. */
export const IMPOSSIBLE_TRAVEL_MIN_KM = 500;
export const IMPOSSIBLE_TRAVEL_MIN_KMH = 900;

/** How many prior logins form the seen-set. Enough for a small fleet's rotation. */
export const PRIOR_LOGIN_WINDOW = 50;

export interface PriorLogin {
  deviceHash: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  at: Date;
}

const UNKNOWN_DEVICE_HASH = deviceHashFor(null);

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function computeLoginFlags(
  current: { deviceHash: string; geo: LoginGeo | null; at: Date },
  prior: PriorLogin[],
): LoginFlag[] {
  if (prior.length === 0) return [];
  const flags: LoginFlag[] = [];

  if (current.deviceHash !== UNKNOWN_DEVICE_HASH && !prior.some((p) => p.deviceHash === current.deviceHash)) {
    flags.push("NEW_DEVICE");
  }

  const country = current.geo?.country ?? null;
  if (country) {
    const seen = prior.map((p) => p.country).filter((c): c is string => !!c);
    if (seen.length > 0 && !seen.includes(country)) flags.push("NEW_COUNTRY");
  }

  if (current.geo && current.geo.lat != null && current.geo.lon != null) {
    const last = prior
      .filter((p) => p.lat != null && p.lon != null)
      .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (last) {
      const km = haversineKm(last.lat as number, last.lon as number, current.geo.lat, current.geo.lon);
      const hours = Math.max((current.at.getTime() - last.at.getTime()) / 3_600_000, 1 / 3600);
      if (km > IMPOSSIBLE_TRAVEL_MIN_KM && km / hours > IMPOSSIBLE_TRAVEL_MIN_KMH) flags.push("IMPOSSIBLE_TRAVEL");
    }
  }

  return flags;
}

/** Prior LOGIN rows for this user, newest first, parsed from details. */
export async function priorLoginsFor(userId: string, take = PRIOR_LOGIN_WINDOW): Promise<PriorLogin[]> {
  const rows = await prisma.auditLog.findMany({
    where: { userId, action: "LOGIN" },
    orderBy: { createdAt: "desc" },
    take,
    select: { details: true, createdAt: true },
  });
  return rows.map((r) => {
    const d = (r.details ?? {}) as Partial<LoginDetails>;
    const geo = (d.geo ?? null) as LoginGeo | null;
    return {
      deviceHash: typeof d.deviceHash === "string" ? d.deviceHash : null,
      country: geo?.country ?? null,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      at: r.createdAt,
    };
  });
}

/**
 * Decorate a built details object with flags against the user's history.
 * Never throws; on any failure the row is written without flags rather than
 * not written at all.
 */
export async function withLoginFlags(
  userId: string,
  details: LoginDetails,
  at: Date = new Date(),
): Promise<LoginDetails & { flags: LoginFlag[] }> {
  try {
    const prior = await priorLoginsFor(userId);
    return { ...details, flags: computeLoginFlags({ deviceHash: details.deviceHash, geo: details.geo, at }, prior) };
  } catch (err) {
    log.warn({ err, userId }, "[loginFlags] prior-login read failed; row written without flags");
    return { ...details, flags: [] };
  }
}

// ── B5b — a sensitive act shortly after a flagged login ──────────────────────
//
// NEW_DEVICE and NEW_COUNTRY on their own are weak: people buy phones and
// travel. What sharpens either is what happens NEXT — a payment-terms change,
// an insurance update, a document upload — inside a day of it. That is the
// account-takeover shape, and it is recorded ON THE LOGIN ROW, because the
// login is what an AE goes back to read. Informational only: the act itself
// is not blocked, the endpoint that performed it has already answered, and a
// failure here is logged and swallowed. One SystemLog SECURITY/WARNING per
// (login, action) so the daily digest can count them; idempotent per action.

export type SensitiveAction = "document-upload" | "quickpay-pilot-request" | "quickpay-election" | "insurance-update";
export const SENSITIVE_ACTION_WINDOW_HOURS = 24;
export const SENSITIVE_LOGIN_RISK_SOURCE = "carrierAuth-login-risk";

export async function flagSensitiveActionAfterNewLogin(
  userId: string,
  action: SensitiveAction,
  now: Date = new Date(),
): Promise<{ flagged: boolean }> {
  try {
    const login = await prisma.auditLog.findFirst({
      where: { userId, action: "LOGIN" },
      orderBy: { createdAt: "desc" },
      select: { id: true, details: true, createdAt: true },
    });
    if (!login) return { flagged: false };
    const ageHours = (now.getTime() - login.createdAt.getTime()) / 3_600_000;
    if (ageHours < 0 || ageHours > SENSITIVE_ACTION_WINDOW_HOURS) return { flagged: false };
    const details = (login.details ?? {}) as Partial<LoginDetails> & { flags?: string[] };
    const flags = Array.isArray(details.flags) ? details.flags : [];
    if (!flags.includes("NEW_DEVICE") && !flags.includes("NEW_COUNTRY")) return { flagged: false };
    const flag = `SENSITIVE_ACTION_AFTER_NEW_LOGIN:${action}`;
    if (flags.includes(flag)) return { flagged: true };
    await prisma.auditLog.update({ where: { id: login.id }, data: { details: { ...details, flags: [...flags, flag] } } });
    await prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: "WARNING",
        source: SENSITIVE_LOGIN_RISK_SOURCE,
        userId,
        message: `Sensitive action ${action} within ${SENSITIVE_ACTION_WINDOW_HOURS}h of a flagged login (${flags.filter((f) => f === "NEW_DEVICE" || f === "NEW_COUNTRY").join(", ")}) [uid:${userId}]`,
        details: { loginAuditLogId: login.id, action, loginAgeHours: Math.round(ageHours * 100) / 100 },
      },
    });
    return { flagged: true };
  } catch (err) {
    log.warn({ err, userId, action }, "[loginFlags] sensitive-action flag failed; the act itself is unaffected");
    return { flagged: false };
  }
}
