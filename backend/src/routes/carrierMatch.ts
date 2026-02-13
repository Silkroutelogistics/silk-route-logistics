import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { verifyCarrierWithFMCSA } from "../services/fmcsaService";
import { checkGuestPromotion } from "../services/tierService";
import { z } from "zod";
import { validateBody } from "../middleware/validate";

const router = Router();

router.use(authenticate);

// GET /api/carrier-match/:loadId — Smart match carriers for a load
router.get("/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE"), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.loadId } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  // Get all approved carriers
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      status: { in: ["APPROVED", "NEW"] },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, email: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  });

  // Score each carrier
  const scored = carriers.map((c) => {
    let score = 0;
    const breakdown: Record<string, number> = {};

    // Equipment match (0 or 30 pts)
    const equipMatch = c.equipmentTypes.includes(load.equipmentType);
    breakdown.equipment = equipMatch ? 30 : 0;
    score += breakdown.equipment;

    // Region match (0-15 pts)
    const loadRegion = getRegion(load.originState);
    const regionMatch = c.operatingRegions.some((r) => r.toLowerCase() === loadRegion.toLowerCase());
    breakdown.region = regionMatch ? 15 : 0;
    score += breakdown.region;

    // CPP score (0-25 pts, scaled from carrier's overall score)
    const carrierScore = c.scorecards[0]?.overallScore || 0;
    breakdown.performance = Math.round((carrierScore / 100) * 25);
    score += breakdown.performance;

    // Compliance (0 or 10 pts)
    const insuranceValid = c.insuranceExpiry ? new Date(c.insuranceExpiry) > new Date() : false;
    const docsComplete = c.w9Uploaded && c.insuranceCertUploaded && c.authorityDocUploaded;
    breakdown.compliance = (insuranceValid && docsComplete) ? 10 : 0;
    score += breakdown.compliance;

    // Tier bonus (0-10 pts)
    const tierPoints: Record<string, number> = { PLATINUM: 10, GOLD: 7, SILVER: 4, BRONZE: 2, GUEST: 0, NONE: 0 };
    breakdown.tier = tierPoints[c.tier] || 0;
    score += breakdown.tier;

    // Caravan source bonus (+5 for caravan, +0 for DAT/guest)
    breakdown.sourceBonus = (c.source === "caravan" || !c.source) ? 5 : 0;
    score += breakdown.sourceBonus;

    // Availability penalty: check if carrier already has active loads near pickup date
    // (simplified — just check active load count)
    breakdown.availability = 5; // Base 5 pts
    score += breakdown.availability;

    const complianceStatus = (!insuranceValid || !docsComplete) ? "red" : (
      c.insuranceExpiry && new Date(c.insuranceExpiry) < new Date(Date.now() + 30 * 86400000) ? "amber" : "green"
    );

    return {
      carrierId: c.id,
      userId: c.userId,
      company: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
      contactName: `${c.user.firstName} ${c.user.lastName}`,
      phone: c.user.phone,
      email: c.user.email,
      mcNumber: c.mcNumber,
      dotNumber: c.dotNumber,
      tier: c.tier,
      cppTier: c.cppTier,
      source: c.source || "caravan",
      equipmentTypes: c.equipmentTypes,
      operatingRegions: c.operatingRegions,
      overallScore: carrierScore,
      safetyScore: c.safetyScore,
      totalLoads: c.cppTotalLoads,
      complianceStatus,
      equipmentMatch: equipMatch,
      matchScore: score,
      breakdown,
      emergencyApproved: c.emergencyApproved,
    };
  });

  // Sort by match score descending, filter to equipment matches first
  const sorted = scored
    .filter((c) => c.equipmentMatch && c.complianceStatus !== "red")
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  // If no good matches, include all equipment matches regardless of compliance
  const allMatches = sorted.length > 0 ? sorted : scored
    .filter((c) => c.equipmentMatch)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  const suggestDAT = allMatches.length < 3;

  res.json({
    load: {
      id: load.id,
      referenceNumber: load.referenceNumber,
      originCity: load.originCity,
      originState: load.originState,
      destCity: load.destCity,
      destState: load.destState,
      equipmentType: load.equipmentType,
    },
    matches: allMatches,
    totalCandidates: carriers.length,
    suggestDAT,
  });
});

// POST /api/carrier-match/import-from-dat — Import carrier from DAT response
const importSchema = z.object({
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  companyName: z.string(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

router.post("/import-from-dat", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE"), validateBody(importSchema), async (req: AuthRequest, res: Response) => {
  const data = req.body;

  // Check if carrier already exists by MC or DOT
  if (data.mcNumber) {
    const existing = await prisma.carrierProfile.findFirst({ where: { mcNumber: data.mcNumber } });
    if (existing) {
      res.status(409).json({ error: "Carrier with this MC# already exists", carrierId: existing.id });
      return;
    }
  }
  if (data.dotNumber) {
    const existing = await prisma.carrierProfile.findFirst({ where: { dotNumber: data.dotNumber } });
    if (existing) {
      res.status(409).json({ error: "Carrier with this DOT# already exists", carrierId: existing.id });
      return;
    }
  }

  // Create user + carrier profile
  const bcrypt = await import("bcryptjs");
  const tempPassword = "CarrierTemp" + Math.random().toString(36).slice(2, 8) + "!";
  const passwordHash = await bcrypt.default.hash(tempPassword, 12);

  const nameParts = (data.contactName || data.companyName).split(" ");
  const firstName = nameParts[0] || data.companyName;
  const lastName = nameParts.slice(1).join(" ") || "Carrier";

  const user = await prisma.user.create({
    data: {
      email: data.email || `dat-${Date.now()}@placeholder.silkroutelogistics.ai`,
      passwordHash,
      firstName,
      lastName,
      company: data.companyName,
      phone: data.phone || null,
      role: "CARRIER",
      carrierProfile: {
        create: {
          mcNumber: data.mcNumber || null,
          dotNumber: data.dotNumber || null,
          companyName: data.companyName,
          contactName: data.contactName || null,
          contactPhone: data.phone || null,
          contactEmail: data.email || null,
          equipmentTypes: [],
          operatingRegions: [],
          onboardingStatus: "UNDER_REVIEW",
          status: "REVIEW",
          tier: "GUEST",
          cppTier: "GUEST",
          source: "dat",
        },
      },
    },
    include: { carrierProfile: true },
  });

  const profile = user.carrierProfile!;

  // Auto-trigger FMCSA verification if DOT number provided
  let fmcsaResult = null;
  if (data.dotNumber) {
    try {
      fmcsaResult = await verifyCarrierWithFMCSA(data.dotNumber);

      if (fmcsaResult.verified) {
        await prisma.carrierProfile.update({
          where: { id: profile.id },
          data: {
            onboardingStatus: "APPROVED",
            status: "APPROVED",
            approvedAt: new Date(),
            safetyRating: fmcsaResult.safetyRating,
            fmcsaAuthorityStatus: fmcsaResult.operatingStatus,
            fmcsaLastChecked: new Date(),
            ...(fmcsaResult.legalName && { companyName: fmcsaResult.legalName }),
          },
        });
      } else {
        await prisma.carrierProfile.update({
          where: { id: profile.id },
          data: {
            onboardingStatus: "REJECTED",
            status: "REJECTED",
            fmcsaAuthorityStatus: fmcsaResult.operatingStatus,
            fmcsaLastChecked: new Date(),
            notes: "FMCSA verification failed: " + (fmcsaResult.errors || []).join(", "),
          },
        });
      }
    } catch (err) {
      console.error("[FMCSA] Verification error during DAT import:", err);
    }
  }

  // Re-fetch updated profile
  const updated = await prisma.carrierProfile.findUnique({
    where: { id: profile.id },
    include: { user: { select: { id: true, firstName: true, lastName: true, company: true, email: true } } },
  });

  res.status(201).json({
    carrier: updated,
    fmcsa: fmcsaResult,
    tempPassword: data.email ? tempPassword : null,
  });
});

// POST /api/carrier-match/:id/emergency-approve — Admin emergency approval
router.post("/:id/emergency-approve", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400).json({ error: "Reason required for emergency approval" });
    return;
  }

  const profile = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const updated = await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      onboardingStatus: "APPROVED",
      status: "APPROVED",
      approvedAt: new Date(),
      emergencyApproved: true,
      emergencyApproveReason: reason,
      emergencyApprovedById: req.user!.id,
      emergencyApprovedAt: new Date(),
    },
  });

  // Audit trail
  try {
    await prisma.auditTrail.create({
      data: {
        performedById: req.user!.id,
        action: "CREATE",
        entityType: "EMERGENCY_APPROVE",
        entityId: profile.id,
        changedFields: { reason, carrierId: profile.id } as any,
        ipAddress: req.ip || null,
      },
    });
  } catch { /* non-blocking */ }

  res.json({ success: true, carrier: updated });
});

// POST /api/carrier-match/:id/promote-to-bronze — Manually promote Guest to Bronze
router.post("/:id/promote-to-bronze", authorize("ADMIN", "CEO", "BROKER"), async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true } } },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  if (profile.tier !== "GUEST" && profile.cppTier !== "GUEST") {
    res.status(400).json({ error: "Carrier is not a Guest tier" });
    return;
  }

  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: { tier: "BRONZE", cppTier: "BRONZE", source: "caravan" },
  });

  await prisma.notification.create({
    data: {
      userId: profile.userId,
      type: "GENERAL",
      title: "Welcome to The Caravan!",
      message: "You have been promoted to Bronze tier in The Caravan by your account executive.",
      actionUrl: "/carrier/dashboard.html",
    },
  });

  res.json({ success: true });
});

// Helper: map state to region
function getRegion(state: string): string {
  const regions: Record<string, string[]> = {
    "Northeast": ["CT","DE","MA","MD","ME","NH","NJ","NY","PA","RI","VT","DC"],
    "Southeast": ["AL","AR","FL","GA","KY","LA","MS","NC","SC","TN","VA","WV"],
    "Midwest": ["IA","IL","IN","KS","MI","MN","MO","ND","NE","OH","SD","WI"],
    "Southwest": ["AZ","NM","OK","TX"],
    "West Coast": ["CA","HI","NV","OR","WA"],
    "South Central": ["CO","ID","MT","UT","WY"],
  };
  for (const [region, states] of Object.entries(regions)) {
    if (states.includes(state.toUpperCase())) return region;
  }
  return "Other";
}

export default router;
