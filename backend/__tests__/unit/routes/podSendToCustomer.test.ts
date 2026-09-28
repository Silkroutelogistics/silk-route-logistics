/**
 * F-D3 (ruled 2026-09-28) — POST /api/documents/:id/send-to-customer.
 *
 * A POD upload used to email the customer on every upload, and the email's
 * "Download POD" button was PORTAL_BASE + podUrl: the marketing host plus a storage
 * key, which served nothing. Now staff send one POD deliberately and the customer
 * gets the FILE, attached: no link, no login.
 *
 * The real router, the real authorize(), and the real sender (shipperLoadNotifyService)
 * run here; only the email transport, storage, the recipient resolver and the activity
 * log are mocked. The stored bytes are unique to this file, so an attachment carrying
 * them can only have come from reading the POD. document.findFirst answers its WHERE
 * against the fixtures, so a sender that stops scoping by load or type goes red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "stream";
import { prisma } from "../../../src/config/database";

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
const STORED = Buffer.from("%PDF-1.4 pod-bytes-7731");
const DOCS = [
  { id: "d-pod", loadId: "load-303", docType: "POD", fileUrl: "s3://srl/documents/pod-7731.pdf", fileName: "signed pod.pdf", fileType: "application/pdf" },
  { id: "d-bol", loadId: "load-303", docType: "SIGNED_BOL_DEL", fileUrl: "s3://srl/documents/bol.pdf", fileName: "bol.pdf", fileType: "application/pdf" },
  { id: "d-empty", loadId: "load-303", docType: "POD", fileUrl: "", fileName: "lost.pdf", fileType: "application/pdf" },
  { id: "d-loose", loadId: null, docType: "POD", fileUrl: "s3://srl/documents/loose.pdf", fileName: "loose.pdf", fileType: "application/pdf" },
];

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
  h.getFileStream.mockImplementation(async () => Readable.from([STORED]));
  h.sendEmail.mockResolvedValue("email-id");
  h.logLoadActivity.mockResolvedValue({});
});

describe("staff send one POD, and the customer gets the file", () => {
  it("attaches the stored POD, sends no link, and records who sent it", async () => {
    const r = await send("d-pod", "BROKER");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sent: 2, recipients: ["ops@cust.test", "lead@cust.test"], failed: [] });
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    for (const [, subject, html, attachments] of h.sendEmail.mock.calls) {
      expect(subject).toContain("SRL-900303");
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe("SRL-900303-POD.pdf");
      expect(Buffer.compare(attachments[0].content, STORED)).toBe(0);
      expect(html).toContain("attached");
      expect(html).not.toContain("Download POD");
      expect(html).not.toContain("pod-7731"); // the storage key is never put in a link
    }
    expect(h.getFileStream).toHaveBeenCalledWith("s3://srl/documents/pod-7731.pdf");
    expect(h.logLoadActivity).toHaveBeenCalledWith(expect.objectContaining({
      loadId: "load-303", eventType: "pod_sent_to_customer", actorId: "u-broker",
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
  it("no session is 401; a shipper, a carrier and a FACTOR are 403; nothing is emailed", async () => {
    expect((await send("d-pod")).status).toBe(401);
    for (const role of ["SHIPPER", "CARRIER", "FACTOR"]) expect((await send("d-pod", role)).status, role).toBe(403);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
});

describe("what is refused, before any email", () => {
  it("a document that is not a POD: 400 NOT_A_POD", async () => {
    const r = await send("d-bol", "BROKER");
    expect([r.status, r.body.code]).toEqual([400, "NOT_A_POD"]);
  });
  it("a POD row with no stored file: 409 POD_FILE_MISSING", async () => {
    const r = await send("d-empty", "BROKER");
    expect([r.status, r.body.code]).toEqual([409, "POD_FILE_MISSING"]);
  });
  it("a document on no load, or no document: 404", async () => {
    expect((await send("d-loose", "BROKER")).status).toBe(404);
    expect((await send("d-none", "BROKER")).status).toBe(404);
  });
  it("a customer with no operational contact: 409 NO_OPERATIONAL_RECIPIENTS", async () => {
    h.resolveOperationalRecipients.mockResolvedValue([]);
    const r = await send("d-pod", "BROKER");
    expect([r.status, r.body.code]).toEqual([409, "NO_OPERATIONAL_RECIPIENTS"]);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
  it("the stored file cannot be read: 502, and nothing is sent or recorded", async () => {
    h.getFileStream.mockRejectedValue(new Error("NoSuchKey"));
    const r = await send("d-pod", "BROKER");
    expect([r.status, r.body.code]).toEqual([502, "POD_SEND_FAILED"]);
    expect(h.logLoadActivity).not.toHaveBeenCalled();
  });
  it("every address fails: 502, and nothing is recorded as sent", async () => {
    h.sendEmail.mockRejectedValue(new Error("down"));
    const r = await send("d-pod", "BROKER");
    expect([r.status, r.body.code]).toEqual([502, "POD_SEND_FAILED"]);
    expect(h.logLoadActivity).not.toHaveBeenCalled();
  });
  for (const id of ["d-bol", "d-empty", "d-loose", "d-none"]) {
    it(`${id}: no email goes out`, async () => {
      await send(id, "BROKER");
      expect(h.sendEmail).not.toHaveBeenCalled();
    });
  }
});
