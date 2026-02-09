import { Router } from "express";
import { createLoad, getLoads, getLoadById, updateLoadStatus, deleteLoad, carrierUpdateStatus } from "../controllers/loadController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

router.post("/", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), auditLog("CREATE", "Load"), createLoad);
router.get("/", getLoads);
router.get("/:id", getLoadById);
router.patch("/:id/status", auditLog("UPDATE_STATUS", "Load"), updateLoadStatus);
router.patch("/:id/carrier-status", authorize("CARRIER"), auditLog("UPDATE_STATUS", "Load"), carrierUpdateStatus);
router.delete("/:id", auditLog("DELETE", "Load"), deleteLoad);

export default router;
