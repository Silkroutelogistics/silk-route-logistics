import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { auditLog } from "../middleware/audit";
import { createCourseSchema, saveBundleSchema, setStatusSchema } from "../validators/trainingAdmin";
import {
  listCoursesForAdmin, getCourseForAdmin, createCourse,
  saveCourseBundle, setCourseStatus, deleteCourse, HttpError,
} from "../services/trainingAdminService";
import { log } from "../lib/logger";

/**
 * v3.8.ane — SRL Driver Academy Sprint T7: AE course-authoring API.
 *
 * AE-cookie authenticated (NOT a CARRIER_PORTAL_MOUNT). Writes are ADMIN/CEO;
 * reads also allow OPERATIONS. The driver-facing /api/driver-training endpoints
 * stay PUBLISHED-only + answer-hidden — this surface is the authoring side and
 * returns full answers to the AE.
 */

const router = Router();
router.use(authenticate);

function handleError(e: unknown, res: Response) {
  const status = e instanceof HttpError ? e.status : 500;
  if (status === 500) log.error({ err: e }, "[TrainingAdmin] error");
  res.status(status).json({ error: e instanceof Error ? e.message : "Training admin error" });
}

// List every course (all statuses) with content + adoption counts.
router.get("/courses", authorize("ADMIN", "CEO", "OPERATIONS"), async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ courses: await listCoursesForAdmin() });
  } catch (e) { handleError(e, res); }
});

// Full course for the editor (lessons + questions WITH answers).
router.get("/courses/:id", authorize("ADMIN", "CEO", "OPERATIONS"), async (req: AuthRequest, res: Response) => {
  try {
    const course = await getCourseForAdmin(req.params.id);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }
    res.json(course);
  } catch (e) { handleError(e, res); }
});

// Create an empty DRAFT (slug immutable hereafter).
router.post("/courses", authorize("ADMIN", "CEO"), validateBody(createCourseSchema), auditLog("CREATE", "TrainingCourse"), async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await createCourse(req.body));
  } catch (e) { handleError(e, res); }
});

// Full transactional save (meta + lessons[] + questions[]).
router.put("/courses/:id", authorize("ADMIN", "CEO"), validateBody(saveBundleSchema), auditLog("UPDATE", "TrainingCourse"), async (req: AuthRequest, res: Response) => {
  try {
    const course = await saveCourseBundle(req.params.id, req.body);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }
    res.json(course);
  } catch (e) { handleError(e, res); }
});

// DRAFT ⇄ PUBLISHED ⇄ ARCHIVED.
router.patch("/courses/:id/status", authorize("ADMIN", "CEO"), validateBody(setStatusSchema), auditLog("STATUS_CHANGE", "TrainingCourse"), async (req: AuthRequest, res: Response) => {
  try {
    const course = await setCourseStatus(req.params.id, req.body.status);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }
    res.json(course);
  } catch (e) { handleError(e, res); }
});

// Hard-delete only when no driver has touched it; else 409 → archive.
router.delete("/courses/:id", authorize("ADMIN", "CEO"), auditLog("DELETE", "TrainingCourse"), async (req: AuthRequest, res: Response) => {
  try {
    const result = await deleteCourse(req.params.id);
    if (result.notFound) { res.status(404).json({ error: "Course not found" }); return; }
    if (result.blocked) { res.status(409).json({ error: "This course has driver training history and can't be deleted. Archive it instead." }); return; }
    res.json({ deleted: true });
  } catch (e) { handleError(e, res); }
});

export default router;
