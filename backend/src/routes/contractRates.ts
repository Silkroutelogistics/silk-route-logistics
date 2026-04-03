import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createContractRate,
  getContractRates,
  getContractRate,
  updateContractRate,
  softDeleteContractRate,
  checkContractRate,
} from "../services/contractRateService";

const router = Router();

router.use(authenticate);

// POST /contract-rates — create
router.post("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const rate = await createContractRate(req.body, req.user!.id);
    res.status(201).json(rate);
  } catch (err: any) {
    const status = err.message?.includes("Overlapping") ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// GET /contract-rates/lookup — check rate for a specific lane (must be before /:id)
router.get("/lookup", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { originState, destState, equipmentType, customerId } = req.query as Record<string, string>;
    if (!originState || !destState || !equipmentType) {
      return res.status(400).json({ error: "originState, destState, and equipmentType are required" });
    }
    const rate = await checkContractRate(originState, destState, equipmentType, customerId);
    if (!rate) {
      return res.status(404).json({ error: "No active contract rate found for this lane" });
    }
    res.json(rate);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /contract-rates — list
router.get("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      customerId: req.query.customerId as string | undefined,
      originState: req.query.originState as string | undefined,
      destState: req.query.destState as string | undefined,
      equipmentType: req.query.equipmentType as string | undefined,
      status: req.query.status as any,
      effectiveFrom: req.query.effectiveFrom as string | undefined,
      effectiveTo: req.query.effectiveTo as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    };
    const result = await getContractRates(filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /contract-rates/:id — detail
router.get("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const rate = await getContractRate(req.params.id);
    res.json(rate);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PATCH /contract-rates/:id — update
router.patch("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const rate = await updateContractRate(req.params.id, req.body);
    res.json(rate);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /contract-rates/:id — soft delete
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    await softDeleteContractRate(req.params.id);
    res.json({ message: "Contract rate deleted" });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
