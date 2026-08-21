// Carrier 2FA enrollment is mandatory, and this is the boundary that enforces it.
//
// The portal layout also redirects an unenrolled carrier to the enrollment
// screen, but that is UX: it runs in a browser the carrier controls. This is the
// part that holds when someone calls the API directly, which is the only version
// of "mandatory" that means anything.
//
// SHAPED AFTER THE EXISTING ACTIVATION GATE (v3.8.aqi), deliberately rather than
// inventing a second idiom: that gate pairs a `requiresActivation` flag on
// /activation-status with a layout redirect, and hard-blocks the operational
// consequence separately in complianceCheck. Same three parts here — a
// `requiresTotpEnrollment` flag, a layout redirect, and this.
//
// WHAT IT DOES NOT BLOCK, and why each exemption is load-bearing. A gate that
// blocks the route needed to satisfy the gate is a lockout, which is the exact
// failure the whole recovery-before-enforcement ordering exists to avoid:
//
//   · the enrollment endpoints themselves — otherwise nobody can ever enroll
//   · /activation-status — the portal reads it to know WHERE to send them
//   · /me and /logout — identity and escape must always work
//
// Everything else on the carrier portal requires an armed authenticator.

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { prisma } from "../config/database";

/**
 * Paths that stay reachable to a carrier who has not yet enrolled.
 *
 * Matched against the path WITHIN the mounted router, so entries are the
 * suffixes as the route file declares them.
 */
const ENROLLMENT_EXEMPT = [
  "/totp/setup",
  "/totp/confirm",
  "/totp/status",
  // ARC 15 — /application-status was MISSING and it is the one page a PENDING
  // carrier is allowed to see. The list had /activation-status (the BCA gate)
  // and they are two different routes: carrierAuth.ts:587 and :906. While the
  // gate was inert this was invisible; the moment it started working, a PENDING
  // carrier could not load the only page available to them — exactly the lockout
  // this list exists to prevent. Caught by proving the gate, not by reading it.
  "/application-status",
  "/activation-status",
  // Recovery must stay reachable: a carrier whose verification link died needs
  // this before they can do anything else, and it is authenticated + CARRIER-scoped.
  "/resend-verification",
  "/me",
  "/logout",
];

export async function requireTotpEnrolled(req: AuthRequest, res: Response, next: NextFunction) {
  // Only carriers. AE and shipper flows are untouched by this arc.
  if (!req.user || req.user.role !== "CARRIER") return next();

  const path = req.path || "";
  if (ENROLLMENT_EXEMPT.some((p) => path === p || path.startsWith(p + "/"))) return next();

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { totpEnabled: true },
  });

  if (!user?.totpEnabled) {
    res.status(403).json({
      error:
        "Set up your authenticator app before using the carrier portal. This protects the bank details and load information on your account.",
      code: "TOTP_ENROLLMENT_REQUIRED",
      action: { href: "/carrier/dashboard/security" },
    });
    return;
  }

  next();
}
