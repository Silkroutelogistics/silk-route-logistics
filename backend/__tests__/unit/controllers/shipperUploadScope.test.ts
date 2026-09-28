/**
 * F-D4 (ruled 2026-09-28) — a shipper uploads a BOL or OTHER, nothing else; a role that
 * is neither staff, carrier nor shipper uploads nothing.
 *
 * Before: a shipper who posted a load, or was its customer, passed the ownership gate
 * and could file a POD (the delivery event: it advances the load and fires the
 * settlement hooks) or an INVOICE (the carrier's claim for pay, which emails
 * accounting). A FACTOR or CARRIER_REVIEWER session was refused only when it named a
 * target it did not own; with no target it could upload freely.
 *
 * uploadDocuments runs against the REAL load seam here, with storage and the hooks
 * mocked, so "refused" means refused before anything is uploaded, stored or advanced,
 * on both the load path and the entity path. The load mock answers whichever select
 * asks (the ownership gate and the seam read different fields).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hooks = vi.hoisted(() => ({
  onLoadDelivered: vi.fn().mockResolvedValue(undefined),
  onPODUploaded: vi.fn().mockResolvedValue(undefined),
  syncSettlementDocFlags: vi.fn().mockResolvedValue({ updated: true }),
  uploadFile: vi.fn().mockResolvedValue("https://s3.test/documents/fd4.pdf"),
  validateBufferSignature: vi.fn().mockReturnValue(true),
  autoGenerateInvoice: vi.fn().mockResolvedValue(undefined),
  sendPODToContact: vi.fn().mockResolvedValue(undefined),
  logLoadActivity: vi.fn().mockResolvedValue(undefined),
  broadcastSSE: vi.fn(),
  notifyAccountingOfCarrierInvoice: vi.fn().mockResolvedValue({ emailed: true, rows: 1 }),
}));

vi.mock("../../../src/services/integrationService", () => ({
  onLoadDelivered: hooks.onLoadDelivered,
  onPODUploaded: hooks.onPODUploaded,
  syncSettlementDocFlags: hooks.syncSettlementDocFlags,
}));
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: hooks.uploadFile,
  uploadFileToPath: vi.fn(),
  getDownloadUrl: vi.fn(),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(),
  validateBufferSignature: hooks.validateBufferSignature,
  isS3Url: vi.fn().mockReturnValue(true),
}));
vi.mock("../../../src/services/invoiceService", () => ({ autoGenerateInvoice: hooks.autoGenerateInvoice }));
vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendPODToContact: hooks.sendPODToContact }));
vi.mock("../../../src/services/loadActivityService", () => ({ logLoadActivity: hooks.logLoadActivity }));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: hooks.broadcastSSE }));
vi.mock("../../../src/services/carrierInvoiceNotifyService", () => ({ notifyAccountingOfCarrierInvoice: hooks.notifyAccountingOfCarrierInvoice }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { prisma } from "../../../src/config/database";
import { uploadDocuments } from "../../../src/controllers/documentController";
import { recordLoadDocument, LoadDocumentRefusal } from "../../../src/services/loadDocumentService";
import { documentUploadRefusal, SHIPPER_UPLOADABLE_DOC_TYPES } from "../../../src/lib/documentTypes";

const mockPrisma = prisma as any;
const POSTER = "u-shipper-poster";
const CUSTOMER_USER = "u-shipper-customer";
const CARRIER = "u-carrier";

function pdf() {
  return { originalname: "paper.pdf", mimetype: "application/pdf", size: 2048, buffer: Buffer.from("%PDF-1.4 fd4") };
}

function call(user: { id: string; role: string }, body: Record<string, unknown>) {
  const req: any = { body, user, params: {}, query: {}, headers: {}, files: [pdf()] };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return uploadDocuments(req, res).then(() => ({ status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] }));
}

function nothingWritten() {
  expect(hooks.uploadFile).not.toHaveBeenCalled();
  expect(mockPrisma.document.create).not.toHaveBeenCalled();
  expect(mockPrisma.load.update).not.toHaveBeenCalled();
  expect(hooks.onLoadDelivered).not.toHaveBeenCalled();
  expect(hooks.onPODUploaded).not.toHaveBeenCalled();
  expect(hooks.notifyAccountingOfCarrierInvoice).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // One load row that answers both readers: the ownership gate (posterId, carrierId,
  // customer.userId) and the seam (status, referenceNumber, customer.contactName).
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-fd4", status: "DELIVERED", referenceNumber: "SRL-900404",
    posterId: POSTER, carrierId: CARRIER, destCompany: "Receiver Co",
    actualPickupDatetime: null, actualDeliveryDatetime: null,
    customer: { userId: CUSTOMER_USER, contactName: "Dana" },
  });
  mockPrisma.customer.findUnique.mockResolvedValue({ userId: POSTER });
  mockPrisma.document.create.mockImplementation(async (a: any) => ({ id: "doc-fd4", ...a.data }));
  mockPrisma.load.update.mockResolvedValue({});
  mockPrisma.notification.create.mockResolvedValue({});
});

describe("the rule", () => {
  it("staff and a carrier are not restricted by it; a shipper may upload BOL, OTHER or no type", () => {
    for (const role of ["ADMIN", "BROKER", "ACCOUNTING", "AE", "CARRIER"]) expect(documentUploadRefusal(role, "POD")).toBeNull();
    expect([...SHIPPER_UPLOADABLE_DOC_TYPES]).toEqual(["BOL", "OTHER"]);
    for (const t of ["BOL", "OTHER", undefined, null, ""]) expect(documentUploadRefusal("SHIPPER", t as any)).toBeNull();
  });
  it("a shipper is refused every other type with a 400", () => {
    for (const t of ["POD", "INVOICE", "SIGNED_BOL_DEL", "SIGNED_BOL_PU", "RATE_CON", "TEMP_LOG", "CREDIT_APP", "W9"]) {
      expect(documentUploadRefusal("SHIPPER", t), t).toMatchObject({ status: 400, code: "DOC_TYPE_NOT_SHIPPER_UPLOADABLE" });
    }
  });
  it("any other role is refused with a 403, whatever the type", () => {
    for (const role of ["FACTOR", "CARRIER_REVIEWER", "DRIVER", "SOMETHING_NEW", ""]) {
      expect(documentUploadRefusal(role, "OTHER"), role).toMatchObject({ status: 403, code: "ROLE_MAY_NOT_UPLOAD_DOCUMENTS" });
    }
  });
});

describe("POST /documents — a shipper on its own load", () => {
  it("the poster cannot file a POD: 400, nothing uploaded, stored or advanced", async () => {
    const r = await call({ id: POSTER, role: "SHIPPER" }, { loadId: "load-fd4", docType: "POD" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("DOC_TYPE_NOT_SHIPPER_UPLOADABLE");
    nothingWritten();
  });
  it("the customer cannot file an INVOICE: 400, accounting is not told", async () => {
    const r = await call({ id: CUSTOMER_USER, role: "SHIPPER" }, { loadId: "load-fd4", docType: "INVOICE" });
    expect(r.status).toBe(400);
    nothingWritten();
  });
  it("the poster may file a BOL", async () => {
    const r = await call({ id: POSTER, role: "SHIPPER" }, { loadId: "load-fd4", docType: "BOL" });
    expect(r.status).toBe(201);
    expect(mockPrisma.document.create.mock.calls[0][0].data).toMatchObject({ loadId: "load-fd4", docType: "BOL" });
  });
  it("a shipper upload with no type is stored as OTHER", async () => {
    const r = await call({ id: POSTER, role: "SHIPPER" }, { loadId: "load-fd4" });
    expect(r.status).toBe(201);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe("OTHER");
  });
});

describe("POST /documents — refusals that come first, and the entity path", () => {
  it("a shipper who is not a party to the load gets 403, even for a BOL", async () => {
    const r = await call({ id: "u-shipper-stranger", role: "SHIPPER" }, { loadId: "load-fd4", docType: "BOL" });
    expect(r.status).toBe(403);
    nothingWritten();
  });
  it("a shipper cannot file a CREDIT_APP against its own customer record either", async () => {
    const r = await call({ id: POSTER, role: "SHIPPER" }, { entityType: "CUSTOMER", entityId: "cust-own", docType: "CREDIT_APP" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("DOC_TYPE_NOT_SHIPPER_UPLOADABLE");
    nothingWritten();
  });
  it("the shipper portal's own upload (files, no type, no target) still works", async () => {
    const r = await call({ id: POSTER, role: "SHIPPER" }, {});
    expect(r.status).toBe(201);
    expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
  });
  it("a FACTOR or CARRIER_REVIEWER uploads nothing: 403, even with no target", async () => {
    for (const role of ["FACTOR", "CARRIER_REVIEWER"]) {
      vi.clearAllMocks();
      const r = await call({ id: `u-${role}`, role }, {});
      expect(r.status, role).toBe(403);
      expect(r.body.code).toBe("ROLE_MAY_NOT_UPLOAD_DOCUMENTS");
      nothingWritten();
    }
  });
  it("unchanged: the assigned carrier and staff may still file the POD", async () => {
    expect((await call({ id: CARRIER, role: "CARRIER" }, { loadId: "load-fd4", docType: "POD" })).status).toBe(201);
    vi.clearAllMocks();
    mockPrisma.document.create.mockImplementation(async (a: any) => ({ id: "doc-fd4", ...a.data }));
    expect((await call({ id: "u-ae", role: "BROKER" }, { loadId: "load-fd4", docType: "POD" })).status).toBe(201);
  });
});

describe("the load seam applies the same rule to any caller", () => {
  const base = { loadId: "load-fd4", file: pdf(), uploadSource: "AE_CONSOLE" as const };
  it("a shipper's POD is refused before the load is read or anything uploaded", async () => {
    await expect(recordLoadDocument({ ...base, docType: "POD", actor: { id: POSTER, role: "SHIPPER" } }))
      .rejects.toMatchObject({ status: 400, code: "DOC_TYPE_NOT_SHIPPER_UPLOADABLE" });
    expect(mockPrisma.load.findUnique).not.toHaveBeenCalled();
    nothingWritten();
  });
  it("a FACTOR is refused with a 403", async () => {
    const p = recordLoadDocument({ ...base, docType: "OTHER", actor: { id: "u-f", role: "FACTOR" } });
    await expect(p).rejects.toBeInstanceOf(LoadDocumentRefusal);
    await expect(p).rejects.toMatchObject({ status: 403, code: "ROLE_MAY_NOT_UPLOAD_DOCUMENTS" });
    nothingWritten();
  });
});
