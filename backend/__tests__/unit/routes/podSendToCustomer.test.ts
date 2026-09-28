/**
 * F-D3 (ruled 2026-09-28) — POST /api/documents/:id/send-to-customer.
 *
 * A POD upload used to email the customer on every upload, and the email's
 * "Download POD" button was PORTAL_BASE + podUrl: the marketing host plus a storage
 * key, which served nothing. Now staff send one delivery document deliberately and the
 * customer gets the FILE, attached: no link, no login. The POD and the signed delivery
 * BOL are sendable (ruled 2026-09-28, second ruling); no other type is.
 *
 * The real router, the real authorize(), and the real sender (shipperLoadNotifyService)
 * run here; only the email transport, storage, the recipient resolver and the activity
 * log are mocked. Each stored file has bytes unique to it, so an attachment carrying
 * them can only have come from reading THAT document. document.findFirst answers its
 * WHERE against the fixtures, so a sender that stops scoping by load or type goes red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "stream";
import { prisma } from "../../../src/config/database";
import { CUSTOMER_SENDABLE_DOC_TYPES } from "../../../src/services/shipperLoadNotifyService";

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getFileStream: vi.fn(),
  resolveOperationalRecipients: vi.fn(),
  logLoadActivity: vi.fn(),
}));

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
vi.mock("../../../src/middleware/requireTotpEnrolled", () => ({ requireTotpEnrolled: (_r: any, _s: any, n: any) => n() }));
vi.mock("../../../src/middleware/complianceDocStepUp", () => ({ requireStepUpForCarrierComplianceDoc: (_r: any, _s: any, n: any) => n() }));
vi.mock("../../../src/services/emailService", async (orig) => ({ ...((await orig()) as any), sendEmail: h.sendEmail }));
vi.mock("../../../src/services/storageService", () => ({
  getFileStream: h.getFileStream,
  uploadFile: vi.fn(), uploadFileToPath: vi.fn(), getDownloadUrl: vi.fn(), deleteFile: vi.fn(),
  validateBufferSignature: vi.fn().mockReturnValue(true), isS3Url: vi.fn().mockReturnValue(true),
}));
vi.mock("../../../src/services/customerRecipientResolver", () => ({ resolveOperationalRecipients: h.resolveOperationalRecipients }));
vi.mock("../../../src/services/loadActivityService", () => ({ logLoadActivity: h.logLoadActivity }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const mockPrisma = prisma as any;
const STORED: Record<string, Buffer> = {
  "s3://srl/documents/pod-7731.pdf": Buffer.from("%PDF-1.4 pod-bytes-7731"),
  "s3://srl/documents/bol-5519.pdf": Buffer.from("%PDF-1.4 bol-bytes-5519"),
};
const file = (id: string, docType: string, fileUrl: string, loadId: string | null = "load-303") =>
  ({ id, loadId, docType, fileUrl, fileName: `${id}.pdf`, fileType: "application/pdf" });
const DOCS = [
  file("d-pod", "POD", "s3://srl/documents/pod-7731.pdf"),
  file("d-bol-del", "SIGNED_BOL_DEL", "s3://srl/documents/bol-5519.pdf"),
  file("d-bol-pu", "SIGNED_BOL_PU", "s3://srl/documents/pu.pdf"),
  file("d-inv", "INVOICE", "s3://srl/documents/inv.pdf"),
  file("d-rc", "RATE_CON", "s3://srl/documents/rc.pdf"),
  file("d-copy", "CUSTOMER_INVOICE_COPY", "s3://srl/documents/copy.pdf"),
  file("d-empty", "POD", ""),
  file("d-loose", "POD", "s3://srl/documents/loose.pdf", null),
];
const NOT_SENDABLE = ["d-bol-pu", "d-inv", "d-rc", "d-copy"];

async function app() {
  const documents = (await import("../../../src/routes/documents")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/documents", documents);
  return a;
}
const send = async (docId: string, role?: string) => {
  const r = request(await app()).post(`/api/documents/${docId}/send-to-customer`);
  return role ? r.set("x-test-role", role) : r;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.document.findUnique.mockImplementation(async (a: any) => {
    const d = DOCS.find((x) => x.id === a.where.id);
    return d ? { loadId: d.loadId } : null;
  });
  mockPrisma.document.findFirst.mockImplementation(async (a: any) =>
    DOCS.find((x) => x.id === a.where.id && x.loadId === a.where.loadId) ?? null);
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-303", referenceNumber: "SRL-900303", originCity: "Lebanon", originState: "NH",
    destCity: "North Lake", destState: "TX", equipmentType: "Reefer", trackingToken: null,
    carrier: { company: "Haul Co" }, customer: { name: "Cust Co" }, checkCalls: [],
  });
  h.resolveOperationalRecipients.mockResolvedValue([{ email: "ops@cust.test" }, { email: "lead@cust.test" }]);
  h.getFileStream.mockImplementation(async (url: string) => {
    if (!STORED[url]) throw new Error(`test read an unexpected file: ${url}`);
    return Readable.from([STORED[url]]);
  });
  h.sendEmail.mockResolvedValue("email-id");
  h.logLoadActivity.mockResolvedValue({});
});

function attachedFrom(url: string, filename: string, subjectBit: string, name: string) {
  expect(h.sendEmail).toHaveBeenCalledTimes(2);
  for (const [, subject, html, attachments] of h.sendEmail.mock.calls) {
    expect(subject).toContain("SRL-900303");
    expect(subject).toContain(subjectBit);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe(filename);
    expect(Buffer.compare(attachments[0].content, STORED[url])).toBe(0);
    expect(html).toContain(`The ${name} for your shipment`);
    expect(html).toContain("attached");
    expect(html).not.toContain("Download POD");
    expect(html).not.toContain(url.split("/").pop()!.replace(".pdf", "")); // no storage key in a link
  }
}

describe("what may be sent", () => {
  it("exactly the POD and the signed delivery BOL", () => {
    expect([...CUSTOMER_SENDABLE_DOC_TYPES]).toEqual(["POD", "SIGNED_BOL_DEL"]);
  });
});

describe("staff send one delivery document, and the customer gets the file", () => {
  it("POD: attaches the stored POD, sends no link, records who sent what", async () => {
    const r = await send("d-pod", "BROKER");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sent: 2, recipients: ["ops@cust.test", "lead@cust.test"], failed: [] });
    attachedFrom("s3://srl/documents/pod-7731.pdf", "SRL-900303-POD.pdf", "Proof of Delivery", "proof of delivery");
    expect(h.logLoadActivity).toHaveBeenCalledWith(expect.objectContaining({
      loadId: "load-303", eventType: "doc_sent_to_customer", actorId: "u-broker",
      description: "Proof of Delivery sent to the customer (2 recipients)",
      metadata: expect.objectContaining({ documentId: "d-pod", docType: "POD", recipients: ["ops@cust.test", "lead@cust.test"] }),
    }));
  });

  it("signed delivery BOL: the same action, its own file, name and subject", async () => {
    const r = await send("d-bol-del", "OPERATIONS");
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(2);
    attachedFrom("s3://srl/documents/bol-5519.pdf", "SRL-900303-Signed-BOL.pdf", "Signed Delivery BOL", "signed delivery bill of lading");
    expect(h.logLoadActivity).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "doc_sent_to_customer", actorId: "u-operations",
      metadata: expect.objectContaining({ documentId: "d-bol-del", docType: "SIGNED_BOL_DEL" }),
    }));
  });

  it("a failure on one address does not hide that the other has it", async () => {
    h.sendEmail.mockImplementation(async (to: string) => { if (to === "lead@cust.test") throw new Error("bounce"); return "id"; });
    const r = await send("d-pod", "OPERATIONS");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sent: 1, recipients: ["ops@cust.test"], failed: ["lead@cust.test"] });
  });
});

describe("who may send it", () => {
  it("no session is 401; a shipper, a carrier and a FACTOR are 403; nothing is read or emailed", async () => {
    expect((await send("d-pod")).status).toBe(401);
    for (const role of ["SHIPPER", "CARRIER", "FACTOR"]) {
      expect((await send("d-pod", role)).status, role).toBe(403);
      expect((await send("d-bol-del", role)).status, role).toBe(403);
    }
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
});

describe("what is refused, before any email", () => {
  for (const id of NOT_SENDABLE) {
    it(`${id}: 400 DOC_NOT_SENDABLE, the file is not read and nothing is emailed`, async () => {
      const r = await send(id, "BROKER");
      expect([r.status, r.body.code]).toEqual([400, "DOC_NOT_SENDABLE"]);
      expect(h.getFileStream).not.toHaveBeenCalled();
      expect(h.sendEmail).not.toHaveBeenCalled();
    });
  }
  it("a document row with no stored file: 409 DOC_FILE_MISSING", async () => {
    const r = await send("d-empty", "BROKER");
    expect([r.status, r.body.code]).toEqual([409, "DOC_FILE_MISSING"]);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
  it("a document on no load, or no document: 404, nothing emailed", async () => {
    expect((await send("d-loose", "BROKER")).status).toBe(404);
    expect((await send("d-none", "BROKER")).status).toBe(404);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
  it("a customer with no operational contact: 409 NO_OPERATIONAL_RECIPIENTS, file not read", async () => {
    h.resolveOperationalRecipients.mockResolvedValue([]);
    const r = await send("d-bol-del", "BROKER");
    expect([r.status, r.body.code]).toEqual([409, "NO_OPERATIONAL_RECIPIENTS"]);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
  it("the stored file cannot be read: 502, and nothing is sent or recorded", async () => {
    h.getFileStream.mockRejectedValue(new Error("NoSuchKey"));
    const r = await send("d-pod", "BROKER");
    expect([r.status, r.body.code]).toEqual([502, "DOC_SEND_FAILED"]);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.logLoadActivity).not.toHaveBeenCalled();
  });
  it("every address fails: 502, and nothing is recorded as sent", async () => {
    h.sendEmail.mockRejectedValue(new Error("down"));
    const r = await send("d-bol-del", "BROKER");
    expect([r.status, r.body.code]).toEqual([502, "DOC_SEND_FAILED"]);
    expect(h.logLoadActivity).not.toHaveBeenCalled();
  });
});
