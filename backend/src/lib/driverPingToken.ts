import jwt from "jsonwebtoken";

/**
 * The link in a check-call text that a driver can tap to share where they are.
 *
 * SHAPE COPIED FROM `tenderActionToken`, deliberately. That is the in-repo
 * precedent for a signed, purpose-scoped, expiring link on a PUBLIC route where
 * the token IS the authorisation, and it has been through adversarial review.
 * Inventing a second scheme for the same problem is how a codebase ends up with
 * two token conventions and one of them wrong.
 *
 * WHY IT IS LOAD-SCOPED AND SHORT-LIVED. A driver ping link is handed to a
 * person over SMS, on a channel that forwards, screenshots and survives phone
 * changes. Scoping it to one load means a leaked link discloses one load's
 * geography and can write one load's position. Expiring it means a link found
 * in an old message thread is inert rather than a permanent write handle.
 *
 * THE `purpose` CLAIM IS LOAD-BEARING. The shared token verifier rejects any
 * purpose-carrying token (Arc 11 hardening), so a ping token can never be
 * presented as a session, and a session can never be presented as a ping token.
 */

const PURPOSE = "driver-ping" as const;

/** Long enough to survive a driver finishing a shift; short enough to rot. */
const TTL_HOURS = 36;

export interface DriverPingPayload {
  loadId: string;
  /** The verified E.164 this link was issued to, so a ping names its handset. */
  phone: string;
  purpose: typeof PURPOSE;
}

export function mintDriverPingToken(loadId: string, phone: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set — cannot mint a driver ping token");
  return jwt.sign({ loadId, phone, purpose: PURPOSE }, secret, {
    algorithm: "HS256",
    expiresIn: `${TTL_HOURS}h`,
  });
}

/** Returns null on anything not a live, correctly-purposed ping token. */
export function verifyDriverPingToken(token: string): DriverPingPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const d = jwt.verify(token, secret, { algorithms: ["HS256"] }) as any;
    if (!d || d.purpose !== PURPOSE || typeof d.loadId !== "string" || typeof d.phone !== "string") {
      return null;
    }
    return { loadId: d.loadId, phone: d.phone, purpose: PURPOSE };
  } catch {
    return null;
  }
}

export function driverPingUrl(token: string): string {
  const base = process.env.PORTAL_BASE_URL || "https://silkroutelogistics.ai";
  return `${base}/api/ping/${token}`;
}
