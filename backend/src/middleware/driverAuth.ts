import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";
import { verifyDriverSessionToken } from "../lib/driverToken";
import { log } from "../lib/logger";

/**
 * v3.8.amz — SRL Driver Academy Sprint T2 driver-session middleware.
 *
 * Deliberately SEPARATE from the shared authenticate() (auth.ts): drivers
 * are NOT platform Users, so the standard path's prisma.user.findUnique
 * would never resolve them. authenticateDriver decodes the srl_token_driver
 * cookie (or Bearer header), enforces the "driver-training" purpose claim,
 * blacklist-checks the token, then loads the DRIVER record and gates on
 * driver status + roster linkage. It populates req.driver (never req.user).
 *
 * Cookie isolation: this reads srl_token_driver directly and never touches
 * the shared User-based cookie resolver, so the driver cookie can neither
 * pollute nor be polluted by the AE/carrier/shipper resolution chain.
 */

export interface DriverRequest extends Request<any, any, any, any> {
  driver?: {
    id: string;
    carrierProfileId: string;
    firstName: string;
    lastName: string;
  };
  token?: string;
}

const INACTIVE_DRIVER_STATUSES = ["INACTIVE", "TERMINATED"];

export async function authenticateDriver(req: DriverRequest, res: Response, next: NextFunction) {
  // Bearer header takes precedence (parity with authenticate()); else the
  // driver-portal cookie. NO fallback to other portals' cookies by design.
  let token: string | undefined;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    token = header.split(" ")[1];
  } else {
    token = (req.cookies || {}).srl_token_driver;
  }

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const payload = verifyDriverSessionToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  if (await isTokenBlacklisted(token)) {
    res.status(401).json({ error: "Token has been revoked" });
    return;
  }

  const driver = await prisma.driver.findUnique({
    where: { id: payload.driverId },
    select: {
      id: true,
      carrierProfileId: true,
      firstName: true,
      lastName: true,
      status: true,
      trainingPinHash: true,
    },
  });

  if (!driver) {
    res.status(401).json({ error: "Driver not found" });
    return;
  }
  // Defense-in-depth: the token's embedded carrierProfileId must still match
  // the driver's current roster linkage (catches a driver moved/unlinked
  // after the token was minted).
  if (!driver.carrierProfileId || driver.carrierProfileId !== payload.carrierProfileId) {
    res.status(401).json({ error: "Driver roster linkage changed — please sign in again" });
    return;
  }
  if (!driver.trainingPinHash) {
    res.status(401).json({ error: "Training account not activated" });
    return;
  }
  if (INACTIVE_DRIVER_STATUSES.includes(driver.status)) {
    res.status(403).json({
      error: "Your driver profile is inactive. Contact your carrier.",
      code: "DRIVER_INACTIVE",
    });
    return;
  }

  req.driver = {
    id: driver.id,
    carrierProfileId: driver.carrierProfileId,
    firstName: driver.firstName,
    lastName: driver.lastName,
  };
  req.token = token;
  next();
}

/**
 * Best-effort structured security log for driver-auth events. Returns the
 * promise so callers can `void` it (fire-and-forget) or await it; the
 * internal .catch keeps audit-log failures from ever rejecting the caller.
 */
export function logDriverAuthEvent(message: string, severity: "INFO" | "WARNING" = "INFO", ip?: string | null): Promise<void> {
  return prisma.systemLog
    .create({
      data: {
        logType: "SECURITY",
        severity,
        source: "driver-auth",
        message,
        ipAddress: ip || null,
      },
    })
    .then(() => undefined)
    .catch((e) => log.warn({ err: e }, "[DriverAuth] security log write failed"));
}
