import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage + side-effect services BEFORE controller import.
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: vi.fn(),
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
}));

import { prisma } from "../../../src/config/database";
import { uploadDocuments } from "../../../src/controllers/documentController";
import { uploadFile } from "../../../src/services/storageService";
import { updateCustomerSchema } from "../../../src/validators/customer";

const mockPrisma = vi.mocked(prisma);
const mockUploadFile = vi.mocked(uploadFile);

function mockUploadReqRes(body: any, files: any[] = [{ originalname: "contract.pdf", mimetype: "application/pdf", buffer: Buffer.from("PDF"), size: 4 }]) {
  const req: any = { body, files, user: { id: "u-1", email: "ae@srl.test", role: "ADMIN" } };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return { req, res };
}

// Mock $transaction(callback) to invoke callback with the same mockPrisma
// as `tx` — both code paths (in-transaction document.create + customer.update,
// and the no-op fallthrough) hit the same prisma mocks.
function arrangeTransactionPassthrough() {
  (mockPrisma.$transaction as any).mockImplementation(async (arg: any) => {
    if (typeof arg === "function") return await arg(mockPrisma);
    return Promise.all(arg);
  });
}

describe("documentController.uploadDocuments — Gap 2 CUSTOMER_CONTRACT cross-write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadFile.mockResolvedValue("https://s3/documents/contract-abc.pdf");
    mockPrisma.document.create.mockResolvedValue({ id: "doc-1", fileUrl: "https://s3/documents/contract-abc.pdf" } as any);
    mockPrisma.customer.update.mockResolvedValue({ id: "cust-1" } as any);
    arrangeTransactionPassthrough();
  });

  it("CUSTOMER_CONTRACT + entityType=CUSTOMER + entityId → populates customer.contractUrl with the uploaded URL", async () => {
    const { req, res } = mockUploadReqRes({
      docType: "CUSTOMER_CONTRACT",
      entityType: "CUSTOMER",
      entityId: "cust-1",
    });

    await uploadDocuments(req, res);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: { contractUrl: "https://s3/documents/contract-abc.pdf" },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("non-CONTRACT upload (e.g. POD) does NOT touch customer.contractUrl", async () => {
    const { req, res } = mockUploadReqRes({
      docType: "POD",
      loadId: "load-1",
    });

    await uploadDocuments(req, res);

    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    // POD path goes through the non-transaction branch; document.create should
    // be called directly, not wrapped in a $transaction callback.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.document.create).toHaveBeenCalled();
  });

  it("CUSTOMER_CONTRACT but missing entityId falls through to no cross-write", async () => {
    const { req, res } = mockUploadReqRes({
      docType: "CUSTOMER_CONTRACT",
      entityType: "CUSTOMER",
      // entityId omitted on purpose
    });

    await uploadDocuments(req, res);

    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("CUSTOMER_CONTRACT with wrong entityType (CARRIER) does NOT cross-write to customer", async () => {
    const { req, res } = mockUploadReqRes({
      docType: "CUSTOMER_CONTRACT",
      entityType: "CARRIER",
      entityId: "carrier-1",
    });

    await uploadDocuments(req, res);

    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("second CUSTOMER_CONTRACT upload overwrites contractUrl with the latest fileUrl (latest-wins convention)", async () => {
    // First upload
    mockUploadFile.mockResolvedValueOnce("https://s3/documents/contract-v1.pdf");
    const r1 = mockUploadReqRes({ docType: "CUSTOMER_CONTRACT", entityType: "CUSTOMER", entityId: "cust-1" });
    await uploadDocuments(r1.req, r1.res);

    // Second upload — different URL
    mockUploadFile.mockResolvedValueOnce("https://s3/documents/contract-v2.pdf");
    const r2 = mockUploadReqRes({ docType: "CUSTOMER_CONTRACT", entityType: "CUSTOMER", entityId: "cust-1" }, [
      { originalname: "contract-v2.pdf", mimetype: "application/pdf", buffer: Buffer.from("PDF2"), size: 4 },
    ]);
    await uploadDocuments(r2.req, r2.res);

    const updateCalls = (mockPrisma.customer.update as any).mock.calls;
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][0].data.contractUrl).toBe("https://s3/documents/contract-v1.pdf");
    expect(updateCalls[1][0].data.contractUrl).toBe("https://s3/documents/contract-v2.pdf");
  });
});

describe("updateCustomerSchema — Gap 2 contractUrl admin override", () => {
  it("accepts contractUrl as a valid URL string", () => {
    const result = updateCustomerSchema.safeParse({ contractUrl: "https://srl/contracts/bkn.pdf" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractUrl).toBe("https://srl/contracts/bkn.pdf");
    }
  });

  it("accepts contractUrl=null (clear-the-field semantics)", () => {
    const result = updateCustomerSchema.safeParse({ contractUrl: null });
    expect(result.success).toBe(true);
  });

  it("rejects contractUrl that is not a URL", () => {
    const result = updateCustomerSchema.safeParse({ contractUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("contractUrl is optional (omission is fine)", () => {
    const result = updateCustomerSchema.safeParse({ name: "Acme" });
    expect(result.success).toBe(true);
  });
});
