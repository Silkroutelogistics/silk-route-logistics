import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { logWaterfallEvent } from "../services/waterfallEventService";
import { createCheckCallSchedule } from "../services/checkCallAutomation";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

const AE_ROLES = ["BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE"] as const;

// ─── Loadboard feed (carrier portal) ──────────────────────
// Returns loads visible to the authenticated carrier based on the
// spec visibility rules: open (all approved carriers), reserved (only
// directTenderCarrierId). Waterfall/DAT hidden.
router.get("/loadboard", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const profile = await prisma.carrierProfile.findUnique({
      where: { userId },
      select: { id: true, onboardingStatus: true },
    });
    if (!profile || profile.onboardingStatus !== "APPROVED") {
      return res.json({ loads: [] });
    }

    const loads = await prisma.load.findMany({
      where: {
        deletedAt: null,
        status: { in: ["POSTED", "TENDERED"] },
        OR: [
          { visibility: "open" },
          { visibility: "reserved", directTenderCarrierId: userId },
        ],
      },
      orderBy: { pickupDate: "asc" },
      take: 100,
      select: {
        id: true,
        loadNumber: true,
        referenceNumber: true,
        visibility: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        equipmentType: true,
        weight: true,
        commodity: true,
        distance: true,
        pickupDate: true,
        deliveryDate: true,
        carrierRate: true,
        rate: true,
      },
    });
    res.json({ loads });
  } catch (err) {
    log.error({ err }, "[Loadboard] feed error");
    res.status(500).json({ error: "Failed to fetch loadboard" });
  }
});

// ─── Submit bid (carrier) ──────────────────────────────────
router.post(
  "/loads/:loadId/bids",
  authorize("CARRIER") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { bidRate, notes } = req.body as { bidRate: number; notes?: string };

      const load = await prisma.load.findUnique({
        where: { id: loadId },
        select: { id: true, visibility: true, distance: true, posterId: true, referenceNumber: true, loadNumber: true },
      });
      if (!load) return res.status(404).json({ error: "Load not found" });
      if (load.visibility !== "open" && load.visibility !== "reserved") {
        return res.status(403).json({ error: "Load is not accepting bids" });
      }
      if (!bidRate || bidRate <= 0) return res.status(400).json({ error: "bidRate required" });

      const bid = await prisma.loadBid.create({
        data: {
          loadId,
          carrierId: req.user!.id,
          bidRate,
          bidRatePerMile: load.distance ? bidRate / load.distance : null,
          notes: notes ?? null,
        },
      });

      await logWaterfallEvent({
        loadId,
        event: "bid_submitted",
        description: `Bid submitted by carrier at $${bidRate}`,
        actorType: "CARRIER",
        actorId: req.user!.id,
        actorName: req.user!.email,
        metadata: { bidId: bid.id, bidRate },
      });

      // Notify broker
      if (load.posterId) {
        try {
          await prisma.notification.create({
            data: {
              userId: load.posterId,
              type: "LOAD",
              title: "New bid received",
              message: `Load ${load.loadNumber ?? load.referenceNumber}: $${bidRate}`,
              actionUrl: "/dashboard/waterfall",
            },
          });
        } catch {}
      }

      res.status(201).json({ bid });
    } catch (err) {
      log.error({ err }, "[Bids] submit error");
      res.status(500).json({ error: "Failed to submit bid" });
    }
  }
);

// ─── List bids (AE) ────────────────────────────────────────
router.get(
  "/loads/:loadId/bids",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const bids = await prisma.loadBid.findMany({
        where: { loadId: req.params.loadId },
        orderBy: { submittedAt: "desc" },
      });
      // Enrich with carrier company name
      const carrierIds = bids.map((b) => b.carrierId);
      const carriers = await prisma.user.findMany({
        where: { id: { in: carrierIds } },
        select: { id: true, email: true, carrierProfile: { select: { companyName: true, cppTier: true } } },
      });
      const map = new Map(carriers.map((c) => [c.id, c]));
      res.json({ bids: bids.map((b) => ({ ...b, carrier: map.get(b.carrierId) ?? null })) });
    } catch (err) {
      log.error({ err }, "[Bids] list error");
      res.status(500).json({ error: "Failed to fetch bids" });
    }
  }
);

// ─── Accept/reject bid (AE) ────────────────────────────────
router.patch(
  "/loads/:loadId/bids/:bidId",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId, bidId } = req.params;
      const { action } = req.body as { action: "accept" | "reject" };
      const bid = await prisma.loadBid.findUnique({ where: { id: bidId } });
      if (!bid || bid.loadId !== loadId) return res.status(404).json({ error: "Bid not found" });

      if (action === "reject") {
        const updated = await prisma.loadBid.update({
          where: { id: bidId },
          data: { status: "rejected", reviewedAt: new Date(), reviewedById: req.user?.id },
        });
        await logWaterfallEvent({
          loadId,
          event: "bid_rejected",
          description: `Bid rejected`,
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
          metadata: { bidId },
        });
        return res.json({ bid: updated });
      }

      if (action === "accept") {
        const now = new Date();
        const updated = await prisma.loadBid.update({
          where: { id: bidId },
          data: { status: "accepted", reviewedAt: now, reviewedById: req.user?.id },
        });

        // Reject sibling bids
        await prisma.loadBid.updateMany({
          where: { loadId, status: "pending", id: { not: bidId } },
          data: { status: "rejected", reviewedAt: now, reviewedById: req.user?.id },
        });

        // Dispatch the load — Karpathy state machine
        await prisma.load.update({
          where: { id: loadId },
          data: {
            status: "DISPATCHED",
            carrierId: bid.carrierId,
            dispatchedAt: now,
            dispatchedCarrierId: bid.carrierId,
            statusUpdatedAt: now,
          },
        });

        await logWaterfallEvent({
          loadId,
          event: "bid_accepted",
          description: `Bid accepted at $${bid.bidRate} — load dispatched`,
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
          metadata: { bidId, carrierUserId: bid.carrierId },
        });
        await logWaterfallEvent({
          loadId,
          event: "load_dispatched",
          description: "Load dispatched via open loadboard",
          actorType: "USER",
          actorId: req.user?.id,
          metadata: { via: "loadboard", carrierUserId: bid.carrierId },
        });

        try {
          await createCheckCallSchedule(loadId);
        } catch {}

        return res.json({ bid: updated });
      }

      return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
      log.error({ err }, "[Bids] update error");
      res.status(500).json({ error: "Failed to update bid" });
    }
  }
);

// ─── Load notes ────────────────────────────────────────────
router.get(
  "/loads/:loadId/notes",
  async (req: AuthRequest, res: Response) => {
    try {
      const notes = await prisma.loadNote.findMany({
        where: { loadId: req.params.loadId },
        orderBy: { createdAt: "desc" },
      });
      res.json({ notes });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  }
);

router.post(
  "/loads/:loadId/notes",
  authorize(...AE_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { content, noteType, source } = req.body as { content: string; noteType?: string; source?: string };
      if (!content) return res.status(400).json({ error: "content required" });
      const note = await prisma.loadNote.create({
        data: {
          loadId: req.params.loadId,
          content,
          noteType: noteType ?? "internal",
          source: source ?? "manual",
          createdById: req.user?.id,
          createdByName: req.user?.email,
        },
      });
      await logWaterfallEvent({
        loadId: req.params.loadId,
        event: "note_added",
        description: `Note added (${note.noteType})`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { noteId: note.id },
      });
      res.status(201).json({ note });
    } catch (err) {
      log.error({ err }, "[Notes] create error");
      res.status(500).json({ error: "Failed to create note" });
    }
  }
);

// ─── Market rates (DAT IQ RateView facade) ────────────────
router.get("/market-rates", async (req: AuthRequest, res: Response) => {
  try {
    const { origin, destination, equipment } = req.query as {
      origin?: string; destination?: string; equipment?: string;
    };
    // TODO: wire real DAT IQ RateView API call when DAT_API_KEY is set.
    // For now, return deterministic stub data so the UI renders end-to-end.
    const base = 2.5;
    const distance = 900;
    const spotRate = Math.round(distance * base);
    res.json({
      origin, destination, equipment,
      distance,
      spotRate: { total: spotRate, perMile: base, avg30d: Math.round(spotRate * 1.02) },
      range: { low: spotRate * 0.9, high: spotRate * 1.15 },
      loadToTruckRatio: 4.2,
      trend7d: 4.2,
      capacity: "tight",
      avgTransitDays: Math.ceil(distance / 500),
      carriersOnLane30d: 18,
      source: "DAT IQ RateView (stub — pending DAT_API_KEY wiring)",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch market rates" });
  }
});

export default router;
