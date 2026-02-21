import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { createDelay, getDelaysByLoadId, updateDelay, deleteDelay } from "../services/delayService";
import { z } from "zod";

const router = Router();
router.use(authenticate);

const createDelaySchema = z.object({
  loadId: z.string(),
  reasonCode: z.enum([
    "WEATHER", "TRAFFIC", "MECHANICAL", "SHIPPER_DELAY", "RECEIVER_DELAY",
    "DRIVER_HOS", "CUSTOMS", "DETENTION", "ACCIDENT", "ROAD_CLOSURE", "OTHER",
  ]),
  description: z.string().optional(),
  delayMinutes: z.number().int().positive(),
});

const updateDelaySchema = z.object({
  reasonCode: z.enum([
    "WEATHER", "TRAFFIC", "MECHANICAL", "SHIPPER_DELAY", "RECEIVER_DELAY",
    "DRIVER_HOS", "CUSTOMS", "DETENTION", "ACCIDENT", "ROAD_CLOSURE", "OTHER",
  ]).optional(),
  description: z.string().optional(),
  delayMinutes: z.number().int().positive().optional(),
  resolved: z.boolean().optional(),
});

// Create a delay report for a load
router.post(
  "/",
  authorize("ADMIN", "DISPATCH", "OPERATIONS", "BROKER") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId, reasonCode, description, delayMinutes } = createDelaySchema.parse(req.body);
      const delay = await createDelay({ loadId, reasonCode, description, delayMinutes, reportedById: req.user!.id });
      res.status(201).json(delay);
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      res.status(500).json({ error: String(err) });
    }
  }
);

// Get all delays for a load
router.get("/load/:loadId", async (req: AuthRequest, res: Response) => {
  try {
    const delays = await getDelaysByLoadId(req.params.loadId);
    res.json(delays);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Update a delay
router.put(
  "/:id",
  authorize("ADMIN", "DISPATCH", "OPERATIONS", "BROKER") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const data = updateDelaySchema.parse(req.body);
      const updateData: any = {};
      if (data.reasonCode) updateData.reasonCode = data.reasonCode;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.delayMinutes) updateData.delayMinutes = data.delayMinutes;
      if (data.resolved === true) updateData.resolvedAt = new Date();
      if (data.resolved === false) updateData.resolvedAt = null;

      const delay = await updateDelay(req.params.id, updateData);
      res.json(delay);
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      res.status(500).json({ error: String(err) });
    }
  }
);

// Delete a delay
router.delete(
  "/:id",
  authorize("ADMIN", "DISPATCH", "OPERATIONS") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      await deleteDelay(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }
);

export default router;
