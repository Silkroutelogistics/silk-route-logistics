/**
 * RECONCILE 3d (2026-09-26). Once an invoice links the stored copy of the file
 * its customer received (archivedDocumentId), a download returns THOSE bytes,
 * never a re-render: a render is a different document (the Beekeepers packets
 * carry the BOL and POD as well). This reads the archive back and checks it
 * against deliveredFileHash. It never falls back to anything else: an
 * unreadable archive or a mismatch is a refusal the caller passes on.
 */
import { createHash } from "crypto";
import { prisma } from "../config/database";
import { getFileStream } from "../services/storageService";

export type ArchivedInvoice =
  | { ok: true; bytes: Buffer; hash: string }
  | { ok: false; status: 500 | 503; code: "INVOICE_ARCHIVE_UNREADABLE" | "INVOICE_ARCHIVE_HASH_MISMATCH"; error: string; detail: unknown };

export async function readArchivedInvoice(invoice: { archivedDocumentId: string; deliveredFileHash: string | null }): Promise<ArchivedInvoice> {
  let bytes: Buffer;
  try {
    const doc = await prisma.document.findUnique({ where: { id: invoice.archivedDocumentId }, select: { fileUrl: true } });
    if (!doc?.fileUrl) throw new Error("the archived document has no stored file");
    const chunks: Buffer[] = [];
    for await (const chunk of await getFileStream(doc.fileUrl)) chunks.push(Buffer.from(chunk));
    bytes = Buffer.concat(chunks);
  } catch (detail) {
    return {
      ok: false, status: 503, code: "INVOICE_ARCHIVE_UNREADABLE", detail,
      error: "The delivered copy of this invoice could not be read. Try again shortly; nothing else is served in its place.",
    };
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (invoice.deliveredFileHash && hash !== invoice.deliveredFileHash) {
    return {
      ok: false, status: 500, code: "INVOICE_ARCHIVE_HASH_MISMATCH", detail: { expected: invoice.deliveredFileHash, actual: hash },
      error: "The stored copy of this invoice does not match the file the customer received, so it is not served.",
    };
  }
  return { ok: true, bytes, hash };
}
