import { Router, Response } from "express";
import { createTender, acceptTender, acceptTenderOnBehalf, counterTender, rejectCounter, declineTender, getCarrierTenders, getLoadTenders } from "../controllers/tenderController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { launchWaterfall, getWaterfallStatus, WaterfallCandidate } from "../services/waterfallTenderService";
import { launchBroadcast, BroadcastCandidate } from "../services/broadcastTenderService";
import { isFeatureEnabled } from "../config/features";
import { z } from "zod";
import { log } from "../lib/logger";
import { releaseCarrier, withdrawTender, RELEASE_REASONS } from "../services/carrierReleaseService";

const router = Router();

router.use(authenticate);

router.post("/loads/:id/tender", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), createTender);
router.get("/loads/:id/tenders", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), getLoadTenders);
router.post("/tenders/:id/accept", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), acceptTender);
// Sprint 39 (Item 54) — AE accept-on-behalf, tighter authorize scope.
// Distinct endpoint so audit log action="TENDER_ACCEPTED_ON_BEHALF" is
// queryable separately from organic carrier accepts.
router.post("/tenders/:id/accept-on-behalf", authorize("ADMIN", "CEO"), acceptTenderOnBehalf);
router.post("/tenders/:id/counter", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), counterTender);
// v3.8.axh — the AE side of a counter. Accepting one already works through
// accept-on-behalf (which admits COUNTERED and settles at the counter rate);
// rejecting one had no path at all, so a countered tender simply sat until it
// expired. AE-only: this is SRL's decision, not the carrier's.
router.post("/tenders/:id/reject-counter", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), rejectCounter);

// v3.8.axi — withdraw a live offer, and release a carrier already on a load.
//
// Two endpoints because they are two different acts. Withdrawing pulls an offer
// nobody accepted: no reason required, nothing undone. Releasing takes back a
// load a carrier has committed to — a truck may be routed and paper signed — so
// it demands a coded reason, voids live rate confirmations, and records a
// fall-off unless the cause was SRL's own mistake.
router.post(
  "/tenders/:id/withdraw",
  authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      const updated = await withdrawTender({
        tenderId: req.params.id,
        reason: typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : null,
        actorId: req.user!.id,
      });
      res.json(updated);
    } catch (err: any) {
      if (err?.code === "NOT_LIVE") { res.status(409).json({ error: err.message, code: "NOT_LIVE" }); return; }
      log.error({ err, tenderId: req.params.id }, "[Tender] withdraw failed");
      res.status(400).json({ error: err?.message ?? "Failed to withdraw tender" });
    }
  },
);

const releaseSchema = z.object({
  reason: z.enum(RELEASE_REASONS),
  note: z.string().max(500).optional(),
});

router.post(
  "/loads/:id/release-carrier",
  authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = releaseSchema.parse(req.body);
      const result = await releaseCarrier({
        loadId: req.params.id,
        reason: parsed.reason,
        note: parsed.note ?? null,
        actorId: req.user!.id,
      });
      if (!result.released) {
        // Idempotent rather than an error: two AEs pressing the same button
        // should not give the second one a failure for work already done.
        res.status(200).json({ ...result, message: "This load has no carrier assigned." });
        return;
      }
      res.json(result);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "A release reason is required.", allowed: RELEASE_REASONS, details: err.errors });
        return;
      }
      log.error({ err, loadId: req.params.id }, "[Tender] release-carrier failed");
      res.status(400).json({ error: err?.message ?? "Failed to release carrier" });
    }
  },
);
router.post("/tenders/:id/decline", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), declineTender);
router.get("/carrier/tenders", authorize("CARRIER", "ADMIN", "CEO"), getCarrierTenders);

// ─── Waterfall Tendering ────────────────────────────────

const waterfallSchema = z.object({
  candidates: z.array(z.object({
    carrierId: z.string(),
    carrierUserId: z.string(),
    companyName: z.string(),
    score: z.number(),
    offeredRate: z.number(),
  })).min(1).max(20),
  expirationMinutes: z.number().min(15).max(1440).default(60),
});

/** Launch a waterfall tender campaign for a load */
router.post(
  "/loads/:id/waterfall",
  authorize("BROKER", "ADMIN", "CEO", "DISPATCH"),
  async (req: AuthRequest, res: Response) => {
    if (!isFeatureEnabled("waterfallTendering")) {
      res.status(403).json({ error: "Waterfall tendering is not enabled" });
      return;
    }
    try {
      const parsed = waterfallSchema.parse(req.body);
      const result = await launchWaterfall({
        loadId: req.params.id,
        candidates: parsed.candidates as WaterfallCandidate[],
        expirationMinutes: parsed.expirationMinutes,
        createdById: req.user!.id,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
      } else {
        log.error({ err: err }, "[Waterfall] Launch error:");
        res.status(400).json({ error: err.message || "Failed to launch waterfall" });
      }
    }
  },
);

/** Get waterfall status for a load */
router.get(
  "/loads/:id/waterfall",
  authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      const status = await getWaterfallStatus(req.params.id);
      if (!status) { res.status(404).json({ error: "Load not found" }); return; }
      res.json(status);
    } catch (err) {
      log.error({ err: err }, "[Waterfall] Status error:");
      res.status(500).json({ error: "Failed to get waterfall status" });
    }
  },
);

// ─── Broadcast Tendering ───────────────────────────────

const broadcastSchema = z.object({
  candidates: z.array(z.object({
    carrierId: z.string(),
    carrierUserId: z.string(),
    companyName: z.string(),
    offeredRate: z.number(),
  })).min(1).max(50),
  expirationMinutes: z.number().min(15).max(1440).default(60),
});

/** Launch a broadcast tender — offer to all carriers simultaneously */
router.post(
  "/loads/:id/broadcast",
  authorize("BROKER", "ADMIN", "CEO", "DISPATCH"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = broadcastSchema.parse(req.body);
      const result = await launchBroadcast({
        loadId: req.params.id,
        candidates: parsed.candidates as BroadcastCandidate[],
        expirationMinutes: parsed.expirationMinutes,
        createdById: req.user!.id,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
      } else {
        log.error({ err }, "[Broadcast] Launch error:");
        res.status(400).json({ error: err.message || "Failed to launch broadcast" });
      }
    }
  },
);

export default router;
