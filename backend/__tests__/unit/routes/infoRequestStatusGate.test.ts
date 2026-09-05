/**
 * POST /api/info-requests — the carrier-status policy, now on the server.
 *
 * THE RULE: a request the carrier surface cannot show must not be creatable.
 * The carrier portal renders its info-request section only when
 * `onboardingStatus === "INFO_REQUESTED"`, and create flips to that state only
 * from PENDING or REVIEWING. So a request raised against an APPROVED, REJECTED
 * or SUSPENDED carrier never flipped the status, never rendered in the portal,
 * and could never be answered — it sat OPEN forever while the AE waited for a
 * reply the carrier had never been shown.
 *
 * The exclusion existed on both AE buttons and nowhere on the server, which
 * made it a convention rather than a rule. This file is what makes it a rule.
 *
 * BOTH SIDES ARE TESTED, and the second half is the one that matters. Proving
 * the three closed states are refused says nothing about whether the gate is
 * too wide — a check that refused everything would pass those three cases and
 * break onboarding entirely. The three allowed states are the tripwire.
 *
 * THE PARITY BLOCK IS THE DURABLE PART. The requirement was "matching the
 * frontend gate exactly", and a matching pair of hand-written lists in two
 * repos is exactly the shape that drifts. It reads the frontend source and
 * fails if the two sets diverge in either direction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { STATUSES_CLOSED_TO_INFO_REQUESTS } from "../../../src/services/infoRequestService";

const mockPrisma = prisma as any;

const BACKEND = path.join(__dirname, "../../..");
const REPO = path.join(BACKEND, "..");

// Importing the router pulls its whole service graph. The 5s default is not
// enough, and a timeout here reads exactly like cross-file mock pollution.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-admin", email: "admin@srl.invalid", role: "ADMIN" };
      next();
    },
    authorize: () => (_req: any, _res: any, next: any) => next(),
  };
});

// §19 Sub-pattern 20 — outbound is dead by construction, not by absence of a
// key. createInfoRequest emails the carrier on the happy path, and a test that
// reaches a real transport is a test that can send mail to a real address.
const sendEmail = vi.fn();
vi.mock("../../../src/services/emailService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, sendEmail: (...a: unknown[]) => sendEmail(...a) };
});

async function app() {
  const infoRequests = (await import("../../../src/routes/infoRequests")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/info-requests", infoRequests);
  return a;
}

const body = {
  carrierId: "carrier-1",
  category: "COI_UPDATE",
  message: "Please send an updated certificate of insurance.",
};

beforeEach(() => {
  // The backend has no global afterEach, so spy history survives between cases
  // in a file unless the file clears it. Without this the "no second flip"
  // assertion sees the flips from the two cases before it and fails against
  // correct code — which is how it failed the first time this ran.
  vi.clearAllMocks();

  // `infoRequest` is not in the shared prisma mock — the create path is the
  // first test to need it. A missing method throws "is not a function" at the
  // call site and reads as a code bug, which is the v3.8.alh class.
  mockPrisma.infoRequest = { create: vi.fn(), count: vi.fn() };

  // $transaction in setup.ts is a bare vi.fn() with NO implementation, so out
  // of the box it returns undefined and never invokes its callback — an
  // unconfigured happy path would silently exercise none of the body.
  // Re-established here every test because vi.clearAllMocks() clears call
  // history but NOT implementations (§13.3 Item 148).
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.infoRequest.create.mockResolvedValue({ id: "ir-1", category: "COI_UPDATE" });
  mockPrisma.carrierProfile.update.mockResolvedValue({});
});

function carrier(onboardingStatus: string) {
  return {
    id: "carrier-1",
    onboardingStatus,
    companyName: "Test Carrier LLC",
    user: { email: "carrier@srl.invalid", firstName: "Sam" },
  };
}

describe("the three states the carrier surface cannot show are refused", () => {
  for (const status of ["APPROVED", "REJECTED", "SUSPENDED"]) {
    it(`refuses ${status} with 409 CARRIER_NOT_UNDER_REVIEW`, async () => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier(status));

      const res = await request(await app()).post("/api/info-requests").send(body);

      // 409, not 500. The request is well-formed and the caller is authorised;
      // it is the target's state that forbids it. Before this gate the route's
      // catch mapped every non-"Carrier not found" throw to a 500.
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CARRIER_NOT_UNDER_REVIEW");
    });

    it(`writes no row and sends no mail for ${status}`, async () => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier(status));

      await request(await app()).post("/api/info-requests").send(body);

      // Refused BEFORE the transaction. A row written and then apologised for
      // is the state this gate exists to prevent — it is the OPEN request
      // nobody can answer.
      expect(mockPrisma.infoRequest.create).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it(`names the state and the remedy in a sentence that stands alone for ${status}`, async () => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier(status));

      const res = await request(await app()).post("/api/info-requests").send(body);

      // The modal renders `error` and ignores `code`, so the sentence is the
      // whole of what an AE sees. It has to say which state is blocking and
      // what to do — "Request failed" would send them to press it again.
      expect(res.body.error).toContain(status);
      expect(res.body.error).toMatch(/under review/i);
      expect(res.body.error).toMatch(/change the carrier's status/i);
    });
  }
});

describe("the three states it can show are still accepted", () => {
  // The tripwire. Without these, a gate that refused every status would pass
  // every test above while making info requests impossible to create at all.
  for (const status of ["PENDING", "REVIEWING", "INFO_REQUESTED"]) {
    it(`accepts ${status}`, async () => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier(status));

      const res = await request(await app()).post("/api/info-requests").send(body);

      expect(res.status).toBe(201);
      expect(mockPrisma.infoRequest.create).toHaveBeenCalledTimes(1);
    });
  }

  it("accepts a SECOND request against a carrier already at INFO_REQUESTED", async () => {
    // The whole point of the arc. Several concurrent open requests are legal —
    // no unique constraint, no count check — and INFO_REQUESTED is the state a
    // carrier is already in when the first one is open. A gate that treated it
    // as terminal would re-break what F1 just fixed.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(carrier("INFO_REQUESTED"));

    const res = await request(await app()).post("/api/info-requests").send(body);

    expect(res.status).toBe(201);
    // Already INFO_REQUESTED, so no second flip — that no-op is what lets
    // concurrent requests coexist.
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
  });

  it("still 404s an unknown carrier rather than folding it into the new 409", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(null);

    const res = await request(await app()).post("/api/info-requests").send(body);

    expect(res.status).toBe(404);
    expect(res.body.code).toBeUndefined();
  });
});

describe("the server set and the frontend gate are the same set", () => {
  const page = fs.readFileSync(
    path.join(REPO, "frontend/src/app/dashboard/carriers/page.tsx"),
    "utf8",
  );

  /** Statuses named inside one `onboardingStatus !== "X"` chain. */
  function excludedIn(haystack: string): string[] {
    return [...haystack.matchAll(/onboardingStatus\s*!==\s*"([A-Z_]+)"/g)].map((m) => m[1]).sort();
  }

  it("the Profile-tab button excludes exactly the states the server refuses", () => {
    // The action bar at page.tsx ~1348. Sliced tightly so the assertion is
    // about THIS gate and not about every !== in a 2,800-line file.
    const marker = page.indexOf("v3.8.ajh — Request Info button");
    expect(marker, "the Profile-tab Request Info button moved — re-anchor this guard").toBeGreaterThan(-1);
    const gate = page.slice(marker, marker + 900);

    expect(excludedIn(gate)).toEqual([...STATUSES_CLOSED_TO_INFO_REQUESTS].sort());
  });

  it("the Info Req tab's canRequestInfo prop excludes the same states", () => {
    const marker = page.indexOf("canRequestInfo={");
    expect(marker, "the canRequestInfo prop moved — re-anchor this guard").toBeGreaterThan(-1);
    const gate = page.slice(marker, marker + 400);

    expect(excludedIn(gate)).toEqual([...STATUSES_CLOSED_TO_INFO_REQUESTS].sort());
  });

  it("reads a real file with real gates in it", () => {
    // Vacuity tripwire. Both assertions above compare a slice against a list;
    // if the file failed to load, or the markers matched an empty region, they
    // would compare [] against [] and pass while checking nothing.
    expect(page.length).toBeGreaterThan(10_000);
    expect(STATUSES_CLOSED_TO_INFO_REQUESTS.length).toBe(3);
  });
});
