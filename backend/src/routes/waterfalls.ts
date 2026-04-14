import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import {
  buildWaterfall,
  startWaterfall,
  advanceWaterfall,
  declinePosition,
  acceptPosition,
} from "../services/waterfallEngineService";
import { scoreCarriersForLoad, loadLoadContext } from "../services/waterfallScoringService";
import { logWaterfallEvent } from "../services/waterfallEventService";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

const AE_ROLES = ["BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE"] as const;

// ─── Waterfall board summary + list ────────────────────────

router.get(
  "/summary",
  authorize(...AE_ROLES) as any,
  async (_req: AuthRequest, res: Response) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [pending, activeWaterfalls, dispatchedToday, exhausted, acceptedIn30, totalIn30] =
        await Promise.all([
          prisma.load.count({
            where: { status: "POSTED", dispatchMethod: "waterfall", deletedAt: null },
          }),
          prisma.waterfall.count({ where: { status: "active" } }),
          prisma.load.count({
            where: { dispatchedAt: { gte: todayStart }, deletedAt: null },
          }),
          prisma.waterfall.count({ where: { status: "exhausted" } }),
          prisma.waterfallPosition.count({
            where: { status: "accepted", respondedAt: { gte: thirtyDaysAgo } },
          }),
          prisma.waterfallPosition.count({
            where: {
              status: { in: ["accepted", "declined", "expired"] },
              respondedAt: { gte: thirtyDaysAgo },
            },
          }),
        ]);

      const acceptanceRate = totalIn30 > 0 ? Math.round((acceptedIn30 / totalIn30) * 100) : null;

      res.json({
        pending,
        activeWaterfalls,
        dispatchedToday,
        exhausted,
        acceptanceRate,
      });
    } catch (err) {
      log.error({ err }, "[Waterfall] summary error");
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  }
);

router.get(
  "/loads",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const tab = (req.query.tab as string) || "active";
      let where: any = { deletedAt: null };

      if (tab === "pending") {
        where.status = "POSTED";
        where.waterfalls = { none: { status: { in: ["active", "paused"] } } };
      } else if (tab === "active") {
        where.waterfalls = { some: { status: "active" } };
      } else if (tab === "dispatched") {
        where.dispatchedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      } else if (tab === "exhausted") {
        where.waterfalls = { some: { status: "exhausted" } };
      }

      const loads = await prisma.load.findMany({
        where,
        orderBy: [{ pickupDate: "asc" }, { createdAt: "desc" }],
        take: 200,
        select: {
          id: true,
          loadNumber: true,
          referenceNumber: true,
          status: true,
          visibility: true,
          dispatchMethod: true,
          waterfallMode: true,
          originCity: true,
          originState: true,
          destCity: true,
          destState: true,
          equipmentType: true,
          pickupDate: true,
          deliveryDate: true,
          customerRate: true,
          carrierRate: true,
          rate: true,
          dispatchedAt: true,
          customer: { select: { id: true, name: true } },
          waterfalls: {
            where: { status: { in: ["building", "active", "paused", "exhausted", "completed"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              positions: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  position: true,
                  status: true,
                  carrierId: true,
                  matchScore: true,
                  offeredRate: true,
                  tenderExpiresAt: true,
                  isFallback: true,
                },
              },
            },
          },
        },
      });

      res.json({ loads, total: loads.length });
    } catch (err) {
      log.error({ err }, "[Waterfall] loads error");
      res.status(500).json({ error: "Failed to fetch loads" });
    }
  }
);

// ─── Waterfall CRUD ────────────────────────────────────────

router.get(
  "/:id",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const wf = await prisma.waterfall.findUnique({
        where: { id: req.params.id },
        include: {
          positions: {
            orderBy: { position: "asc" },
            include: { tenders: true },
          },
          load: {
            include: {
              customer: { select: { id: true, name: true } },
              loadBids: { orderBy: { submittedAt: "desc" } },
              loadNotes: { orderBy: { createdAt: "desc" } },
              loadActivities: { orderBy: { createdAt: "desc" }, take: 100 },
            },
          },
        },
      });
      if (!wf) return res.status(404).json({ error: "Waterfall not found" });

      // Enrich positions with carrier info
      const carrierIds = wf.positions.map((p) => p.carrierId).filter(Boolean) as string[];
      const carriers = await prisma.user.findMany({
        where: { id: { in: carrierIds } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          carrierProfile: {
            select: {
              id: true,
              companyName: true,
              cppTier: true,
              equipmentTypes: true,
              operatingRegions: true,
            },
          },
        },
      });
      const carrierMap = new Map(carriers.map((c) => [c.id, c]));

      const enrichedPositions = wf.positions.map((p) => ({
        ...p,
        carrier: p.carrierId ? carrierMap.get(p.carrierId) ?? null : null,
      }));

      res.json({ waterfall: { ...wf, positions: enrichedPositions } });
    } catch (err) {
      log.error({ err }, "[Waterfall] get error");
      res.status(500).json({ error: "Failed to fetch waterfall" });
    }
  }
);

router.post(
  "/",
  authorize(...AE_ROLES) as any,
  auditLog("CREATE", "Waterfall"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId, mode } = req.body as { loadId: string; mode?: "manual" | "semi_auto" | "full_auto" };
      if (!loadId) return res.status(400).json({ error: "loadId required" });
      const wf = await buildWaterfall(loadId, { mode, createdById: req.user?.id });
      res.status(201).json({ waterfall: wf });
    } catch (err: any) {
      log.error({ err }, "[Waterfall] create error");
      res.status(500).json({ error: err?.message ?? "Failed to create waterfall" });
    }
  }
);

router.post(
  "/:id/start",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const wf = await startWaterfall(req.params.id);
      res.json({ waterfall: wf });
    } catch (err: any) {
      log.error({ err }, "[Waterfall] start error");
      res.status(400).json({ error: err?.message ?? "Failed to start waterfall" });
    }
  }
);

router.patch(
  "/:id",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { action } = req.body as { action: "pause" | "resume" | "cancel" };
      const wf = await prisma.waterfall.findUnique({ where: { id: req.params.id } });
      if (!wf) return res.status(404).json({ error: "Waterfall not found" });

      if (action === "pause") {
        await prisma.waterfall.update({ where: { id: wf.id }, data: { status: "paused" } });
        await logWaterfallEvent({
          loadId: wf.loadId,
          event: "waterfall_paused",
          description: "Waterfall paused",
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
        });
      } else if (action === "resume") {
        await prisma.waterfall.update({ where: { id: wf.id }, data: { status: "active" } });
        await logWaterfallEvent({
          loadId: wf.loadId,
          event: "waterfall_resumed",
          description: "Waterfall resumed",
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
        });
      } else if (action === "cancel") {
        await prisma.waterfall.update({
          where: { id: wf.id },
          data: { status: "cancelled", completedAt: new Date() },
        });
        await prisma.waterfallPosition.updateMany({
          where: { waterfallId: wf.id, status: { in: ["queued", "tendered"] } },
          data: { status: "skipped" },
        });
        await logWaterfallEvent({
          loadId: wf.loadId,
          event: "waterfall_cancelled",
          description: "Waterfall cancelled",
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
        });
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }

      res.json({ ok: true });
    } catch (err: any) {
      log.error({ err }, "[Waterfall] patch error");
      res.status(500).json({ error: err?.message ?? "Failed" });
    }
  }
);

// Skip current tendered position — advance to next
router.patch(
  "/:id/positions/:posId/skip",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const pos = await prisma.waterfallPosition.findUnique({
        where: { id: req.params.posId },
      });
      if (!pos || pos.waterfallId !== req.params.id) {
        return res.status(404).json({ error: "Position not found" });
      }

      await prisma.waterfallPosition.update({
        where: { id: pos.id },
        data: { status: "skipped", respondedAt: new Date() },
      });
      await prisma.loadTender.updateMany({
        where: { waterfallPositionId: pos.id, status: "OFFERED" },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      const wf = await prisma.waterfall.findUnique({
        where: { id: pos.waterfallId },
        select: { loadId: true },
      });
      if (wf) {
        await logWaterfallEvent({
          loadId: wf.loadId,
          event: "position_skipped",
          description: `Position #${pos.position} skipped by AE`,
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
          metadata: { positionId: pos.id },
        });
      }

      await advanceWaterfall(pos.waterfallId, pos.position + 1);
      res.json({ ok: true });
    } catch (err) {
      log.error({ err }, "[Waterfall] skip error");
      res.status(500).json({ error: "Failed to skip position" });
    }
  }
);

// Add a carrier to the waterfall (manual builder)
router.post(
  "/:id/positions",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { carrierUserId, offeredRate, insertAt } = req.body as {
        carrierUserId: string;
        offeredRate?: number;
        insertAt?: number;
      };
      const wf = await prisma.waterfall.findUnique({
        where: { id: req.params.id },
        include: { positions: { orderBy: { position: "asc" } } },
      });
      if (!wf) return res.status(404).json({ error: "Waterfall not found" });

      const fallback = wf.positions.find((p) => p.isFallback);
      const insertPos =
        insertAt ?? (fallback ? fallback.position : wf.positions.length + 1);

      // Shift existing positions from insertPos onward
      await prisma.waterfallPosition.updateMany({
        where: { waterfallId: wf.id, position: { gte: insertPos } },
        data: { position: { increment: 1 } },
      });

      const newPos = await prisma.waterfallPosition.create({
        data: {
          waterfallId: wf.id,
          carrierId: carrierUserId,
          position: insertPos,
          status: "queued",
          offeredRate: offeredRate ?? null,
        },
      });

      await prisma.waterfall.update({
        where: { id: wf.id },
        data: { totalPositions: { increment: 1 } },
      });

      await logWaterfallEvent({
        loadId: wf.loadId,
        event: "waterfall_built",
        description: `Position #${insertPos} added manually`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { positionId: newPos.id, carrierUserId },
      });

      res.status(201).json({ position: newPos });
    } catch (err) {
      log.error({ err }, "[Waterfall] add position error");
      res.status(500).json({ error: "Failed to add position" });
    }
  }
);

// ─── Carrier match preview (drawer Match tab) ──────────────

router.get(
  "/load/:loadId/carrier-matches",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = await loadLoadContext(req.params.loadId);
      if (!ctx) return res.status(404).json({ error: "Load not found" });
      const scored = await scoreCarriersForLoad(ctx);
      res.json({ carriers: scored });
    } catch (err) {
      log.error({ err }, "[Waterfall] carrier-matches error");
      res.status(500).json({ error: "Failed to fetch carrier matches" });
    }
  }
);

// ─── Tender accept / decline (carrier portal) ──────────────

router.post(
  "/tenders/:positionId/accept",
  authorize("CARRIER", ...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      await acceptPosition(req.params.positionId, req.user?.id);
      res.json({ ok: true });
    } catch (err) {
      log.error({ err }, "[Waterfall] accept error");
      res.status(500).json({ error: "Failed to accept tender" });
    }
  }
);

router.post(
  "/tenders/:positionId/decline",
  authorize("CARRIER", ...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { reason } = req.body as { reason?: string };
      await declinePosition(req.params.positionId, reason ?? null, req.user?.id);
      res.json({ ok: true });
    } catch (err) {
      log.error({ err }, "[Waterfall] decline error");
      res.status(500).json({ error: "Failed to decline tender" });
    }
  }
);

export default router;
