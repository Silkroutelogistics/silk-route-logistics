import { Router } from "express";
import { createSOP, getSOPs, getSOPById, updateSOP, uploadSOPFile, deleteSOP } from "../controllers/sopController";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../config/upload";

const router = Router();
router.use(authenticate);

router.get("/", getSOPs);
router.get("/:id", getSOPById);
router.post("/", authorize("ADMIN", "CEO", "OPERATIONS"), createSOP);
router.patch("/:id", authorize("ADMIN", "CEO", "OPERATIONS"), updateSOP);
router.post("/:id/upload", authorize("ADMIN", "CEO", "OPERATIONS"), upload.single("file"), uploadSOPFile);
router.delete("/:id", authorize("ADMIN", "CEO"), deleteSOP);

export default router;
