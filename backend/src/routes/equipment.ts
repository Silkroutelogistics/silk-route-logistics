import { Router } from "express";
import { createEquipment, getEquipment, getEquipmentById, updateEquipment, deleteEquipment } from "../controllers/equipmentController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "DISPATCH", "OPERATIONS"));

router.post("/", createEquipment);
router.get("/", getEquipment);
router.get("/:id", getEquipmentById);
router.patch("/:id", updateEquipment);
router.delete("/:id", authorize("ADMIN"), deleteEquipment);

export default router;
