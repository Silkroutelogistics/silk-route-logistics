import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  createTag, getTags, updateTag, deleteTag,
  createTagRule, deleteTagRule,
  assignTag, removeTagAssignment, getEntityTags, autoTagEntity,
} from "../services/tagService";

const router = Router();
router.use(authenticate);

router.post("/", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await createTag(req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (_req: AuthRequest, res: Response) => {
  try { res.json(await getTags()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await updateTag(req.params.id, req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/:id", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try { await deleteTag(req.params.id); res.json({ message: "Tag deleted" }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Rules
router.post("/:id/rules", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await createTagRule(req.params.id, req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/rules/:ruleId", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { await deleteTagRule(req.params.ruleId); res.json({ message: "Rule deleted" }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Assignments
router.post("/assign", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await assignTag(req.body.tagId, req.body.entityType, req.body.entityId, req.user!.id)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/assign", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try { await removeTagAssignment(req.body.tagId, req.body.entityType, req.body.entityId); res.json({ message: "Removed" }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/entity/:entityType/:entityId", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await getEntityTags(req.params.entityType, req.params.entityId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Auto-tag
router.post("/auto-tag", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const matched = await autoTagEntity(req.body.entityType, req.body.entityId, req.body.entityData);
    res.json({ matched });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
