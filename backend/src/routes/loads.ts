import { Router } from "express";
import { createLoad, getLoads, getLoadById, updateLoad, updateLoadStatus, deleteLoad, carrierUpdateStatus, getDistance } from "../controllers/loadController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { validateBody, validateQuery } from "../middleware/validate";
import { createLoadSchema, updateLoadStatusSchema, loadQuerySchema } from "../validators/load";
import { z } from "zod";

const updateLoadSchema = createLoadSchema.partial();

const router = Router();

router.use(authenticate);

router.get("/distance", getDistance);
router.post("/", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), validateBody(createLoadSchema), auditLog("CREATE", "Load"), createLoad);
router.get("/", validateQuery(loadQuerySchema), getLoads);
router.get("/:id", getLoadById);
router.put("/:id", authorize("BROKER", "ADMIN", "CEO", "DISPATCH"), validateBody(updateLoadSchema), auditLog("UPDATE", "Load"), updateLoad);
router.patch("/:id/status", validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), updateLoadStatus);
router.patch("/:id/carrier-status", authorize("CARRIER"), validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), carrierUpdateStatus);
router.delete("/:id", auditLog("DELETE", "Load"), deleteLoad);

export default router;
