import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { normalizePhoneE164 } from "../lib/phoneNormalization";
import { mintDriverInviteToken, driverInviteUrl } from "../lib/driverToken";
import { sendSMS } from "../services/openPhoneService";
import { generateTrainingCertificate, buildCertificateData } from "../services/certificatePdfService";
import { buildCarrierTrainingSummary } from "../services/trainingService";
import { log } from "../lib/logger";

// v3.8.amz (review fix) — cap invite/re-invite churn. The invite response
// returns a signed setup link (the deliberate copy-link fallback); rate
// limiting bounds how fast that token-bearing URL can be re-minted.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many invite requests. Please try again shortly." },
});

/**
 * v3.8.amw — SRL Driver Academy Sprint T1: carrier-managed driver roster.
 *
 * Carriers maintain their own driver list from the portal. Rows created
 * here carry Driver.carrierProfileId (the roster scope); legacy AE-console
 * fleet rows (carrierProfileId NULL) are never visible on this surface.
 *
 * Phone is REQUIRED on roster drivers: Sprint T2 issues training-portal
 * credentials via SMS invite (phone + PIN per the locked Academy decisions),
 * so a roster row without a phone could never receive a login.
 *
 * No hard DELETE — drivers deactivate to INACTIVE so training records
 * (Sprint T3+) and any future load references stay intact.
 */

const router = Router();

router.use(authenticate);
router.use(authorize("CARRIER"));

// ── Profile resolution + status gate ────────────────────────────────────
// Roster management is an APPROVED-carrier surface (mirrors /available's
// gate at carrierLoads.ts). Non-APPROVED carriers are confined to the
// application-status page by the portal layout anyway; this enforces the
// same boundary at the API layer.
async function getApprovedProfile(req: AuthRequest, res: Response): Promise<{ id: string } | null> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true, onboardingStatus: true },
  });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return null;
  }
  if (profile.onboardingStatus === "SUSPENDED") {
    res.status(403).json({
      error: "Your account is suspended. Contact compliance@silkroutelogistics.ai.",
      code: "CARRIER_SUSPENDED",
    });
    return null;
  }
  if (profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({
      error: "Carrier must be approved to manage drivers",
      code: "CARRIER_NOT_APPROVED",
    });
    return null;
  }
  return { id: profile.id };
}

const ROSTER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  licenseType: true,
  licenseNumber: true,
  licenseState: true,
  licenseExpiry: true,
  medicalCardExpiry: true,
  status: true,
  createdAt: true,
  // v3.8.amz — Driver Academy T2 invite/activation state for the roster UI.
  trainingPinSetAt: true,
  trainingInviteSentAt: true,
} as const;

// ISO date string (yyyy-mm-dd or full ISO) — converted to Date in handlers.
const dateStr = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date" });

const createDriverSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().min(10).max(20),
  email: z.string().trim().email().max(255).optional(),
  licenseType: z.string().trim().min(1).max(30).default("CDL-A"),
  licenseNumber: z.string().trim().max(40).optional(),
  licenseState: z.string().trim().max(2).optional(),
  licenseExpiry: dateStr.optional(),
  medicalCardExpiry: dateStr.optional(),
});

const updateDriverSchema = createDriverSchema.partial();

// GET /api/carrier-drivers — the carrier's roster (no pagination; rosters
// are small at launch volume — revisit if any carrier crosses ~200 drivers)
router.get("/", async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;

  const drivers = await prisma.driver.findMany({
    where: { carrierProfileId: profile.id },
    select: ROSTER_SELECT,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const active = drivers.filter((d) => d.status !== "INACTIVE" && d.status !== "TERMINATED").length;
  res.json({ drivers, total: drivers.length, active, inactive: drivers.length - active });
});

// POST /api/carrier-drivers — add a driver to the roster
router.post("/", validateBody(createDriverSchema), async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;

  const data = req.body as z.infer<typeof createDriverSchema>;

  const normalizedPhone = normalizePhoneE164(data.phone);
  if (!normalizedPhone) {
    res.status(400).json({ error: "Enter a valid 10-digit US phone number" });
    return;
  }

  // Per-carrier duplicate gate on the normalized phone (the future T2
  // login identity). Scoped to THIS carrier only — a driver may exist
  // under another carrier's roster independently.
  const dupe = await prisma.driver.findFirst({
    where: { carrierProfileId: profile.id, phone: normalizedPhone, status: { not: "TERMINATED" } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (dupe) {
    res.status(409).json({
      error: `A driver with this phone number is already on your roster (${dupe.firstName} ${dupe.lastName}).`,
    });
    return;
  }

  const driver = await prisma.driver.create({
    data: {
      carrierProfileId: profile.id,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: normalizedPhone,
      email: data.email || null,
      licenseType: data.licenseType,
      licenseNumber: data.licenseNumber || null,
      licenseState: data.licenseState ? data.licenseState.toUpperCase() : null,
      licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : null,
      medicalCardExpiry: data.medicalCardExpiry ? new Date(data.medicalCardExpiry) : null,
      status: "AVAILABLE",
    },
    select: ROSTER_SELECT,
  });

  res.status(201).json({ driver });
});

// Ownership check shared by the per-driver mutations. 404 (not 403) on
// foreign/unknown ids so roster ids aren't enumerable across carriers.
async function getOwnedDriver(profileId: string, driverId: string) {
  return prisma.driver.findFirst({
    where: { id: driverId, carrierProfileId: profileId },
    select: { id: true },
  });
}

// PATCH /api/carrier-drivers/:id — edit roster driver details
router.patch("/:id", validateBody(updateDriverSchema), async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;

  const owned = await getOwnedDriver(profile.id, req.params.id);
  if (!owned) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const data = req.body as z.infer<typeof updateDriverSchema>;
  const patch: Record<string, unknown> = {};

  if (data.firstName !== undefined) patch.firstName = data.firstName;
  if (data.lastName !== undefined) patch.lastName = data.lastName;
  if (data.phone !== undefined) {
    const normalizedPhone = normalizePhoneE164(data.phone);
    if (!normalizedPhone) {
      res.status(400).json({ error: "Enter a valid 10-digit US phone number" });
      return;
    }
    const dupe = await prisma.driver.findFirst({
      where: {
        carrierProfileId: profile.id,
        phone: normalizedPhone,
        status: { not: "TERMINATED" },
        id: { not: owned.id },
      },
      select: { id: true },
    });
    if (dupe) {
      res.status(409).json({ error: "Another driver on your roster already uses this phone number." });
      return;
    }
    patch.phone = normalizedPhone;
  }
  if (data.email !== undefined) patch.email = data.email || null;
  if (data.licenseType !== undefined) patch.licenseType = data.licenseType;
  if (data.licenseNumber !== undefined) patch.licenseNumber = data.licenseNumber || null;
  if (data.licenseState !== undefined) patch.licenseState = data.licenseState ? data.licenseState.toUpperCase() : null;
  if (data.licenseExpiry !== undefined) patch.licenseExpiry = data.licenseExpiry ? new Date(data.licenseExpiry) : null;
  if (data.medicalCardExpiry !== undefined) patch.medicalCardExpiry = data.medicalCardExpiry ? new Date(data.medicalCardExpiry) : null;

  const driver = await prisma.driver.update({
    where: { id: owned.id },
    data: patch,
    select: ROSTER_SELECT,
  });

  res.json({ driver });
});

// PATCH /api/carrier-drivers/:id/deactivate — soft-remove from roster.
// INACTIVE (reversible) rather than TERMINATED or hard delete so future
// training records survive roster churn.
router.patch("/:id/deactivate", async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;

  const owned = await getOwnedDriver(profile.id, req.params.id);
  if (!owned) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const driver = await prisma.driver.update({
    where: { id: owned.id },
    data: { status: "INACTIVE" },
    select: ROSTER_SELECT,
  });
  res.json({ driver });
});

// PATCH /api/carrier-drivers/:id/reactivate — restore to the active roster
router.patch("/:id/reactivate", async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;

  const owned = await getOwnedDriver(profile.id, req.params.id);
  if (!owned) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const driver = await prisma.driver.update({
    where: { id: owned.id },
    data: { status: "AVAILABLE" },
    select: ROSTER_SELECT,
  });
  res.json({ driver });
});

// POST /api/carrier-drivers/:id/invite — send (or re-send) the SRL Driver
// Academy training-login invite. Mints a 7-day invite token, fires an SMS
// to the driver's phone (graceful — never blocks on OpenPhone), and ALWAYS
// returns the invite URL so the carrier can copy + share it directly even
// when SMS is unavailable. `reset: true` clears an existing PIN so the new
// link can re-activate a driver who forgot their PIN (UI gates this behind
// a confirm).
const inviteSchema = z.object({ reset: z.boolean().optional() });
router.post("/:id/invite", inviteLimiter, validateBody(inviteSchema), async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;

  const driver = await prisma.driver.findFirst({
    where: { id: req.params.id, carrierProfileId: profile.id },
    select: { id: true, firstName: true, lastName: true, phone: true, status: true, trainingPinHash: true },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  if (driver.status === "INACTIVE" || driver.status === "TERMINATED") {
    res.status(409).json({ error: "Reactivate this driver before sending a training invite." });
    return;
  }
  if (!driver.phone) {
    res.status(400).json({ error: "This driver has no phone number on file." });
    return;
  }

  const reset = (req.body as z.infer<typeof inviteSchema>).reset === true;
  if (driver.trainingPinHash && !reset) {
    res.status(409).json({
      error: "This driver has already set up their training login. Use \"Reset PIN\" to send a fresh invite.",
      code: "ALREADY_ACTIVATED",
    });
    return;
  }

  // reset=true clears the existing PIN state so the new invite can re-activate.
  await prisma.driver.update({
    where: { id: driver.id },
    data: {
      trainingInviteSentAt: new Date(),
      ...(reset ? { trainingPinHash: null, trainingPinSetAt: null, trainingFailedAttempts: 0, trainingLockedUntil: null } : {}),
    },
  });

  const token = mintDriverInviteToken(driver.id, profile.id);
  const inviteUrl = driverInviteUrl(token);

  let smsSent = false;
  let smsError: string | null = null;
  const message = `${driver.firstName}, your carrier invited you to SRL Driver Academy training. Set your 6-digit PIN here: ${inviteUrl} (link expires in 7 days)`;
  try {
    await sendSMS(driver.phone, message);
    smsSent = true;
  } catch (e) {
    smsError = e instanceof Error ? e.message : "SMS could not be sent";
    log.warn({ driverId: driver.id, err: smsError }, "[DriverAcademy] invite SMS failed — copy-link fallback returned");
  }

  res.json({ inviteUrl, smsSent, smsError, reset });
});

// GET /api/carrier-drivers/training-summary — roster × course completion matrix
// + % trained, scoped to this carrier. Powers the carrier Training dashboard.
// v3.8.and (T6) — logic extracted to trainingService.buildCarrierTrainingSummary
// so the AE carrier-detail Training tab (/api/carriers/:id/training-summary)
// shares one source. Response shape preserved; T6 adds isExpired/daysUntilExpiry
// per cell + expiredCells/expiringCells in summary (additive).
router.get("/training-summary", async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;
  const summary = await buildCarrierTrainingSummary(profile.id);
  res.json(summary);
});

// GET /api/carrier-drivers/:id/certificate/:slug — download a roster driver's
// completion certificate. getOwnedDriver gates to THIS carrier's roster (404
// otherwise, no cross-carrier enumeration). buildCertificateData returns null
// unless the driver has PASSED the course.
router.get("/:id/certificate/:slug", async (req: AuthRequest, res: Response) => {
  const profile = await getApprovedProfile(req, res);
  if (!profile) return;
  const owned = await getOwnedDriver(profile.id, req.params.id);
  if (!owned) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const data = await buildCertificateData(req.params.id, req.params.slug);
  if (!data) {
    res.status(404).json({ error: "No certificate available for this driver and course." });
    return;
  }
  const doc = generateTrainingCertificate(data);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="SRL-Certificate-${req.params.slug}.pdf"`);
  doc.pipe(res);
});

export default router;
