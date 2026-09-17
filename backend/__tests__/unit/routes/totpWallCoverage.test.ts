/**
 * B1a (2026-09-17) — the 2FA wall covers /api/carrier and /api/documents.
 *
 * WHY THIS EXISTS
 *
 * requireTotpEnrolled was mounted on the five carrier-portal mounts in Arc 15,
 * and its own header says "Everything else on the carrier portal requires an
 * armed authenticator." Two more mounts a carrier cookie authenticates on were
 * never covered: /api/carrier (the audience-mixed singular mount, §13.3 Item
 * 161 — scorecard, revenue, dashboard, document upload) and /api/documents (the
 * carrier documents page uploads and downloads through it). A session holding a
 * password and an inbox but no authenticator could read revenue and upload
 * compliance paperwork. The Arc 15 proof script only probed the five mounts, so
 * nothing said otherwise.
 *
 * WHAT THIS PROVES, AND HOW
 *
 * The REAL routers are mounted behind the REAL wall. Only `authenticate` is
 * replaced, by a stub that injects a role from a test header — the real one
 * needs a signed cookie and a session row, and neither is the subject here.
 * `authorize` and `requireTotpEnrolled` are the genuine modules. A text
 * assertion that `router.use(requireTotpEnrolled)` appears in the file would
 * pass with the line in the wrong place (above the public block, or above
 * authenticate — both of which are lockouts the codebase has shipped before),
 * so the cases below send requests and read answers instead.
 *
 * Adversarially verified at authoring: removing the wall line from carrier.ts
 * turns the three /api/carrier refusal cases red and leaves the /api/documents
 * ones green, and vice versa — each router's cases fail only for its own line.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

// Importing the routers pulls their whole controller/service graph.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) {
        res.status(401).json({ error: "No token provided" });
        return;
      }
      req.user = { id: `u-${String(role).toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});

const WALL = "TOTP_ENROLLMENT_REQUIRED";

async function app() {
  const carrier = (await import("../../../src/routes/carrier")).default;
  const documents = (await import("../../../src/routes/documents")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/carrier", carrier);
  a.use("/api/documents", documents);
  return a;
}

/** The wall reads exactly this. Anything else on the user mock is noise here. */
function enrolled(flag: boolean) {
  mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: flag });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("an unenrolled carrier is refused on the two mounts the Arc 15 wall missed", () => {
  const cases: Array<[string, string]> = [
    ["get", "/api/carrier/scorecard"],
    ["get", "/api/carrier/revenue"],
    ["post", "/api/carrier/documents"],
    ["post", "/api/documents/upload"],
    ["get", "/api/documents/doc-1/download"],
  ];

  for (const [method, path] of cases) {
    it(`${method.toUpperCase()} ${path} → 403 ${WALL}`, async () => {
      enrolled(false);
      const a = await app();
      const res = await (request(a) as any)[method](path).set("x-test-role", "CARRIER");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(WALL);
      expect(res.body.action?.href).toBe("/carrier/dashboard/security");
    });
  }

  it("the wall actually consulted the enrollment flag (vacuity tripwire)", async () => {
    // A 403 from somewhere else — a role gate, a stale rate limiter — would
    // satisfy the status check above. This pins that the refusal came from a
    // middleware that asked the database the one question the wall asks.
    enrolled(false);
    const a = await app();
    await request(a).get("/api/carrier/scorecard").set("x-test-role", "CARRIER");
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: { totpEnabled: true } }),
    );
  });
});

describe("an enrolled carrier passes the wall", () => {
  // The handlers run against a mocked prisma and may answer 4xx/5xx of their
  // own. What must NOT come back is the wall's refusal.
  for (const [method, path] of [
    ["get", "/api/carrier/scorecard"],
    ["post", "/api/documents/upload"],
  ] as Array<[string, string]>) {
    it(`${method.toUpperCase()} ${path} is not refused by the wall`, async () => {
      enrolled(true);
      const a = await app();
      const res = await (request(a) as any)[method](path).set("x-test-role", "CARRIER");
      expect(res.body?.code).not.toBe(WALL);
    });
  }
});

describe("other audiences are untouched — the middleware no-ops on their role", () => {
  it("ADMIN on the AE routes of /api/carrier is not asked about enrollment", async () => {
    enrolled(false); // would refuse a carrier; must be irrelevant to an admin
    // The real handler runs and must be able to ANSWER, or supertest waits out
    // the timeout and the failure reads as a wall defect. An empty roster is
    // enough for it to respond.
    mockPrisma.carrierProfile.findMany.mockResolvedValue([]);
    const a = await app();
    const res = await request(a).get("/api/carrier/all").set("x-test-role", "ADMIN");
    expect(res.body?.code).not.toBe(WALL);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ select: { totpEnabled: true } }),
    );
  });

  it("SHIPPER upload on /api/documents passes — the shipper portal uses this mount", async () => {
    enrolled(false);
    const a = await app();
    const res = await request(a).post("/api/documents").set("x-test-role", "SHIPPER");
    expect(res.body?.code).not.toBe(WALL);
    expect(res.status).not.toBe(403);
  });

  it("AE upload on /api/documents/upload passes — the CRM and T&T docs tabs use it", async () => {
    enrolled(false);
    const a = await app();
    const res = await request(a).post("/api/documents/upload").set("x-test-role", "BROKER");
    expect(res.body?.code).not.toBe(WALL);
    expect(res.status).not.toBe(403);
  });
});

describe("the wall sits below the public block and above nothing it should not", () => {
  it("the unauthenticated onboarding routes above it stay reachable with no session", async () => {
    // /carrier/register and /carrier/onboarding/* sit ABOVE router.use(authenticate)
    // by design — a person with no account has to reach them. A wall placed
    // above that block would be the Arc 27 outage in a new costume.
    const a = await app();
    const res = await request(a).get("/api/carrier/onboarding/status");
    expect(res.status).not.toBe(401);
    expect(res.body?.code).not.toBe(WALL);
  });

  it("with no session, authenticate refuses BEFORE the wall is reached", async () => {
    // Order matters: the wall reads req.user and must never see a request that
    // has none (Arc 15 — it short-circuits to next() and the wall is inert).
    enrolled(false);
    const a = await app();
    const res = await request(a).get("/api/carrier/scorecard");
    expect(res.status).toBe(401);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});
