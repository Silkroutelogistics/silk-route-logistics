import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  getExceptionConfigs,
  updateExceptionConfig,
  seedExceptionConfigs,
  createExceptionAlert,
  getExceptionAlerts,
  resolveExceptionAlert,
  dismissExceptionAlert,
  getExceptionAlertStats,
} from "../services/exceptionConfigService";

const router = Router();

router.use(authenticate);

// POST /exceptions/seed — seed default exception types
router.post("/seed", authorize("ADMIN") as any, async (req: AuthRequest, res: Response) => {
  try {
    await seedExceptionConfigs();
    res.json({ message: "Exception configs seeded" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /exceptions/configs
router.get("/configs", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const configs = await getExceptionConfigs(req.query.category as string);
    res.json(configs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /exceptions/configs/:id
router.patch("/configs/:id", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const config = await updateExceptionConfig(req.params.id, req.body);
    res.json(config);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /exceptions/alerts/stats
router.get("/alerts/stats", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getExceptionAlertStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /exceptions/alerts
router.get("/alerts", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      loadId: req.query.loadId as string | undefined,
      severity: req.query.severity as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    };
    const result = await getExceptionAlerts(filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /exceptions/alerts
router.post("/alerts", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await createExceptionAlert(req.body);
    res.status(201).json(alert);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /exceptions/alerts/:id/resolve
router.post("/alerts/:id/resolve", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await resolveExceptionAlert(req.params.id, req.user!.id, req.body.note);
    res.json(alert);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /exceptions/alerts/:id/dismiss
router.post("/alerts/:id/dismiss", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await dismissExceptionAlert(req.params.id, req.user!.id, req.body.note);
    res.json(alert);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
