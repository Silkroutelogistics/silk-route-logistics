import { Router } from "express";
import { createEquipment, getEquipment, getEquipmentById, updateEquipment, deleteEquipment } from "../controllers/equipmentController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"));

router.post("/", createEquipment);
router.get("/", getEquipment);
router.get("/:id", getEquipmentById);
router.patch("/:id", updateEquipment);
router.delete("/:id", authorize("ADMIN", "CEO"), deleteEquipment);

export default router;
