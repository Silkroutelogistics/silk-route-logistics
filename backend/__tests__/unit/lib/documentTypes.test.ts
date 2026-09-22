/**
 * E1a (2026-09-21) — docType is an allowlist, on both upload routes.
 *
 * Document.docType is a free-form String? and both routes stored whatever
 * arrived. The settlement checklist (integrationService SETTLEMENT_DOC_TYPES)
 * matches exact strings, so a typo produced a row nothing would ever read. The
 * vocabulary now lives in lib/documentTypes and each route refuses anything
 * outside it with a 400 — driven here through the REAL router over HTTP,
 * because a pure test of the lib proves the list and nothing about whether a
 * route consults it.
 *
 * Adversarially verified at authoring: removing the isAllowedDocType check from
 * the route turns exactly its refusal case red; dropping TEMP_LOG from the lib
 * turns the parity case red. /documents/upload is E1a-ii.
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
  normalizeDocType,
  isAllowedDocType,
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
  validateAndNotifyPOD: vi.fn().mockResolvedValue(undefined),
  sendShipperDeliveryEmail: vi.fn(),
  sendShipperMilestoneEmail: vi.fn(),
}));
vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendPODToContact: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/loadActivityService", () => ({ logLoadActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));
vi.mock("../../../src/lib/loginFlags", () => ({ flagSensitiveActionAfterNewLogin: vi.fn().mockResolvedValue(undefined) }));

async function app() {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carrier-loads", carrierLoads);
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
});
