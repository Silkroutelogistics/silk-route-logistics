/**
 * E4 (ruling 6, 2026-09-21) — the carrier upload route enforces the one
 * paperwork status gate, and the carrier's load read carries the paperwork
 * vocabulary the panel renders from.
 *
 * "SIGNED_BOL_PU accepted from AT_PICKUP." The panel does not offer the slot
 * earlier; this route is what makes that a rule rather than a button. Every
 * other paperwork type is open from the moment the panel exists, and a type
 * the rule does not govern (a photo) is not gated by it.
 *
 * Real router over HTTP, prisma mocked, the document seam mocked so the
 * assertion is whether the request REACHED it. Adversarially verified at
 * authoring: deleting the gate block turns the BOOKED case red with the seam
 * called; narrowing the include back to ["RATE_CON","BOL","POD"] turns the
 * include case red.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { PAPERWORK_DOC_TYPES } from "../../../../shared/constants/paperwork";

const mockPrisma = prisma as any;

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
  };
});
vi.mock("../../../src/middleware/rateLimiters", () => ({
  uploadLimiter: (_r: any, _s: any, n: any) => n(),
  staffUploadLimiter: (_r: any, _s: any, n: any) => n(),
}));
const seam = vi.hoisted(() => ({ recordLoadDocument: vi.fn(async () => ({ document: { id: "doc-1" } })) }));
vi.mock("../../../src/services/loadDocumentService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, recordLoadDocument: seam.recordLoadDocument };
});
vi.mock("../../../src/lib/loginFlags", () => ({ flagSensitiveActionAfterNewLogin: vi.fn() }));

// The router graph is imported ONCE, before the first case: under a full-suite
// run the first import can outlast vitest's 5s default, and a request that
// lands after its case timed out lands in the NEXT case's call count
// (§13.3 Item 273.7).
let theApp: express.Express;
beforeAll(async () => {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/carrier-loads", carrierLoads);
}, 60_000);
async function app() {
  return theApp;
}

function armLoad(status: string) {
  mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", carrierId: "u-carrier", status, deletedAt: null });
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ onboardingStatus: "APPROVED" });
}

const upload = async (docType: string) =>
  request(await app())
    .post("/api/carrier-loads/load-1/documents")
    .field("docType", docType)
    .attach("file", Buffer.from("%PDF-1.4 proof"), "x.pdf");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /carrier-loads/:id/documents — the pickup-BOL gate", () => {
  it("SIGNED_BOL_PU at BOOKED → 409 PAPERWORK_TOO_EARLY naming AT_PICKUP; the seam never runs", async () => {
    armLoad("BOOKED");
    const r = await upload("SIGNED_BOL_PU");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PAPERWORK_TOO_EARLY");
    expect(r.body.error).toMatch(/AT_PICKUP/);
    expect(seam.recordLoadDocument).not.toHaveBeenCalled();
  });

  it("SIGNED_BOL_PU at AT_PICKUP reaches the seam with the type intact", async () => {
    armLoad("AT_PICKUP");
    const r = await upload("SIGNED_BOL_PU");
    expect(r.status).toBe(200);
    expect(seam.recordLoadDocument).toHaveBeenCalledTimes(1);
    expect((seam.recordLoadDocument.mock.calls[0] as any)[0]).toMatchObject({ loadId: "load-1", docType: "SIGNED_BOL_PU", uploadSource: "CARRIER_PORTAL" });
  });

  it("the case of the type does not decide it — 'signed_bol_pu' is the same gate", async () => {
    armLoad("BOOKED");
    const r = await upload("signed_bol_pu");
    expect(r.status).toBe(409);
    expect(seam.recordLoadDocument).not.toHaveBeenCalled();
  });

  it("every other paperwork type is open at BOOKED", async () => {
    for (const t of PAPERWORK_DOC_TYPES.filter((t) => t !== "SIGNED_BOL_PU")) {
      vi.clearAllMocks();
      armLoad("BOOKED");
      const r = await upload(t);
      expect(r.status, t).toBe(200);
      expect(seam.recordLoadDocument, t).toHaveBeenCalledTimes(1);
    }
  });

  it("a type the rule does not govern (PHOTO_SEAL) is not gated here — the seam decides it", async () => {
    armLoad("BOOKED");
    const r = await upload("PHOTO_SEAL");
    expect(r.status).toBe(200);
    expect(seam.recordLoadDocument).toHaveBeenCalledTimes(1);
  });

  it("on a cancelled load the refusal says the load is closed, not that it is early", async () => {
    armLoad("CANCELLED");
    const r = await upload("POD");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("LOAD_NOT_OPEN");
    expect(r.body.error).not.toMatch(/reaches/);
    expect(seam.recordLoadDocument).not.toHaveBeenCalled();
  });
});

describe("GET /carrier-loads/:id — the paperwork vocabulary rides the detail read", () => {
  it("asks for every settlement type plus the RC and the original BOL, newest first", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", carrierId: "u-carrier", status: "DELIVERED", tenders: [], documents: [] });
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ onboardingStatus: "APPROVED" });
    const r = await request(await app()).get("/api/carrier-loads/load-1");
    expect(r.status).toBe(200);
    const include = mockPrisma.load.findUnique.mock.calls[0][0].include;
    const types: string[] = include.documents.where.docType.in;
    for (const t of PAPERWORK_DOC_TYPES) expect(types, t).toContain(t);
    expect(types).toContain("RATE_CON");
    expect(types).toContain("BOL");
    expect(include.documents.orderBy).toEqual({ createdAt: "desc" });
  });
});
