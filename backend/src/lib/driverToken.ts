import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * v3.8.amz — SRL Driver Academy Sprint T2 driver tokens.
 *
 * Two signed-JWT token classes, both on the same JWT_SECRET + HS256 as the
 * platform auth tokens, mirroring the tenderActionToken precedent:
 *
 *  - INVITE token (purpose "driver-invite", 7-day expiry): embedded in the
 *    SMS/copy-link the carrier sends. The token IS the authorization for the
 *    public POST /api/driver-auth/set-pin endpoint. Made single-use by
 *    blacklisting it on consumption (set-pin) so a leaked/old link can't be
 *    replayed even across a carrier-initiated PIN reset.
 *  - SESSION token (purpose "driver-training", 7-day expiry): issued on PIN
 *    set + on login, stored in the srl_token_driver cookie, consumed by
 *    authenticateDriver.
 *
 * The distinct `purpose` claim is the cross-class + cross-portal isolation
 * primitive: an invite token can't be used as a session (and vice versa),
 * and neither carries a userId, so the shared User-based authenticate()
 * rejects them. Drivers are NOT Users — these tokens embed driverId +
 * carrierProfileId only.
 *
 * Banked (§13.3 Item 193 follow-ups): per-token-class secret separation +
 * RS256 are platform-wide hardening, deferred; purpose-claim isolation is
 * the T2 boundary.
 */

const INVITE_PURPOSE = "driver-invite";
const SESSION_PURPOSE = "driver-training";

// Frontend (Cloudflare Pages) base — hardcoded to the prod domain to match
// the existing carrier verify-email URL construction in carrierController.
const APP_BASE = "https://silkroutelogistics.ai";

// Single source of truth for the driver session lifetime — the JWT exp and
// the cookie maxAge both derive from this so they can't drift (review fix).
const DRIVER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DRIVER_SESSION_SECONDS = Math.floor(DRIVER_SESSION_MS / 1000);

export interface DriverInvitePayload {
  driverId: string;
  carrierProfileId: string;
  purpose: typeof INVITE_PURPOSE;
}

export interface DriverSessionPayload {
  driverId: string;
  carrierProfileId: string;
  purpose: typeof SESSION_PURPOSE;
}

export function mintDriverInviteToken(driverId: string, carrierProfileId: string, expiresIn: string | number = "7d"): string {
  return jwt.sign(
    { driverId, carrierProfileId, purpose: INVITE_PURPOSE },
    env.JWT_SECRET,
    { algorithm: "HS256", expiresIn } as jwt.SignOptions,
  );
}

export function verifyDriverInviteToken(token: string): DriverInvitePayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
    const driverId = decoded.driverId;
    const carrierProfileId = decoded.carrierProfileId;
    if (typeof driverId !== "string" || typeof carrierProfileId !== "string" || decoded.purpose !== INVITE_PURPOSE) {
      return null;
    }
    return { driverId, carrierProfileId, purpose: INVITE_PURPOSE };
  } catch {
    return null;
  }
}

export function mintDriverSessionToken(driverId: string, carrierProfileId: string, expiresIn: string | number = DRIVER_SESSION_SECONDS): string {
  return jwt.sign(
    { driverId, carrierProfileId, purpose: SESSION_PURPOSE },
    env.JWT_SECRET,
    { algorithm: "HS256", expiresIn } as jwt.SignOptions,
  );
}

export function verifyDriverSessionToken(token: string): DriverSessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
    const driverId = decoded.driverId;
    const carrierProfileId = decoded.carrierProfileId;
    if (typeof driverId !== "string" || typeof carrierProfileId !== "string" || decoded.purpose !== SESSION_PURPOSE) {
      return null;
    }
    return { driverId, carrierProfileId, purpose: SESSION_PURPOSE };
  } catch {
    return null;
  }
}

/** Full frontend set-PIN URL for an invite token (carrier sends this to the driver). */
export function driverInviteUrl(token: string): string {
  return `${APP_BASE}/driver/set-pin?token=${token}`;
}

/** Session cookie lifetime — derives from DRIVER_SESSION_MS (single source). */
export const DRIVER_SESSION_MAX_AGE_MS = DRIVER_SESSION_MS;
