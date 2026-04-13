import { Router, Response } from "express";
import { createSOP, getSOPs, getSOPById, updateSOP, uploadSOPFile, deleteSOP } from "../controllers/sopController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { upload } from "../config/upload";
import { prisma } from "../config/database";
import { generateSOPPdf } from "../services/sopPdfService";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

router.get("/", getSOPs);
router.get("/:id", getSOPById);
router.post("/", authorize("ADMIN", "CEO", "OPERATIONS"), createSOP);
router.patch("/:id", authorize("ADMIN", "CEO", "OPERATIONS"), updateSOP);
router.post("/:id/upload", authorize("ADMIN", "CEO", "OPERATIONS"), upload.single("file"), uploadSOPFile);
router.delete("/:id", authorize("ADMIN", "CEO"), deleteSOP);

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
