import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/database";
import { LoadStatus } from "@prisma/client";
import { getVehicleLocation } from "../services/eldService";

// ─── Helpers ─────────────────────────────────────────────

/**
 * Resolve the shipper's load filter.
 * A SHIPPER user may have a linked Customer record (via Customer.userId).
 * Loads belong to the shipper if load.customerId matches OR load.posterId matches.
 */
async function resolveShipperLoadWhere(userId: string) {
  const customer = await prisma.customer.findUnique({ where: { userId } });
  if (customer) {
    // Customer linked — show all loads for this customer (posted by anyone)
    // plus any loads the shipper posted directly
    return {
      deletedAt: null,
      OR: [{ customerId: customer.id }, { posterId: userId }],
    };
  }
  // Fallback: no customer linked, just show loads they posted
  return { posterId: userId, deletedAt: null };
}

async function getShipperLoadIds(userId: string): Promise<string[]> {
  const where = await resolveShipperLoadWhere(userId);
  const loads = await prisma.load.findMany({ where, select: { id: true } });
  return loads.map((l) => l.id);
}

// Status display labels
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", PLANNED: "Planned", POSTED: "Pending", TENDERED: "Tendered",
  CONFIRMED: "Confirmed", BOOKED: "Booked", DISPATCHED: "Dispatched",
  AT_PICKUP: "At Pickup", LOADED: "Picked Up", PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit", AT_DELIVERY: "At Delivery",
  DELIVERED: "Delivered", POD_RECEIVED: "Delivered", INVOICED: "Delivered",
  COMPLETED: "Delivered", TONU: "Cancelled", CANCELLED: "Cancelled",
};

function mapLoadStatus(status: string): string {
  return STATUS_LABELS[status] || status;
}

function computeProgress(status: string): number {
  const map: Record<string, number> = {
    DRAFT: 0, PLANNED: 5, POSTED: 5, TENDERED: 8, CONFIRMED: 10,
    BOOKED: 10, DISPATCHED: 20, AT_PICKUP: 30, LOADED: 40, PICKED_UP: 40,
    IN_TRANSIT: 60, AT_DELIVERY: 90, DELIVERED: 100, POD_RECEIVED: 100,
    INVOICED: 100, COMPLETED: 100, TONU: 0, CANCELLED: 0,
  };
  return map[status] ?? 0;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function mapLoadToShipment(load: any) {
  const latestCC = load.checkCalls?.[0] || null;
  const eta = latestCC?.etaUpdate
    ? formatDate(latestCC.etaUpdate)
    : load.deliveryDate
    ? formatDate(load.deliveryDate)
    : "—";

  return {
    id: load.referenceNumber || load.id,
    origin: `${load.originCity || ""}${load.originState ? ", " + load.originState : ""}`,
    dest: `${load.destCity || ""}${load.destState ? ", " + load.destState : ""}`,
    status: mapLoadStatus(load.status),
    carrier: load.carrier?.company || load.carrier?.firstName
      ? `${load.carrier.firstName || ""} ${load.carrier.lastName || ""}`.trim()
      : "TBD",
    equipment: load.equipmentType || "—",
    pickDate: formatDate(load.pickupDate),
    delDate: formatDate(load.deliveryDate),
    rate: load.customerRate || load.rate || 0,
    weight: load.weight ? `${Number(load.weight).toLocaleString()} lbs` : "—",
    distance: load.distance ? `${load.distance} mi` : "—",
    eta,
    progress: computeProgress(load.status),
    loadId: load.id,
  };
}

function mapTenderToQuote(tender: any) {
  const load = tender.load;
  return {
    id: `QT-${tender.id.slice(-4).toUpperCase()}`,
    origin: `${load?.originCity || ""}${load?.originState ? ", " + load.originState : ""}`,
    dest: `${load?.destCity || ""}${load?.destState ? ", " + load.destState : ""}`,
    equipment: load?.equipmentType || "—",
    rate: tender.counterRate
      ? `$${tender.offeredRate.toLocaleString()} - $${tender.counterRate.toLocaleString()}`
      : `$${tender.offeredRate.toLocaleString()}`,
    status: tender.status === "OFFERED" ? "Quoted" : tender.status === "ACCEPTED" ? "Booked" : tender.status,
    expires: formatDate(tender.expiresAt),
    distance: load?.distance ? `${load.distance} mi` : "—",
  };
}

function mapInvoice(inv: any) {
  return {
    id: inv.invoiceNumber || inv.id,
    shipment: inv.load?.referenceNumber || "—",
    amount: inv.amount || inv.totalAmount || 0,
    issued: formatDate(inv.createdAt),
    due: formatDate(inv.dueDate),
    status: inv.status === "SENT" || inv.status === "SUBMITTED" || inv.status === "OVERDUE"
      ? "Unpaid"
      : inv.status === "UNDER_REVIEW" || inv.status === "APPROVED" || inv.status === "PARTIAL"
      ? "Processing"
      : inv.status === "PAID" || inv.status === "FUNDED"
      ? "Paid"
      : inv.status,
  };
}

// ─── Dashboard ───────────────────────────────────────────

export async function getShipperDashboard(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const where = await resolveShipperLoadWhere(userId);

    const activeStatuses: LoadStatus[] = ["IN_TRANSIT", "AT_PICKUP", "LOADED", "AT_DELIVERY", "DISPATCHED", "BOOKED"];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Parallel queries
    const [activeCount, recentLoads, customer] = await Promise.all([
      prisma.load.count({ where: { ...where, status: { in: activeStatuses } } }),
      prisma.load.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
          checkCalls: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      prisma.customer.findUnique({ where: { userId } }),
    ]);

    // Month spend
    const monthSpendLoads = await prisma.load.findMany({
      where: { ...where, pickupDate: { gte: monthStart } },
      select: { customerRate: true, rate: true },
    });
    const monthSpend = monthSpendLoads.reduce((sum, l) => sum + (l.customerRate || l.rate || 0), 0);

    // On-time % (delivered loads)
    const deliveredLoads = await prisma.load.findMany({
      where: { ...where, status: { in: ["DELIVERED", "POD_RECEIVED", "COMPLETED"] } },
      select: { deliveryDate: true, actualDeliveryDatetime: true },
    });
    const onTimeCount = deliveredLoads.filter((l) => {
      if (!l.actualDeliveryDatetime || !l.deliveryDate) return true;
      const deadline = new Date(l.deliveryDate);
      deadline.setDate(deadline.getDate() + 1);
      return new Date(l.actualDeliveryDatetime) <= deadline;
    }).length;
    const onTimePercent = deliveredLoads.length > 0
      ? Math.round((onTimeCount / deliveredLoads.length) * 100)
      : 100;

    // Open quotes
    const loadIds = await getShipperLoadIds(userId);
    const openQuoteCount = loadIds.length > 0
      ? await prisma.loadTender.count({
          where: { loadId: { in: loadIds }, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
        })
      : 0;

    const openQuotes = loadIds.length > 0
      ? await prisma.loadTender.findMany({
          where: { loadId: { in: loadIds }, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
          include: { load: { select: { originCity: true, originState: true, destCity: true, destState: true, equipmentType: true, distance: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [];

    // 12-month spend trend
    const spendTrend: { month: string; spend: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const loads = await prisma.load.findMany({
        where: { ...where, pickupDate: { gte: d, lte: end } },
        select: { customerRate: true, rate: true },
      });
      const spend = loads.reduce((s, l) => s + (l.customerRate || l.rate || 0), 0);
      spendTrend.push({
        month: d.toLocaleDateString("en-US", { month: "short" }),
        spend: Math.round(spend),
      });
    }

    res.json({
      kpis: {
        activeShipments: activeCount,
        monthSpend: Math.round(monthSpend),
        onTimePercent,
        openQuotes: openQuoteCount,
      },
      recentShipments: recentLoads.map(mapLoadToShipment),
      spendTrend,
      openQuotes: openQuotes.map(mapTenderToQuote),
    });
  } catch (err) {
    console.error("[ShipperPortal] Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
}

// ─── Shipments ───────────────────────────────────────────

export async function getShipperShipments(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const baseWhere = await resolveShipperLoadWhere(userId);
    const { status, search, page: pageStr, limit: limitStr } = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(pageStr) || 1);
    const limit = Math.min(100, parseInt(limitStr) || 50);

    // Status filter mapping
    const statusMap: Record<string, string[]> = {
      "In Transit": ["IN_TRANSIT"],
      "Delivered": ["DELIVERED", "POD_RECEIVED", "COMPLETED"],
      "Pending": ["POSTED", "PLANNED", "DRAFT", "TENDERED"],
      "Picked Up": ["PICKED_UP", "LOADED", "AT_PICKUP"],
      "Booked": ["BOOKED", "CONFIRMED"],
      "Dispatched": ["DISPATCHED"],
      "At Risk": [], // handled separately
    };

    let where: any = { ...baseWhere };

    if (status && status !== "All") {
      if (status === "At Risk") {
        // Get loads with recent RED/AMBER risk logs
        const loadIds = await getShipperLoadIds(userId);
        const riskLogs = loadIds.length > 0
          ? await prisma.riskLog.findMany({
              where: { loadId: { in: loadIds }, level: { in: ["RED", "AMBER"] } },
              select: { loadId: true },
              distinct: ["loadId"],
            })
          : [];
        where = { ...baseWhere, id: { in: riskLogs.map((r) => r.loadId) } };
      } else if (statusMap[status]) {
        where = { ...baseWhere, status: { in: statusMap[status] } };
      }
    }

    // Search
    if (search) {
      where = {
        ...where,
        OR: [
          { referenceNumber: { contains: search, mode: "insensitive" } },
          { loadNumber: { contains: search, mode: "insensitive" } },
          { originCity: { contains: search, mode: "insensitive" } },
          { destCity: { contains: search, mode: "insensitive" } },
          { carrier: { company: { contains: search, mode: "insensitive" } } },
        ],
      };
    }

    const [loads, total] = await Promise.all([
      prisma.load.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
          checkCalls: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      prisma.load.count({ where }),
    ]);

    res.json({
      shipments: loads.map(mapLoadToShipment),
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[ShipperPortal] Shipments error:", err);
    res.status(500).json({ error: "Failed to load shipments" });
  }
}

// ─── Invoices ────────────────────────────────────────────

export async function getShipperInvoices(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const loadIds = await getShipperLoadIds(userId);
    const { status, page: pageStr, limit: limitStr } = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(pageStr) || 1);
    const limit = Math.min(100, parseInt(limitStr) || 50);

    if (loadIds.length === 0) {
      return res.json({
        invoices: [], total: 0, totalPages: 0,
        billing: { outstandingBalance: 0, unpaidCount: 0, ytdBilled: 0, avgPaymentCycleDays: 0 },
      });
    }

    const statusMap: Record<string, string[]> = {
      Unpaid: ["SENT", "SUBMITTED", "OVERDUE", "DRAFT"],
      Processing: ["UNDER_REVIEW", "APPROVED", "PARTIAL"],
      Paid: ["PAID", "FUNDED"],
    };

    let invoiceWhere: any = { loadId: { in: loadIds } };
    if (status && status !== "All" && statusMap[status]) {
      invoiceWhere.status = { in: statusMap[status] };
    }

    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const [invoices, total, unpaidAgg, ytdInvoices, paidInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { load: { select: { referenceNumber: true } } },
      }),
      prisma.invoice.count({ where: invoiceWhere }),
      // Outstanding balance
      prisma.invoice.findMany({
        where: { loadId: { in: loadIds }, status: { in: ["SENT", "SUBMITTED", "OVERDUE", "DRAFT"] } },
        select: { amount: true, totalAmount: true },
      }),
      // YTD billed
      prisma.invoice.findMany({
        where: { loadId: { in: loadIds }, createdAt: { gte: yearStart } },
        select: { amount: true, totalAmount: true },
      }),
      // Avg payment cycle
      prisma.invoice.findMany({
        where: { loadId: { in: loadIds }, status: { in: ["PAID", "FUNDED"] }, paidAt: { not: null } },
        select: { createdAt: true, paidAt: true },
      }),
    ]);

    const outstandingBalance = unpaidAgg.reduce((s, i) => s + (i.totalAmount || i.amount || 0), 0);
    const ytdBilled = ytdInvoices.reduce((s, i) => s + (i.totalAmount || i.amount || 0), 0);
    const avgCycleDays = paidInvoices.length > 0
      ? Math.round(
          paidInvoices.reduce((s, i) => {
            const diff = (new Date(i.paidAt!).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            return s + diff;
          }, 0) / paidInvoices.length
        )
      : 0;

    res.json({
      invoices: invoices.map(mapInvoice),
      total,
      totalPages: Math.ceil(total / limit),
      billing: {
        outstandingBalance: Math.round(outstandingBalance),
        unpaidCount: unpaidAgg.length,
        ytdBilled: Math.round(ytdBilled),
        avgPaymentCycleDays: avgCycleDays,
      },
    });
  } catch (err) {
    console.error("[ShipperPortal] Invoices error:", err);
    res.status(500).json({ error: "Failed to load invoices" });
  }
}

// ─── Analytics ───────────────────────────────────────────

export async function getShipperAnalytics(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const where = await resolveShipperLoadWhere(userId);
    const period = (req.query.period as string) || "30d";

    // Period date range
    const now = new Date();
    let periodStart: Date;
    switch (period) {
      case "7d": periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case "90d": periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
      case "ytd": periodStart = new Date(now.getFullYear(), 0, 1); break;
      default: periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const periodWhere = { ...where, pickupDate: { gte: periodStart } };

    // Period loads
    const periodLoads = await prisma.load.findMany({
      where: periodWhere,
      select: { customerRate: true, rate: true, distance: true, pickupDate: true, deliveryDate: true, actualDeliveryDatetime: true, actualPickupDatetime: true, status: true },
    });

    const totalShipments = periodLoads.length;
    const totalSpend = periodLoads.reduce((s, l) => s + (l.customerRate || l.rate || 0), 0);
    const totalMiles = periodLoads.reduce((s, l) => s + (l.distance || 0), 0);
    const avgCostPerMile = totalMiles > 0 ? Math.round((totalSpend / totalMiles) * 100) / 100 : 0;

    // Avg transit days (for delivered loads)
    const deliveredInPeriod = periodLoads.filter(
      (l) => l.actualDeliveryDatetime && l.actualPickupDatetime
    );
    const avgTransitDays = deliveredInPeriod.length > 0
      ? Math.round(
          (deliveredInPeriod.reduce((s, l) => {
            const diff = (new Date(l.actualDeliveryDatetime!).getTime() - new Date(l.actualPickupDatetime!).getTime()) / (1000 * 60 * 60 * 24);
            return s + Math.max(0.5, diff);
          }, 0) / deliveredInPeriod.length) * 10
        ) / 10
      : 0;

    // 12-month spend + on-time arrays
    const spendByMonth: number[] = [];
    const onTimeByMonth: number[] = [];
    const months: string[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      months.push(d.toLocaleDateString("en-US", { month: "short" }));

      const mLoads = await prisma.load.findMany({
        where: { ...where, pickupDate: { gte: d, lte: end } },
        select: { customerRate: true, rate: true, deliveryDate: true, actualDeliveryDatetime: true, status: true },
      });

      spendByMonth.push(Math.round(mLoads.reduce((s, l) => s + (l.customerRate || l.rate || 0), 0)));

      const delivered = mLoads.filter((l) => ["DELIVERED", "POD_RECEIVED", "COMPLETED"].includes(l.status));
      const onTime = delivered.filter((l) => {
        if (!l.actualDeliveryDatetime || !l.deliveryDate) return true;
        const deadline = new Date(l.deliveryDate);
        deadline.setDate(deadline.getDate() + 1);
        return new Date(l.actualDeliveryDatetime) <= deadline;
      });
      onTimeByMonth.push(delivered.length > 0 ? Math.round((onTime.length / delivered.length) * 100) : 100);
    }

    // Top lanes
    const allLoads = await prisma.load.findMany({
      where: { ...where, pickupDate: { gte: periodStart } },
      select: { originCity: true, originState: true, destCity: true, destState: true, customerRate: true, rate: true },
    });

    const laneMap = new Map<string, { spend: number; count: number }>();
    for (const l of allLoads) {
      const lane = `${l.originCity}, ${l.originState} → ${l.destCity}, ${l.destState}`;
      const existing = laneMap.get(lane) || { spend: 0, count: 0 };
      existing.spend += l.customerRate || l.rate || 0;
      existing.count += 1;
      laneMap.set(lane, existing);
    }
    const topLanes = [...laneMap.entries()]
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 5)
      .map(([lane, data]) => ({
        lane,
        spend: Math.round(data.spend),
        loads: data.count,
        pct: totalSpend > 0 ? Math.round((data.spend / totalSpend) * 100) : 0,
      }));

    // Carrier scorecard
    const carrierLoads = await prisma.load.findMany({
      where: { ...where, carrierId: { not: null } },
      select: {
        carrierId: true,
        carrier: { select: { company: true, firstName: true, lastName: true } },
        deliveryDate: true,
        actualDeliveryDatetime: true,
        status: true,
      },
    });

    const carrierMap = new Map<string, { name: string; total: number; onTime: number }>();
    for (const l of carrierLoads) {
      if (!l.carrierId) continue;
      const name = l.carrier?.company || `${l.carrier?.firstName || ""} ${l.carrier?.lastName || ""}`.trim();
      const existing = carrierMap.get(l.carrierId) || { name, total: 0, onTime: 0 };
      existing.total += 1;
      if (["DELIVERED", "POD_RECEIVED", "COMPLETED"].includes(l.status)) {
        if (!l.actualDeliveryDatetime || !l.deliveryDate) {
          existing.onTime += 1;
        } else {
          const deadline = new Date(l.deliveryDate);
          deadline.setDate(deadline.getDate() + 1);
          if (new Date(l.actualDeliveryDatetime) <= deadline) existing.onTime += 1;
        }
      }
      carrierMap.set(l.carrierId, existing);
    }

    const carrierScorecard = [...carrierMap.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((c) => {
        const otd = c.total > 0 ? Math.round((c.onTime / c.total) * 100) : 100;
        return {
          name: c.name,
          otd,
          score: otd >= 97 ? "A+" : otd >= 95 ? "A" : otd >= 90 ? "A-" : otd >= 85 ? "B" : "C",
          loads: c.total,
        };
      });

    res.json({
      metrics: { totalShipments, avgCostPerMile, avgTransitDays },
      spendByMonth,
      onTimeByMonth,
      months,
      topLanes,
      carrierScorecard,
    });
  } catch (err) {
    console.error("[ShipperPortal] Analytics error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
}

// ─── Tracking ────────────────────────────────────────────

export async function getShipperTracking(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const baseWhere = await resolveShipperLoadWhere(userId);
    const activeStatuses: LoadStatus[] = ["IN_TRANSIT", "AT_PICKUP", "LOADED", "AT_DELIVERY", "DISPATCHED"];

    const loads = await prisma.load.findMany({
      where: { ...baseWhere, status: { in: activeStatuses } },
      include: {
        carrier: { select: { id: true, company: true, firstName: true, lastName: true } },
        checkCalls: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    // Get risk logs and ELD data
    const loadIds = loads.map((l) => l.id);
    const riskLogs = loadIds.length > 0
      ? await prisma.riskLog.findMany({
          where: { loadId: { in: loadIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["loadId"],
        })
      : [];
    const riskMap = new Map(riskLogs.map((r) => [r.loadId, r]));

    // ELD positions for loads with drivers
    const driverIds = loads.filter((l) => l.driverId).map((l) => l.driverId!);
    const drivers = driverIds.length > 0
      ? await prisma.driver.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, currentLocation: true },
        })
      : [];
    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    const shipments = loads.map((load) => {
      const base = mapLoadToShipment(load);
      const risk = riskMap.get(load.id);
      const driver = load.driverId ? driverMap.get(load.driverId) : null;
      const eldPos = driver ? getVehicleLocation(driver.currentLocation) : null;

      return {
        ...base,
        checkCalls: (load.checkCalls || []).map((cc: any) => ({
          status: cc.status,
          city: cc.city || "",
          state: cc.state || "",
          timestamp: cc.createdAt?.toISOString?.() || cc.createdAt,
          method: cc.method || "PHONE",
        })),
        eldPosition: eldPos
          ? { lat: eldPos.latitude, lng: eldPos.longitude, speed: eldPos.speed, address: eldPos.address }
          : null,
        riskLevel: risk?.level || "GREEN",
      };
    });

    res.json({ shipments });
  } catch (err) {
    console.error("[ShipperPortal] Tracking error:", err);
    res.status(500).json({ error: "Failed to load tracking" });
  }
}

// ─── Documents ───────────────────────────────────────────

export async function getShipperDocuments(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const loadIds = await getShipperLoadIds(userId);

    if (loadIds.length === 0) {
      return res.json({ typeCounts: [], documents: [] });
    }

    const documents = await prisma.document.findMany({
      where: { loadId: { in: loadIds } },
      orderBy: { createdAt: "desc" },
      include: { load: { select: { referenceNumber: true } } },
    });

    // Group by docType
    const typeCountMap = new Map<string, number>();
    for (const doc of documents) {
      const type = doc.docType || "OTHER";
      typeCountMap.set(type, (typeCountMap.get(type) || 0) + 1);
    }
    const typeCounts = [...typeCountMap.entries()].map(([type, count]) => ({ type, count }));

    // Recent 20
    const recent = documents.slice(0, 20).map((doc) => ({
      id: doc.id,
      name: doc.fileName,
      type: doc.docType || "OTHER",
      shipment: doc.load?.referenceNumber || "—",
      date: formatDate(doc.createdAt),
      size: doc.fileSize || 0,
      url: doc.fileUrl,
    }));

    res.json({ typeCounts, documents: recent });
  } catch (err) {
    console.error("[ShipperPortal] Documents error:", err);
    res.status(500).json({ error: "Failed to load documents" });
  }
}

// ─── Create Quote Request ────────────────────────────────
export async function createQuoteRequest(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const {
      originAddress, originCity, originState, originZip,
      destAddress, destCity, destState, destZip,
      pickupDate, deliveryDate, equipmentType, loadType,
      weight, commodity, specialInstructions,
    } = req.body;

    if (!originCity || !originState || !destCity || !destState || !pickupDate || !equipmentType || !weight || !commodity) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Resolve the shipper's customer record
    const customer = await prisma.customer.findUnique({ where: { userId } });

    // Create the load as a quote (POSTED status = pending quote)
    const load = await prisma.load.create({
      data: {
        referenceNumber: `RFQ-${Date.now().toString(36).toUpperCase()}`,
        status: LoadStatus.POSTED,
        originAddress: originAddress || "",
        originCity,
        originState,
        originZip: originZip || "",
        destAddress: destAddress || "",
        destCity,
        destState,
        destZip: destZip || "",
        pickupDate: new Date(pickupDate),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        equipmentType,
        commodity,
        weight: parseFloat(weight.toString().replace(/,/g, "")) || 0,
        specialInstructions: specialInstructions || "",
        rate: 0,
        notes: `Load Type: ${loadType || "FTL"}\nSubmitted via Shipper Portal`,
        posterId: userId,
        customerId: customer?.id ?? null,
      },
    });

    res.status(201).json({
      id: load.id,
      referenceNumber: load.referenceNumber,
      message: "Quote request submitted successfully",
    });
  } catch (err) {
    console.error("[ShipperPortal] Create quote error:", err);
    res.status(500).json({ error: "Failed to submit quote request" });
  }
}
