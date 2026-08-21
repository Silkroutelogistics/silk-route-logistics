import { Router } from "express";
import { createDriver, getDrivers, getDriverById, getDriverStats, updateDriver, deleteDriver } from "../controllers/driverController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"));

router.post("/", auditLog("CREATE", "Driver"), createDriver);
router.get("/", getDrivers);
router.get("/stats", getDriverStats);
router.get("/:id", getDriverById);
router.patch("/:id", auditLog("UPDATE", "Driver"), updateDriver);
router.delete("/:id", authorize("ADMIN", "CEO"), auditLog("DELETE", "Driver"), deleteDriver);

export default router;
