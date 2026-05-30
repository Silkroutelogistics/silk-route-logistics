import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import * as ctrl from "../controllers/analyticsController";
import { getTopLanes, getLaneDetail, getLaneHeatmap, getMarginAnalysis } from "../services/laneAnalyticsService";
import { prisma } from "../config/database";
import { log } from "../lib/logger";

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
    log.error({ err: err }, "[Analytics] Lane heatmap error:");
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
    log.error({ err: err }, "[Analytics] Margin analysis error:");
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
    log.error({ err: err }, "[Analytics] Lane rate error:");
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
    log.error({ err: err }, "[Analytics] Lane detail error:");
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

// ─── Variance Reports (Quoted vs Actual) ────────────────────────────

router.get("/variance", authorize("ADMIN", "CEO", "BROKER", "ACCOUNTING") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const loads = await prisma.load.findMany({
      where: {
        deletedAt: null,
        status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
        customerRate: { not: null },
        carrierRate: { not: null },
        createdAt: { gte: since },
      },
      select: {
        id: true, loadNumber: true, referenceNumber: true,
        originState: true, destState: true, equipmentType: true,
        rate: true, customerRate: true, carrierRate: true,
        fuelSurcharge: true, totalCarrierPay: true,
        grossMargin: true, marginPercent: true,
        customer: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Calculate variance stats
    const variances = loads.map((l) => {
      const quoted = l.customerRate || l.rate;
      const actual = l.totalCarrierPay || l.carrierRate || 0;
      const variance = quoted - actual;
      const variancePct = quoted > 0 ? ((variance / quoted) * 100) : 0;
      return { ...l, quotedRate: quoted, actualCost: actual, variance, variancePct };
    });

    // By lane aggregation
    const byLane: Record<string, { lane: string; count: number; totalVariance: number; avgVariancePct: number }> = {};
    variances.forEach((v) => {
      const lane = `${v.originState}→${v.destState}`;
      if (!byLane[lane]) byLane[lane] = { lane, count: 0, totalVariance: 0, avgVariancePct: 0 };
      byLane[lane].count++;
      byLane[lane].totalVariance += v.variance;
    });
    Object.values(byLane).forEach((l) => { l.avgVariancePct = l.count > 0 ? (l.totalVariance / l.count) : 0; });

    // By carrier aggregation
    const totalVariance = variances.reduce((s, v) => s + v.variance, 0);
    const avgVariancePct = variances.length > 0 ? variances.reduce((s, v) => s + v.variancePct, 0) / variances.length : 0;
    const positiveVariance = variances.filter((v) => v.variance > 0).length;
    const negativeVariance = variances.filter((v) => v.variance < 0).length;

    res.json({
      summary: {
        totalLoads: variances.length,
        totalVariance: Math.round(totalVariance),
        avgVariancePct: Math.round(avgVariancePct * 10) / 10,
        positiveVariance, // loads where quoted > actual (good margin)
        negativeVariance, // loads where actual > quoted (margin leak)
      },
      byLane: Object.values(byLane).sort((a, b) => b.totalVariance - a.totalVariance).slice(0, 20),
      loads: variances.slice(0, 100),
    });
  } catch (err) {
    log.error({ err }, "[Analytics] Variance report error:");
    res.status(500).json({ error: "Failed to generate variance report" });
  }
});

// ─── Geographic Spend Heatmap ───────────────────────────────────────

router.get("/geo-spend", authorize("ADMIN", "CEO", "BROKER", "ACCOUNTING") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 180;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Spend by origin state
    const byOrigin = await prisma.load.groupBy({
      by: ["originState"],
      where: { deletedAt: null, rate: { gt: 0 }, createdAt: { gte: since } },
      _sum: { rate: true, totalCarrierPay: true },
      _count: true,
      _avg: { rate: true, distance: true },
    });

    // Spend by dest state
    const byDest = await prisma.load.groupBy({
      by: ["destState"],
      where: { deletedAt: null, rate: { gt: 0 }, createdAt: { gte: since } },
      _sum: { rate: true, totalCarrierPay: true },
      _count: true,
      _avg: { rate: true, distance: true },
    });

    // Top lanes by spend
    const topLanes = await prisma.load.groupBy({
      by: ["originState", "destState"],
      where: { deletedAt: null, rate: { gt: 0 }, createdAt: { gte: since } },
      _sum: { rate: true, totalCarrierPay: true },
      _count: true,
      _avg: { rate: true, distance: true, weight: true },
      orderBy: { _sum: { rate: "desc" } },
      take: 20,
    });

    // Overall stats
    const totals = await prisma.load.aggregate({
      where: { deletedAt: null, rate: { gt: 0 }, createdAt: { gte: since } },
      _sum: { rate: true, weight: true, distance: true },
      _count: true,
      _avg: { rate: true },
    });

    const totalSpend = totals._sum.rate || 0;
    const totalWeight = totals._sum.weight || 0;
    const totalDistance = totals._sum.distance || 0;
    const totalLoads = totals._count || 0;

    res.json({
      summary: {
        totalSpend: Math.round(totalSpend),
        spendPerLoad: totalLoads > 0 ? Math.round(totalSpend / totalLoads) : 0,
        spendPerPound: totalWeight > 0 ? Math.round((totalSpend / totalWeight) * 100) / 100 : null,
        spendPerMile: totalDistance > 0 ? Math.round((totalSpend / totalDistance) * 1000) / 1000 : null,
        totalLoads,
      },
      byOriginState: byOrigin.map((s) => ({
        state: s.originState,
        spend: Math.round(s._sum.rate || 0),
        count: s._count,
        avgRate: Math.round(s._avg.rate || 0),
      })),
      byDestState: byDest.map((s) => ({
        state: s.destState,
        spend: Math.round(s._sum.rate || 0),
        count: s._count,
        avgRate: Math.round(s._avg.rate || 0),
      })),
      topLanes: topLanes.map((l) => ({
        origin: l.originState,
        dest: l.destState,
        spend: Math.round(l._sum.rate || 0),
        carrierCost: Math.round(l._sum.totalCarrierPay || 0),
        count: l._count,
        avgRate: Math.round(l._avg.rate || 0),
        avgDistance: Math.round(l._avg.distance || 0),
        avgWeight: Math.round(l._avg.weight || 0),
        spendPerMile: (l._avg.distance || 0) > 0 ? Math.round(((l._sum.rate || 0) / ((l._avg.distance || 1) * l._count)) * 100) / 100 : null,
      })),
    });
  } catch (err) {
    log.error({ err }, "[Analytics] Geo spend error:");
    res.status(500).json({ error: "Failed to generate geographic spend data" });
  }
});

// ─── Backhaul/Fronthaul Discovery ───────────────────────────────────

router.get("/backhaul-discovery", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { state, city, radiusMiles, type } = req.query as Record<string, string>;
    if (!state) return res.status(400).json({ error: "state is required" });

    const isBackhaul = type === "backhaul"; // looking for loads going TO this area
    const isFronthaul = type === "fronthaul"; // looking for loads going FROM this area

    const where: any = {
      deletedAt: null,
      status: { in: ["POSTED", "TENDERED"] },
      carrierId: null, // unassigned
    };

    if (isBackhaul) {
      where.destState = state;
      if (city) where.destCity = { contains: city, mode: "insensitive" };
    } else {
      where.originState = state;
      if (city) where.originCity = { contains: city, mode: "insensitive" };
    }

    const loads = await prisma.load.findMany({
      where,
      select: {
        id: true, loadNumber: true, referenceNumber: true,
        originCity: true, originState: true, destCity: true, destState: true,
        equipmentType: true, rate: true, distance: true,
        pickupDate: true, deliveryDate: true, weight: true,
        status: true,
      },
      orderBy: { pickupDate: "asc" },
      take: 50,
    });

    res.json({
      type: type || "fronthaul",
      searchArea: { state, city },
      results: loads,
      count: loads.length,
    });
  } catch (err) {
    log.error({ err }, "[Analytics] Backhaul discovery error:");
    res.status(500).json({ error: "Failed to search for loads" });
  }
});

// ─── Tender Funnel + Decline Taxonomy (v3.8.alz §13.3 Item 145) ─────
// Engagement signals over the tender lifecycle: funnel (offered → accepted /
// declined / countered / expired / pending), conversion + response-time
// stats, decline-reason distribution, and breakdowns by equipment, carrier
// tier, and the chosen expiry window (4h/24h/48h preset effectiveness, Item
// 144). Single fetch of tenders in the window + JS aggregation (pre-revenue
// volume is small; capped at 5000 defensively). Needs meaningful volume to
// be statistically useful — surfaces honestly at low N.
router.get("/tender-funnel", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tenders = await prisma.loadTender.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: {
        status: true, declineReason: true, offeredRate: true, counterRate: true,
        createdAt: true, respondedAt: true, expiresAt: true,
        load: { select: { equipmentType: true } },
        carrier: { select: { cppTier: true } },
      },
      take: 5000,
      orderBy: { createdAt: "desc" },
    });

    const total = tenders.length;
    const by = (s: string) => tenders.filter((t) => t.status === s).length;
    const accepted = by("ACCEPTED");
    const declined = by("DECLINED");
    const countered = by("COUNTERED");
    const expired = by("EXPIRED");
    const pending = by("OFFERED");
    const responded = accepted + declined + countered;

    // Response time (minutes) for tenders that got a response.
    const respTimes = tenders
      .filter((t) => t.respondedAt)
      .map((t) => (new Date(t.respondedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000)
      .filter((m) => m >= 0);
    const avgResponseMinutes = respTimes.length
      ? Math.round(respTimes.reduce((s, m) => s + m, 0) / respTimes.length)
      : null;

    // Decline-reason distribution.
    const declineReasons: Record<string, number> = {};
    tenders.filter((t) => t.status === "DECLINED").forEach((t) => {
      const r = t.declineReason || "Unspecified";
      declineReasons[r] = (declineReasons[r] || 0) + 1;
    });

    // Generic group-accumulator → {offered(total), accepted, declined, expired, acceptanceRate}.
    type Bucket = { key: string; total: number; accepted: number; declined: number; expired: number; acceptanceRate: number };
    const groupBy = (keyFn: (t: (typeof tenders)[number]) => string) => {
      const m: Record<string, Bucket> = {};
      tenders.forEach((t) => {
        const k = keyFn(t) || "Unknown";
        if (!m[k]) m[k] = { key: k, total: 0, accepted: 0, declined: 0, expired: 0, acceptanceRate: 0 };
        m[k].total++;
        if (t.status === "ACCEPTED") m[k].accepted++;
        else if (t.status === "DECLINED") m[k].declined++;
        else if (t.status === "EXPIRED") m[k].expired++;
      });
      return Object.values(m).map((b) => ({ ...b, acceptanceRate: b.total ? Math.round((b.accepted / b.total) * 100) : 0 }))
        .sort((a, b) => b.total - a.total);
    };

    // Expiry-window bucket: round (expiresAt - createdAt) to nearest hour,
    // map to the 4h/24h/48h presets (Item 144) else "Other".
    const windowKey = (t: (typeof tenders)[number]) => {
      const h = Math.round((new Date(t.expiresAt).getTime() - new Date(t.createdAt).getTime()) / 3600000);
      if (h <= 6) return "4h";
      if (h <= 36) return "24h";
      if (h <= 72) return "48h";
      return "Other";
    };

    res.json({
      periodDays: days,
      funnel: { total, accepted, declined, countered, expired, pending, responded },
      conversion: {
        acceptanceRateOfTotal: total ? Math.round((accepted / total) * 100) : 0,
        acceptanceRateOfResponded: responded ? Math.round((accepted / responded) * 100) : 0,
        responseRate: total ? Math.round((responded / total) * 100) : 0,
      },
      avgResponseMinutes,
      declineReasons: Object.entries(declineReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      byEquipment: groupBy((t) => t.load?.equipmentType ?? "Unknown"),
      byTier: groupBy((t) => t.carrier?.cppTier ?? "Unknown"),
      byExpiryWindow: groupBy(windowKey),
    });
  } catch (err) {
    log.error({ err }, "[Analytics] Tender funnel error:");
    res.status(500).json({ error: "Failed to generate tender funnel data" });
  }
});

export default router;
