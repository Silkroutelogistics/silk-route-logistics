import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();
router.use(authenticate);

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
      console.error("Create stop error:", err);
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

      const stop = await prisma.loadStop.update({
        where: { id: stopId },
        data: updateData,
      });

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

export default router;
