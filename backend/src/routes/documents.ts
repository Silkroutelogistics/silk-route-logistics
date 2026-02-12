import { Router } from "express";
import { uploadDocuments, getDocuments, downloadDocument, generateRateConfirmation, deleteDocument } from "../controllers/documentController";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../config/upload";

const router = Router();

router.use(authenticate);

// Upload documents (up to 10 files)
router.post("/upload", upload.array("files", 10), uploadDocuments as any);

// Legacy upload route (kept for backward compat)
router.post("/", upload.array("files", 5), uploadDocuments as any);

// List documents with filters
router.get("/", getDocuments as any);

// Download a document
router.get("/:id/download", downloadDocument as any);

// Generate rate confirmation for a load
router.post(
  "/rate-con/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE") as any,
  generateRateConfirmation as any
);

// Delete a document
router.delete("/:id", deleteDocument as any);

export default router;
