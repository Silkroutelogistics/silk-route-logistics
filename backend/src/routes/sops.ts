import { Router } from "express";
import { createSOP, getSOPs, getSOPById, updateSOP, uploadSOPFile, deleteSOP } from "../controllers/sopController";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../config/upload";

const router = Router();
router.use(authenticate);

router.get("/", getSOPs);
router.get("/:id", getSOPById);
router.post("/", authorize("ADMIN", "OPERATIONS"), createSOP);
router.patch("/:id", authorize("ADMIN", "OPERATIONS"), updateSOP);
router.post("/:id/upload", authorize("ADMIN", "OPERATIONS"), upload.single("file"), uploadSOPFile);
router.delete("/:id", authorize("ADMIN"), deleteSOP);

export default router;
