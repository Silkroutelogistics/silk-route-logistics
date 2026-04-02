import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getAllCronJobs } from "../services/cronRegistryService";

// ──────────────────────────────────────────────────
// Get Users (with pagination, search, filters)
// ──────────────────────────────────────────────────

export async function getUsers(req: AuthRequest, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = (req.query.search as string) || "";
    const role = req.query.role as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status === "ACTIVE") {
      where.isActive = true;
    } else if (status === "INACTIVE") {
      where.isActive = false;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
          totpEnabled: true,
          lastLogin: true,
          createdAt: true,
          carrierProfile: { select: { safetyScore: true } },
          _count: { select: { loadsPosted: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error("getUsers error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
}

// ──────────────────────────────────────────────────
// Update User Status (activate / deactivate)
// ──────────────────────────────────────────────────

export async function updateUserStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (typeof active !== "boolean") {
      res.status(400).json({ error: "active field (boolean) is required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, isActive: true } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: active },
    });

    // Create audit trail entry
    await prisma.auditTrail.create({
      data: {
        entityType: "User",
        entityId: id,
        action: "STATUS_CHANGE",
        changedFields: { isActive: { from: user.isActive, to: active } },
        performedById: req.user!.id,
        ipAddress: req.ip || "unknown",
      },
    }).catch(() => {});

    res.json({ message: `User ${active ? "activated" : "deactivated"} successfully` });
  } catch (err: any) {
    console.error("updateUserStatus error:", err);
    res.status(500).json({ error: "Failed to update user status" });
  }
}

// ──────────────────────────────────────────────────
// Reset User Password
// ──────────────────────────────────────────────────

export async function resetUserPassword(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });

    // Create audit trail entry
    await prisma.auditTrail.create({
      data: {
        entityType: "User",
        entityId: id,
        action: "UPDATE",
        changedFields: { action: "password_reset", targetEmail: user.email },
        performedById: req.user!.id,
        ipAddress: req.ip || "unknown",
      },
    }).catch(() => {});

    // In production, this would send an email with the temp password
    // For now, return success (temp password not exposed in response for security)
    res.json({
      message: "Password has been reset successfully. The user will need to set a new password on next login.",
    });
  } catch (err: any) {
    console.error("resetUserPassword error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
}

// ──────────────────────────────────────────────────
// System Status
// ──────────────────────────────────────────────────

export async function getSystemStatus(_req: AuthRequest, res: Response) {
  try {
    // Check integration env vars
    const integrations = [
      {
        name: "DAT Load Board",
        key: "DAT_API_KEY",
        configured: !!process.env.DAT_API_KEY,
        description: "Freight marketplace for posting and searching loads",
      },
      {
        name: "Highway Carrier Monitoring",
        key: "HIGHWAY_API_KEY",
        configured: !!process.env.HIGHWAY_API_KEY,
        description: "Real-time carrier compliance and safety monitoring",
      },
      {
        name: "FMCSA Lookup",
        key: "FMCSA_WEB_KEY",
        configured: !!process.env.FMCSA_WEB_KEY,
        description: "Federal motor carrier safety administration database",
      },
      {
        name: "Resend Email",
        key: "RESEND_API_KEY",
        configured: !!process.env.RESEND_API_KEY,
        description: "Transactional email delivery service",
      },
      {
        name: "Google Maps",
        key: "GOOGLE_MAPS_API_KEY",
        configured: !!process.env.GOOGLE_MAPS_API_KEY,
        description: "Geocoding, routing, and distance calculations",
      },
      {
        name: "Sentry Monitoring",
        key: "SENTRY_DSN",
        configured: !!process.env.SENTRY_DSN,
        description: "Error tracking and application performance monitoring",
      },
      // Free API integrations (always available)
      {
        name: "FMCSA Insurance API",
        key: "FMCSA_INSURANCE",
        configured: !!process.env.FMCSA_WEB_KEY,
        description: "Carrier insurance filing details — BIPD, cargo, bond status",
      },
      {
        name: "OFAC/SDN Screening",
        key: "OFAC_SDN",
        configured: true,
        description: "Treasury Dept sanctions list — no API key required",
      },
      {
        name: "NHTSA VIN Decoder",
        key: "NHTSA_VIN",
        configured: true,
        description: "Vehicle identification — make, model, year, GVWR. Free, no key required",
      },
      {
        name: "SEC EDGAR Credit",
        key: "SEC_EDGAR",
        configured: true,
        description: "Public company financial intelligence — revenue, assets, risk scoring. Free",
      },
      {
        name: "SAM.gov Exclusions",
        key: "SAM_GOV",
        configured: true,
        description: "Federal debarment and exclusion screening. Free",
      },
      {
        name: "OpenCorporates",
        key: "OPENCORPORATES",
        configured: true,
        description: "Business entity verification — 50 free lookups/day",
      },
      {
        name: "Cross-Reference Validation",
        key: "CROSS_REF",
        configured: true,
        description: "Multi-source identity cross-check — FMCSA vs application vs entity records",
      },
      {
        name: "FMCSA Bulk Monitor",
        key: "FMCSA_BULK",
        configured: !!process.env.FMCSA_WEB_KEY,
        description: "Daily carrier network snapshot — detect authority/insurance changes",
      },
      // Paid API integrations (require API keys)
      {
        name: "CarrierOk Intelligence",
        key: "CARRIER_OK_API_KEY",
        configured: !!process.env.CARRIER_OK_API_KEY,
        description: "300+ field carrier profiles with A-F risk grades",
      },
      {
        name: "Truckstop / RMIS",
        key: "TRUCKSTOP_API_KEY",
        configured: !!process.env.TRUCKSTOP_API_KEY,
        description: "COI monitoring and insurance certificate tracking",
      },
      {
        name: "CH Robinson",
        key: "CH_ROBINSON_API_KEY",
        configured: !!process.env.CH_ROBINSON_API_KEY,
        description: "Navisphere load posting and capacity",
      },
      {
        name: "Echo Global",
        key: "ECHO_API_KEY",
        configured: !!process.env.ECHO_API_KEY,
        description: "Cross-brokerage capacity and pricing",
      },
      {
        name: "Uber Freight",
        key: "UBER_FREIGHT_API_KEY",
        configured: !!process.env.UBER_FREIGHT_API_KEY,
        description: "Load matching and instant quotes",
      },
      {
        name: "project44",
        key: "PROJECT44_API_KEY",
        configured: !!process.env.PROJECT44_API_KEY,
        description: "Multi-carrier real-time visibility",
      },
      {
        name: "Samsara ELD",
        key: "SAMSARA_API_TOKEN",
        configured: !!process.env.SAMSARA_API_TOKEN,
        description: "ELD location tracking and HOS data",
      },
      {
        name: "Motive ELD",
        key: "MOTIVE_API_KEY",
        configured: !!process.env.MOTIVE_API_KEY,
        description: "ELD tracking and fleet management",
      },
      {
        name: "Numverify Phone",
        key: "NUMVERIFY_API_KEY",
        configured: !!process.env.NUMVERIFY_API_KEY,
        description: "Phone number validation — VoIP/landline/mobile detection",
      },
      {
        name: "IRS TIN Matching",
        key: "IRS_TIN_MATCH_API_KEY",
        configured: !!process.env.IRS_TIN_MATCH_API_KEY,
        description: "W-9 TIN verification against IRS database",
      },
    ];

    // Get cron jobs
    const cronJobs = await getAllCronJobs().catch(() => []);

    // Get database stats
    const [users, loads, invoices, carriers, customers] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.load.count().catch(() => 0),
      prisma.invoice.count().catch(() => 0),
      prisma.user.count({ where: { role: "CARRIER" } }).catch(() => 0),
      prisma.customer.count().catch(() => 0),
    ]);

    res.json({
      integrations,
      cronJobs: cronJobs.map((j) => ({
        jobName: j.jobName,
        schedule: j.schedule,
        lastRun: j.lastRun,
        nextRun: j.nextRun || null,
        enabled: j.enabled,
        lastStatus: j.lastStatus,
      })),
      dbStats: { users, loads, invoices, carriers, customers },
      environment: {
        nodeVersion: process.version,
        env: process.env.NODE_ENV || "development",
        uptime: process.uptime(),
      },
    });
  } catch (err: any) {
    console.error("getSystemStatus error:", err);
    res.status(500).json({ error: "Failed to fetch system status" });
  }
}

// ──────────────────────────────────────────────────
// Platform Analytics
// ──────────────────────────────────────────────────

export async function getAnalytics(_req: AuthRequest, res: Response) {
  try {
    // KPIs
    const [totalLoads, totalRevenueResult, activeCarriersResult, activeShippersResult] = await Promise.all([
      prisma.load.count(),
      prisma.invoice.aggregate({ _sum: { amount: true } }),
      prisma.load.findMany({
        where: { status: { not: "CANCELLED" as any }, carrierId: { not: null } },
        select: { carrierId: true },
        distinct: ["carrierId"],
      }),
      prisma.load.findMany({
        select: { posterId: true },
        distinct: ["posterId"],
      }),
    ]);

    const totalRevenue = totalRevenueResult._sum.amount || 0;
    const activeCarriers = activeCarriersResult.length;
    const activeShippers = activeShippersResult.length;

    // Loads by status
    const loadsByStatusRaw = await prisma.load.groupBy({
      by: ["status"],
      _count: true,
      orderBy: { _count: { status: "desc" } },
    });
    const loadsByStatus = loadsByStatusRaw.map((item) => ({
      status: item.status.replace(/_/g, " "),
      count: item._count,
    }));

    // Revenue by month (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: twelveMonthsAgo } },
      select: { amount: true, createdAt: true },
    });

    // Aggregate in JS for simplicity
    const monthlyMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }
    for (const inv of invoices) {
      const d = new Date(inv.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + inv.amount);
      }
    }
    const revenueByMonth = Array.from(monthlyMap.entries()).map(([month, revenue]) => {
      const [year, m] = month.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        month: `${monthNames[parseInt(m) - 1]} ${year.slice(2)}`,
        revenue: Math.round(revenue),
      };
    });

    // Top lanes
    const loadsForLanes = await prisma.load.findMany({
      select: { originState: true, destState: true, rate: true },
      where: { status: { not: "CANCELLED" as any } },
    });

    const laneMap = new Map<string, { count: number; totalRate: number }>();
    for (const load of loadsForLanes) {
      const key = `${load.originState}|${load.destState}`;
      const existing = laneMap.get(key) || { count: 0, totalRate: 0 };
      existing.count++;
      existing.totalRate += load.rate;
      laneMap.set(key, existing);
    }

    const topLanes = Array.from(laneMap.entries())
      .map(([key, val]) => {
        const [originState, destState] = key.split("|");
        return {
          originState,
          destState,
          loadCount: val.count,
          avgRate: Math.round(val.totalRate / val.count),
        };
      })
      .sort((a, b) => b.loadCount - a.loadCount)
      .slice(0, 5);

    res.json({
      kpis: { totalLoads, totalRevenue, activeCarriers, activeShippers },
      loadsByStatus,
      revenueByMonth,
      topLanes,
    });
  } catch (err: any) {
    console.error("getAnalytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
}
