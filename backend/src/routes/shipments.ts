import { Router } from "express";
import { createShipment, getShipments, getShipmentById, updateShipment, updateShipmentStatus, updateShipmentLocation, deleteShipment } from "../controllers/shipmentController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.post("/", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS"), createShipment);
router.get("/", getShipments);
router.get("/:id", getShipmentById);
router.patch("/:id", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS"), updateShipment);
router.patch("/:id/status", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS"), updateShipmentStatus);
router.patch("/:id/location", authorize("ADMIN", "DISPATCH"), updateShipmentLocation);
router.delete("/:id", authorize("ADMIN"), deleteShipment);

export default router;
