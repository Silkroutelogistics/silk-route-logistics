import { Router } from "express";
import { uploadDocuments, getDocuments, deleteDocument } from "../controllers/documentController";
import { authenticate } from "../middleware/auth";
import { upload } from "../config/upload";

const router = Router();

router.use(authenticate);

router.post("/", upload.array("files", 5), uploadDocuments);
router.get("/", getDocuments);
router.delete("/:id", deleteDocument);

export default router;
