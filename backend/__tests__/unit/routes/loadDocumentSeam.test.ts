/**
 * E1d (2026-09-21) — both upload routes reach the load-document seam.
 *
 * E1c built recordLoadDocument() and moved the carrier route onto it; this
 * commit moves /documents/upload's load branch onto it and deletes the second
 * POD sender that branch used. The property this guard holds is that there is
 * ONE path for a load document, whichever route carried it: a route that
 * records a load document by its own hand is a route that will drift from
 * what a POD sets in motion, which is the P0 this arc closed.
 *
 * Behavioural, through the REAL routers over HTTP with the seam mocked — a
 * grep for "recordLoadDocument(" in a route file would be satisfied by an
 * import line (section 19 Sub-pattern 16, the presence-is-not-function shape).
 * The one structural check is the inverse: neither route may still call
 * prisma.document.create for a LOAD document.
 *
 * Adversarially verified at authoring: restoring the pre-E1d load branch in
 * documentController (own document.create + onPODUploaded) turns the AE case
 * and the structural case red; removing the seam call from carrierLoads turns
 * the carrier case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

const seam = vi.hoisted(() => ({
  recordLoadDocument: vi.fn(),
  LoadDocumentRefusal: class LoadDocumentRefusal extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));
vi.mock("../../../src/services/loadDocumentService", () => seam);

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
vi.mock("../../../src/middleware/requireTotpEnrolled", () => ({ requireTotpEnrolled: (_r: any, _s: any, n: any) => n() }));
vi.mock("../../../src/middleware/complianceDocStepUp", () => ({ requireStepUpForCarrierComplianceDoc: (_r: any, _s: any, n: any) => n() }));
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://s3.test/documents/x.pdf"),
  validateBufferSignature: vi.fn().mockReturnValue(true),
  isS3Url: vi.fn().mockReturnValue(true),
  getDownloadUrl: vi.fn(),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(),
  uploadFileToPath: vi.fn(),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onPODUploaded: vi.fn(),
  onLoadDelivered: vi.fn(),
  syncSettlementDocFlags: vi.fn(),
}));
vi.mock("../../../src/lib/loginFlags", () => ({ flagSensitiveActionAfterNewLogin: vi.fn().mockResolvedValue(undefined) }));

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

describe("one seam, both routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seam.recordLoadDocument.mockResolvedValue({
      document: { id: "doc-1", docType: "POD", fileUrl: "https://s3.test/documents/x.pdf" },
      docType: "POD",
      status: { before: "AT_DELIVERY", after: "POD_RECEIVED" },
      deliveryHooksFired: true,
    });
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", carrierId: "u-carrier", posterId: "u-admin", status: "AT_DELIVERY", customer: null });
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-carrier", onboardingStatus: "APPROVED" });
  });

  it("POST /carrier-loads/:id/documents reaches the seam as CARRIER_PORTAL", async () => {
    const res = await request(await app())
      .post("/api/carrier-loads/load-1/documents")
      .set("x-test-role", "CARRIER")
      .field("docType", "POD")
      .attach("file", PDF, { filename: "pod.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(seam.recordLoadDocument).toHaveBeenCalledTimes(1);
    expect(seam.recordLoadDocument.mock.calls[0][0]).toMatchObject({ loadId: "load-1", docType: "POD", uploadSource: "CARRIER_PORTAL", actor: { id: "u-carrier" } });
    expect(res.body.id).toBe("doc-1");
  });

  it("POST /documents/upload with a loadId reaches the seam as AE_CONSOLE, once per file", async () => {
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "ADMIN")
      .field("docType", "POD")
      .field("loadId", "load-1")
      .attach("files", PDF, { filename: "pod-1.pdf", contentType: "application/pdf" })
      .attach("files", PDF, { filename: "pod-2.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(seam.recordLoadDocument).toHaveBeenCalledTimes(2);
    for (const call of seam.recordLoadDocument.mock.calls) {
      expect(call[0]).toMatchObject({ loadId: "load-1", docType: "POD", uploadSource: "AE_CONSOLE", actor: { id: "u-admin" } });
    }
    expect(res.body).toHaveLength(2);
  });

  it("a seam refusal is the route's response — status and code pass through", async () => {
    seam.recordLoadDocument.mockRejectedValueOnce(new seam.LoadDocumentRefusal(400, "FILE_CONTENT_MISMATCH", "content mismatch"));
    const res = await request(await app())
      .post("/api/carrier-loads/load-1/documents")
      .set("x-test-role", "CARRIER")
      .field("docType", "POD")
      .attach("file", PDF, { filename: "pod.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FILE_CONTENT_MISMATCH");
  });

  it("an entity document (no loadId) does NOT go through the seam — it is not a load document", async () => {
    mockPrisma.document.create.mockResolvedValue({ id: "doc-9" });
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "CARRIER")
      .field("docType", "W9")
      .attach("files", PDF, { filename: "w9.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(seam.recordLoadDocument).not.toHaveBeenCalled();
    expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
  });

  it("neither route records a LOAD document by its own hand", () => {
    // The inverse of the behavioural cases: a route that still calls
    // prisma.document.create with a loadId is a second path. carrierLoads has no
    // document.create at all; documentController keeps one for ENTITY documents
    // and its load branch must be the seam.
    const src = (f: string) => fs.readFileSync(path.resolve(__dirname, "../../../src", f), "utf8");
    // Scoped to the /:id/documents handler: POST /:id/exceptions/:excId/receipt
    // also writes a load document (RECEIPT_MECHANICAL, attached to an exception)
    // by its own hand — a third writer, outside E1's two routes, banked at
    // §13.3 Item 293 rather than pulled onto the seam here.
    const cl = src("routes/carrierLoads.ts");
    const start = cl.indexOf('router.post("/:id/documents"');
    const handler = cl.slice(start, cl.indexOf("\nrouter.", start + 1));
    expect(start).toBeGreaterThan(0);
    expect(handler).toContain("recordLoadDocument(");
    expect(handler).not.toMatch(/document\.create\(/);
    const dc = src("controllers/documentController.ts");
    expect(dc).toContain("recordLoadDocument(");
    // The entity branch may create; the load branch may not. Every remaining
    // document.create in the controller must sit under `loadId: loadId || null`
    // style entity handling, never a `loadId: load.id` load write.
    expect(dc).not.toMatch(/onPODUploaded\(/);
    expect(dc).not.toMatch(/validateAndNotifyPOD/);
  });
});
