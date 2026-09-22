/**
 * E1a (2026-09-21) — docType is an allowlist, on both upload routes.
 *
 * Document.docType is a free-form String? and both routes stored whatever
 * arrived. The settlement checklist (integrationService SETTLEMENT_DOC_TYPES)
 * matches exact strings, so a typo produced a row nothing would ever read. The
 * vocabulary now lives in lib/documentTypes and each route refuses anything
 * outside it with a 400 — driven here through the REAL routers over HTTP,
 * because a pure test of the lib proves the list and nothing about whether a
 * route consults it.
 *
 * Adversarially verified at authoring: removing the isAllowedDocType check from
 * either route turns exactly that route's refusal case red; dropping TEMP_LOG
 * from the lib turns the parity case red.
 *
 * v3.8.bfu: RATE_CON leaves the CARRIER-uploadable subset. The signed rate
 * confirmation is system-generated and frozen by contentHash; a carrier copy
 * is a second, unverified record of the same document. Refused in the seam,
 * so both routes answer 400 to a CARRIER and AE roles keep the type. Deleting
 * the seam's carrierMayUploadLoadDocType check turns the two CARRIER RATE_CON
 * cases red and leaves the AE case green.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import {
  SETTLEMENT_DOC_TYPES,
  LOAD_DOC_TYPES,
  CARRIER_DOC_TYPES,
  CUSTOMER_DOC_TYPES,
  CARRIER_UPLOADABLE_LOAD_DOC_TYPES,
  normalizeDocType,
  isAllowedDocType,
  carrierMayUploadLoadDocType,
  docTypeClassFor,
} from "../../../src/lib/documentTypes";

const mockPrisma = prisma as any;
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
  getDownloadUrl: vi.fn(),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(),
  uploadFileToPath: vi.fn(),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onPODUploaded: vi.fn().mockResolvedValue(undefined),
  onLoadDelivered: vi.fn().mockResolvedValue(undefined),
  syncSettlementDocFlags: vi.fn().mockResolvedValue({ updated: false }),
}));
vi.mock("../../../src/services/shipperNotificationService", () => ({
  sendShipperDeliveryEmail: vi.fn(),
  sendShipperMilestoneEmail: vi.fn(),
}));
vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendPODToContact: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/loadActivityService", () => ({ logLoadActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));
vi.mock("../../../src/lib/loginFlags", () => ({ flagSensitiveActionAfterNewLogin: vi.fn().mockResolvedValue(undefined) }));
// The 2FA wall (v3.8.atm) sits on the documents router; it is exercised by its
// own proof, not here. The CARRIER test principal has no TOTP row.
vi.mock("../../../src/middleware/requireTotpEnrolled", () => ({
  requireTotpEnrolled: (_r: any, _s: any, n: any) => n(),
}));
vi.mock("../../../src/middleware/complianceDocStepUp", () => ({
  requireStepUpForCarrierComplianceDoc: (_r: any, _s: any, n: any) => n(),
}));

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

describe("the vocabulary", () => {
  it("settlement types are all LOAD types, and match integrationService's checklist exactly", () => {
    for (const t of SETTLEMENT_DOC_TYPES) expect(isAllowedDocType(t, "LOAD")).toBe(true);
    // Parity with the map that decides the checklist flags: every string it
    // matches on is in the settlement set, and the set has nothing it ignores.
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/services/integrationService.ts"), "utf8");
    const start = src.indexOf("const SETTLEMENT_DOC_TYPES = {");
    const block = src.slice(start, src.indexOf("} as const;", start));
    const inMap = new Set(Array.from(block.matchAll(/"([A-Z_]+)"/g), (m) => m[1]));
    expect(inMap.size).toBeGreaterThan(0); // vacuity: the block was found
    expect(new Set(SETTLEMENT_DOC_TYPES)).toEqual(inMap);
  });

  it("the carrier-uploadable load types are every LOAD type except RATE_CON, and every settlement type is among them", () => {
    expect([...CARRIER_UPLOADABLE_LOAD_DOC_TYPES].sort()).toEqual(LOAD_DOC_TYPES.filter((t) => t !== "RATE_CON").sort());
    expect(carrierMayUploadLoadDocType("RATE_CON")).toBe(false);
    for (const t of LOAD_DOC_TYPES) if (t !== "RATE_CON") expect(carrierMayUploadLoadDocType(t), t).toBe(true);
    // the paperwork panel's slots must all be reachable from the portal
    for (const t of SETTLEMENT_DOC_TYPES) expect(carrierMayUploadLoadDocType(t), t).toBe(true);
    // vacuity: the subset is the list minus exactly one
    expect(CARRIER_UPLOADABLE_LOAD_DOC_TYPES).toHaveLength(LOAD_DOC_TYPES.length - 1);
  });

  it("refuses an unknown string in every class", () => {
    for (const cls of ["LOAD", "CARRIER", "CUSTOMER", "ANY"] as const) {
      expect(isAllowedDocType("FOO", cls)).toBe(false);
      expect(isAllowedDocType("", cls)).toBe(false);
    }
  });

  it("normalizes case and whitespace; absent or empty is null so a caller can default", () => {
    expect(normalizeDocType(" pod ")).toBe("POD");
    expect(normalizeDocType("Signed_Bol_Del")).toBe("SIGNED_BOL_DEL");
    expect(normalizeDocType(undefined)).toBeNull();
    expect(normalizeDocType("")).toBeNull();
    expect(normalizeDocType(42)).toBeNull();
  });

  it("resolves the class from the target — a load wins over an entity", () => {
    expect(docTypeClassFor({ loadId: "l1", entityType: "CARRIER" })).toBe("LOAD");
    expect(docTypeClassFor({ entityType: "CARRIER" })).toBe("CARRIER");
    expect(docTypeClassFor({ entityType: "CUSTOMER" })).toBe("CUSTOMER");
    expect(docTypeClassFor({ entityType: "INVOICE" })).toBe("ANY");
    expect(docTypeClassFor({})).toBe("ANY");
  });

  it("a customer contract is not a carrier document — the class is scoped, not a flat union", () => {
    expect(isAllowedDocType("CUSTOMER_CONTRACT", "CUSTOMER")).toBe(true);
    expect(isAllowedDocType("CUSTOMER_CONTRACT", "CARRIER")).toBe(false);
    expect(isAllowedDocType("W9", "CARRIER")).toBe(true);
    expect(isAllowedDocType("W9", "LOAD")).toBe(false);
    for (const t of [...LOAD_DOC_TYPES, ...CARRIER_DOC_TYPES, ...CUSTOMER_DOC_TYPES]) {
      expect(isAllowedDocType(t, "ANY")).toBe(true);
    }
  });
});

describe("POST /carrier-loads/:id/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", carrierId: "u-carrier", status: "BOOKED", referenceNumber: "SRL-1" });
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ onboardingStatus: "APPROVED" });
    mockPrisma.document.create.mockResolvedValue({ id: "doc-1" });
  });

  it("refuses an unknown docType with 400 and stores nothing", async () => {
    const res = await request(await app())
      .post("/api/carrier-loads/load-1/documents")
      .set("x-test-role", "CARRIER")
      .field("docType", "FOO")
      .attach("file", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNKNOWN_DOC_TYPE");
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("accepts a settlement docType, normalized", async () => {
    const res = await request(await app())
      .post("/api/carrier-loads/load-1/documents")
      .set("x-test-role", "CARRIER")
      .field("docType", " signed_bol_del ")
      .attach("file", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe("SIGNED_BOL_DEL");
  });

  it("refuses RATE_CON from a carrier with 400 and stores nothing — the signed rate confirmation is system-generated", async () => {
    const res = await request(await app())
      .post("/api/carrier-loads/load-1/documents")
      .set("x-test-role", "CARRIER")
      .field("docType", "RATE_CON")
      .attach("file", PDF, { filename: "rc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DOC_TYPE_NOT_CARRIER_UPLOADABLE");
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });
});

describe("POST /documents/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.document.create.mockResolvedValue({ id: "doc-1" });
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-carrier" });
  });

  it("refuses an unknown docType with 400 and stores nothing (AE caller)", async () => {
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "ADMIN")
      .field("docType", "FOO")
      .field("loadId", "load-1")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNKNOWN_DOC_TYPE");
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("refuses a load-class type on a carrier's compliance upload — the class follows the auto-linked target", async () => {
    // A carrier with no loadId is auto-linked to their CARRIER profile; POD is
    // not a carrier document, so it is refused rather than filed on the profile.
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "CARRIER")
      .field("docType", "POD")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNKNOWN_DOC_TYPE");
  });

  it("accepts a carrier compliance type on the auto-linked profile", async () => {
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "CARRIER")
      .field("docType", "w9")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe("W9");
  });

  it("refuses RATE_CON from a carrier on a load it owns with 400 and stores nothing — same seam, same answer", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", carrierId: "u-carrier", posterId: "u-admin", status: "BOOKED", referenceNumber: "SRL-1", customer: null });
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "CARRIER")
      .field("docType", "RATE_CON")
      .field("loadId", "load-1")
      .attach("files", PDF, { filename: "rc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DOC_TYPE_NOT_CARRIER_UPLOADABLE");
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("keeps RATE_CON for an AE: an AE attaching a wet-signed scan on the carrier's behalf is stored", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", carrierId: "u-carrier", posterId: "u-admin", status: "BOOKED", referenceNumber: "SRL-1", customer: null });
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "ADMIN")
      .field("docType", "RATE_CON")
      .field("loadId", "load-1")
      .attach("files", PDF, { filename: "rc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe("RATE_CON");
  });

  it("an absent docType is still stored as null — absent is not unknown", async () => {
    const res = await request(await app())
      .post("/api/documents/upload")
      .set("x-test-role", "ADMIN")
      .attach("files", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBeNull();
  });
});
