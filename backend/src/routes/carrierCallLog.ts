import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createCallLog,
  getCallLogsByLoad,
  getCallLogsByCarrier,
  getCallLogStats,
  wasCarrierCalled,
  getFollowUps,
} from "../services/carrierCallLogService";

const router = Router();

router.use(authenticate);

// GET /carrier-calls/follow-ups
router.get("/follow-ups", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const followUps = await getFollowUps(req.query.mine === "true" ? req.user!.id : undefined);
    res.json(followUps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /carrier-calls/load/:loadId
router.get("/load/:loadId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await getCallLogsByLoad(req.params.loadId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /carrier-calls/load/:loadId/stats
router.get("/load/:loadId/stats", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getCallLogStats(req.params.loadId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /carrier-calls/check/:loadId/:carrierId — was this carrier already called?
router.get("/check/:loadId/:carrierId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await wasCarrierCalled(req.params.loadId, req.params.carrierId);
    res.json({ called: !!existing, lastCall: existing || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /carrier-calls/carrier/:carrierId
router.get("/carrier/:carrierId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const result = await getCallLogsByCarrier(req.params.carrierId, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /carrier-calls
router.post("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const log = await createCallLog(req.body, req.user!.id);
    res.status(201).json(log);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
