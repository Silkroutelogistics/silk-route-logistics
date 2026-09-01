import { Router, Response } from "express";
import { createSOP, getSOPs, getSOPById, updateSOP, uploadSOPFile, deleteSOP } from "../controllers/sopController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { upload } from "../config/upload";
import { prisma } from "../config/database";
import { generateSOPPdf } from "../services/sopPdfService";
import { staffUploadLimiter } from "../middleware/rateLimiters";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

router.get("/", getSOPs);
router.get("/:id", getSOPById);
router.post("/", authorize("ADMIN", "CEO", "OPERATIONS"), createSOP);
router.patch("/:id", authorize("ADMIN", "CEO", "OPERATIONS"), updateSOP);
router.post("/:id/upload", authorize("ADMIN", "CEO", "OPERATIONS"), staffUploadLimiter, upload.single("file"), uploadSOPFile);
router.delete("/:id", authorize("ADMIN", "CEO"), deleteSOP);

// GET /sops/:id/file — serve the UPLOADED file's bytes (distinct from the
// generated branded PDF below, which is a different artifact).
//
// v3.8.awt — the console previewed this by concatenating a mangled base with
// SOP.fileUrl, which holds `s3://bucket/key` in production. Two independent
// reasons it could never render, and neither showed up in dev. There was no
// endpoint that served these bytes at all, so the preview has been dead since
// storage moved to object storage.
//
// Proxied rather than redirected, for the same reason as documents ?inline=1:
// an <iframe> pointing at the API host is refused by `frame-src 'self' blob:`,
// and fetching a redirect to storage dies on the second hop because
// `connect-src` names no storage host. Bytes from this origin, then a blob: URL.
//
// Content-Type is passed through from storage rather than guessed — SOP has no
// fileName or fileType column, but uploadFile() set the type at write time, so
// the upstream response already knows it.
// Gated explicitly, unlike its ungated neighbours: SOPs are internal operating
// procedure and "sops" is in EMPLOYEE_ONLY_ROUTES, so a carrier has no business
// here. The older reads on this router predate the authorize-coverage guard and
// are on its documented inventory; a NEW route does not get to join them.
router.get("/:id/file", authorize("ADMIN", "CEO", "OPERATIONS", "BROKER", "DISPATCH"), async (req: AuthRequest, res: Response) => {
  try {
    const sop = await prisma.sOP.findUnique({ where: { id: req.params.id }, select: { fileUrl: true } });
    if (!sop?.fileUrl) { res.status(404).json({ error: "This SOP has no uploaded file." }); return; }

    const { isS3Url, getDownloadUrl } = await import("../services/storageService");
    if (!isS3Url(sop.fileUrl)) { res.status(409).json({ error: "Stored file is not in object storage." }); return; }

    const upstream = await fetch(await getDownloadUrl(sop.fileUrl));
    if (!upstream.ok) { res.status(502).json({ error: "Could not read the stored file." }); return; }

    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", "inline");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    log.error({ err }, "[SOP] file proxy failed");
    res.status(500).json({ error: "Could not open the file." });
  }
});

// GET /sops/:id/pdf — generate branded PDF on the fly
router.get("/:id/pdf", async (req: AuthRequest, res: Response) => {
  try {
    const sop = await prisma.sOP.findUnique({ where: { id: req.params.id } });
    if (!sop) { res.status(404).json({ error: "SOP not found" }); return; }

    const doc = generateSOPPdf(sop);
    const filename = `SRL-SOP-${sop.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 50)}-${sop.version}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] SOP generation error:");
    res.status(500).json({ error: "Failed to generate SOP PDF" });
  }
});

export default router;
