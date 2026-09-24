/**
 * C5 — execution evidence reaches the AE, and the storage key reaches nobody.
 *
 * The Certificate of Electronic Signature is STREAMED rather than redirected
 * to: a presigned redirect puts the storage URL in the browser's address bar
 * and its history, which is the same leak as returning the key outright.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "stream";

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
const getFileStream = vi.fn();
vi.mock("../../../src/services/storageService", () => ({
  getFileStream: (...a: unknown[]) => getFileStream(...a),
  getDownloadUrl: vi.fn(),
  isS3Url: () => true,
  uploadFileToPath: vi.fn(),
  uploadFile: vi.fn(),
}));

import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const RC = "rc-1";
const KEY = "s3://srl-docs/agreements/rc-sign-cert-rc-1.pdf";

async function app() {
  const routes = (await import("../../../src/routes/rateConfirmations")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/rate-confirmations", routes);
  return a;
}

const SIGNED_RC = {
  id: RC,
  rateConNumber: "SRL-121500R",
  signed: true,
  signedAt: new Date("2026-09-20T10:00:00.000Z"),
  signerName: "Jordan Carrier",
  signerIp: "203.0.113.7",
  signerUserAgent: "Mozilla/5.0",
  contentHash: "abc123",
  counterSignedByName: "Wasi Haider",
  counterSignedByTitle: "President",
  counterSignedAt: new Date("2026-09-19T09:00:00.000Z"),
  signedUrl: KEY,
  load: {
    id: "load-1",
    carrierAcceptedAt: new Date("2026-09-19T08:00:00.000Z"),
    carrierAcceptedVia: "TENDER_ACCEPT",
    carrierAcceptedByUserId: "u-carrier",
    poster: {}, carrier: {}, customer: {}, tenders: [],
  },
  createdBy: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.rateConfirmation.findUnique = vi.fn().mockResolvedValue(SIGNED_RC);
  getFileStream.mockResolvedValue(Readable.from([Buffer.from("%PDF-1.7 cert")]));
});

describe("the AE detail carries the evidence", () => {
  it("returns signer, hash and countersignature, and the acceptance beside them", async () => {
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}`).set("x-test-role", "BROKER");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      signerName: "Jordan Carrier",
      signerIp: "203.0.113.7",
      contentHash: "abc123",
      counterSignedByName: "Wasi Haider",
      counterSignedByTitle: "President",
    });
    expect(res.body.load).toMatchObject({
      carrierAcceptedVia: "TENDER_ACCEPT",
      carrierAcceptedByUserId: "u-carrier",
    });
  });

  it("NEVER returns the storage key", async () => {
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}`).set("x-test-role", "BROKER");

    expect(res.body.signedUrl).toBeUndefined();
    // Not merely absent from the field — absent from the payload entirely, so a
    // future `include` cannot smuggle it back under another name.
    expect(JSON.stringify(res.body)).not.toContain("s3://");
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it("an unsigned RC reports null evidence rather than omitting it", async () => {
    mockPrisma.rateConfirmation.findUnique.mockResolvedValue({
      ...SIGNED_RC, signed: false, signedAt: null, signerName: null,
      signerIp: null, contentHash: null, signedUrl: null,
    });
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}`).set("x-test-role", "BROKER");

    expect(res.status).toBe(200);
    // Present-and-null, so the panel can say "Not signed" rather than render an
    // empty row it cannot distinguish from a missing field.
    expect(res.body).toHaveProperty("signerName", null);
    expect(res.body).toHaveProperty("signedAt", null);
  });
});

describe("the certificate is AE-only and streamed", () => {
  it("streams the bytes to an AE without ever naming the key", async () => {
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}/certificate`).set("x-test-role", "BROKER");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(getFileStream).toHaveBeenCalledWith(KEY);
    expect(res.headers["content-disposition"]).toContain("SRL-121500R_Signature_Certificate.pdf");
    expect(res.headers["content-disposition"]).not.toContain("s3://");
  });

  it("403s a CARRIER — the certificate is SRL's evidence, not the carrier's copy", async () => {
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}/certificate`).set("x-test-role", "CARRIER");

    expect(res.status).toBe(403);
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it("404s when nothing has been signed — there is no certificate to refuse", async () => {
    mockPrisma.rateConfirmation.findUnique.mockResolvedValue({
      id: RC, rateConNumber: "SRL-1R", signed: false, signedUrl: null,
    });
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}/certificate`).set("x-test-role", "ADMIN");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NO_CERTIFICATE");
  });

  it("a storage failure does not echo the key back", async () => {
    getFileStream.mockRejectedValue(new Error("bucket unreachable"));
    const res = await request(await app()).get(`/api/rate-confirmations/${RC}/certificate`).set("x-test-role", "ADMIN");

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("s3://");
  });
});

/**
 * The LIST endpoint is the one the AE Load Board actually calls, and it had the
 * identical leak. Found by checking the sibling rather than assuming the fix to
 * one covered the class — both query with `include` and no top-level `select`.
 */
describe("the list endpoint strips the key too", () => {
  beforeEach(() => {
    mockPrisma.rateConfirmation.findMany = vi.fn().mockResolvedValue([
      { ...SIGNED_RC, load: undefined },
      { ...SIGNED_RC, id: "rc-2", signed: false, signedUrl: null, load: undefined },
    ]);
  });

  it("returns the evidence but never the storage key", async () => {
    const res = await request(await app())
      .get("/api/rate-confirmations/load/load-1")
      .set("x-test-role", "BROKER");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ signerName: "Jordan Carrier", contentHash: "abc123" });
    expect(res.body[0].signedUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("s3://");
  });
});
