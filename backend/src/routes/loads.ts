import { Router } from "express";
import { createLoad, getLoads, getLoadById, updateLoadStatus, deleteLoad } from "../controllers/loadController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), createLoad);
router.get("/", getLoads);
router.get("/:id", getLoadById);
router.patch("/:id/status", updateLoadStatus);
router.delete("/:id", deleteLoad);

export default router;
