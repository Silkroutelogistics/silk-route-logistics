import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { calculateTier, getBonusPercentage, calculateOverallScore } from "../services/tierService";

const router = Router();

router.use(authenticate);

// GET /api/cpp/my-status — Carrier's CPP loyalty status
router.get("/my-status", authorize("CARRIER"), async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 6 },
      bonuses: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const latestScore = profile.scorecards[0];
  const currentScore = latestScore?.overallScore || 0;
  const currentTier = profile.cppTier !== "NONE" ? profile.cppTier : profile.tier;

  // Tier thresholds
  const tiers = [
    { name: "PLATINUM", min: 98, bonus: 3, perks: ["Priority load access", "3% bonus on all loads", "Dedicated account manager", "Instant QuickPay", "Annual awards eligibility"] },
    { name: "GOLD", min: 95, bonus: 1.5, perks: ["Early load access", "1.5% bonus on loads", "Reduced QuickPay fees", "Priority support"] },
    { name: "SILVER", min: 90, bonus: 0, perks: ["Standard load access", "Loyalty recognition", "Standard QuickPay rates"] },
    { name: "BRONZE", min: 0, bonus: 0, perks: ["Standard load access", "QuickPay available"] },
  ];

  const currentTierInfo = tiers.find(t => t.name === currentTier) || tiers[3];
  const nextTierIdx = tiers.findIndex(t => t.name === currentTier) - 1;
  const nextTier = nextTierIdx >= 0 ? tiers[nextTierIdx] : null;

  // Calculate total bonuses earned
  const totalBonusEarned = profile.bonuses.reduce((sum, b) => sum + b.amount, 0);
  const pendingBonuses = profile.bonuses.filter(b => b.status === "PENDING").reduce((sum, b) => sum + b.amount, 0);

  res.json({
    tier: currentTier,
    score: currentScore,
    totalLoads: profile.cppTotalLoads,
    totalMiles: profile.cppTotalMiles,
    joinedDate: profile.cppJoinedDate,
    bonusPercentage: getBonusPercentage(currentTier as any),
    totalBonusEarned,
    pendingBonuses,
    currentTierInfo,
    nextTier: nextTier ? {
      name: nextTier.name,
      minScore: nextTier.min,
      pointsNeeded: Math.max(0, nextTier.min - currentScore),
      perks: nextTier.perks,
    } : null,
    scorecards: profile.scorecards,
    recentBonuses: profile.bonuses.slice(0, 5),
    allTiers: tiers,
  });
});

// POST /api/cpp/recalculate — Admin: recalculate all carrier tiers
router.post("/recalculate", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    include: {
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
      user: { select: { id: true } },
    },
  });

  let updated = 0;
  for (const carrier of carriers) {
    const latestScore = carrier.scorecards[0];
    if (!latestScore) continue;

    const newTier = calculateTier(latestScore.overallScore);
    const oldTier = carrier.cppTier !== "NONE" ? carrier.cppTier : carrier.tier;

    if (newTier !== oldTier) {
      await prisma.carrierProfile.update({
        where: { id: carrier.id },
        data: { tier: newTier, cppTier: newTier },
      });

      // Notify carrier of tier change
      await prisma.notification.create({
        data: {
          userId: carrier.user.id,
          type: "GENERAL",
          title: "CPP Tier Updated",
          message: `Your CPP tier has changed from ${oldTier} to ${newTier}.`,
          actionUrl: "/carrier/dashboard.html",
        },
      });

      updated++;
    }
  }

  res.json({ totalCarriers: carriers.length, tiersUpdated: updated });
});

// GET /api/cpp/leaderboard — Top carriers by score (employee view)
router.get("/leaderboard", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    include: {
      user: { select: { firstName: true, lastName: true, company: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
    orderBy: { cppTotalLoads: "desc" },
    take: limit,
  });

  const leaderboard = carriers.map((c, idx) => ({
    rank: idx + 1,
    company: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
    tier: c.cppTier !== "NONE" ? c.cppTier : c.tier,
    score: c.scorecards[0]?.overallScore || 0,
    totalLoads: c.cppTotalLoads,
    totalMiles: c.cppTotalMiles,
    bonusPercentage: getBonusPercentage(c.tier),
  }));

  res.json({ leaderboard });
});

export default router;
