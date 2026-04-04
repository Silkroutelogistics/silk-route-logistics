import { Router } from "express";
import { createLoad, getLoads, getLoadById, updateLoad, updateLoadStatus, deleteLoad, restoreLoad, carrierUpdateStatus, getDistance, getLoadAudit } from "../controllers/loadController";
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
router.patch("/:id/status", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), updateLoadStatus);
router.patch("/:id/carrier-status", authorize("CARRIER"), validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), carrierUpdateStatus);
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), auditLog("DELETE", "Load"), deleteLoad);
router.put("/:id/restore", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS"), auditLog("UPDATE", "Load"), restoreLoad);

// Field-level audit trail
router.get("/:id/audit", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getLoadAudit);

// Compass by SRL: load-level compliance check
import { runLoadComplianceCheck } from "../controllers/carrierVettingController";
router.post("/:loadId/compliance-check", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), runLoadComplianceCheck);

export default router;
