/**
 * RECONCILE 3d: the stored copy of a delivered invoice is read back and checked
 * against the recorded SHA-256, and never replaced by anything else.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import { createHash } from "crypto";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/storageService", () => ({ getFileStream: vi.fn() }));
import { getFileStream } from "../../../src/services/storageService";
import { readArchivedInvoice } from "../../../src/lib/invoiceArchive";

const mockPrisma = prisma as any;
const PACKET = Buffer.from("%PDF-1.7 the invoice, BOL and POD exactly as uploaded");
const HASH = createHash("sha256").update(PACKET).digest("hex");
const ARCHIVE = { archivedDocumentId: "doc-1", deliveredFileHash: HASH };

describe("readArchivedInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({ fileUrl: "s3://bucket/invoices/archive/121494I.pdf" });
    vi.mocked(getFileStream).mockImplementation(async () => Readable.from([PACKET.subarray(0, 9), PACKET.subarray(9)]));
  });

  it("returns the stored bytes, reassembled exactly, with their hash", async () => {
    const r = await readArchivedInvoice(ARCHIVE);
    expect(r.ok && Buffer.compare(r.bytes, PACKET)).toBe(0);
    expect(r).toMatchObject({ ok: true, hash: HASH });
    expect(getFileStream).toHaveBeenCalledWith("s3://bucket/invoices/archive/121494I.pdf");
  });

  it("refuses bytes that do not match the recorded hash", async () => {
    const r = await readArchivedInvoice({ ...ARCHIVE, deliveredFileHash: "0".repeat(64) });
    expect(r).toMatchObject({ ok: false, status: 500, code: "INVOICE_ARCHIVE_HASH_MISMATCH" });
  });

  it("refuses an archive that storage cannot read", async () => {
    vi.mocked(getFileStream).mockRejectedValue(new Error("NoSuchKey"));
    expect(await readArchivedInvoice(ARCHIVE)).toMatchObject({ ok: false, status: 503, code: "INVOICE_ARCHIVE_UNREADABLE" });
  });

  it("refuses a stream that fails partway, rather than returning what arrived", async () => {
    vi.mocked(getFileStream).mockImplementation(async () =>
      new Readable({ read() { this.push(PACKET.subarray(0, 9)); this.destroy(new Error("connection reset")); } }));
    expect(await readArchivedInvoice(ARCHIVE)).toMatchObject({ ok: false, code: "INVOICE_ARCHIVE_UNREADABLE" });
  });

  it("refuses a document row that never stored a file (empty fileUrl, the Item 248 shape)", async () => {
    mockPrisma.document.findUnique.mockResolvedValue({ fileUrl: "" });
    expect(await readArchivedInvoice(ARCHIVE)).toMatchObject({ ok: false, code: "INVOICE_ARCHIVE_UNREADABLE" });
    expect(getFileStream).not.toHaveBeenCalled();
  });
});
