import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { calculatePredictiveETA } from "../services/predictiveEtaService";
import { statesInRegion } from "../services/regionMap";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

// ─── v3.3.w Filtered board endpoints (spec sections 1 & 2) ─────────────

const ACTIVE_STATUSES = [
  "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
] as const;
const TENDERED_STATUSES = ["TENDERED", "CONFIRMED"] as const;
const DELIVERED_STATUSES = ["DELIVERED", "POD_RECEIVED", "INVOICED"] as const;

// GET /api/track-trace/summary — 5 top-row stat cards
router.get(
  "/summary",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (_req: AuthRequest, res: Response) => {
    try {
      const stale = new Date(Date.now() - 30 * 60 * 1000);
      const now = new Date();

      const [active, openExceptions, overdueCalls, delivered24h, atRiskEvents] = await Promise.all([
        prisma.load.count({ where: { status: { in: ACTIVE_STATUSES as any }, deletedAt: null } }),
        prisma.loadException.count({ where: { status: "OPEN" } }),
        prisma.checkCallSchedule.count({
          where: { status: "PENDING", scheduledTime: { lt: now } },
        }).catch(() => 0),
        prisma.load.count({
          where: {
            status: { in: DELIVERED_STATUSES as any },
            actualDeliveryDatetime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            deletedAt: null,
          },
        }),
        prisma.loadTrackingEvent.count({
          where: { alertLevel: { in: ["YELLOW", "RED", "CRITICAL"] }, createdAt: { gte: stale } },
        }),
      ]);

      const onTimeCount = await prisma.loadStop.count({
        where: {
          stopType: "DELIVERY",
          onTime: true,
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });

      res.json({
        active,
        onTime: onTimeCount,
        atRisk: atRiskEvents,
        exceptions: openExceptions,
        checkCallsDue: overdueCalls,
      });
    } catch (err) {
      log.error({ err }, "T&T summary error");
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  }
);

// GET /api/track-trace/loads — Filtered board list (spec §1.2–1.5)
router.get(
  "/loads",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        tab = "active",        // needs_attention | tendered | active | delivered | closed
        search,
        region,
        equipment,
        carrierId,
        shipperId,
        dateFrom,
        dateTo,
        quickFilter,           // all | calls_due | at_risk | exceptions | gps_stale | awaiting_pod
      } = req.query as Record<string, string | undefined>;

      const andClauses: Prisma.LoadWhereInput[] = [{ deletedAt: null }];

      // Tab → status
      if (tab === "tendered") {
        andClauses.push({ status: { in: TENDERED_STATUSES as any } });
      } else if (tab === "active" || tab === "needs_attention") {
        andClauses.push({ status: { in: [...ACTIVE_STATUSES, ...TENDERED_STATUSES] as any } });
      } else if (tab === "delivered") {
        andClauses.push({ status: { in: DELIVERED_STATUSES as any } });
        andClauses.push({
          OR: [
            { podVerified: false },
            { customerInvoiced: false },
            { carrierSettled: false },
          ],
        });
      } else if (tab === "closed") {
        andClauses.push({ status: "COMPLETED" });
      }

      // Filters
      if (region) {
        const states = statesInRegion(region);
        if (states.length) {
          andClauses.push({
            OR: [
              { originState: { in: states } },
              { destState: { in: states } },
            ],
          });
        }
      }
      if (equipment) andClauses.push({ equipmentType: equipment });
      if (carrierId) andClauses.push({ carrierId });
      if (shipperId) andClauses.push({ customerId: shipperId });
      if (dateFrom || dateTo) {
        const range: Prisma.DateTimeFilter = {};
        if (dateFrom) range.gte = new Date(dateFrom);
        if (dateTo) range.lte = new Date(dateTo);
        andClauses.push({ pickupDate: range });
      }
      if (search) {
        const s = search.trim();
        andClauses.push({
          OR: [
            { loadNumber: { contains: s, mode: "insensitive" } },
            { referenceNumber: { contains: s, mode: "insensitive" } },
            { bolNumber: { contains: s, mode: "insensitive" } },
            { customerRef: { contains: s, mode: "insensitive" } },
            { driverName: { contains: s, mode: "insensitive" } },
            { shipperPoNumber: { contains: s, mode: "insensitive" } },
          ],
        });
      }

      const where: Prisma.LoadWhereInput = { AND: andClauses };

      const loads = await prisma.load.findMany({
        where,
        orderBy: [{ pickupDate: "desc" }],
        take: 500,
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
          customer: { select: { id: true, name: true } },
          loadStops: {
            orderBy: { stopNumber: "asc" },
            select: {
              id: true, stopType: true, facilityName: true, city: true, state: true,
              appointmentDate: true, appointmentTime: true, actualArrival: true,
              actualDeparture: true, onTime: true,
            },
          },
          trackingEvents: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              alertLevel: true, locationCity: true, locationState: true,
              latitude: true, longitude: true, etaDestination: true, createdAt: true,
            },
          },
          loadExceptions: {
            where: { status: "OPEN" },
            select: { id: true, category: true },
          },
          checkCalls: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, createdAt: true },
          },
          checkCallSchedules: {
            where: { status: { in: ["PENDING", "SENT"] } },
            orderBy: { scheduledTime: "asc" },
            select: { id: true, scheduledTime: true, status: true },
          },
        },
      });

      const now = Date.now();
      const staleCutoff = now - 30 * 60 * 1000;

      const enriched = loads.map((load) => {
        const pickup = load.loadStops.find((s) => s.stopType === "PICKUP");
        const delivery = [...load.loadStops].reverse().find((s) => s.stopType === "DELIVERY");
        const latestEvent = load.trackingEvents[0] ?? null;
        const hasOpenException = load.loadExceptions.length > 0;

        // 4-step progress: booked / picked / transit / delivered
        const progress = (() => {
          const step = (state: "complete" | "active" | "pending" | "exception") => state;
          const s = load.status as string;
          const r: any = {
            booked: step("pending"),
            pickedUp: step("pending"),
            inTransit: step("pending"),
            delivered: step("pending"),
          };
          if (["BOOKED", "DISPATCHED", "AT_PICKUP"].includes(s)) {
            r.booked = "complete"; r.pickedUp = s === "AT_PICKUP" ? "active" : "pending";
          }
          if (["LOADED"].includes(s)) { r.booked = "complete"; r.pickedUp = "complete"; r.inTransit = "active"; }
          if (["IN_TRANSIT"].includes(s)) { r.booked = "complete"; r.pickedUp = "complete"; r.inTransit = "active"; }
          if (["AT_DELIVERY"].includes(s)) { r.booked = "complete"; r.pickedUp = "complete"; r.inTransit = "complete"; r.delivered = "active"; }
          if (DELIVERED_STATUSES.includes(s as any) || s === "COMPLETED") {
            r.booked = "complete"; r.pickedUp = "complete"; r.inTransit = "complete"; r.delivered = "complete";
          }
          if (hasOpenException) {
            if (r.inTransit === "active") r.inTransit = "exception";
            else if (r.delivered === "active") r.delivered = "exception";
          }
          return r;
        })();

        const gpsStatus = (() => {
          if (!latestEvent?.latitude) return "none";
          const age = now - new Date(latestEvent.createdAt).getTime();
          if (DELIVERED_STATUSES.includes(load.status as any)) return "none";
          return age > 30 * 60 * 1000 ? "stale" : "live";
        })();

        const nextCall = load.checkCallSchedules[0] ?? null;
        const callsDue = nextCall ? new Date(nextCall.scheduledTime).getTime() < now : false;

        const awaitingPod = DELIVERED_STATUSES.includes(load.status as any) && !load.podVerified;

        // Stripe color by equipment/shipment type
        const stripe = (() => {
          if (load.temperatureControlled) return "amber";       // reefer
          if (load.urgencyLevel === "EXPEDITED") return "red";  // expedited
          if ((load.equipmentType || "").toUpperCase() === "LTL") return "purple";
          return "gray";
        })();

        return {
          id: load.id,
          loadNumber: load.loadNumber,
          referenceNumber: load.referenceNumber,
          status: load.status,
          stripe,
          progress,
          shipper: load.customer?.name ?? load.shipperFacility ?? null,
          origin: pickup
            ? { city: pickup.city, state: pickup.state, facility: pickup.facilityName }
            : { city: load.originCity, state: load.originState },
          destination: delivery
            ? { city: delivery.city, state: delivery.state, facility: delivery.facilityName }
            : { city: load.destCity, state: load.destState },
          carrier: load.carrier
            ? { id: load.carrier.id, name: load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`.trim() }
            : null,
          equipmentType: load.equipmentType,
          eta: latestEvent?.etaDestination ?? null,
          pickupDate: load.pickupDate,
          deliveryDate: load.deliveryDate,
          gpsStatus,
          callsDue,
          hasOpenException,
          openExceptionCount: load.loadExceptions.length,
          awaitingPod,
          alertLevel: latestEvent?.alertLevel ?? "GREEN",
          paperworkGates: {
            podVerified: load.podVerified,
            customerInvoiced: load.customerInvoiced,
            carrierSettled: load.carrierSettled,
          },
        };
      });

      // Quick filter post-filter
      let filtered = enriched;
      switch (quickFilter) {
        case "calls_due":   filtered = enriched.filter(l => l.callsDue); break;
        case "at_risk":     filtered = enriched.filter(l => l.alertLevel === "YELLOW" || l.alertLevel === "RED" || l.alertLevel === "CRITICAL"); break;
        case "exceptions":  filtered = enriched.filter(l => l.hasOpenException); break;
        case "gps_stale":   filtered = enriched.filter(l => l.gpsStatus === "stale"); break;
        case "awaiting_pod": filtered = enriched.filter(l => l.awaitingPod); break;
      }

      // needs_attention override — anything problematic
      if (tab === "needs_attention") {
        filtered = filtered.filter(l =>
          l.hasOpenException || l.callsDue || l.gpsStatus === "stale" || l.awaitingPod ||
          l.alertLevel === "RED" || l.alertLevel === "CRITICAL"
        );
      }

      res.json({
        loads: filtered,
        total: filtered.length,
        counts: {
          all: enriched.length,
          callsDue: enriched.filter(l => l.callsDue).length,
          atRisk: enriched.filter(l => l.alertLevel === "YELLOW" || l.alertLevel === "RED" || l.alertLevel === "CRITICAL").length,
          exceptions: enriched.filter(l => l.hasOpenException).length,
          gpsStale: enriched.filter(l => l.gpsStatus === "stale").length,
          awaitingPod: enriched.filter(l => l.awaitingPod).length,
        },
      });
    } catch (err) {
      log.error({ err }, "T&T filtered loads error");
      res.status(500).json({ error: "Failed to fetch loads" });
    }
  }
);

// GET /api/track-trace/load/:loadId — full load detail for drawer
router.get(
  "/load/:loadId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, email: true } },
          customer: { select: { id: true, name: true, billingEmail: true, phone: true } },
          loadStops: { orderBy: { stopNumber: "asc" } },
          trackingEvents: { orderBy: { createdAt: "desc" }, take: 50 },
          loadExceptions: { orderBy: { reportedAt: "desc" }, include: { documents: true } },
          documents: { orderBy: { createdAt: "desc" } },
          checkCalls: { orderBy: { createdAt: "desc" } },
          checkCallSchedules: { orderBy: { scheduledTime: "asc" } },
          loadActivities: { orderBy: { createdAt: "desc" }, take: 200 },
          geofenceEvents: { orderBy: { occurredAt: "asc" } },
          detentionRecords: { orderBy: { enteredAt: "desc" } },
          loadAccessorials: { orderBy: { createdAt: "desc" } },
          shipperTrackingTokens: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!load) return res.status(404).json({ error: "Load not found" });
      res.json({ load });
    } catch (err) {
      log.error({ err }, "T&T load detail error");
      res.status(500).json({ error: "Failed to fetch load" });
    }
  }
);

// GET /api/track-trace/board — All active loads with latest location for dispatch table + map
router.get(
  "/board",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, equipmentType, carrierId, customerId, urgency } = req.query;

      const where: any = {
        status: {
          in: [
            "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
            "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
            "DELIVERED", "POD_RECEIVED",
          ],
        },
        deletedAt: null,
      };

      if (status) where.status = status as string;
      if (equipmentType) where.equipmentType = equipmentType as string;
      if (carrierId) where.carrierId = carrierId as string;
      if (customerId) where.customerId = customerId as string;
      if (urgency) where.urgencyLevel = urgency as string;

      const loads = await prisma.load.findMany({
        where,
        orderBy: [{ pickupDate: "asc" }, { createdAt: "desc" }],
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
          customer: { select: { id: true, name: true } },
          loadStops: {
            orderBy: { stopNumber: "asc" },
            select: {
              id: true, stopNumber: true, stopType: true,
              facilityName: true, city: true, state: true,
              appointmentDate: true, appointmentTime: true, appointmentRef: true,
              actualArrival: true, actualDeparture: true,
              onTime: true, hookType: true, trailerNumber: true,
              latitude: true, longitude: true,
            },
          },
          trackingEvents: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: {
              OR: [
                { latitude: { not: null } },
                { eventType: "STATUS_CHANGE" },
              ],
            },
            select: {
              id: true, eventType: true, locationCity: true, locationState: true,
              locationSource: true, latitude: true, longitude: true,
              etaDestination: true, alertLevel: true, temperatureF: true,
              createdAt: true,
            },
          },
          checkCalls: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true, city: true, state: true, location: true,
              driverStatus: true, etaUpdate: true, createdAt: true,
            },
          },
        },
      });

      // Enrich with computed fields
      const enrichedLoads = loads.map((load) => {
        const firstPickup = load.loadStops.find((s) => s.stopType === "PICKUP");
        const lastDelivery = [...load.loadStops].reverse().find((s) => s.stopType === "DELIVERY");
        const latestEvent = load.trackingEvents[0] || null;
        const latestCheckCall = load.checkCalls[0] || null;

        // Latest location from tracking events or check calls
        const location = latestEvent?.locationCity
          ? { city: latestEvent.locationCity, state: latestEvent.locationState, source: latestEvent.locationSource, updatedAt: latestEvent.createdAt }
          : latestCheckCall?.city
            ? { city: latestCheckCall.city, state: latestCheckCall.state, source: "CHECK_CALL", updatedAt: latestCheckCall.createdAt }
            : null;

        // ETA from latest tracking event or check call
        const eta = latestEvent?.etaDestination || latestCheckCall?.etaUpdate || null;

        // Alert level
        let alertLevel = latestEvent?.alertLevel || "GREEN";
        if (lastDelivery?.appointmentDate && eta) {
          const apptTime = lastDelivery.appointmentTime || "23:59";
          const apptDateStr = new Date(lastDelivery.appointmentDate).toISOString().split("T")[0];
          const apptDeadline = new Date(`${apptDateStr}T${apptTime}`);
          const etaDate = new Date(eta);
          const bufferMs = apptDeadline.getTime() - etaDate.getTime();
          const bufferHours = bufferMs / (1000 * 60 * 60);

          if (bufferHours < 0) alertLevel = "RED";
          else if (bufferHours < 2) alertLevel = "YELLOW";
        }

        // Margin (AE-only)
        const margin = load.customerRate && load.carrierRate
          ? { amount: load.customerRate - load.carrierRate, percent: ((load.customerRate - load.carrierRate) / load.customerRate * 100) }
          : null;

        return {
          id: load.id,
          loadNumber: load.loadNumber,
          referenceNumber: load.referenceNumber,
          status: load.status,
          equipmentType: load.equipmentType,
          commodity: load.commodity,
          driverName: load.driverName,
          driverPhone: load.driverPhone,
          trailerNumber: load.trailerNumber,
          hookType: load.hookType,
          urgencyLevel: load.urgencyLevel,
          temperatureControlled: load.temperatureControlled,
          tempMin: load.tempMin,
          tempMax: load.tempMax,
          currentTemp: latestEvent?.temperatureF || null,
          carrier: load.carrier,
          customer: load.customer,
          origin: firstPickup
            ? { city: firstPickup.city, state: firstPickup.state, facility: firstPickup.facilityName, appointmentDate: firstPickup.appointmentDate, appointmentTime: firstPickup.appointmentTime, appointmentRef: firstPickup.appointmentRef }
            : { city: load.originCity, state: load.originState },
          destination: lastDelivery
            ? { city: lastDelivery.city, state: lastDelivery.state, facility: lastDelivery.facilityName, appointmentDate: lastDelivery.appointmentDate, appointmentTime: lastDelivery.appointmentTime, appointmentRef: lastDelivery.appointmentRef }
            : { city: load.destCity, state: load.destState },
          stopCount: load.loadStops.length,
          isMultiStop: load.isMultiStop,
          location,
          eta,
          alertLevel,
          lastCheckCallAt: latestCheckCall?.createdAt || null,
          margin,
          pickupDate: load.pickupDate,
          deliveryDate: load.deliveryDate,
          mapPin: latestEvent?.latitude
            ? { lat: Number(latestEvent.latitude), lng: Number(latestEvent.longitude) }
            : null,
        };
      });

      res.json({ loads: enrichedLoads, total: enrichedLoads.length });
    } catch (err) {
      log.error({ err: err }, "Track trace board error:");
      res.status(500).json({ error: "Failed to fetch board data" });
    }
  }
);

// GET /api/track-trace/alerts — Get all current YELLOW/RED/CRITICAL alerts
router.get(
  "/alerts",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const alerts = await prisma.loadTrackingEvent.findMany({
        where: {
          alertLevel: { in: ["YELLOW", "RED", "CRITICAL"] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        include: {
          load: {
            select: {
              id: true, loadNumber: true, referenceNumber: true, status: true,
              originCity: true, originState: true, destCity: true, destState: true,
              driverName: true, driverPhone: true,
              carrier: { select: { firstName: true, lastName: true, company: true } },
            },
          },
        },
        take: 100,
      });

      // Also pull risk logs from the existing risk engine
      const riskAlerts = await prisma.riskLog.findMany({
        where: {
          level: { in: ["AMBER", "RED"] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        include: {
          load: {
            select: { id: true, loadNumber: true, referenceNumber: true, status: true },
          },
        },
        take: 50,
      });

      res.json({ trackingAlerts: alerts, riskAlerts });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  }
);

// GET /api/track-trace/stats — Summary counts for dashboard header
router.get(
  "/stats",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const activeStatuses = [
        "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
        "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
      ];

      const [
        totalActive,
        inTransit,
        atPickup,
        atDelivery,
        delivered24h,
        alertsYellow,
        alertsRed,
        alertsCritical,
      ] = await Promise.all([
        prisma.load.count({ where: { status: { in: activeStatuses as any }, deletedAt: null } }),
        prisma.load.count({ where: { status: "IN_TRANSIT", deletedAt: null } }),
        prisma.load.count({ where: { status: "AT_PICKUP", deletedAt: null } }),
        prisma.load.count({ where: { status: "AT_DELIVERY", deletedAt: null } }),
        prisma.load.count({
          where: {
            status: { in: ["DELIVERED", "POD_RECEIVED"] },
            actualDeliveryDatetime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            deletedAt: null,
          },
        }),
        prisma.loadTrackingEvent.count({
          where: { alertLevel: "YELLOW", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        prisma.loadTrackingEvent.count({
          where: { alertLevel: "RED", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        prisma.loadTrackingEvent.count({
          where: { alertLevel: "CRITICAL", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);

      // On-time percentage (last 30 days)
      const recentDeliveries = await prisma.loadStop.findMany({
        where: {
          stopType: "DELIVERY",
          onTime: { not: null },
          updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { onTime: true },
      });
      const onTimePct = recentDeliveries.length > 0
        ? Math.round((recentDeliveries.filter((s) => s.onTime).length / recentDeliveries.length) * 100)
        : null;

      res.json({
        totalActive,
        inTransit,
        atPickup,
        atDelivery,
        delivered24h,
        alerts: { yellow: alertsYellow, red: alertsRed, critical: alertsCritical, total: alertsYellow + alertsRed + alertsCritical },
        onTimePct,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  }
);

// POST /api/track-trace/tracking-token/:loadId — Generate shipper tracking token
router.post(
  "/tracking-token/:loadId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { shipperId, accessLevel } = req.body;

      // Check if token already exists
      const existing = await prisma.shipperTrackingToken.findFirst({ where: { loadId } });
      if (existing) {
        return res.json({ token: existing });
      }

      // Generate 12-char alphanumeric token
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let tokenStr = "";
      for (let i = 0; i < 12; i++) {
        tokenStr += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const token = await prisma.shipperTrackingToken.create({
        data: {
          loadId,
          token: tokenStr,
          shipperId: shipperId || "",
          accessLevel: accessLevel || "STATUS_ONLY",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days after delivery
        },
      });

      res.status(201).json({ token });
    } catch (err) {
      res.status(500).json({ error: "Failed to generate tracking token" });
    }
  }
);

// GET /api/track-trace/tracking-token/:loadId — Get existing token for a load
router.get(
  "/tracking-token/:loadId",
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const token = await prisma.shipperTrackingToken.findFirst({ where: { loadId } });
      res.json({ token: token || null });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tracking token" });
    }
  }
);

// GET /api/track-trace/eta/:loadId — Predictive ETA for a load
router.get(
  "/eta/:loadId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const eta = await calculatePredictiveETA(loadId);
      if (!eta) {
        return res.json({ eta: null, message: "Insufficient data for ETA prediction" });
      }
      res.json({ eta });
    } catch (err) {
      res.status(500).json({ error: "Failed to calculate ETA" });
    }
  }
);

export default router;
