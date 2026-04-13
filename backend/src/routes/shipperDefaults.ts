import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { getShipperDefaults, updateShipperDefaults, getShipperDefaultsSchema } from "../services/shipperDefaultsService";

const router = Router();
router.use(authenticate);

// GET /shipper-defaults/:customerId/schema — get full schema with values
router.get("/:customerId/schema", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await getShipperDefaultsSchema(req.params.customerId)); }
  catch (err: any) { res.status(err.message?.includes("not found") ? 404 : 500).json({ error: err.message }); }
});

// GET /shipper-defaults/:customerId
router.get("/:customerId", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await getShipperDefaults(req.params.customerId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /shipper-defaults/:customerId
router.patch("/:customerId", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await updateShipperDefaults(req.params.customerId, req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
