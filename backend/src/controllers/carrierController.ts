import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthRequest } from "../middleware/auth";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { calculateTier, getBonusPercentage } from "../services/tierService";

export async function registerCarrier(req: Request, res: Response) {
  const data = carrierRegisterSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      phone: data.phone,
      role: "CARRIER",
      carrierProfile: {
        create: {
          mcNumber: data.mcNumber,
          dotNumber: data.dotNumber,
          equipmentTypes: data.equipmentTypes,
          operatingRegions: data.operatingRegions,
          onboardingStatus: "PENDING",
        },
      },
    },
    include: { carrierProfile: true },
  });

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  res.status(201).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    carrierProfile: user.carrierProfile,
    token,
  });
}

export async function uploadCarrierDocuments(req: AuthRequest, res: Response) {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const documents = await Promise.all(
    files.map((file) =>
      prisma.document.create({
        data: {
          fileName: file.originalname,
          fileUrl: `/uploads/${file.filename}`,
          fileType: file.mimetype,
          fileSize: file.size,
          userId: req.user!.id,
        },
      })
    )
  );

  const updateData: Record<string, boolean | string> = {};
  for (const file of files) {
    const name = file.originalname.toLowerCase();
    if (name.includes("w9")) updateData.w9Uploaded = true;
    if (name.includes("insurance") || name.includes("cert")) updateData.insuranceCertUploaded = true;
    if (name.includes("authority")) updateData.authorityDocUploaded = true;
  }

  if (Object.keys(updateData).length > 0) {
    updateData.onboardingStatus = "DOCUMENTS_SUBMITTED";
    await prisma.carrierProfile.update({ where: { id: profile.id }, data: updateData });
  }

  res.status(201).json(documents);
}

export async function getOnboardingStatus(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: {
      onboardingStatus: true,
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      tier: true,
      approvedAt: true,
    },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  res.json(profile);
}

export async function verifyCarrier(req: AuthRequest, res: Response) {
  const { status, safetyScore } = verifyCarrierSchema.parse(req.body);
  const profile = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const updated = await prisma.carrierProfile.update({
    where: { id: req.params.id },
    data: {
      onboardingStatus: status,
      safetyScore: safetyScore ?? null,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });

  if (status === "APPROVED") {
    await prisma.user.update({
      where: { id: profile.userId },
      data: { isVerified: true },
    });

    await prisma.notification.create({
      data: {
        userId: profile.userId,
        type: "ONBOARDING",
        title: "Application Approved",
        message: "Your carrier application has been approved. Welcome to Silk Route!",
        actionUrl: "/dashboard/overview",
      },
    });
  }

  res.json(updated);
}

export async function getDashboard(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
      bonuses: { where: { status: "PENDING" } },
    },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const [activeLoads, weeklyRevenue, monthlyRevenue, recentNotifications] = await Promise.all([
    prisma.load.count({ where: { carrierId: req.user!.id, status: { in: ["BOOKED", "IN_TRANSIT"] } } }),
    prisma.invoice.aggregate({
      where: {
        userId: req.user!.id,
        status: { in: ["FUNDED", "PAID"] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        userId: req.user!.id,
        status: { in: ["FUNDED", "PAID"] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { amount: true },
    }),
    prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const latestScore = profile.scorecards[0];

  res.json({
    carrier: {
      tier: profile.tier,
      onboardingStatus: profile.onboardingStatus,
      equipmentTypes: profile.equipmentTypes,
      operatingRegions: profile.operatingRegions,
    },
    stats: {
      activeLoads,
      weeklyRevenue: weeklyRevenue._sum.amount || 0,
      monthlyRevenue: monthlyRevenue._sum.amount || 0,
      currentScore: latestScore?.overallScore || 0,
    },
    pendingBonuses: profile.bonuses.reduce((sum, b) => sum + b.amount, 0),
    recentNotifications,
  });
}

export async function getScorecard(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const scorecards = await prisma.carrierScorecard.findMany({
    where: { carrierId: profile.id },
    orderBy: { calculatedAt: "desc" },
    take: 12,
  });

  const currentTier = profile.tier;
  const currentScore = scorecards[0]?.overallScore || 0;
  const nextTierThreshold =
    currentTier === "BRONZE" ? 90 : currentTier === "SILVER" ? 95 : currentTier === "GOLD" ? 98 : 100;
  const bonusPct = getBonusPercentage(currentTier);

  res.json({
    currentTier,
    currentScore,
    nextTierThreshold,
    bonusPercentage: bonusPct,
    pointsToNextTier: Math.max(0, nextTierThreshold - currentScore),
    scorecards,
  });
}

export async function getRevenue(req: AuthRequest, res: Response) {
  const period = (req.query.period as string) || "monthly";
  const now = new Date();
  let since: Date;

  if (period === "weekly") since = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  else if (period === "ytd") since = new Date(now.getFullYear(), 0, 1);
  else since = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);

  const invoices = await prisma.invoice.findMany({
    where: { userId: req.user!.id, createdAt: { gte: since } },
    include: { load: { select: { originCity: true, originState: true, destCity: true, destState: true } } },
    orderBy: { createdAt: "desc" },
  });

  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  const bonuses = profile
    ? await prisma.carrierBonus.findMany({
        where: { carrierId: profile.id, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
  const avgPerLoad = invoices.length > 0 ? totalRevenue / invoices.length : 0;

  res.json({
    period,
    totalRevenue,
    totalBonuses,
    avgPerLoad,
    loadCount: invoices.length,
    invoices,
    bonuses,
  });
}

export async function getBonuses(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const bonuses = await prisma.carrierBonus.findMany({
    where: { carrierId: profile.id },
    orderBy: { createdAt: "desc" },
  });

  res.json(bonuses);
}
