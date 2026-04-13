import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createDockSchedule,
  getDockSchedules,
  getDockSchedule,
  updateDockSchedule,
  deleteDockSchedule,
  getDockStats,
} from "../services/dockScheduleService";

const router = Router();

router.use(authenticate);

// GET /dock-schedules/stats
router.get("/stats", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getDockStats(req.query.facilityName as string);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /dock-schedules
router.post("/", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await createDockSchedule(req.body, req.user!.id);
    res.status(201).json(schedule);
  } catch (err: any) {
    const status = err.message?.includes("conflict") ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// GET /dock-schedules
router.get("/", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      facilityName: req.query.facilityName as string | undefined,
      appointmentDate: req.query.appointmentDate as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      status: req.query.status as string | undefined,
      appointmentType: req.query.appointmentType as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    };
    const result = await getDockSchedules(filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /dock-schedules/:id
router.get("/:id", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await getDockSchedule(req.params.id);
    res.json(schedule);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PATCH /dock-schedules/:id
router.patch("/:id", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await updateDockSchedule(req.params.id, req.body);
    res.json(schedule);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /dock-schedules/:id (cancels)
router.delete("/:id", authorize("ADMIN", "CEO", "OPERATIONS", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    await deleteDockSchedule(req.params.id);
    res.json({ message: "Dock schedule cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
