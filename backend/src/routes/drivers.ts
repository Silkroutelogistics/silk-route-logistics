import { Router } from "express";
import { createDriver, getDrivers, getDriverById, getDriverStats, updateDriver, updateDriverHOS, assignEquipment, assignTruck, assignTrailer, deleteDriver } from "../controllers/driverController";
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
router.patch("/:id/hos", auditLog("UPDATE_HOS", "Driver"), updateDriverHOS);
router.patch("/:id/assign-equipment", auditLog("ASSIGN_EQUIPMENT", "Driver"), assignEquipment);
router.patch("/:id/assign-truck", auditLog("ASSIGN_TRUCK", "Driver"), assignTruck);
router.patch("/:id/assign-trailer", auditLog("ASSIGN_TRAILER", "Driver"), assignTrailer);
router.delete("/:id", authorize("ADMIN", "CEO"), auditLog("DELETE", "Driver"), deleteDriver);

export default router;
