/**
 * E1b (2026-09-21) — a refused upload is a client error, and reaches the
 * client as one.
 *
 * errorHandler matched the substring "Only PDF, JPEG, and PNG files are
 * allowed". config/upload.ts stopped producing that message when DOC/DOCX were
 * added ("Only PDF, JPEG, PNG, DOC, and DOCX files are allowed"), so every
 * refused MIME type fell through to the default branch: 500, logged to
 * error_logs as UNHANDLED, counted toward the spike alert, sent to Sentry, and
 * "Internal server error" in production. Multer's own LIMIT_FILE_SIZE never
 * matched the substring at all, so an oversize file was a 500 too. The limits
 * were enforced; their refusal read as a crash.
 *
 * Real multer, real errorHandler, over HTTP. The assertions are on STATUS and
 * on the absence of an error_logs write, never on message text — a guard that
 * matched the message would be the defect this closes.
 *
 * Adversarially verified at authoring, both halves isolated: restoring the
 * old substring branch (handler half) makes the oversize case a 500 and strips
 * the code from the two MIME cases, which the default branch then writes to
 * error_logs; reverting the tagged refusal in config/upload.ts (the other
 * half) makes the two MIME cases 500s while the 413 still holds.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { upload } from "../../../src/config/upload";
import { errorHandler } from "../../../src/middleware/errorHandler";
import { env } from "../../../src/config/env";

const mockPrisma = prisma as any;
vi.setConfig({ testTimeout: 30_000 });

function app() {
  const a = express();
  a.post("/upload", upload.single("file"), (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
}

const PDF = Buffer.from("%PDF-1.4 probe");

describe("upload refusals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The default branch does prisma.errorLog.create(...).catch(...); a bare
    // vi.fn() returns undefined and the HANDLER would throw, turning every case
    // into a 500 for a reason unrelated to the code under test.
    mockPrisma.errorLog.create.mockResolvedValue({});
  });

  it("a file over MAX_FILE_SIZE is 413 with multer's code, not a logged 500", async () => {
    const big = Buffer.alloc(env.MAX_FILE_SIZE + 1024, 0x20);
    const res = await request(app()).post("/upload").attach("file", big, { filename: "big.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("LIMIT_FILE_SIZE");
    expect(mockPrisma.errorLog.create).not.toHaveBeenCalled();
  });

  it("a MIME type outside the allowlist is 400 UNSUPPORTED_FILE_TYPE, not a logged 500", async () => {
    const res = await request(app()).post("/upload").attach("file", Buffer.from("hello"), { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(mockPrisma.errorLog.create).not.toHaveBeenCalled();
  });

  it("an extension that disagrees with an allowed MIME type is 400, not a logged 500", async () => {
    const res = await request(app()).post("/upload").attach("file", PDF, { filename: "payload.exe", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(mockPrisma.errorLog.create).not.toHaveBeenCalled();
  });

  it("an allowed file passes through untouched", async () => {
    const res = await request(app()).post("/upload").attach("file", PDF, { filename: "pod.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("the limit the 413 is measured against is the configured one, not a literal", () => {
    // Vacuity guard for the first case: a limit of 0 would make every upload
    // 413 and the case would pass without testing the boundary.
    expect(env.MAX_FILE_SIZE).toBeGreaterThan(1024 * 1024);
  });
});
