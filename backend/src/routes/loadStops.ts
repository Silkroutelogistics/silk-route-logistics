import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { log } from "../lib/logger";
import { applyStopDwellCharges } from "../lib/detentionLayover";

const router = Router();
router.use(authenticate);

/**
 * Settle detention and layover for a stop whose departure was just written.
 *
 * Both stop-edit endpoints below set actualDeparture directly. Before this
 * helper existed, neither reconciled, and that was not merely a missed charge:
 * the alert engine selects on `actualDeparture: null`, so the moment an AE saved
 * a departure the stop left the engine's query forever, and the only path that
 * walks a provisional layover back is the "final" pass, which nothing on these
 * routes ever ran. The concrete failure was permanent. A stop open 31h has the
 * engine write LAYOVER $250. An AE then records the real 5h departure. The
 * ledger keeps the $250 layover, never writes the $150 detention that actually
 * applies, and no later pass corrects it.
 *
 * Routing through the single owner fixes amount and composition together, and
 * makes the walk-back reachable.
 *
 * Never throws into the response. A stop edit is not a billing operation from
 * the AE's point of view, and a reconciler failure must not lose their edit.
 */
async function settleDwellForStop(stopId: string): Promise<void> {
  try {
    const stop = await prisma.loadStop.findUnique({
      where: { id: stopId },
      select: {
        id: true,
        loadId: true,
        stopType: true,
        facilityName: true,
        actualArrival: true,
        actualDeparture: true,
      },
    });
    if (!stop?.actualArrival || !stop.actualDeparture) return;

    await applyStopDwellCharges(prisma, {
      loadId: stop.loadId,
      stopId: stop.id,
      stopType: stop.stopType,
      arrivalAt: new Date(stop.actualArrival),
      departedAt: new Date(stop.actualDeparture),
      phase: "final",
      facilityName: stop.facilityName,
    });
  } catch (err) {
    log.error({ err, stopId }, "Dwell reconciliation failed after stop edit");
  }
}

// GET /api/load-stops/:loadId — Get all stops ordered by stop_number
router.get(
  "/:loadId",
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const stops = await prisma.loadStop.findMany({
        where: { loadId },
        orderBy: { stopNumber: "asc" },
        include: {
          trackingEvents: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          accessorials: true,
        },
      });
      res.json({ stops });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stops" });
    }
  }
);

// POST /api/load-stops/:loadId — Add a stop
router.post(
  "/:loadId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("CREATE", "LoadStop"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const {
        stopType, facilityName, address, city, state, zip,
        latitude, longitude, appointmentDate, appointmentTime,
        appointmentRef, hookType, commodity, weight, pieces, notes,
        contactName, contactPhone, dwellMinutes, isPayable,
      } = req.body;

      // Determine the next stop number
      const lastStop = await prisma.loadStop.findFirst({
        where: { loadId },
        orderBy: { stopNumber: "desc" },
      });
      const stopNumber = (lastStop?.stopNumber || 0) + 1;

      const stop = await prisma.loadStop.create({
        data: {
          loadId,
          stopNumber,
          stopType,
          facilityName,
          address,
          city,
          state,
          zip,
          latitude: latitude || null,
          longitude: longitude || null,
          appointmentDate: appointmentDate ? new Date(appointmentDate) : null,
          appointmentTime: appointmentTime || null,
          appointmentRef: appointmentRef || null,
          hookType: hookType || null,
          commodity: commodity || null,
          weight: weight || null,
          pieces: pieces || null,
          contactName: contactName || null,
          contactPhone: contactPhone || null,
          dwellMinutes: dwellMinutes || null,
          isPayable: isPayable ?? true,
          notes: notes || null,
        },
      });

      // Mark load as multi-stop if more than 2 stops
      const stopCount = await prisma.loadStop.count({ where: { loadId } });
      if (stopCount > 2) {
        await prisma.load.update({
          where: { id: loadId },
          data: { isMultiStop: true },
        });
      }

      res.status(201).json({ stop });
    } catch (err) {
      log.error({ err: err }, "Create stop error:");
      res.status(500).json({ error: "Failed to create stop" });
    }
  }
);

// PUT /api/load-stops/:loadId/:stopId — Update stop
router.put(
  "/:loadId/:stopId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "CARRIER") as any,
  auditLog("UPDATE", "LoadStop"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { stopId } = req.params;
      const {
        facilityName, address, city, state, zip,
        latitude, longitude, appointmentDate, appointmentTime,
        appointmentRef, actualArrival, actualDeparture,
        hookType, trailerNumber, sealNumber, commodity,
        weight, pieces, onTime, notes, detentionMinutes,
        contactName, contactPhone, dwellMinutes, isPayable,
      } = req.body;

      const updateData: any = {};

      if (facilityName !== undefined) updateData.facilityName = facilityName;
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (zip !== undefined) updateData.zip = zip;
      if (latitude !== undefined) updateData.latitude = latitude;
      if (longitude !== undefined) updateData.longitude = longitude;
      if (appointmentDate !== undefined) updateData.appointmentDate = appointmentDate ? new Date(appointmentDate) : null;
      if (appointmentTime !== undefined) updateData.appointmentTime = appointmentTime;
      if (appointmentRef !== undefined) updateData.appointmentRef = appointmentRef;
      if (actualArrival !== undefined) updateData.actualArrival = actualArrival ? new Date(actualArrival) : null;
      if (actualDeparture !== undefined) updateData.actualDeparture = actualDeparture ? new Date(actualDeparture) : null;
      if (hookType !== undefined) updateData.hookType = hookType;
      if (trailerNumber !== undefined) updateData.trailerNumber = trailerNumber;
      if (sealNumber !== undefined) updateData.sealNumber = sealNumber;
      if (commodity !== undefined) updateData.commodity = commodity;
      if (weight !== undefined) updateData.weight = weight;
      if (pieces !== undefined) updateData.pieces = pieces;
      if (onTime !== undefined) updateData.onTime = onTime;
      if (notes !== undefined) updateData.notes = notes;
      if (detentionMinutes !== undefined) updateData.detentionMinutes = detentionMinutes;
      if (contactName !== undefined) updateData.contactName = contactName;
      if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
      if (dwellMinutes !== undefined) updateData.dwellMinutes = dwellMinutes;
      if (isPayable !== undefined) updateData.isPayable = isPayable;

      const stop = await prisma.loadStop.update({
        where: { id: stopId },
        data: updateData,
      });

      // An edit that moves either dwell timestamp changes what this stop owes.
      // Hand the stop to the single owner rather than leaving a departure
      // written here and the money written somewhere else.
      if (actualArrival !== undefined || actualDeparture !== undefined) {
        await settleDwellForStop(stopId);
      }

      res.json({ stop });
    } catch (err) {
      res.status(500).json({ error: "Failed to update stop" });
    }
  }
);

// DELETE /api/load-stops/:loadId/:stopId — Remove a stop and reorder remaining
router.delete(
  "/:loadId/:stopId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("DELETE", "LoadStop"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId, stopId } = req.params;

      const deletedStop = await prisma.loadStop.delete({
        where: { id: stopId },
      });

      // Reorder remaining stops
      const remainingStops = await prisma.loadStop.findMany({
        where: { loadId },
        orderBy: { stopNumber: "asc" },
      });

      for (let i = 0; i < remainingStops.length; i++) {
        if (remainingStops[i].stopNumber !== i + 1) {
          await prisma.loadStop.update({
            where: { id: remainingStops[i].id },
            data: { stopNumber: i + 1 },
          });
        }
      }

      // Update isMultiStop flag
      const stopCount = await prisma.loadStop.count({ where: { loadId } });
      await prisma.load.update({
        where: { id: loadId },
        data: { isMultiStop: stopCount > 2 },
      });

      res.json({ success: true, deleted: deletedStop.id });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete stop" });
    }
  }
);

// PUT /api/load-stops/:loadId/reorder — Reorder stops
router.put(
  "/:loadId/reorder",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("UPDATE", "LoadStop"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { order } = req.body; // Array of { stopId: string, sequence: number }

      if (!Array.isArray(order) || order.length === 0) {
        res.status(400).json({ error: "order must be a non-empty array of { stopId, sequence }" });
        return;
      }

      // Validate all stops belong to this load
      const existingStops = await prisma.loadStop.findMany({ where: { loadId } });
      const existingIds = new Set(existingStops.map((s) => s.id));
      for (const item of order) {
        if (!existingIds.has(item.stopId)) {
          res.status(400).json({ error: `Stop ${item.stopId} does not belong to load ${loadId}` });
          return;
        }
      }

      // Update all stop numbers in a transaction
      await prisma.$transaction(
        order.map((item: { stopId: string; sequence: number }) =>
          prisma.loadStop.update({
            where: { id: item.stopId },
            data: { stopNumber: item.sequence },
          })
        )
      );

      const stops = await prisma.loadStop.findMany({
        where: { loadId },
        orderBy: { stopNumber: "asc" },
      });

      res.json({ stops });
    } catch (err) {
      log.error({ err: err }, "Reorder stops error:");
      res.status(500).json({ error: "Failed to reorder stops" });
    }
  }
);

// PATCH /api/load-stops/stop/:stopId — Update stop by stopId only
router.patch(
  "/stop/:stopId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "CARRIER") as any,
  auditLog("UPDATE", "LoadStop"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { stopId } = req.params;
      const {
        facilityName, address, city, state, zip,
        latitude, longitude, appointmentDate, appointmentTime,
        appointmentRef, actualArrival, actualDeparture,
        hookType, trailerNumber, sealNumber, commodity,
        weight, pieces, onTime, notes, detentionMinutes,
        contactName, contactPhone, dwellMinutes, isPayable,
      } = req.body;

      const updateData: any = {};
      if (facilityName !== undefined) updateData.facilityName = facilityName;
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (zip !== undefined) updateData.zip = zip;
      if (latitude !== undefined) updateData.latitude = latitude;
      if (longitude !== undefined) updateData.longitude = longitude;
      if (appointmentDate !== undefined) updateData.appointmentDate = appointmentDate ? new Date(appointmentDate) : null;
      if (appointmentTime !== undefined) updateData.appointmentTime = appointmentTime;
      if (appointmentRef !== undefined) updateData.appointmentRef = appointmentRef;
      if (actualArrival !== undefined) updateData.actualArrival = actualArrival ? new Date(actualArrival) : null;
      if (actualDeparture !== undefined) updateData.actualDeparture = actualDeparture ? new Date(actualDeparture) : null;
      if (hookType !== undefined) updateData.hookType = hookType;
      if (trailerNumber !== undefined) updateData.trailerNumber = trailerNumber;
      if (sealNumber !== undefined) updateData.sealNumber = sealNumber;
      if (commodity !== undefined) updateData.commodity = commodity;
      if (weight !== undefined) updateData.weight = weight;
      if (pieces !== undefined) updateData.pieces = pieces;
      if (onTime !== undefined) updateData.onTime = onTime;
      if (notes !== undefined) updateData.notes = notes;
      if (detentionMinutes !== undefined) updateData.detentionMinutes = detentionMinutes;
      if (contactName !== undefined) updateData.contactName = contactName;
      if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
      if (dwellMinutes !== undefined) updateData.dwellMinutes = dwellMinutes;
      if (isPayable !== undefined) updateData.isPayable = isPayable;

      const stop = await prisma.loadStop.update({
        where: { id: stopId },
        data: updateData,
      });

      // An edit that moves either dwell timestamp changes what this stop owes.
      // Hand the stop to the single owner rather than leaving a departure
      // written here and the money written somewhere else.
      if (actualArrival !== undefined || actualDeparture !== undefined) {
        await settleDwellForStop(stopId);
      }

      res.json({ stop });
    } catch (err) {
      res.status(500).json({ error: "Failed to update stop" });
    }
  }
);

export default router;
