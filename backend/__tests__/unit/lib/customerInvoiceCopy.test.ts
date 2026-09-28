/**
 * D (ruled 2026-09-28): SRL's copy of its invoice to the customer is its own document type,
 * CUSTOMER_INVOICE_COPY. It never reaches a carrier or a customer.
 *
 * Before this, the Documents tab's "Invoice" row filed it as INVOICE, which is the CARRIER's
 * invoice. The four Beekeepers packets therefore cleared the carrier-pay gate, filled the
 * carrier's paperwork panel and were listed and served in the carrier's portal. This file
 * drives each of those surfaces with the new type, through the real function or router.
 * Every prisma mock ANSWERS ITS WHERE against fixture documents, so a filter that stops
 * excluding the type returns it and the case goes red. A mock that returns fixed rows
 * would pass whatever the filter says.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import {
  SRL_INTERNAL_LOAD_DOC_TYPES,
  SRL_STAFF_ROLES,
  LOAD_DOC_TYPES,
  SETTLEMENT_DOC_TYPES,
  isSrlInternalDocType,
  isSrlStaffRole,
  carrierMayUploadLoadDocType,
  isAllowedDocType,
} from "../../../src/lib/documentTypes";
import { PAPERWORK_DOC_TYPES, paperworkSlots } from "../../../../shared/constants/paperwork";
import { invoiceOnFile } from "../../../src/lib/carrierPayInvoiceGate";
import { SHIPPER_VISIBLE_DOC_TYPES } from "../../../src/controllers/shipperPortalController";
import { notifyAccountingOfCarrierInvoice } from "../../../src/services/carrierInvoiceNotifyService";
import { sendPODToContact } from "../../../src/services/shipperLoadNotifyService";
import { onPODUploaded } from "../../../src/services/integrationService";

const mockPrisma = prisma as any;
const COPY = "CUSTOMER_INVOICE_COPY";
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) return res.status(401).json({ error: "No token provided" });
      req.user = { id: `u-${String(role).toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});
vi.mock("../../../src/middleware/rateLimiters", () => ({
  uploadLimiter: (_r: any, _s: any, n: any) => n(),
  staffUploadLimiter: (_r: any, _s: any, n: any) => n(),
}));
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://s3.test/documents/x.pdf"),
  validateBufferSignature: vi.fn().mockReturnValue(true),
  isS3Url: vi.fn().mockReturnValue(true),
  getDownloadUrl: vi.fn().mockResolvedValue("https://s3.test/presigned"),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(),
  uploadFileToPath: vi.fn(),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onPODUploaded: vi.fn().mockResolvedValue(undefined),
  onLoadDelivered: vi.fn().mockResolvedValue(undefined),
  syncSettlementDocFlags: vi.fn().mockResolvedValue({ updated: false }),
}));
vi.mock("../../../src/services/carrierInvoiceNotifyService", () => ({ notifyAccountingOfCarrierInvoice: vi.fn().mockResolvedValue({ emailed: true }) }));
vi.mock("../../../src/services/shipperNotificationService", () => ({ sendShipperDeliveryEmail: vi.fn(), sendShipperMilestoneEmail: vi.fn() }));
vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendPODToContact: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/loadActivityService", () => ({ logLoadActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));
vi.mock("../../../src/lib/loginFlags", () => ({ flagSensitiveActionAfterNewLogin: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/middleware/requireTotpEnrolled", () => ({ requireTotpEnrolled: (_r: any, _s: any, n: any) => n() }));
vi.mock("../../../src/middleware/complianceDocStepUp", () => ({ requireStepUpForCarrierComplianceDoc: (_r: any, _s: any, n: any) => n() }));

async function app() {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  const documents = (await import("../../../src/routes/documents")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carrier-loads", carrierLoads);
  a.use("/api/documents", documents);
  return a;
}

const PDF = Buffer.from("%PDF-1.4 probe");
// The packet as it sits after D: SRL's copy, next to a POD and the RC the carrier owns.
const DOCS = [
  { id: "d-copy", loadId: "load-1", docType: COPY, status: "PENDING", createdAt: new Date("2026-09-27T23:50:00Z") },
  { id: "d-pod", loadId: "load-1", docType: "POD", status: "PENDING", createdAt: new Date("2026-09-26T12:00:00Z") },
  { id: "d-rc", loadId: "load-1", docType: "RATE_CON", status: "VERIFIED", createdAt: new Date("2026-09-22T21:19:00Z") },
];
/** A prisma docType filter, evaluated: equals, { in }, { notIn }. */
function docTypeMatches(filter: any, docType: string | null): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "string") return docType === filter;
  if (filter.in) return filter.in.includes(docType);
  if (filter.notIn) return !filter.notIn.includes(docType);
  throw new Error(`unhandled docType filter ${JSON.stringify(filter)}`);
}
const answer = (where: any = {}) => DOCS.filter((d) => (!where.loadId || where.loadId === d.loadId) && docTypeMatches(where.docType, d.docType));

describe("the vocabulary", () => {
  it("CUSTOMER_INVOICE_COPY is a LOAD type SRL keeps: not settlement, not paperwork, not carrier-uploadable, not shipper-visible", () => {
    expect(SRL_INTERNAL_LOAD_DOC_TYPES).toEqual([COPY]);
    expect(LOAD_DOC_TYPES).toContain(COPY);
    expect(isAllowedDocType(COPY, "LOAD")).toBe(true);
    expect(isSrlInternalDocType(COPY)).toBe(true);
    expect(SETTLEMENT_DOC_TYPES as readonly string[]).not.toContain(COPY);
    expect(PAPERWORK_DOC_TYPES as readonly string[]).not.toContain(COPY);
    expect(carrierMayUploadLoadDocType(COPY)).toBe(false);
    expect(SHIPPER_VISIBLE_DOC_TYPES).not.toContain(COPY);
    for (const t of ["INVOICE", "OTHER", "POD", null, undefined, ""]) expect(isSrlInternalDocType(t as any), String(t)).toBe(false);
  });

  it("staff are the eight SRL roles; carrier, shipper, reviewer, factor, driver and anything unknown are not", () => {
    expect([...SRL_STAFF_ROLES].sort()).toEqual(["ACCOUNTING", "ACCOUNT_EXECUTIVE", "ADMIN", "AE", "BROKER", "CEO", "DISPATCH", "OPERATIONS"]);
    for (const r of SRL_STAFF_ROLES) expect(isSrlStaffRole(r), r).toBe(true);
    for (const r of ["CARRIER", "SHIPPER", "CARRIER_REVIEWER", "FACTOR", "DRIVER", "admin", "", null, undefined]) expect(isSrlStaffRole(r as any), String(r)).toBe(false);
  });
});

describe("the carrier-pay gate and the carrier's paperwork panel", () => {
  const db = (docs: any[]) => ({
    load: { findUnique: vi.fn().mockResolvedValue({ status: "DELIVERED", equipmentType: "Dry Van", temperatureControlled: false }) },
    document: { findMany: vi.fn(async (args: any) => docs.filter((d) => docTypeMatches(args.where.docType, d.docType))) },
  });

  it("a customer invoice copy does not put a carrier invoice on file", async () => {
    expect(await invoiceOnFile("load-1", db([DOCS[0]]) as any)).toBe(false);
    // control: the gate does clear on a carrier INVOICE, so false above is the type, not the fixture
    expect(await invoiceOnFile("load-1", db([{ ...DOCS[0], docType: "INVOICE" }]) as any)).toBe(true);
  });

  it("the INVOICE slot stays MISSING with only the copy on the load", () => {
    const slot = (docs: any[]) => paperworkSlots({ status: "DELIVERED" }, docs).find((s) => s.key === "INVOICE")!;
    expect(slot([DOCS[0]]).state).toBe("MISSING");
    expect(slot([{ ...DOCS[0], docType: "INVOICE" }]).state).toBe("UPLOADED");
  });
});

describe("filing it: POST /documents/upload and the carrier route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.document.create.mockImplementation(async (args: any) => ({ id: "doc-new", ...args.data }));
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1", carrierId: "u-carrier", posterId: "u-admin", status: "DELIVERED", referenceNumber: "SRL-1",
      destCompany: "Beekeepers", customer: { userId: "u-shipper", contactName: "AP" },
    });
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-carrier", onboardingStatus: "APPROVED" });
    mockPrisma.invoice.findUnique.mockResolvedValue({ userId: "u-shipper", load: { posterId: "u-admin", carrierId: "u-carrier", customer: { userId: "u-shipper" } } });
  });

  it("an AE files it: stored with the type, and nothing is sent", async () => {
    const res = await request(await app())
      .post("/api/documents/upload").set("x-test-role", "ADMIN")
      .field("docType", COPY).field("loadId", "load-1").field("entityType", "LOAD").field("entityId", "load-1")
      .attach("files", PDF, { filename: "121495I-Invoice-POD.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe(COPY);
    // the INVOICE row's side effects, none of which may fire for the copy
    expect(notifyAccountingOfCarrierInvoice).not.toHaveBeenCalled();
    expect(sendPODToContact).not.toHaveBeenCalled();
    expect(onPODUploaded).not.toHaveBeenCalled();
  });

  it("a carrier on its own load is refused, through either upload route, and nothing is stored", async () => {
    const a = await app();
    const viaDocuments = await request(a)
      .post("/api/documents/upload").set("x-test-role", "CARRIER")
      .field("docType", COPY).field("loadId", "load-1")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    const viaCarrierLoads = await request(a)
      .post("/api/carrier-loads/load-1/documents").set("x-test-role", "CARRIER")
      .field("docType", COPY)
      .attach("file", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    for (const res of [viaDocuments, viaCarrierLoads]) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DOC_TYPE_SRL_ONLY");
    }
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("a shipper who is a party is refused on the load and on its invoice, and nothing is stored", async () => {
    const a = await app();
    const onLoad = await request(a)
      .post("/api/documents/upload").set("x-test-role", "SHIPPER")
      .field("docType", COPY).field("loadId", "load-1")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    const onInvoice = await request(a)
      .post("/api/documents/upload").set("x-test-role", "SHIPPER")
      .field("docType", COPY).field("invoiceId", "inv-1")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    for (const res of [onLoad, onInvoice]) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DOC_TYPE_SRL_ONLY");
    }
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });
});

describe("reaching it: the carrier portal list, the download, and GET /loads/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.load.findUnique.mockImplementation(async (args: any) => ({
      id: "load-1", carrierId: "u-carrier", posterId: "u-admin", status: "DELIVERED",
      documents: answer(args?.include?.documents?.where ? { docType: args.include.documents.where.docType } : {}),
    }));
  });

  it("the carrier's load detail does not list it", async () => {
    const res = await request(await app()).get("/api/carrier-loads/load-1").set("x-test-role", "CARRIER");
    expect(res.status).toBe(200);
    const types = res.body.documents.map((d: any) => d.docType);
    expect(types).not.toContain(COPY);
    expect(types).toEqual(expect.arrayContaining(["POD", "RATE_CON"])); // vacuity: the list is not simply empty
  });

  const docRow = (docType: string) => ({
    id: "d-x", userId: "u-admin", docType, fileName: "x.pdf", fileType: "application/pdf", fileUrl: "s3://b/documents/x.pdf",
    load: { posterId: "u-admin", carrierId: "u-carrier", customer: { userId: "u-shipper" } },
  });

  it("the load's carrier and the load's customer cannot download it; SRL can", async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow(COPY));
    const a = await app();
    expect((await request(a).get("/api/documents/d-x/download").set("x-test-role", "CARRIER")).status).toBe(403);
    expect((await request(a).get("/api/documents/d-x/download").set("x-test-role", "SHIPPER")).status).toBe(403);
    expect((await request(a).get("/api/documents/d-x/download").set("x-test-role", "ADMIN")).status).toBe(302);
  });

  it("control: the same carrier downloads a POD on the same load, so the 403 above is the type", async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow("POD"));
    expect((await request(await app()).get("/api/documents/d-x/download").set("x-test-role", "CARRIER")).status).toBe(302);
  });

  it("GET /loads/:id withholds it from a carrier and a shipper, and returns it to staff", async () => {
    const { getLoadById } = await import("../../../src/controllers/loadController");
    const call = async (role: string) => {
      let body: any;
      const res: any = { status: () => res, json: (b: any) => { body = b; return res; } };
      await getLoadById({ params: { id: "load-1" }, user: { id: `u-${role.toLowerCase()}`, role } } as any, res);
      return body.documents.map((d: any) => d.docType);
    };
    for (const role of ["CARRIER", "SHIPPER"]) {
      const types = await call(role);
      expect(types, role).not.toContain(COPY);
      expect(types, role).toContain("POD");
    }
    for (const role of ["ADMIN", "AE", "ACCOUNTING"]) expect(await call(role), role).toContain(COPY);
  });
});
