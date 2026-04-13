import { Router, Response } from "express";
import { createTender, acceptTender, counterTender, declineTender, getCarrierTenders, getLoadTenders } from "../controllers/tenderController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { launchWaterfall, getWaterfallStatus, WaterfallCandidate } from "../services/waterfallTenderService";
import { launchBroadcast, BroadcastCandidate } from "../services/broadcastTenderService";
import { isFeatureEnabled } from "../config/features";
import { z } from "zod";
import { log } from "../lib/logger";

const router = Router();

router.use(authenticate);

router.post("/loads/:id/tender", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), createTender);
router.get("/loads/:id/tenders", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), getLoadTenders);
router.post("/tenders/:id/accept", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), acceptTender);
router.post("/tenders/:id/counter", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), counterTender);
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
