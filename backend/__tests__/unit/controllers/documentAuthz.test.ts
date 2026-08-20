import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/storageService", () => ({
  uploadFile: vi.fn().mockResolvedValue("s3://srl-documents-prod/documents/x.pdf"),
  uploadFileToPath: vi.fn(),
  getDownloadUrl: vi.fn(),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(),
  validateBufferSignature: vi.fn().mockReturnValue(true),
  isS3Url: vi.fn().mockReturnValue(true),
}));
vi.mock("../../../src/services/shipperNotificationService", () => ({
  validateAndNotifyPOD: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onPODUploaded: vi.fn().mockResolvedValue(undefined),
  // v3.8.ath — the upload path now also syncs the settlement doc checklist.
  syncSettlementDocFlags: vi.fn().mockResolvedValue({ updated: false }),
}));

import { uploadDocuments, getDocuments } from "../../../src/controllers/documentController";

const mockPrisma = vi.mocked(prisma) as any;

function pdf() {
  return {
    originalname: "doc.pdf",
    mimetype: "application/pdf",
    size: 1024,
    buffer: Buffer.from("%PDF-1.4"),
  };
}

function mockReqRes(opts: { body?: any; user?: any; query?: any; files?: any[] }) {
  return {
    req: {
      body: opts.body ?? {},
      user: opts.user,
      params: {},
      query: opts.query ?? {},
      headers: {},
      files: opts.files,
    } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn() } as any,
  };
}

/**
 * v3.8.aqn regression suite for document-endpoint authorization.
 *
 * Two cross-tenant defects were live:
 *
 * 1. uploadDocuments took loadId / invoiceId / entityType / entityId straight
 *    from the request body with NO ownership check and no authorize() on the
 *    route, so any authenticated user could overwrite another customer's
 *    contractUrl (a precondition of the customer-approval gate) or attach a POD
 *    to someone else's load — which fires onPODUploaded() and advances that
 *    load's status and its invoice.
 *
 * 2. getDocuments applied its ownership clause only when NO filter was supplied,
 *    so passing any filter REMOVED the restriction. `?entityType=CARRIER` alone
 *    returned every carrier's W-9 / COI / AUTHORITY rows platform-wide.
 */
describe("document authorization — v3.8.aqn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction = vi.fn(async (fn: any) => fn(mockPrisma));
    mockPrisma.document.create.mockResolvedValue({ id: "doc-1" });
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.document.count.mockResolvedValue(0);
  });

  describe("uploadDocuments — ownership of the attach target", () => {
    it("blocks a carrier attaching a document to another carrier's profile", async () => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue({ userId: "other-carrier-user" });

      const { req, res } = mockReqRes({
        body: { entityType: "CARRIER", entityId: "other-carrier-profile", docType: "W9" },
        user: { id: "carrier-1", role: "CARRIER" },
        files: [pdf()],
      });

      await uploadDocuments(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.document.create).not.toHaveBeenCalled();
    });

    it("blocks a carrier attaching a POD to a load they are not on (the onPODUploaded trigger)", async () => {
      mockPrisma.load.findUnique.mockResolvedValue({
        posterId: "some-ae",
        carrierId: "a-different-carrier",
        customer: { userId: "some-shipper" },
      });

      const { req, res } = mockReqRes({
        body: { loadId: "load-belonging-to-someone-else", docType: "POD" },
        user: { id: "carrier-1", role: "CARRIER" },
        files: [pdf()],
      });

      await uploadDocuments(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.document.create).not.toHaveBeenCalled();
    });

    it("blocks a non-AE user from uploading a CUSTOMER_CONTRACT (the approval-gate cross-write)", async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ userId: "shipper-1" });

      const { req, res } = mockReqRes({
        body: { entityType: "CUSTOMER", entityId: "cust-1", docType: "CUSTOMER_CONTRACT" },
        user: { id: "shipper-1", role: "SHIPPER" }, // owns the customer, still refused
        files: [pdf()],
      });

      await uploadDocuments(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });

    it("still allows a carrier to upload their OWN compliance document (auto-linked, no entity supplied)", async () => {
      // The carrier portal sends no entity fields; the controller auto-links to
      // the caller's own profile. This must keep working — it is the real flow.
      mockPrisma.carrierProfile.findUnique.mockResolvedValue({
        id: "my-profile",
        userId: "carrier-1",
      });

      const { req, res } = mockReqRes({
        body: { docType: "W9" },
        user: { id: "carrier-1", role: "CARRIER" },
        files: [pdf()],
      });

      await uploadDocuments(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockPrisma.document.create).toHaveBeenCalled();
    });

    it("still allows AE staff to attach a document to any load", async () => {
      const { req, res } = mockReqRes({
        body: { loadId: "any-load", docType: "RATE_CON" },
        user: { id: "ae-1", role: "BROKER" },
        files: [pdf()],
      });

      await uploadDocuments(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // AE is exempt from the ownership lookup entirely.
      expect(mockPrisma.load.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("getDocuments — ownership scoping is applied, not opted out", () => {
    it("scopes a carrier even when a filter is supplied (the bypass)", async () => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "my-profile" });

      const { req, res } = mockReqRes({
        user: { id: "carrier-1", role: "CARRIER" },
        query: { entityType: "CARRIER" }, // pre-fix this removed all scoping
      });

      await getDocuments(req, res);

      const where = mockPrisma.document.findMany.mock.calls[0][0].where;
      expect(where.entityType).toBe("CARRIER");
      // The ownership set must still be intersected with the caller's filter.
      expect(Array.isArray(where.OR)).toBe(true);
      expect(where.OR).toEqual(
        expect.arrayContaining([{ userId: "carrier-1" }, { entityType: "CARRIER", entityId: "my-profile" }])
      );
    });

    it("leaves AE staff unrestricted — including CEO, which the old ADMIN-only check mis-scoped", async () => {
      const { req, res } = mockReqRes({ user: { id: "ceo-1", role: "CEO" }, query: {} });

      await getDocuments(req, res);

      const where = mockPrisma.document.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
      expect(where.userId).toBeUndefined();
    });
  });
});
