import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import multer from "multer";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthRequest } from "../middleware/auth";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { calculateTier, getBonusPercentage } from "../services/tierService";
import { onCarrierApproved } from "../services/integrationService";
import { uploadFile } from "../services/storageService";
import { runFmcsaScan } from "../services/complianceMonitorService";
import { vetAndStoreReport } from "../services/carrierVettingService";
import { sendEmail, wrap } from "../services/emailService";
import { runIdentityCheck } from "../services/identityVerificationService";
import { screenCarrier } from "../services/ofacScreeningService";

export async function registerCarrier(req: Request, res: Response) {
  try {
  const data = carrierRegisterSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  // Check for existing DOT/MC before attempting create
  if (data.dotNumber) {
    const existingDot = await prisma.carrierProfile.findUnique({ where: { dotNumber: data.dotNumber } });
    if (existingDot) {
      res.status(409).json({ error: `DOT number ${data.dotNumber} is already registered with another carrier` });
      return;
    }
  }
  if (data.mcNumber) {
    const existingMc = await prisma.carrierProfile.findUnique({ where: { mcNumber: data.mcNumber } });
    if (existingMc) {
      res.status(409).json({ error: `MC number ${data.mcNumber} is already registered with another carrier` });
      return;
    }
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

  // Handle file uploads (photoId, articlesOfInc) if present
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files && user.carrierProfile) {
    const profileId = user.carrierProfile.id;
    const uploadPromises: Promise<void>[] = [];

    if (files.photoId?.[0]) {
      const file = files.photoId[0];
      const key = `carrier-docs/${profileId}/photo-id-${Date.now()}${path.extname(file.originalname)}`;
      uploadPromises.push(
        uploadFile(file.buffer, key, file.mimetype).then(async (url) => {
          await prisma.document.create({
            data: { fileName: file.originalname, fileUrl: url, fileType: file.mimetype, fileSize: file.size, userId: user.id },
          });
        })
      );
    }

    if (files.articlesOfInc?.[0]) {
      const file = files.articlesOfInc[0];
      const key = `carrier-docs/${profileId}/articles-${Date.now()}${path.extname(file.originalname)}`;
      uploadPromises.push(
        uploadFile(file.buffer, key, file.mimetype).then(async (url) => {
          await prisma.document.create({
            data: { fileName: file.originalname, fileUrl: url, fileType: file.mimetype, fileSize: file.size, userId: user.id },
          });
          await prisma.carrierProfile.update({ where: { id: profileId }, data: { authorityDocUploaded: true } });
        })
      );
    }

    // Fire and forget — don't block response
    Promise.all(uploadPromises).catch((e) => console.error("[Registration Files] Upload error:", e.message));
  }

  // No JWT issued at registration — carrier must be approved first
  res.status(201).json({
    message: "Carrier application submitted successfully. Your application is under review.",
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    carrierProfile: user.carrierProfile,
  });

  // ── Post-registration automation (fire-and-forget) ──
  const profileId = user.carrierProfile?.id;
  const dot = data.dotNumber;
  const mc = data.mcNumber;

  // 1. Send registration confirmation email
  sendEmail(
    data.email,
    "Application Received — Silk Route Logistics",
    wrap(`
      <h2 style="color:#0f172a">Welcome, ${data.firstName}!</h2>
      <p>Thank you for registering with <strong>Silk Route Logistics</strong>. Your carrier application has been received.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Company</td><td style="padding:8px;border:1px solid #e2e8f0">${data.company}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">DOT#</td><td style="padding:8px;border:1px solid #e2e8f0">${dot}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">MC#</td><td style="padding:8px;border:1px solid #e2e8f0">${mc}</td></tr>
      </table>
      <h3 style="color:#0f172a">What Happens Next?</h3>
      <ol style="line-height:1.8">
        <li>Our <strong>Compass</strong> compliance engine will automatically vet your FMCSA authority, safety record, and OFAC status.</li>
        <li>A team member will review your application and may request additional documents.</li>
        <li>Once approved, you'll receive an email with instructions to log in.</li>
      </ol>
      <p style="color:#64748b;font-size:13px;margin-top:24px">Typical review time: 1-2 business days. For urgent inquiries, contact <a href="mailto:operations@silkroutelogistics.ai">operations@silkroutelogistics.ai</a>.</p>
    `)
  ).catch((e) => console.error("[Registration Email] Error:", e.message));

  // 2. Auto-trigger Compass vetting (background)
  if (dot) {
    vetAndStoreReport(dot, profileId, mc, "AUTO_REGISTRATION").catch((e) =>
      console.error("[Compass Auto-Vet] Registration vetting error:", e.message)
    );
  }

  // 3. Auto-trigger identity verification (background)
  if (profileId) {
    runIdentityCheck(profileId).catch((e) =>
      console.error("[Compass Identity] Auto identity check error:", e.message)
    );
  }

  // 4. Auto-trigger OFAC screening (background)
  if (profileId) {
    screenCarrier(profileId).catch((e) =>
      console.error("[Compass OFAC] Auto OFAC screening error:", e.message)
    );
  }
  } catch (err: unknown) {
    console.error("[Carrier Registration] Error:", err);
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message.includes("Unique constraint")) {
      res.status(409).json({ error: "A carrier with this email, DOT, or MC number is already registered" });
    } else {
      res.status(500).json({ error: message });
    }
  }
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
    files.map(async (file) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      const key = `carrier-docs/${uniqueSuffix}${ext}`;
      const fileUrl = await uploadFile(file.buffer, key, file.mimetype);

      return prisma.document.create({
        data: {
          fileName: file.originalname,
          fileUrl,
          fileType: file.mimetype,
          fileSize: file.size,
          userId: req.user!.id,
        },
      });
    })
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

    // Integration: create initial CPP scorecard + GUEST tier
    onCarrierApproved(profile.id).catch((e) => console.error("[Integration] onCarrierApproved error:", e.message));

    // Auto-trigger FMCSA scan to populate compliance data
    runFmcsaScan(profile.id).catch((e) => console.error("[Compliance] Auto FMCSA scan error:", e.message));

    // Send approval email to carrier
    const carrierUser = await prisma.user.findUnique({ where: { id: profile.userId } });
    if (carrierUser) {
      sendEmail(
        carrierUser.email,
        "Application Approved — Welcome to Silk Route Logistics!",
        wrap(`
          <h2 style="color:#0f172a">Congratulations, ${carrierUser.firstName}!</h2>
          <p>Your carrier application has been <strong style="color:#16a34a">approved</strong>. You can now log in to the Silk Route Logistics carrier portal.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://silkroutelogistics.ai/carrier/login.html" style="display:inline-block;background:#d4a574;color:#0f172a;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Log In to Your Dashboard</a>
          </div>
          <h3 style="color:#0f172a">Getting Started</h3>
          <ul style="line-height:1.8">
            <li>Upload your W-9, Certificate of Insurance, and Operating Authority documents</li>
            <li>Set up two-factor authentication for account security</li>
            <li>Browse available loads on the load board</li>
          </ul>
          <p style="color:#64748b;font-size:13px;margin-top:24px">Questions? Contact your account representative or email <a href="mailto:operations@silkroutelogistics.ai">operations@silkroutelogistics.ai</a>.</p>
        `)
      ).catch((e) => console.error("[Approval Email] Error:", e.message));
    }
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
  const includeDeleted = req.query.include_deleted === "true";
  const where = includeDeleted ? {} : { deletedAt: null };

  const carriers = await prisma.carrierProfile.findMany({
    where,
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
        lastVettingScore: c.lastVettingScore,
        lastVettingRisk: c.lastVettingRisk,
        lastVettedAt: c.lastVettedAt,
        createdAt: c.createdAt,
      };
    })
  );

  res.json({ carriers: results, total: results.length });
}

/** Get single carrier detail */
export async function getCarrierDetail(req: AuthRequest, res: Response) {
  const carrier = await prisma.carrierProfile.findFirst({
    where: { id: req.params.id, deletedAt: null },
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
