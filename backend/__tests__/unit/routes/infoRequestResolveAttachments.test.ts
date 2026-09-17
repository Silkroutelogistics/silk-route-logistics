/**
 * A carrier's info-request attachment lands as what was asked for.
 *
 * v3.8.bbx. Every attachment used to be written as docType
 * "INFO_REQUEST_RESPONSE" whatever the request asked for, so a W-9 that arrived
 * this way was not a W-9 anywhere else: the intake reader parses only COI and
 * W9, the AE Documents panel groups by docType, and `w9Uploaded` was flipped by
 * every upload path except this one. Production 2026-09-17: CJ MASTER FREIGHT
 * answered "Doc attached" and nothing on the record said what, or where.
 *
 * Exercised over the REAL carrierAuth router with real multer parsing a real
 * multipart body. authenticate/authorize, the upload limiter, storage, intake
 * and the resolve service are doubled; Prisma is the shared mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => { req.user = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" }; next(); },
    authorize: () => (_req: any, _res: any, next: any) => next(),
  };
});
vi.mock("../../../src/middleware/rateLimiters", async (orig) => {
  const actual = (await orig()) as any;
  const pass = (_req: any, _res: any, next: any) => next();
  return { ...actual, uploadLimiter: pass, staffUploadLimiter: pass };
});
const uploadFile = vi.fn(async (_buf: Buffer, key: string) => `s3://srl-documents/${key}`);
vi.mock("../../../src/services/storageService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, uploadFile: (...a: any[]) => uploadFile(a[0], a[1], a[2]) };
});
const queueDocumentIntake = vi.fn();
vi.mock("../../../src/services/documentIntakeService", () => ({ queueDocumentIntake: (...a: any[]) => queueDocumentIntake(...a) }));
const resolveInfoRequest = vi.fn(async (args: any) => ({ id: args.requestId, status: "RESOLVED" }));
vi.mock("../../../src/services/infoRequestService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, resolveInfoRequest: (args: any) => resolveInfoRequest(args) };
});

async function app() {
  const carrierAuth = (await import("../../../src/routes/carrierAuth")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carrier-auth", carrierAuth);
  return a;
}

function openRequest(category: string) {
  mockPrisma.infoRequest.findUnique.mockResolvedValue({
    id: "ir-1", status: "OPEN", category,
    carrier: { id: "cp-1", userId: "u-carrier" },
  });
}
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF");

async function post(category: string, withFile: boolean) {
  openRequest(category);
  const a = await app();
  let req = request(a).post("/api/carrier-auth/info-requests/ir-1/resolve").field("resolvedNote", "Doc attached");
  if (withFile) req = req.attach("files", PDF, { filename: "CJ Master W9.pdf", contentType: "application/pdf" });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.infoRequest.findUnique = vi.fn();
  mockPrisma.document.create = vi.fn(async ({ data }: any) => ({ id: "doc-1", ...data }));
  mockPrisma.carrierProfile.update = vi.fn(async () => ({}));
});

describe("the attachment is typed by the request's category", () => {
  it.each([
    ["W9_UPDATE", "W9", "w9Uploaded"],
    ["COI_UPDATE", "COI", "insuranceCertUploaded"],
    ["AUTHORITY_LETTER", "AUTHORITY", "authorityDocUploaded"],
  ])("%s → docType %s, flips %s, queues intake, links the request", async (category, docType, flag) => {
    const res = await post(category, true);
    expect(res.status).toBe(200);
    expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.document.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ docType, infoRequestId: "ir-1", entityType: "CARRIER", entityId: "cp-1", uploadSource: "CARRIER_PORTAL", userId: "u-carrier" });
    expect(data.notes).toMatch(/^Answered info request: /);
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledWith({ where: { id: "cp-1" }, data: { [flag]: true } });
    expect(queueDocumentIntake).toHaveBeenCalledWith(expect.objectContaining({ docType, entityType: "CARRIER", entityId: "cp-1" }));
    expect(resolveInfoRequest).toHaveBeenCalledWith(expect.objectContaining({ requestId: "ir-1", attachmentCount: 1 }));
    expect(res.body.attachments).toHaveLength(1);
  });

  it("a category with no existing docType stays INFO_REQUEST_RESPONSE and flips no flag", async () => {
    const res = await post("VOIDED_CHECK", true);
    expect(res.status).toBe(200);
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe("INFO_REQUEST_RESPONSE");
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
  });

  it("a text-only answer to a prose category writes no document and flips nothing", async () => {
    const res = await post("REFERENCES", false);
    expect(res.status).toBe(200);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
    expect(resolveInfoRequest).toHaveBeenCalledWith(expect.objectContaining({ attachmentCount: 0 }));
  });

  it("the storage key is carrier-scoped and names the request", async () => {
    await post("W9_UPDATE", true);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile.mock.calls[0][1]).toMatch(/^carrier-docs\/cp-1\/info-request-ir-1-/);
  });

  it("the multipart body was genuinely parsed — the file reached storage as bytes", async () => {
    await post("W9_UPDATE", true);
    expect(Buffer.isBuffer(uploadFile.mock.calls[0][0])).toBe(true);
    expect(uploadFile.mock.calls[0][0].length).toBe(PDF.length);
  });
});

/**
 * v3.8.bby — a document request needs the document, and the server says so.
 * The gate sits BEFORE any storage write and before the resolve service, so a
 * refusal leaves no half-answered state: no Document row, no status flip, no
 * AE email. The same set drives the form's "(required)" label.
 */
describe("the attachment gate", () => {
  it.each(["W9_UPDATE", "COI_UPDATE", "AUTHORITY_LETTER", "VOIDED_CHECK", "ADDRESS_PROOF"])(
    "%s with no file is refused 422 ATTACHMENT_REQUIRED, naming the document, and resolves nothing",
    async (category) => {
      const res = await post(category, false);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ATTACHMENT_REQUIRED");
      expect(res.body.error).toContain(res.body.categoryLabel);
      expect(res.body.categoryLabel).not.toBe("");
      expect(resolveInfoRequest).not.toHaveBeenCalled();
      expect(mockPrisma.document.create).not.toHaveBeenCalled();
      expect(uploadFile).not.toHaveBeenCalled();
    },
  );

  it.each(["REFERENCES", "SAFETY_CLARIFICATION", "EIN_VERIFICATION", "OTHER"])(
    "%s with no file is still accepted — it is answered in words",
    async (category) => {
      const res = await post(category, false);
      expect(res.status).toBe(200);
      expect(resolveInfoRequest).toHaveBeenCalledTimes(1);
    },
  );

  it("a document request WITH a file passes the gate", async () => {
    const res = await post("W9_UPDATE", true);
    expect(res.status).toBe(200);
  });

  it("the gate refuses before ownership is even relevant to storage: a wrong carrier is still 403, not 422", async () => {
    mockPrisma.infoRequest.findUnique.mockResolvedValue({ id: "ir-1", status: "OPEN", category: "W9_UPDATE", carrier: { id: "cp-2", userId: "someone-else" } });
    const a = await app();
    const res = await request(a).post("/api/carrier-auth/info-requests/ir-1/resolve").field("resolvedNote", "x");
    expect(res.status).toBe(403);
  });

  it("the carrier's list carries requiresAttachment from the same set", async () => {
    mockPrisma.carrierProfile.findUnique = vi.fn(async () => ({ id: "cp-1" }));
    mockPrisma.infoRequest.findMany = vi.fn(async () => [
      { id: "ir-1", category: "W9_UPDATE", message: "m", createdAt: new Date() },
      { id: "ir-2", category: "REFERENCES", message: "m", createdAt: new Date() },
    ]);
    const a = await app();
    const res = await request(a).get("/api/carrier-auth/info-requests");
    expect(res.status).toBe(200);
    expect(res.body.requests.map((r: any) => [r.id, r.requiresAttachment])).toEqual([["ir-1", true], ["ir-2", false]]);
  });
});
