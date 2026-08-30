import { Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { env } from "../config/env";
import { uploadFile, uploadFileToPath, getDownloadUrl, getFileStream, deleteFile, validateBufferSignature, isS3Url } from "../services/storageService";
import { validateAndNotifyPOD } from "../services/shipperNotificationService";
import { onPODUploaded, syncSettlementDocFlags } from "../services/integrationService";
import { log } from "../lib/logger";

/**
 * Roles that operate SRL internally and legitimately need visibility across all
 * tenants. Everyone else (CARRIER, SHIPPER, FACTOR) must be scoped to what they own.
 */
// v3.8.aue — ACCOUNT_EXECUTIVE added (POD/document access is operational).
const AE_INTERNAL_ROLES = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "AE", "ACCOUNT_EXECUTIVE"];

function isAeInternal(role: string): boolean {
  return AE_INTERNAL_ROLES.includes(role);
}

/**
 * v3.8.aqn — verify the caller is allowed to attach a document to the target they
 * named. Returns an error string to reject with, or null when allowed.
 *
 * uploadDocuments previously took loadId / invoiceId / entityType / entityId
 * straight from the request body and never checked them against the caller. Since
 * the route carried only `authenticate` (no authorize, no ownership test), ANY
 * logged-in user could:
 *   - POST docType=CUSTOMER_CONTRACT&entityType=CUSTOMER&entityId=<any customer>
 *     and overwrite that customer's contractUrl — which is a precondition of the
 *     customer-approval gate;
 *   - POST docType=POD&loadId=<someone else's load>, which fires onPODUploaded()
 *     and advances that load to POD_RECEIVED and its invoice to SENT.
 * Both are cross-tenant writes triggered purely by body parameters.
 *
 * Verified against every caller before writing this: the carrier portal sends no
 * entity fields at all (the auto-link block below fills in its OWN profile), the
 * shipper portal sends only files, and every caller that does name an entity —
 * CRM DocsTab, track-trace DocsTab/PhotosTab, CreateInvoiceModal — is AE-console.
 * So no legitimate flow supplies a target it does not own.
 */
async function checkUploadTargetOwnership(
  req: AuthRequest,
  target: { loadId?: string; invoiceId?: string; entityType?: string; entityId?: string; docType?: string }
): Promise<string | null> {
  const role = req.user!.role;
  const userId = req.user!.id;

  if (isAeInternal(role)) return null;

  const { loadId, invoiceId, entityType, entityId, docType } = target;

  // Attaching to a load requires being a party to that load.
  if (loadId) {
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { posterId: true, carrierId: true, customer: { select: { userId: true } } },
    });
    if (!load) return "Load not found";
    const isParty =
      load.carrierId === userId || load.posterId === userId || load.customer?.userId === userId;
    if (!isParty) return "Not authorized to attach documents to this load";
  }

  // Attaching to an invoice requires owning it.
  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { userId: true, load: { select: { posterId: true, carrierId: true, customer: { select: { userId: true } } } } },
    });
    if (!invoice) return "Invoice not found";
    const isParty =
      invoice.userId === userId ||
      invoice.load?.carrierId === userId ||
      invoice.load?.posterId === userId ||
      invoice.load?.customer?.userId === userId;
    if (!isParty) return "Not authorized to attach documents to this invoice";
  }

  // Attaching to an entity requires owning that entity.
  if (entityType === "CARRIER" && entityId) {
    const profile = await prisma.carrierProfile.findUnique({
      where: { id: entityId },
      select: { userId: true },
    });
    if (!profile || profile.userId !== userId) {
      return "Not authorized to attach documents to this carrier";
    }
  } else if (entityType === "CUSTOMER" && entityId) {
    const customer = await prisma.customer.findUnique({
      where: { id: entityId },
      select: { userId: true },
    });
    if (!customer || customer.userId !== userId) {
      return "Not authorized to attach documents to this customer";
    }
  } else if (entityType && entityId) {
    // Unknown entity type from a non-AE caller — fail closed rather than guess.
    return "Not authorized to attach documents to this entity";
  }

  // The customer-contract cross-write feeds the approval gate. Restrict it to AE
  // staff outright: a carrier must never be able to set a customer's contractUrl,
  // and a shipper should not self-serve their own approval precondition.
  if (docType === "CUSTOMER_CONTRACT") {
    return "Only SRL staff can upload a customer contract";
  }

  return null;
}

// ─── POST /api/documents/upload ───────────────────────
export async function uploadDocuments(req: AuthRequest, res: Response) {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  // Validate file content matches claimed MIME type (magic bytes check on buffer)
  for (const file of files) {
    if (!validateBufferSignature(file.buffer, file.mimetype)) {
      res.status(400).json({ error: `File "${file.originalname}" content does not match its file type. Upload rejected.` });
      return;
    }
  }

  let { loadId, invoiceId, entityType, entityId, docType } = req.body;

  // Auto-link carrier-uploaded compliance docs to their carrier profile
  if (!entityType && req.user!.role === "CARRIER") {
    const carrierProfile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
    if (carrierProfile) {
      entityType = "CARRIER";
      entityId = carrierProfile.id;
    }
  }

  // v3.8.aqn — the caller must actually own whatever they are attaching to.
  // Runs AFTER the auto-link above so the auto-filled values are validated too
  // (they are self-owned, so a legitimate carrier upload passes unchanged).
  const ownershipError = await checkUploadTargetOwnership(req, {
    loadId,
    invoiceId,
    entityType,
    entityId,
    docType,
  });
  if (ownershipError) {
    res.status(403).json({ error: ownershipError });
    return;
  }

  const documents = await Promise.all(
    files.map(async (file) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      const key = `documents/${uniqueSuffix}${ext}`;
      const fileUrl = await uploadFile(file.buffer, key, file.mimetype);

      // v3.8.oo Gap 2 — CUSTOMER_CONTRACT uploads cross-write fileUrl
      // into customer.contractUrl alongside the Document row, so the
      // v3.8.ee approve gate's contract precondition becomes
      // satisfiable through the standard upload flow. Convention on
      // multiple uploads: latest URL wins (overwrite), matching how
      // the rest of the Document table treats document type slots
      // (see DocsTab statusPill which renders the most recent doc per
      // category). Previous Document rows stay in the table for audit
      // history. Wrapped in $transaction so cross-write and Document
      // create succeed or fail together.
      if (
        docType === "CUSTOMER_CONTRACT" &&
        entityType === "CUSTOMER" &&
        entityId
      ) {
        return prisma.$transaction(async (tx) => {
          const doc = await tx.document.create({
            data: {
              fileName: file.originalname,
              fileUrl,
              fileType: file.mimetype,
              fileSize: file.size,
              userId: req.user!.id,
              loadId: loadId || null,
              invoiceId: invoiceId || null,
              entityType,
              entityId,
              docType,
              status: "PENDING",
            },
          });
          await tx.customer.update({
            where: { id: entityId },
            data: { contractUrl: fileUrl },
          });
          return doc;
        });
      }

      return prisma.document.create({
        data: {
          fileName: file.originalname,
          fileUrl,
          fileType: file.mimetype,
          fileSize: file.size,
          userId: req.user!.id,
          loadId: loadId || null,
          invoiceId: invoiceId || null,
          entityType: entityType || null,
          entityId: entityId || null,
          docType: docType || null,
          status: "PENDING",
        },
      });
    })
  );

  // If POD uploaded for a load, trigger validation, shipper notification, and status advancement
  if (docType === "POD" && loadId) {
    for (const doc of documents) {
      validateAndNotifyPOD(loadId, doc.id).catch((e) => log.error({ err: e }, "[ShipperNotify] POD validation error:"));
    }
    // Integration: advance load to POD_RECEIVED + invoice to SENT
    onPODUploaded(loadId).catch((e) => log.error({ err: e }, "[Integration] onPODUploaded error:"));
  }

  // v3.8.ath — the settlement document checklist becomes true here, at the
  // moment the document arrives, rather than never. Recomputed from what exists,
  // so a re-upload or a second document of the same type is free.
  if (loadId) {
    syncSettlementDocFlags(loadId).catch((e) =>
      log.error({ err: e, loadId }, "[Settlement] doc-flag sync failed (non-fatal)"),
    );
  }

  res.status(201).json(documents);
}

// ─── GET /api/documents ───────────────────────────────
export async function getDocuments(req: AuthRequest, res: Response) {
  const { loadId, invoiceId, entityType, entityId, docType, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, parseInt(limit) || 50);

  const where: Record<string, unknown> = {};
  if (loadId) where.loadId = loadId;
  if (invoiceId) where.invoiceId = invoiceId;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (docType) where.docType = docType;

  // v3.8.aqn — ownership scoping is now ALWAYS applied to non-AE callers.
  //
  // It used to be opt-OUT: the `userId` clause was added only when the caller
  // supplied none of entityType/loadId/invoiceId. Supplying any filter therefore
  // REMOVED the ownership restriction instead of narrowing within it, so
  //   GET /api/documents?entityType=CARRIER&entityId=<another carrier's profile>
  // returned that carrier's W-9 / COI / AUTHORITY rows — including fileUrl — to
  // any authenticated user. The same shape leaked customer contracts via
  // entityType=CUSTOMER and any load's documents via loadId.
  //
  // It also compared against "ADMIN" only, so CEO was silently scoped to its own
  // uploads and saw an empty documents page.
  //
  // Prisma ANDs top-level keys, so the caller's filters still apply — they now
  // narrow WITHIN the ownership set rather than replacing it.
  const role = req.user!.role;
  const userId = req.user!.id;

  if (!isAeInternal(role)) {
    const ownership: Record<string, unknown>[] = [{ userId }];

    if (role === "CARRIER") {
      const profile = await prisma.carrierProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (profile) ownership.push({ entityType: "CARRIER", entityId: profile.id });
      ownership.push({ load: { carrierId: userId } });
    } else if (role === "SHIPPER") {
      const customers = await prisma.customer.findMany({ where: { userId }, select: { id: true } });
      for (const c of customers) ownership.push({ entityType: "CUSTOMER", entityId: c.id });
      ownership.push({ load: { posterId: userId } });
      ownership.push({ load: { customer: { userId } } });
    }

    where.OR = ownership;
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * l,
      take: l,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  res.json({ documents, total, page: p, totalPages: Math.ceil(total / l) });
}

// ─── GET /api/documents/:id/download ──────────────────
export async function downloadDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { load: { select: { posterId: true, carrierId: true } } },
  });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // IDOR check: non-admin users can only download their own docs or docs for their loads
  const role = req.user!.role;
  const userId = req.user!.id;
  if (role !== "ADMIN" && role !== "CEO") {
    const isOwner = doc.userId === userId;
    const isLoadParticipant = doc.load && (doc.load.posterId === userId || doc.load.carrierId === userId);
    if (!isOwner && !isLoadParticipant) {
      res.status(403).json({ error: "Not authorized to download this document" });
      return;
    }
  }

  // S3 files: redirect to presigned URL
  if (isS3Url(doc.fileUrl)) {
    const presignedUrl = await getDownloadUrl(doc.fileUrl);
    res.redirect(presignedUrl);
    return;
  }

  // Legacy local files
  const filePath = path.resolve(env.UPLOAD_DIR, path.basename(doc.fileUrl));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found on disk" });
    return;
  }

  // Sanitize filename for Content-Disposition header to prevent header injection
  const safeFileName = doc.fileName.replace(/["\r\n]/g, "_");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
  res.setHeader("Content-Type", doc.fileType);
  fs.createReadStream(filePath).pipe(res);
}

// ─── RETIRED v3.8.avo — the HTML Rate Confirmation renderer ──────────────
//
// generateRateConfirmation + buildRateConHTML rendered a SECOND Rate
// Confirmation, in HTML, from a parallel layout — for the document a carrier
// signs. Two renderers for one legal instrument is the Load.rate defect in
// document form: nobody knows which is authoritative until the numbers
// disagree in front of a carrier.
//
// Dead when removed. POST /api/documents/rate-con/:loadId had no caller in
// backend/src, backend/__tests__, backend/scripts, e2e or frontend/src; the
// only reference was its own route mount. The live path is
// pdfService.generateRateConfirmation (skill chrome) via
// /pdf/rate-confirmation/:loadId and the /rate-confirmations/* model.
//
// It also held the last non-canonical colour on a carrier-facing document:
// #0D1B2A navy and a third gold #C8963E. Retiring it took them with it.

// ─── DELETE /api/documents/:id ────────────────────────
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

  // Delete from storage
  await deleteFile(doc.fileUrl);

  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
