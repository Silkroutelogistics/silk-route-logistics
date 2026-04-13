import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createFuelTable, getFuelTables, getFuelTable, updateFuelTable,
  deleteFuelTable, parseFuelCSV, lookupFuelSurcharge,
} from "../services/fuelSurchargeTableService";

const router = Router();
router.use(authenticate);

router.get("/lookup", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const fuelPrice = parseFloat(req.query.fuelPrice as string);
    if (isNaN(fuelPrice)) return res.status(400).json({ error: "fuelPrice is required" });
    const result = await lookupFuelSurcharge(fuelPrice, req.query.tableId as string);
    if (!result) return res.status(404).json({ error: "No matching fuel surcharge tier" });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await createFuelTable(req.body, req.user!.id)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await getFuelTables(req.query.activeOnly === "true")); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await getFuelTable(req.params.id)); }
  catch (err: any) { res.status(err.message?.includes("not found") ? 404 : 500).json({ error: err.message }); }
});

router.patch("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await updateFuelTable(req.params.id, req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { await deleteFuelTable(req.params.id); res.json({ message: "Deactivated" }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// CSV import endpoint
router.post("/:id/import-csv", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent) return res.status(400).json({ error: "csvContent is required" });
    const tiers = parseFuelCSV(csvContent);
    const table = await updateFuelTable(req.params.id, { tiers });
    res.json(table);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
