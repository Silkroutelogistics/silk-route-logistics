import { Router } from "express";
import { createDriver, getDrivers, getDriverById, getDriverStats, updateDriver, updateDriverHOS, assignEquipment, deleteDriver } from "../controllers/driverController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "DISPATCH", "OPERATIONS"));

router.post("/", createDriver);
router.get("/", getDrivers);
router.get("/stats", getDriverStats);
router.get("/:id", getDriverById);
router.patch("/:id", updateDriver);
router.patch("/:id/hos", updateDriverHOS);
router.patch("/:id/assign-equipment", assignEquipment);
router.delete("/:id", authorize("ADMIN"), deleteDriver);

export default router;
