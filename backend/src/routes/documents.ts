import { Router, Response } from "express";
import { uploadDocuments, getDocuments, downloadDocument, generateRateConfirmation, deleteDocument } from "../controllers/documentController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { upload } from "../config/upload";
import { prisma } from "../config/database";
import { logLoadActivity } from "../services/loadActivityService";

const router = Router();

router.use(authenticate);

// PATCH /documents/:id — update status (verify/reject) or notes
router.patch(
  "/:id",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body as { status?: string; notes?: string };
      const existing = await prisma.document.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Document not found" });

      const updated = await prisma.document.update({
        where: { id },
        data: {
          ...(status ? { status, reviewedAt: new Date(), reviewedBy: req.user?.id } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
      });

      if (existing.loadId && status) {
        await logLoadActivity({
          loadId: existing.loadId,
          eventType: status === "VERIFIED" ? "doc_verified" : status === "REJECTED" ? "doc_rejected" : "doc_updated",
          description: `${existing.docType ?? "Document"} ${status.toLowerCase()}`,
          actorType: "USER",
          actorId: req.user?.id,
          actorName: req.user?.email,
          metadata: { documentId: id },
        });

        // POD verification flips paperwork gate
        if (status === "VERIFIED" && existing.docType === "POD") {
          await prisma.load.update({ where: { id: existing.loadId }, data: { podVerified: true } });
        }
      }

      res.json({ document: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update document" });
    }
  }
);

// Upload documents (up to 10 files)
router.post("/upload", upload.array("files", 10), uploadDocuments as any);

// Legacy upload route (kept for backward compat)
router.post("/", upload.array("files", 5), uploadDocuments as any);

// List documents with filters
router.get("/", getDocuments as any);

// Download a document (any authenticated user with a valid role)
router.get("/:id/download", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE", "CARRIER", "SHIPPER") as any, downloadDocument as any);

// Generate rate confirmation for a load
router.post(
  "/rate-con/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE") as any,
  generateRateConfirmation as any
);

// Delete a document (admin/management only)
router.delete("/:id", authorize("ADMIN", "CEO") as any, deleteDocument as any);

export default router;
