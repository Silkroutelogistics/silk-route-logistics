// RECONCILE 3d: GET /pdf/invoice/:id returns the archived delivered file when the invoice links one,
// under the invoice's usual name, and passes a refusal on rather than rendering in its place.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import { createHash } from "crypto";

vi.mock("../../../src/services/pdfService", () => ({
  generateBOLFromLoad: vi.fn(), generateEnhancedRateConfirmation: vi.fn(), generateShipperLoadConfirmation: vi.fn(),
  generateInvoicePDF: vi.fn(() => ({ pipe: vi.fn() })), generateSettlementPDF: vi.fn(),
}));
vi.mock("../../../src/services/shipperTrackingTokenService", () => ({ generateBOLPrintToken: vi.fn() }));
vi.mock("../../../src/lib/stopContact", () => ({ resolveStopContacts: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../src/services/storageService", () => ({ getFileStream: vi.fn() }));

import { prisma } from "../../../src/config/database";
import { generateInvoicePDF } from "../../../src/services/pdfService";
import { getFileStream } from "../../../src/services/storageService";
import { downloadInvoicePDF } from "../../../src/controllers/pdfController";
import { documentFilename, DOCUMENT_FILENAME_LABEL } from "../../../src/lib/documentNumber";
const mockPrisma = prisma as any;
const PACKET = Buffer.from("%PDF-1.7 the invoice, BOL and POD exactly as uploaded to Tipalti");
const INVOICE = {
  id: "inv-121494", userId: "ae-1", invoiceNumber: "121494I", srlDocNumber: "121494I",
  archivedDocumentId: "doc-121494", deliveredFileHash: createHash("sha256").update(PACKET).digest("hex"),
  load: { referenceNumber: "SRL-121494", posterId: "ae-1", customer: { userId: "shipper-1" } }, user: null, lineItems: [],
};
const NAME = documentFilename("121494I", DOCUMENT_FILENAME_LABEL.INVOICE);
const asAccounting = { params: { invoiceId: "inv-121494" }, user: { id: "acct-1", role: "ACCOUNTING" } } as never;
function res() {
  const r: any = { headers: {} };
  for (const m of ["status", "json", "send"]) r[m] = vi.fn(() => r);
  r.setHeader = vi.fn((k: string, v: string) => { r.headers[k] = v; });
  return r;
}

describe("GET /pdf/invoice/:id and the archived copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({ fileUrl: "s3://bucket/invoices/archive/121494I.pdf" });
    vi.mocked(getFileStream).mockImplementation(async () => Readable.from([PACKET]));
  });
  it("sends the stored bytes with their hash, under the invoice's usual name, and renders nothing", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(INVOICE);
    const r = res();
    await downloadInvoicePDF(asAccounting, r);
    expect(Buffer.compare(r.send.mock.calls[0][0], PACKET)).toBe(0);
    expect(r.headers).toMatchObject({ "X-SRL-Content-Hash": INVOICE.deliveredFileHash, "Content-Disposition": `attachment; filename="${NAME}"` });
    expect(generateInvoicePDF).not.toHaveBeenCalled();
  });
  it("passes a refusal on (status and code) and neither sends nor renders", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...INVOICE, deliveredFileHash: "0".repeat(64) });
    const r = res();
    await downloadInvoicePDF(asAccounting, r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json.mock.calls[0][0]).toMatchObject({ code: "INVOICE_ARCHIVE_HASH_MISMATCH" });
    expect(r.send).not.toHaveBeenCalled();
    expect(generateInvoicePDF).not.toHaveBeenCalled();
  });
  it("control: with no archive it renders, under the same name", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...INVOICE, archivedDocumentId: null, deliveredFileHash: null });
    const r = res();
    await downloadInvoicePDF(asAccounting, r);
    expect(generateInvoicePDF).toHaveBeenCalledTimes(1);
    expect(r.headers["Content-Disposition"]).toBe(`attachment; filename="${NAME}"`);
    expect(getFileStream).not.toHaveBeenCalled();
  });
  it("authorization comes first: a stranger gets 403 and no archive is read", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(INVOICE);
    const r = res();
    await downloadInvoicePDF({ params: { invoiceId: "inv-121494" }, user: { id: "someone", role: "SHIPPER" } } as never, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(getFileStream).not.toHaveBeenCalled();
  });
});
