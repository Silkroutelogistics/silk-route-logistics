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

  const passwordHash = await bcrypt.hash(data.password, 12);
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

export async function getCarrierScore(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
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
    carrierId: profile.id,
    companyName: profile.companyName,
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

/** Setup carrier profile for admin user (for carrier view) */
export async function setupAdminCarrierProfile(req: AuthRequest, res: Response) {
  const { mcNumber, dotNumber, equipmentTypes, operatingRegions, address, city, state, zip, numberOfTrucks, company } = req.body;

  // Check if profile already exists
  const existing = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (existing) {
    // Update existing profile
    const updated = await prisma.carrierProfile.update({
      where: { id: existing.id },
      data: {
        ...(mcNumber && { mcNumber }),
        ...(dotNumber && { dotNumber }),
        ...(equipmentTypes && { equipmentTypes }),
        ...(operatingRegions && { operatingRegions }),
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(zip && { zip }),
        ...(numberOfTrucks && { numberOfTrucks: parseInt(numberOfTrucks) }),
        onboardingStatus: "APPROVED",
        approvedAt: existing.approvedAt || new Date(),
        w9Uploaded: true,
        insuranceCertUploaded: true,
        authorityDocUploaded: true,
      },
    });
    res.json(updated);
    return;
  }

  // Update company name on user if provided
  if (company) {
    await prisma.user.update({ where: { id: req.user!.id }, data: { company } });
  }

  const profile = await prisma.carrierProfile.create({
    data: {
      userId: req.user!.id,
      mcNumber: mcNumber || "",
      dotNumber: dotNumber || "",
      equipmentTypes: equipmentTypes || [],
      operatingRegions: operatingRegions || [],
      address: address || "",
      city: city || "",
      state: state || "",
      zip: zip || "",
      numberOfTrucks: numberOfTrucks ? parseInt(numberOfTrucks) : 1,
      onboardingStatus: "APPROVED",
      approvedAt: new Date(),
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      safetyScore: 100,
      tier: "PLATINUM",
    },
  });

  res.status(201).json(profile);
}

/** Get all carriers with performance data for admin/broker view */
export async function getAllCarriers(req: AuthRequest, res: Response) {
  const carriers = await prisma.carrierProfile.findMany({
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, company: true, phone: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
      tenders: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const results = await Promise.all(
    carriers.map(async (c) => {
      const completedLoads = await prisma.load.count({
        where: { carrierId: c.userId, status: { in: ["DELIVERED", "COMPLETED"] } },
      });
      const activeLoads = await prisma.load.count({
        where: { carrierId: c.userId, status: { in: ["BOOKED", "IN_TRANSIT", "PICKED_UP"] } },
      });
      const totalRevenue = await prisma.invoice.aggregate({
        where: { userId: c.userId, status: { in: ["FUNDED", "PAID"] } },
        _sum: { amount: true },
      });
      const latestScorecard = c.scorecards[0] || null;
      const tendersAccepted = c.tenders.filter((t) => t.status === "ACCEPTED").length;
      const tendersDeclined = c.tenders.filter((t) => t.status === "DECLINED").length;
      const tendersTotal = c.tenders.length;

      return {
        id: c.id,
        userId: c.userId,
        company: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
        contactName: `${c.user.firstName} ${c.user.lastName}`,
        email: c.user.email,
        phone: c.user.phone,
        mcNumber: c.mcNumber,
        dotNumber: c.dotNumber,
        tier: c.tier,
        equipmentTypes: c.equipmentTypes,
        operatingRegions: c.operatingRegions,
        safetyScore: c.safetyScore,
        numberOfTrucks: c.numberOfTrucks,
        onboardingStatus: c.onboardingStatus,
        insuranceExpiry: c.insuranceExpiry,
        w9Uploaded: c.w9Uploaded,
        insuranceCertUploaded: c.insuranceCertUploaded,
        authorityDocUploaded: c.authorityDocUploaded,
        approvedAt: c.approvedAt,
        address: c.address,
        city: c.city,
        state: c.state,
        zip: c.zip,
        completedLoads,
        activeLoads,
        totalRevenue: totalRevenue._sum.amount || 0,
        tendersAccepted,
        tendersDeclined,
        tendersTotal,
        acceptanceRate: tendersTotal > 0 ? Math.round((tendersAccepted / tendersTotal) * 100) : 0,
        performance: latestScorecard
          ? {
              overallScore: latestScorecard.overallScore,
              onTimePickup: latestScorecard.onTimePickupPct,
              onTimeDelivery: latestScorecard.onTimeDeliveryPct,
              communication: latestScorecard.communicationScore,
              claimRatio: latestScorecard.claimRatio,
              docTimeliness: latestScorecard.documentSubmissionTimeliness,
            }
          : null,
        createdAt: c.createdAt,
      };
    })
  );

  res.json({ carriers: results, total: results.length });
}

/** Get single carrier detail */
export async function getCarrierDetail(req: AuthRequest, res: Response) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, company: true, phone: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 6 },
      tenders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, rate: true } } },
      },
    },
  });

  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const loads = await prisma.load.findMany({
    where: { carrierId: carrier.userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, referenceNumber: true, originCity: true, originState: true,
      destCity: true, destState: true, rate: true, status: true, pickupDate: true, deliveryDate: true,
    },
  });

  res.json({ carrier, loads });
}

/** Update carrier profile (admin) */
export async function updateCarrier(req: AuthRequest, res: Response) {
  const { safetyScore, tier, numberOfTrucks, insuranceExpiry, onboardingStatus } = req.body;
  const data: Record<string, unknown> = {};
  if (safetyScore !== undefined) data.safetyScore = parseFloat(safetyScore);
  if (tier !== undefined) data.tier = tier;
  if (numberOfTrucks !== undefined) data.numberOfTrucks = parseInt(numberOfTrucks);
  if (insuranceExpiry !== undefined) data.insuranceExpiry = new Date(insuranceExpiry);
  if (onboardingStatus !== undefined) data.onboardingStatus = onboardingStatus;

  const updated = await prisma.carrierProfile.update({
    where: { id: req.params.id },
    data,
  });

  res.json(updated);
}
