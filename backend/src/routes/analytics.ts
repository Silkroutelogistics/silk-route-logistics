import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import * as ctrl from "../controllers/analyticsController";
import { getTopLanes, getLaneDetail, getLaneHeatmap, getMarginAnalysis } from "../services/laneAnalyticsService";
import { prisma } from "../config/database";

const router = Router();

// All analytics endpoints require authentication
router.use(authenticate as any);

// Revenue & Margin — AE, Accounting, Admin
router.get("/revenue", ctrl.getRevenue as any);

// Load Volume
router.get("/loads", ctrl.getLoads as any);

// On-Time Performance
router.get("/on-time", ctrl.getOnTime as any);

// Lane Profitability (existing)
router.get("/lanes", ctrl.getLanes as any);

// ─── Lane Analytics (Advanced) ───────────────────────────────────────

// Lane heatmap (must be before /:origin/:dest to avoid matching)
router.get("/lane-heatmap", authorize("ADMIN", "CEO", "BROKER") as any, async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getLaneHeatmap();
    res.json(data);
  } catch (err) {
    console.error("[Analytics] Lane heatmap error:", err);
    res.status(500).json({ error: "Failed to fetch lane heatmap data" });
  }
});

// Margin analysis
router.get("/margins", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || "30d";
    const data = await getMarginAnalysis(period);
    res.json(data);
  } catch (err) {
    console.error("[Analytics] Margin analysis error:", err);
    res.status(500).json({ error: "Failed to fetch margin analysis" });
  }
});

// Lane rate quick-stats — lightweight endpoint for load creation/pricing
router.get("/lane-rate/:origin/:dest", async (req: AuthRequest, res: Response) => {
  try {
    const origin = req.params.origin.toUpperCase();
    const dest = req.params.dest.toUpperCase();
    const equipment = (req.query.equipment as string) || "";
    const laneKey = `${origin}:${dest}`;

    // Try RateIntelligence table first (pre-computed)
    const ri = await prisma.rateIntelligence.findFirst({
      where: {
        laneKey,
        ...(equipment ? { equipmentType: { contains: equipment, mode: "insensitive" as any } } : {}),
      },
      orderBy: { lastTrainedAt: "desc" },
    });

    if (ri) {
      res.json({
        lane: `${origin} → ${dest}`,
        avgRate: ri.avgRate,
        minRate: ri.minRate,
        maxRate: ri.maxRate,
        medianRate: ri.medianRate,
        sampleSize: ri.sampleSize,
        trend: ri.trend,
        trendPct: ri.trendPct,
        predictedRate: ri.predictedRate,
        equipmentType: ri.equipmentType,
        lastUpdated: ri.lastTrainedAt,
      });
      return;
    }

    // Fallback: aggregate from recent loads (90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const loads = await prisma.load.findMany({
      where: {
        originState: origin,
        destState: dest,
        deletedAt: null,
        rate: { gt: 0 },
        createdAt: { gte: ninetyDaysAgo },
        ...(equipment ? { equipmentType: { contains: equipment, mode: "insensitive" as any } } : {}),
      },
      select: { rate: true },
    });

    if (loads.length === 0) {
      res.json({ lane: `${origin} → ${dest}`, sampleSize: 0 });
      return;
    }

    const rates = loads.map((l) => l.rate).sort((a, b) => a - b);
    const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
    res.json({
      lane: `${origin} → ${dest}`,
      avgRate: Math.round(avg),
      minRate: rates[0],
      maxRate: rates[rates.length - 1],
      medianRate: rates[Math.floor(rates.length / 2)],
      sampleSize: rates.length,
      trend: "UNKNOWN",
      trendPct: 0,
      predictedRate: Math.round(avg),
      lastUpdated: null,
    });
  } catch (err) {
    console.error("[Analytics] Lane rate error:", err);
    res.status(500).json({ error: "Failed to fetch lane rate data" });
  }
});

// Lane detail — specific origin/dest
router.get("/lanes/:origin/:dest", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { origin, dest } = req.params;
    const period = (req.query.period as string) || "1y";
    const data = await getLaneDetail(origin.toUpperCase(), dest.toUpperCase(), period);
    res.json(data);
  } catch (err) {
    console.error("[Analytics] Lane detail error:", err);
    res.status(500).json({ error: "Failed to fetch lane detail" });
  }
});

// Carrier Scorecards — not available to CARRIER role (they use /earnings)
router.get("/carriers", ctrl.getCarriers as any);

// Shipper Scorecards
router.get("/shippers", ctrl.getShippers as any);

// Cash Flow — Accounting/Admin only
router.get("/cash-flow", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getCashFlow as any);

// AR Aging — Accounting/Admin only
router.get("/ar-aging", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getARAging as any);

// AP — Accounting/Admin only
router.get("/ap", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getAP as any);

// Shipper Credit Health — Accounting/Admin only
router.get("/shipper-credit", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getShipperCredit as any);

// Carrier Earnings — Carrier's own data
router.get("/earnings", ctrl.getCarrierEarnings as any);

// Export
router.post("/export", ctrl.exportReport as any);

export default router;
