import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

export async function uploadDocuments(req: AuthRequest, res: Response) {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const { loadId, invoiceId } = req.body;

  const documents = await Promise.all(
    files.map((file) =>
      prisma.document.create({
        data: {
          fileName: file.originalname,
          fileUrl: `/uploads/${file.filename}`,
          fileType: file.mimetype,
          fileSize: file.size,
          userId: req.user!.id,
          loadId: loadId || null,
          invoiceId: invoiceId || null,
        },
      })
    )
  );

  res.status(201).json(documents);
}

export async function getDocuments(req: AuthRequest, res: Response) {
  const { loadId, invoiceId } = req.query;
  const where: Record<string, unknown> = { userId: req.user!.id };
  if (loadId) where.loadId = loadId;
  if (invoiceId) where.invoiceId = invoiceId;

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  res.json(documents);
}

export async function deleteDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (doc.userId !== req.user!.id && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
