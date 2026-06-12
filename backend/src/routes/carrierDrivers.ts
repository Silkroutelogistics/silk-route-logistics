import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { normalizePhoneE164 } from "../lib/phoneNormalization";

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

export default router;
