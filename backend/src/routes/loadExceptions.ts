import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { broadcastSSE } from "./trackTraceSSE";
import { logLoadActivity } from "../services/loadActivityService";
import {
  EXCEPTION_REASONS,
  EXCEPTION_GROUPS,
  isValidExceptionCode,
  getExceptionReason,
} from "../services/exceptionTaxonomy";

const router = Router();
router.use(authenticate);

// GET /api/load-exceptions/taxonomy — dropdown tree for UI
router.get("/taxonomy", (_req, res: Response) => {
  const grouped = EXCEPTION_GROUPS.map(group => ({
    group,
    reasons: EXCEPTION_REASONS.filter(r => r.group === group),
  }));
  res.json({ groups: grouped, flat: EXCEPTION_REASONS });
});

// GET /api/load-exceptions/load/:loadId — exceptions for a load
router.get("/load/:loadId", async (req: AuthRequest, res: Response) => {
  try {
    const exceptions = await prisma.loadException.findMany({
      where: { loadId: req.params.loadId },
      orderBy: { reportedAt: "desc" },
      include: { documents: true },
    });
    res.json({ exceptions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch exceptions" });
  }
});

// GET /api/load-exceptions/:id — single exception
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const exc = await prisma.loadException.findUnique({
      where: { id: req.params.id },
      include: { documents: true, load: { select: { id: true, loadNumber: true, referenceNumber: true } } },
    });
    if (!exc) return res.status(404).json({ error: "Exception not found" });
    res.json({ exception: exc });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch exception" });
  }
});

// POST /api/load-exceptions/load/:loadId — log new exception (AE console)
router.post(
  "/load/:loadId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("CREATE", "LoadException"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const {
        category, unitType, description, locationText, locationLat, locationLng,
        etaImpactMinutes, repairShopName, repairShopPhone, repairEta, repairCost,
        repairCostResponsibility, receiptRequested,
      } = req.body;

      if (!category || !isValidExceptionCode(category)) {
        return res.status(400).json({ error: "Invalid exception category" });
      }

      const reason = getExceptionReason(category)!;

      const load = await prisma.load.findUnique({ where: { id: loadId }, select: { id: true } });
      if (!load) return res.status(404).json({ error: "Load not found" });

      const exception = await prisma.loadException.create({
        data: {
          loadId,
          category,
          unitType: unitType ?? reason.unitType,
          description: description ?? null,
          locationText: locationText ?? null,
          locationLat: locationLat ?? null,
          locationLng: locationLng ?? null,
          reportedById: req.user?.id ?? null,
          reportedByName: req.user?.email ?? null,
          reportedSource: "AE_CONSOLE",
          etaImpactMinutes: etaImpactMinutes ?? null,
          repairShopName: repairShopName ?? null,
          repairShopPhone: repairShopPhone ?? null,
          repairEta: repairEta ? new Date(repairEta) : null,
          repairCost: repairCost ?? null,
          repairCostResponsibility: repairCostResponsibility ?? null,
          receiptStatus: receiptRequested ? "REQUESTED" : "NONE",
        },
      });

      await logLoadActivity({
        loadId,
        eventType: "exception_logged",
        description: `Exception: ${reason.label}`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { exceptionId: exception.id, category, unitType: exception.unitType },
      });

      broadcastSSE({
        type: "alert",
        loadId,
        data: { kind: "exception", exceptionId: exception.id, category, label: reason.label },
      });

      res.status(201).json({ exception });
    } catch (err) {
      res.status(500).json({ error: "Failed to create exception" });
    }
  }
);

// PATCH /api/load-exceptions/:id — resolve, add note, notify shipper
router.patch(
  "/:id",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("UPDATE", "LoadException"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const {
        action, // "resolve" | "reopen" | "notify_shipper" | "update"
        resolutionNotes,
        description,
        repairShopName, repairShopPhone, repairEta, repairCost,
        receiptStatus,
      } = req.body;

      const existing = await prisma.loadException.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Exception not found" });

      const data: any = {};
      let activityEvent: string | null = null;
      let activityDescription = "";

      if (action === "resolve") {
        data.status = "RESOLVED";
        data.resolvedAt = new Date();
        data.resolvedById = req.user?.id;
        data.resolutionNotes = resolutionNotes ?? existing.resolutionNotes;
        activityEvent = "exception_resolved";
        activityDescription = `Exception resolved: ${getExceptionReason(existing.category)?.label ?? existing.category}`;
      } else if (action === "reopen") {
        data.status = "OPEN";
        data.resolvedAt = null;
        data.resolvedById = null;
        activityEvent = "exception_reopened";
        activityDescription = `Exception reopened`;
      } else if (action === "notify_shipper") {
        data.shipperNotified = true;
        data.shipperNotifiedAt = new Date();
        activityEvent = "exception_shipper_notified";
        activityDescription = `Shipper notified of exception`;
      } else {
        if (description !== undefined) data.description = description;
        if (repairShopName !== undefined) data.repairShopName = repairShopName;
        if (repairShopPhone !== undefined) data.repairShopPhone = repairShopPhone;
        if (repairEta !== undefined) data.repairEta = repairEta ? new Date(repairEta) : null;
        if (repairCost !== undefined) data.repairCost = repairCost;
        if (receiptStatus !== undefined) data.receiptStatus = receiptStatus;
      }

      const updated = await prisma.loadException.update({ where: { id }, data });

      if (activityEvent) {
        await logLoadActivity({
          loadId: existing.loadId,
          eventType: activityEvent,
          description: activityDescription,
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
          metadata: { exceptionId: id },
        });

        broadcastSSE({
          type: "alert",
          loadId: existing.loadId,
          data: { kind: activityEvent, exceptionId: id },
        });
      }

      res.json({ exception: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update exception" });
    }
  }
);

export default router;
