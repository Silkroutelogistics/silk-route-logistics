import { Router, Response } from "express";
import { uploadDocuments, getDocuments, downloadDocument, deleteDocument } from "../controllers/documentController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { requireTotpEnrolled } from "../middleware/requireTotpEnrolled";
import { requireStepUpForCarrierComplianceDoc } from "../middleware/complianceDocStepUp";
import { upload } from "../config/upload";
import { prisma } from "../config/database";
import { logLoadActivity } from "../services/loadActivityService";

const router = Router();

router.use(authenticate);
// The 2FA wall, for the same reason as /api/carrier: the carrier portal uploads
// and downloads through this mount, and it was reachable with no authenticator.
// No-op for AE and SHIPPER sessions, which are the other two callers here.
router.use(requireTotpEnrolled);

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
// B7a — a carrier replacing a compliance document (W9/COI/AUTHORITY/WORKERS_COMP/
// BOC3) needs a fresh authenticator code; every other upload passes through.
// After multer, because the type is in the body; before the handler, so a
// refusal stores nothing. Both aliases, so the legacy one cannot bypass it.
router.post("/upload", upload.array("files", 10), requireStepUpForCarrierComplianceDoc, uploadDocuments as any);

// Legacy upload route (kept for backward compat)
router.post("/", upload.array("files", 5), requireStepUpForCarrierComplianceDoc, uploadDocuments as any);

// List documents with filters.
// v3.8.aqn — AE-internal roles only. Verified before restricting: the ONLY caller
// of this endpoint anywhere in frontend/src is the AE console at
// /dashboard/documents (and it sends no query params). The carrier portal lists
// its documents via /carrier-compliance/documents and the shipper portal via
// /shipper-portal/documents, both of which are already owner-scoped — so no
// carrier or shipper flow depends on this route. getDocuments additionally
// applies per-role ownership scoping as defense in depth.
router.get(
  "/",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "AE") as any,
  getDocuments as any
);

// Download a document (any authenticated user with a valid role)
router.get("/:id/download", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE", "CARRIER", "SHIPPER") as any, downloadDocument as any);

// v3.8.avo — POST /rate-con/:loadId retired with its renderer. The Rate
// Confirmation has one source: the PDF chrome. See documentController.

// Delete a document (admin/management only)
router.delete("/:id", authorize("ADMIN", "CEO") as any, deleteDocument as any);

export default router;
