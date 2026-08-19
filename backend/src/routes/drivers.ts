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
// audit-pass1: MISSING-UI — HOS is surfaced from ELD, not hand-edited; endpoint retained for correction.
router.patch("/:id/hos", auditLog("UPDATE_HOS", "Driver"), updateDriverHOS);
// audit-pass1: SUPERSEDED — frontend uses the narrower /:id/assign-truck and /:id/assign-trailer. Consolidation candidate, not deleted.
router.patch("/:id/assign-equipment", auditLog("ASSIGN_EQUIPMENT", "Driver"), assignEquipment);
router.patch("/:id/assign-truck", auditLog("ASSIGN_TRUCK", "Driver"), assignTruck);
router.patch("/:id/assign-trailer", auditLog("ASSIGN_TRAILER", "Driver"), assignTrailer);
router.delete("/:id", authorize("ADMIN", "CEO"), auditLog("DELETE", "Driver"), deleteDriver);

export default router;
