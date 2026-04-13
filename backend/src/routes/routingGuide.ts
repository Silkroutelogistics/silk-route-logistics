import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createRoutingGuide,
  getRoutingGuides,
  getRoutingGuide,
  updateRoutingGuide,
  deleteRoutingGuide,
  lookupRoutingGuide,
  addRoutingGuideEntry,
  updateRoutingGuideEntry,
  removeRoutingGuideEntry,
  getRoutingGuideStats,
} from "../services/routingGuideService";

const router = Router();

router.use(authenticate);

// GET /routing-guides/stats
router.get("/stats", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getRoutingGuideStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /routing-guides/lookup?originState=TX&destState=CA&equipmentType=DRY_VAN
router.get("/lookup", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { originState, destState, equipmentType, customerId } = req.query as Record<string, string>;
    if (!originState || !destState || !equipmentType) {
      return res.status(400).json({ error: "originState, destState, and equipmentType are required" });
    }
    const guide = await lookupRoutingGuide(originState, destState, equipmentType, customerId);
    if (!guide) return res.status(404).json({ error: "No routing guide found for this lane" });
    res.json(guide);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /routing-guides
router.post("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const guide = await createRoutingGuide(req.body, req.user!.id);
    res.status(201).json(guide);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /routing-guides
router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      originState: req.query.originState as string | undefined,
      destState: req.query.destState as string | undefined,
      equipmentType: req.query.equipmentType as string | undefined,
      customerId: req.query.customerId as string | undefined,
      isActive: req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined,
      search: req.query.search as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    };
    const result = await getRoutingGuides(filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /routing-guides/:id
router.get("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const guide = await getRoutingGuide(req.params.id);
    res.json(guide);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PATCH /routing-guides/:id
router.patch("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const guide = await updateRoutingGuide(req.params.id, req.body);
    res.json(guide);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /routing-guides/:id (soft delete)
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    await deleteRoutingGuide(req.params.id);
    res.json({ message: "Routing guide deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Entry Management ───────────────────────────────────

// POST /routing-guides/:id/entries
router.post("/:id/entries", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const entry = await addRoutingGuideEntry(req.params.id, req.body);
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /routing-guides/entries/:entryId
router.patch("/entries/:entryId", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const entry = await updateRoutingGuideEntry(req.params.entryId, req.body);
    res.json(entry);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /routing-guides/entries/:entryId
router.delete("/entries/:entryId", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    await removeRoutingGuideEntry(req.params.entryId);
    res.json({ message: "Entry removed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
