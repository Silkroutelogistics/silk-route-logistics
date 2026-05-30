import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { getBonusPercentage, calculateOverallScore } from "../services/tierService";
import { checkMilestoneAdvancement, calculateTierFromMilestone } from "../services/caravanService";

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

  // Caravan Partner Program 3-tier thresholds (v3.7.a)
  const tiers = [
    { name: "PLATINUM", min: 95, bonus: 3, perks: ["Net-14 payment terms", "1% / 3% (same-day) Quick Pay", "$300/mo safety bonus", "Priority freight access", "$75/hr detention after 1.5hr"] },
    { name: "GOLD",     min: 90, bonus: 1.5, perks: ["Net-21 payment terms", "2% / 4% (same-day) Quick Pay", "$150/mo safety bonus", "$65/hr detention after 2hr"] },
    { name: "SILVER",   min: 0,  bonus: 0, perks: ["Net-30 payment terms", "3% / 5% (same-day) Quick Pay", "$50/hr detention after 2hr", "Day-1 entry tier"] },
  ];

  const currentTierInfo = tiers.find(t => t.name === currentTier) || tiers[2];
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

// POST /api/cpp/recalculate — Admin: run the canonical milestone-gate
// advancement check across all APPROVED carriers. Replaces the legacy
// score-based bulk-sync with the locked loads-and-days gate per
// caravanService.checkMilestoneAdvancement. Tier is derived from the
// advanced-to milestone (Silver/Gold/Platinum + Founding recognition).
router.post("/recalculate", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const carriers = await prisma.carrierProfile.findMany({
    // v3.8.alm §13.3 Item 189 — exclude test carriers from milestone recalc.
    where: { onboardingStatus: "APPROVED", isTestAccount: false },
    select: { id: true, tier: true, cppTier: true, milestone: true, userId: true, user: { select: { id: true } } },
  });

  let updated = 0;
  for (const carrier of carriers) {
    const result = await checkMilestoneAdvancement(carrier.id);
    if (!result.advanced || !result.newMilestone) continue;

    const newTier = calculateTierFromMilestone(result.newMilestone);
    const oldTier = carrier.cppTier !== "NONE" ? carrier.cppTier : carrier.tier;

    if (newTier !== oldTier) {
      await prisma.carrierProfile.update({
        where: { id: carrier.id },
        data: { tier: newTier, cppTier: newTier },
      });

      await prisma.notification.create({
        data: {
          userId: carrier.user.id,
          type: "GENERAL",
          title: "Caravan Partner Program — Tier Advancement",
          message: `Congratulations! You've advanced to ${newTier} tier by meeting the locked loads-and-days gate.`,
          actionUrl: "/carrier/dashboard",
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
    // v3.8.alm §13.3 Item 189 — exclude test carriers from the leaderboard.
    where: { onboardingStatus: "APPROVED", isTestAccount: false },
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
