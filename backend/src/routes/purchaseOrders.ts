import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createPurchaseOrder, getPurchaseOrders, getPurchaseOrder,
  updatePurchaseOrder, linkLoadToPO, unlinkLoadFromPO,
  updateLineItemShipped, updateLineItemReceived,
} from "../services/purchaseOrderService";

const router = Router();
router.use(authenticate);

router.post("/", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await createPurchaseOrder(req.body, req.user!.id)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      customerId: req.query.customerId as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    };
    res.json(await getPurchaseOrders(filters));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await getPurchaseOrder(req.params.id)); }
  catch (err: any) { res.status(err.message?.includes("not found") ? 404 : 500).json({ error: err.message }); }
});

router.patch("/:id", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await updatePurchaseOrder(req.params.id, req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

// Link/unlink loads
router.post("/:id/loads/:loadId", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await linkLoadToPO(req.params.id, req.params.loadId)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/:id/loads/:loadId", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { await unlinkLoadFromPO(req.params.id, req.params.loadId); res.json({ message: "Unlinked" }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Update line item quantities
router.patch("/line-items/:id/shipped", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await updateLineItemShipped(req.params.id, req.body.shipped)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.patch("/line-items/:id/received", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await updateLineItemReceived(req.params.id, req.body.received)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
