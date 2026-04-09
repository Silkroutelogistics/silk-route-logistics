import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { broadcastSSE } from "./trackTraceSSE";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

// GET /api/load-tracking/:loadId/events — Get all tracking events for a load (timeline)
router.get(
  "/:loadId/events",
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const events = await prisma.loadTrackingEvent.findMany({
        where: { loadId },
        orderBy: { createdAt: "desc" },
        include: {
          stop: { select: { id: true, stopNumber: true, stopType: true, facilityName: true, city: true, state: true } },
        },
      });
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tracking events" });
    }
  }
);

// POST /api/load-tracking/:loadId/events — Add tracking event (location update, note, alert, etc.)
router.post(
  "/:loadId/events",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("CREATE", "LoadTrackingEvent"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const {
        eventType, stopId, latitude, longitude,
        locationCity, locationState, locationSource,
        etaDestination, temperatureF, alertLevel, notes,
      } = req.body;

      const event = await prisma.loadTrackingEvent.create({
        data: {
          loadId,
          eventType,
          stopId: stopId || null,
          latitude: latitude || null,
          longitude: longitude || null,
          locationCity: locationCity || null,
          locationState: locationState || null,
          locationSource: locationSource || null,
          etaDestination: etaDestination ? new Date(etaDestination) : null,
          temperatureF: temperatureF || null,
          alertLevel: alertLevel || null,
          notes: notes || null,
          createdBy: req.user!.id,
        },
      });
      // Broadcast location/event via SSE
      broadcastSSE({
        type: eventType === "STATUS_CHANGE" ? "status_change" : "location_update",
        loadId,
        data: { eventType, latitude, longitude, locationCity, locationState, etaDestination, alertLevel },
      });

      res.status(201).json({ event });
    } catch (err) {
      res.status(500).json({ error: "Failed to create tracking event" });
    }
  }
);

// GET /api/load-tracking/:loadId/location — Get latest location only
router.get(
  "/:loadId/location",
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const event = await prisma.loadTrackingEvent.findFirst({
        where: {
          loadId,
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!event) {
        return res.json({ location: null });
      }

      res.json({
        location: {
          latitude: event.latitude,
          longitude: event.longitude,
          city: event.locationCity,
          state: event.locationState,
          source: event.locationSource,
          updatedAt: event.createdAt,
          eta: event.etaDestination,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch location" });
    }
  }
);

// POST /api/load-tracking/:loadId/status — Update load status (triggers automations)
router.post(
  "/:loadId/status",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("STATUS_CHANGE", "Load"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { newStatus, latitude, longitude, locationCity, locationState, locationSource, notes } = req.body;

      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: {
          loadStops: { orderBy: { stopNumber: "asc" } },
          checkCallSchedules: true,
        },
      });

      if (!load) return res.status(404).json({ error: "Load not found" });

      const previousStatus = load.status;

      // Record status change event
      const event = await prisma.loadTrackingEvent.create({
        data: {
          loadId,
          eventType: "STATUS_CHANGE",
          statusFrom: previousStatus,
          statusTo: newStatus,
          latitude: latitude || null,
          longitude: longitude || null,
          locationCity: locationCity || null,
          locationState: locationState || null,
          locationSource: locationSource || "AE_MANUAL",
          notes: notes || null,
          createdBy: req.user!.id,
        },
      });

      // Update load status
      await prisma.load.update({
        where: { id: loadId },
        data: {
          status: newStatus,
          statusUpdatedAt: new Date(),
          statusUpdatedById: req.user!.id,
        },
      });

      // --- Status-specific automations ---

      if (newStatus === "ACCEPTED" || newStatus === "CONFIRMED") {
        // Create check-call schedule if none exists
        const existingSchedule = await prisma.checkCallSchedule.findFirst({ where: { loadId } });
        if (!existingSchedule) {
          const freq = load.urgencyLevel === "URGENT" ? 120 : 240;
          const firstCheckTime = load.pickupDate
            ? new Date(new Date(load.pickupDate).getTime() - 4 * 60 * 60 * 1000)
            : new Date(Date.now() + freq * 60 * 1000);

          await prisma.checkCallSchedule.create({
            data: {
              loadId,
              scheduledTime: firstCheckTime,
              type: "PRE_PICKUP",
              status: "PENDING",
            },
          });
        }
      }

      if (newStatus === "IN_TRANSIT") {
        // Activate check-call schedule — update next scheduled time
        const freq = load.urgencyLevel === "URGENT" ? 120 : 240;
        await prisma.checkCallSchedule.updateMany({
          where: { loadId, status: "PENDING" },
          data: {
            scheduledTime: new Date(Date.now() + freq * 60 * 1000),
            type: "MIDPOINT",
          },
        });
      }

      if (newStatus === "DELIVERED") {
        // Deactivate check-call schedules
        await prisma.checkCallSchedule.updateMany({
          where: { loadId, status: { in: ["PENDING", "SENT"] } },
          data: { status: "RESPONDED" },
        });

        // Record actual delivery time
        await prisma.load.update({
          where: { id: loadId },
          data: { actualDeliveryDatetime: new Date() },
        });

        // Calculate on-time for last delivery stop
        const delStop = load.loadStops.find(
          (s) => s.stopType === "DELIVERY" && s.onTime === null
        );
        if (delStop && delStop.appointmentDate) {
          const apptTime = delStop.appointmentTime || "23:59";
          const apptDateStr = new Date(delStop.appointmentDate).toISOString().split("T")[0];
          const apptDeadline = new Date(`${apptDateStr}T${apptTime}`);
          const onTime = new Date() <= apptDeadline;
          await prisma.loadStop.update({
            where: { id: delStop.id },
            data: { actualArrival: new Date(), onTime },
          });
        }
      }

      res.json({
        success: true,
        previousStatus,
        newStatus,
        event,
      });
    } catch (err) {
      log.error({ err: err }, "Status change error:");
      res.status(500).json({ error: "Failed to update load status" });
    }
  }
);

// POST /api/load-tracking/:loadId/confirm-loaded — Carrier confirms loaded
router.post(
  "/:loadId/confirm-loaded",
  authorize("CARRIER", "BROKER", "ADMIN", "DISPATCH", "OPERATIONS") as any,
  auditLog("STATUS_CHANGE", "Load"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { timestamp, trailerNumber, sealNumber } = req.body;

      if (!timestamp || !trailerNumber) {
        return res.status(400).json({ error: "Carrier must provide timestamp and trailer number" });
      }

      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: { loadStops: { orderBy: { stopNumber: "asc" } } },
      });
      if (!load) return res.status(404).json({ error: "Load not found" });

      const loadedTime = new Date(timestamp);

      // Update trailer number on load
      await prisma.load.update({
        where: { id: loadId },
        data: {
          trailerNumber,
          status: "LOADED",
          statusUpdatedAt: new Date(),
          statusUpdatedById: req.user!.id,
        },
      });

      // Find the current pickup stop and record departure + detention
      const pickupStop = load.loadStops.find(
        (s) => s.stopType === "PICKUP" && !s.actualDeparture
      );

      let detentionCreated = false;
      if (pickupStop) {
        const updateData: any = {
          actualDeparture: loadedTime,
          trailerNumber,
          sealNumber: sealNumber || null,
        };

        // Calculate detention if applicable
        if (pickupStop.actualArrival) {
          const freeTimeMs = 2 * 60 * 60 * 1000; // 2 hours default
          const dwellMs = loadedTime.getTime() - new Date(pickupStop.actualArrival).getTime();
          if (dwellMs > freeTimeMs) {
            const detentionMin = Math.round((dwellMs - freeTimeMs) / 60000);
            updateData.detentionStart = new Date(
              new Date(pickupStop.actualArrival).getTime() + freeTimeMs
            );
            updateData.detentionMinutes = detentionMin;

            // Auto-create detention accessorial
            await prisma.loadAccessorial.create({
              data: {
                loadId,
                stopId: pickupStop.id,
                type: "DETENTION_PU",
                amount: Math.round((detentionMin / 60) * 75 * 100) / 100,
                quantity: detentionMin,
                unit: "minutes",
                rate: 75,
                billedTo: "SHIPPER",
                createdBy: req.user!.id,
              },
            });
            detentionCreated = true;
          }
        }

        await prisma.loadStop.update({
          where: { id: pickupStop.id },
          data: updateData,
        });
      }

      // Record tracking event
      await prisma.loadTrackingEvent.create({
        data: {
          loadId,
          stopId: pickupStop?.id || null,
          eventType: "STATUS_CHANGE",
          statusFrom: load.status,
          statusTo: "LOADED",
          notes: `Carrier confirmed loaded. Trailer: ${trailerNumber}${sealNumber ? `, Seal: ${sealNumber}` : ""}`,
          createdBy: req.user!.id,
        },
      });

      res.json({
        success: true,
        status: "LOADED",
        trailerNumber,
        sealNumber,
        detentionCreated,
      });
    } catch (err) {
      log.error({ err: err }, "Confirm loaded error:");
      res.status(500).json({ error: "Failed to confirm loaded" });
    }
  }
);

// POST /api/load-tracking/:loadId/confirm-delivered — Carrier confirms delivered
router.post(
  "/:loadId/confirm-delivered",
  authorize("CARRIER", "BROKER", "ADMIN", "DISPATCH", "OPERATIONS") as any,
  auditLog("STATUS_CHANGE", "Load"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { timestamp } = req.body;

      if (!timestamp) {
        return res.status(400).json({ error: "Timestamp is required" });
      }

      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: { loadStops: { orderBy: { stopNumber: "asc" } } },
      });
      if (!load) return res.status(404).json({ error: "Load not found" });

      const deliveredTime = new Date(timestamp);

      // Find delivery stop
      const delStop = load.loadStops.find(
        (s) => s.stopType === "DELIVERY" && !s.actualDeparture
      );

      if (delStop) {
        const updateData: any = { actualDeparture: deliveredTime };

        // Calculate on-time
        if (delStop.appointmentDate) {
          const apptTime = delStop.appointmentTime || "23:59";
          const apptDateStr = new Date(delStop.appointmentDate).toISOString().split("T")[0];
          const apptDeadline = new Date(`${apptDateStr}T${apptTime}`);
          updateData.onTime = deliveredTime <= apptDeadline;
        }

        // Calculate delivery detention
        if (delStop.actualArrival) {
          const freeTimeMs = 2 * 60 * 60 * 1000;
          const dwellMs = deliveredTime.getTime() - new Date(delStop.actualArrival).getTime();
          if (dwellMs > freeTimeMs) {
            const detentionMin = Math.round((dwellMs - freeTimeMs) / 60000);
            updateData.detentionStart = new Date(
              new Date(delStop.actualArrival).getTime() + freeTimeMs
            );
            updateData.detentionMinutes = detentionMin;

            await prisma.loadAccessorial.create({
              data: {
                loadId,
                stopId: delStop.id,
                type: "DETENTION_DEL",
                amount: Math.round((detentionMin / 60) * 75 * 100) / 100,
                quantity: detentionMin,
                unit: "minutes",
                rate: 75,
                billedTo: "SHIPPER",
                createdBy: req.user!.id,
              },
            });
          }
        }

        await prisma.loadStop.update({
          where: { id: delStop.id },
          data: updateData,
        });
      }

      // Update load
      await prisma.load.update({
        where: { id: loadId },
        data: {
          status: "DELIVERED",
          actualDeliveryDatetime: deliveredTime,
          statusUpdatedAt: new Date(),
          statusUpdatedById: req.user!.id,
        },
      });

      // Deactivate check-call schedules
      await prisma.checkCallSchedule.updateMany({
        where: { loadId, status: { in: ["PENDING", "SENT"] } },
        data: { status: "RESPONDED" },
      });

      // Record event
      await prisma.loadTrackingEvent.create({
        data: {
          loadId,
          stopId: delStop?.id || null,
          eventType: "STATUS_CHANGE",
          statusFrom: load.status,
          statusTo: "DELIVERED",
          notes: "Carrier confirmed delivery",
          createdBy: req.user!.id,
        },
      });

      res.json({
        success: true,
        status: "DELIVERED",
        onTime: delStop ? (delStop as any).onTime : null,
      });
    } catch (err) {
      log.error({ err: err }, "Confirm delivered error:");
      res.status(500).json({ error: "Failed to confirm delivered" });
    }
  }
);

// GET /api/load-tracking/:loadId/playback — Historical breadcrumb trail for map replay
router.get(
  "/:loadId/playback",
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const events = await prisma.loadTrackingEvent.findMany({
        where: {
          loadId,
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: {
          latitude: true,
          longitude: true,
          locationCity: true,
          locationState: true,
          locationSource: true,
          createdAt: true,
        },
      });
      res.json({ breadcrumbs: events });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch playback data" });
    }
  }
);

// GET /api/load-tracking/:loadId/detention — Current dwell time and detention alert
router.get("/:loadId/detention", async (req: AuthRequest, res: Response) => {
  try {
    const { loadId } = req.params;
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { status: true, loadStops: { orderBy: { stopNumber: "asc" } } },
    });
    if (!load) { res.status(404).json({ error: "Load not found" }); return; }

    // Find the current stop (AT_PICKUP or AT_DELIVERY) with arrival but no departure
    const activeStop = load.loadStops.find((s) => s.actualArrival && !s.actualDeparture);
    if (!activeStop) { res.json({ detention: false, dwellMinutes: 0 }); return; }

    const dwellMs = Date.now() - new Date(activeStop.actualArrival!).getTime();
    const dwellMinutes = Math.round(dwellMs / 60000);
    const freeTimeMinutes = 120; // 2 hour industry standard
    const inDetention = dwellMinutes > freeTimeMinutes;
    const detentionMinutes = inDetention ? dwellMinutes - freeTimeMinutes : 0;
    const estimatedCharge = inDetention ? Math.round((detentionMinutes / 60) * 75 * 100) / 100 : 0;

    res.json({
      detention: inDetention,
      dwellMinutes,
      detentionMinutes,
      freeTimeMinutes,
      estimatedCharge,
      facilityName: activeStop.facilityName,
      stopType: activeStop.stopType,
      arrivedAt: activeStop.actualArrival,
      severity: detentionMinutes > 120 ? "CRITICAL" : detentionMinutes > 60 ? "HIGH" : inDetention ? "MEDIUM" : "LOW",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch detention data" });
  }
});

export default router;
