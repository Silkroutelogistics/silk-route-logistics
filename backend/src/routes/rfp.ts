import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createRfp,
  getRfps,
  getRfp,
  respondToRfp,
  awardRfp,
  softDeleteRfp,
} from "../services/rfpService";

const router = Router();

router.use(authenticate);

// POST /rfps — create RFP
router.post("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const rfp = await createRfp(req.body, req.user!.id);
    res.status(201).json(rfp);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /rfps — list
router.get("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      customerId: req.query.customerId as string | undefined,
      status: req.query.status as any,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    };
    const result = await getRfps(filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /rfps/:id — detail
router.get("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const rfp = await getRfp(req.params.id);
    res.json(rfp);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /rfps/:id/respond — submit rate responses for lanes
router.post("/:id/respond", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { responses } = req.body;
    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({ error: "responses array is required" });
    }
    const rfp = await respondToRfp(req.params.id, responses, req.user!.id);
    res.json(rfp);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// POST /rfps/:id/award — award RFP (creates contract rates)
router.post("/:id/award", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await awardRfp(req.params.id, req.user!.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /rfps/:id — soft delete
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    await softDeleteRfp(req.params.id);
    res.json({ message: "RFP deleted" });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
