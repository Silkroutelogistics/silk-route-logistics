/**
 * B7a (2026-09-17) — a carrier replacing a compliance document is asked for a
 * fresh authenticator code; a POD is not, and neither is an AE.
 *
 * Real routers (/api/documents, /api/carrier) over HTTP with multipart bodies,
 * so the assertion is about the mount order that matters: the gate reads the
 * type multer parsed, and refuses BEFORE storage is touched. `uploadFile` is
 * the storage boundary and its call count is the "stores nothing" proof.
 *
 * Adversarially verified at authoring: dropping the gate from /upload turns
 * the COI-refusal case red with uploadFile called once; dropping it from the
 * "/" alias turns the alias case red; removing the role check lets the AE case
 * go red with a 403; removing the action from STEP_UP_ACTIONS turns the MINT
 * case red (400 at /carrier-auth/step-up) — mintStepUpToken itself does not
 * check the list, so a with-token case alone would prove nothing about it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { mintStepUpToken, STEP_UP_ACTIONS } from "../../../src/lib/stepUpToken";
import { COMPLIANCE_DOC_STEP_UP_ACTION, COMPLIANCE_DOC_TYPES, isComplianceDocType } from "../../../src/middleware/complianceDocStepUp";

const mockPrisma = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) { res.status(401).json({ error: "No token provided" }); return; }
      req.user = { id: `u-${String(role).toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});
// The 2FA wall is Arc 15's property and has its own proof; here it is a passthrough.
vi.mock("../../../src/middleware/requireTotpEnrolled", () => ({ requireTotpEnrolled: (_r: any, _s: any, n: any) => n() }));
const totp = { generateTotpSetup: vi.fn(), verifyTotpCode: vi.fn(), enableTotp: vi.fn(), disableTotp: vi.fn(), issueBackupCodes: vi.fn(), isTotpEnabled: vi.fn() };
vi.mock("../../../src/services/totpService", () => totp);
// E1d — the load branch of /documents/upload is the seam now; this file tests the
// step-up gate in FRONT of it, so the seam is a stub that records a document.
vi.mock("../../../src/services/loadDocumentService", () => ({
  recordLoadDocument: vi.fn(async (i: any) => ({
    document: { id: "doc-seam", docType: i.docType, fileUrl: "https://storage.example/doc.pdf" },
    docType: i.docType,
    status: { before: "AT_DELIVERY", after: "AT_DELIVERY" },
    deliveryHooksFired: false,
  })),
  LoadDocumentRefusal: class extends Error {},
}));

const uploadFile = vi.fn().mockResolvedValue("https://storage.example/doc.pdf");
vi.mock("../../../src/services/storageService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, uploadFile: (...a: unknown[]) => uploadFile(...a) };
});

const PDF = Buffer.from("%PDF-1.4\n%fixture bytes for the magic-byte check\n");
const CARRIER_USER = "u-carrier";

async function app() {
  const documents = (await import("../../../src/routes/documents")).default;
  const carrier = (await import("../../../src/routes/carrier")).default;
  const carrierAuth = (await import("../../../src/routes/carrierAuth")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/documents", documents);
  a.use("/api/carrier", carrier);
  a.use("/api/carrier-auth", carrierAuth);
  return a;
}

function post(a: express.Express, path: string, role: string, fields: Record<string, string>, token?: string, filename = "scan.pdf") {
  let q = request(a).post(path).set("x-test-role", role);
  if (token) q = q.set("x-step-up-token", token);
  for (const [k, v] of Object.entries(fields)) q = q.field(k, v);
  // Both endpoints take upload.array("files", N).
  return q.attach("files", PDF, { filename, contentType: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadFile.mockResolvedValue("https://storage.example/doc.pdf");
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: CARRIER_USER, onboardingStatus: "APPROVED" });
  mockPrisma.carrierProfile.update.mockResolvedValue({});
  mockPrisma.document.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "doc-1", ...data }));
  mockPrisma.auditLog.findFirst = vi.fn().mockResolvedValue(null);
});

describe("the vocabulary", () => {
  it("names the four D1 classes plus BOC-3, and the action is mintable", () => {
    expect([...COMPLIANCE_DOC_TYPES].sort()).toEqual(["AUTHORITY", "BOC3", "COI", "W9", "WORKERS_COMP"]);
    expect(STEP_UP_ACTIONS).toContain(COMPLIANCE_DOC_STEP_UP_ACTION);
    expect(isComplianceDocType(" coi ")).toBe(true);
    for (const t of ["POD", "BOL", "RATE_CON", "OTHER", "", undefined, null, 7]) expect(isComplianceDocType(t), String(t)).toBe(false);
  });
});

describe("/documents/upload — conditional on role and declared type", () => {
  it("a CARRIER replacing a COI without a code is refused, told what to do, and nothing is stored", async () => {
    const r = await post(await app(), "/api/documents/upload", "CARRIER", { docType: "COI" });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "STEP_UP_REQUIRED", action: COMPLIANCE_DOC_STEP_UP_ACTION });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("the same carrier with a code minted for this action is through, and the document is stored with the declared type", async () => {
    const r = await post(await app(), "/api/documents/upload", "CARRIER", { docType: "COI" }, mintStepUpToken(CARRIER_USER, COMPLIANCE_DOC_STEP_UP_ACTION));
    expect(r.status).toBe(201);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(r.body[0]).toMatchObject({ docType: "COI", entityType: "CARRIER", entityId: "cp-1" });
  });

  it("a code minted for a different action, or for a different user, is a missing code", async () => {
    const a = await app();
    const wrongAction = await post(a, "/api/documents/upload", "CARRIER", { docType: "W9" }, mintStepUpToken(CARRIER_USER, "insurance-update"));
    const wrongUser = await post(a, "/api/documents/upload", "CARRIER", { docType: "W9" }, mintStepUpToken("u-someone-else", COMPLIANCE_DOC_STEP_UP_ACTION));
    expect([wrongAction.status, wrongUser.status]).toEqual([403, 403]);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("a POD, a BOL and an OTHER need no code — the frictionless half of D1", async () => {
    // E1a-ii: these are LOAD documents, so the fixture attaches them to a load the
    // carrier owns. A POD with no loadId is not a shape any real caller produces
    // and is now refused by the docType allowlist (it would resolve to the
    // CARRIER class of the auto-linked profile), which is the point of that guard.
    mockPrisma.load.findUnique.mockResolvedValue({ posterId: "u-ae", carrierId: CARRIER_USER, customer: null });
    const a = await app();
    for (const docType of ["POD", "BOL", "OTHER"]) {
      const r = await post(a, "/api/documents/upload", "CARRIER", { docType, loadId: "load-1" });
      expect(r.status, docType).toBe(201);
    }
    // Through the seam (E1d), which is stubbed here; the gate let all three past.
    const { recordLoadDocument } = await import("../../../src/services/loadDocumentService");
    expect(recordLoadDocument).toHaveBeenCalledTimes(3);
  });

  it("an AE uploading a COI on a carrier's behalf is not asked — the rule is about carriers replacing their own paper", async () => {
    const r = await post(await app(), "/api/documents/upload", "BROKER", { docType: "COI", entityType: "CARRIER", entityId: "cp-1" });
    expect(r.status).toBe(201);
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it("case does not buy a bypass: a lowercase coi is gated like COI", async () => {
    const r = await post(await app(), "/api/documents/upload", "CARRIER", { docType: "coi" });
    expect(r.status).toBe(403);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("the legacy '/' alias is gated identically", async () => {
    const r = await post(await app(), "/api/documents/", "CARRIER", { docType: "AUTHORITY" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("STEP_UP_REQUIRED");
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe("/carrier/documents — gated outright", () => {
  it("refuses without a code whatever the filename says, and stores nothing", async () => {
    const a = await app();
    for (const filename of ["w9.pdf", "scan001.pdf"]) {
      const r = await post(a, "/api/carrier/documents", "CARRIER", {}, undefined, filename);
      expect(r.status, filename).toBe(403);
      expect(r.body.action, filename).toBe(COMPLIANCE_DOC_STEP_UP_ACTION);
    }
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("with a code, the handler runs and infers the type from the filename as before", async () => {
    const r = await post(await app(), "/api/carrier/documents", "CARRIER", {}, mintStepUpToken(CARRIER_USER, COMPLIANCE_DOC_STEP_UP_ACTION), "w9.pdf");
    expect(r.status).toBe(201);
    expect(r.body[0]).toMatchObject({ docType: "W9" });
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });
});

describe("the carrier can actually obtain the code — the mint door accepts the action", () => {
  it("a valid authenticator code at /carrier-auth/step-up mints a token this gate then honours; an unknown action is refused at the door", async () => {
    const a = await app();
    totp.verifyTotpCode.mockResolvedValue(true);
    const minted = await request(a).post("/api/carrier-auth/step-up").set("x-test-role", "CARRIER").send({ code: "123456", action: COMPLIANCE_DOC_STEP_UP_ACTION });
    expect(minted.status).toBe(200);
    expect(typeof minted.body.stepUpToken).toBe("string");

    const spent = await post(a, "/api/documents/upload", "CARRIER", { docType: "COI" }, minted.body.stepUpToken);
    expect(spent.status).toBe(201);
    expect(uploadFile).toHaveBeenCalledTimes(1);

    const unknown = await request(a).post("/api/carrier-auth/step-up").set("x-test-role", "CARRIER").send({ code: "123456", action: "not-an-action" });
    expect(unknown.status).toBe(400);
  });
});
