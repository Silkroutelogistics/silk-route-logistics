/**
 * The public tracking endpoint must not serve a soft-deleted load.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN IMAGINED. On 2026-09-02 three test
 * loads for a real customer were cancelled and soft-deleted, and their tracking
 * links -- already sitting in that customer's inbox -- kept returning HTTP 200
 * from production. Verified live, twice: 200 before the fix, 404 after. This
 * file had ZERO occurrences of `deletedAt` across five load lookups and a token
 * lookup, so soft-deleting a load closed the board and left the public page
 * open.
 *
 * The QR outlives the paper. §14 narrowed what a STATUS_ONLY token returns
 * (v3.8.ara) precisely because the link gets forwarded, photographed and scanned
 * by people who are not parties to the shipment. Narrowing the payload while
 * leaving retired loads served is half a control.
 *
 * TWO KINDS OF CASE HERE. The structural guard counts lookup sites and asserts
 * each carries the filter -- it catches a SEVENTH lookup added later without
 * one, which no behavioural test would notice. The behavioural cases drive the
 * real handler through every entry point and assert 404. Neither is sufficient
 * alone: the guard cannot prove the filter works, and the cases cannot prove
 * someone has not added an unguarded path beside them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { getPublicTracking } from "../../../src/controllers/trackingController";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const SRC = path.resolve(__dirname, "../../../src/controllers/trackingController.ts");
const src = fs.readFileSync(SRC, "utf8");

/** Strip comments so prose about deletedAt cannot satisfy a check about code. */
function codeOnly(s: string): string {
  return s.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "").replace(new RegExp("^[ \\t]*//.*$", "gm"), "");
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Explicit nulls: clearAllMocks resets call history but NOT a queued
  // mockResolvedValue, so a truthy leak from a previous case would read as a
  // handler bug (v3.8.alh).
  mockPrisma.shipperTrackingToken.findFirst.mockResolvedValue(null);
  mockPrisma.load.findFirst.mockResolvedValue(null);
});

describe("structural — every lookup carries the filter", () => {
  const code = codeOnly(src);
  // A lookup is a prisma read on load or shipperTrackingToken. Matched across
  // line breaks: this repo's formatter wraps long prisma chains, and a
  // single-line pattern silently undercounts (§19 Sub-pattern 18).
  const LOOKUP = new RegExp(
    "prisma\\.(load|shipperTrackingToken)\\s*\\.\\s*(findFirst|findUnique|findMany)\\s*\\(([\\s\\S]*?)\\)\\s*;",
    "g",
  );

  const sites = [...code.matchAll(LOOKUP)];

  it("finds lookups at all (vacuity tripwire)", () => {
    // Without this, a regex that had stopped matching would report every lookup
    // guarded, forever, and that failure looks exactly like success.
    expect(sites.length, "the lookup scanner matched nothing — it is broken, not the file").toBeGreaterThanOrEqual(6);
  });

  it("no lookup uses findUnique — it cannot carry a non-key filter", () => {
    // findUnique accepts only unique fields in `where`, so a deletedAt clause
    // cannot be added to one. Any findUnique here is an unguardable lookup.
    const unique = sites.filter((m) => m[2] === "findUnique");
    expect(unique.map((m) => m[0].slice(0, 60)), "findUnique cannot take deletedAt — use findFirst").toEqual([]);
  });

  it("every lookup filters on deletedAt", () => {
    const unguarded = sites
      .filter((m) => !/deletedAt\s*:\s*null/.test(m[3]))
      .map((m) => m[0].replace(/\s+/g, " ").slice(0, 90));
    expect(
      unguarded,
      "a tracking lookup without `deletedAt: null` — a soft-deleted load would be served publicly",
    ).toEqual([]);
  });

  it("the token lookup guards via the load relation, since the token row has none", () => {
    expect(code).toContain("load: { deletedAt: null }");
  });
});

describe("behavioural — a soft-deleted load 404s through every entry point", () => {
  // The handler resolves a load or does not. A soft-deleted load is filtered out
  // by the query, so every path lands on the same 404 — which is the point:
  // there is no entry that still reaches it.
  const ENTRY_POINTS = [
    ["ShipperTrackingToken", "TOKENABC1234"],
    ["legacy trackingToken", "042fd17f-59d0-4739-9d95-22f59650a110"],
    ["shipperCode", "AB12CD"],
    ["BOL number", "BOL-556677"],
    ["reference / loadNumber", "SRL-121489"],
  ] as const;

  for (const [label, token] of ENTRY_POINTS) {
    it(`404 via ${label}`, async () => {
      const req: any = { params: { token } };
      const res = mockRes();
      await getPublicTracking(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Shipment not found" });
    });
  }

  it("a LIVE load still resolves — the filter excludes, it does not break tracking", async () => {
    // Without this the suite would pass on a handler that 404s everything.
    mockPrisma.load.findFirst.mockResolvedValue({
      id: "l1",
      referenceNumber: "SRL-999",
      loadNumber: "SRL-999",
      status: "IN_TRANSIT",
      originCity: "Lebanon", originState: "PA",
      destCity: "Northlake", destState: "TX",
      pickupDate: new Date("2026-09-01"),
      deliveryDate: new Date("2026-09-04"),
      checkCalls: [],
      trackingEvents: [],
      stops: [],
    });
    const res = mockRes();
    await getPublicTracking({ params: { token: "SRL-999" } } as any, res);
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  it("the load query it issues actually carries deletedAt: null", async () => {
    // Proves the filter reaches Prisma rather than merely appearing in source.
    await getPublicTracking({ params: { token: "SRL-121489" } } as any, mockRes());
    const calls = mockPrisma.load.findFirst.mock.calls;
    expect(calls.length, "no load lookup was issued").toBeGreaterThan(0);
    for (const [arg] of calls) {
      expect(JSON.stringify(arg.where)).toContain('"deletedAt":null');
    }
  });
});

describe("a REVOKED tracking token is absent — v3.8.bir", () => {
  // The cancel used to close this path by NULLing Load.trackingToken. That was
  // permanent: @default(uuid()) applies only at INSERT and backend/src holds no
  // other writer, so the value could never come back and the cancel was
  // irreversible by construction. The cancel now stamps trackingTokenRevokedAt
  // and this filter does the closing instead — same behaviour, recoverable.

  const code = codeOnly(src);

  it("the trackingToken lookup filters on trackingTokenRevokedAt", () => {
    // Regex LITERAL, not new RegExp(string): a previous cut of this test built
    // the pattern from a string and every backslash was eaten a layer early, so
    // it matched nothing and reported the lookup missing (§19 Sub-pattern 22).
    const m = code.match(/prisma\.load\s*\.\s*findFirst\(([\s\S]*?trackingToken:[\s\S]*?)\)\s*;/);
    expect(m, "the trackingToken lookup was not found — the scanner is broken, not the file").toBeTruthy();
    expect(
      /trackingTokenRevokedAt\s*:\s*null/.test(m![1]),
      "the trackingToken lookup does not exclude revoked tokens: a cancelled load would still be tracked publicly",
    ).toBe(true);
  });

  it("the query it ISSUES carries the clause, not merely the source", async () => {
    await getPublicTracking({ params: { token: "042fd17f-59d0-4739-9d95-22f59650a110" } } as any, mockRes());
    const tokenCalls = mockPrisma.load.findFirst.mock.calls.filter(
      ([a]: any[]) => a?.where && "trackingToken" in a.where,
    );
    expect(tokenCalls.length, "no trackingToken lookup was issued").toBeGreaterThan(0);
    for (const [arg] of tokenCalls) {
      expect(JSON.stringify(arg.where)).toContain('"trackingTokenRevokedAt":null');
    }
  });

  it("a revoked token 404s while the same uuid on a live load resolves", async () => {
    // The filter is what decides: revoked, the scoped query matches nothing.
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const revoked = mockRes();
    await getPublicTracking({ params: { token: "042fd17f-59d0-4739-9d95-22f59650a110" } } as any, revoked);
    expect(revoked.status).toHaveBeenCalledWith(404);

    // Control: without it this passes on a handler that 404s everything.
    mockPrisma.load.findFirst.mockResolvedValue({
      id: "l1", referenceNumber: "SRL-999", loadNumber: "SRL-999", status: "IN_TRANSIT",
      originCity: "Lebanon", originState: "PA", destCity: "Northlake", destState: "TX",
      pickupDate: new Date("2026-09-01"), deliveryDate: new Date("2026-09-04"),
      checkCalls: [], trackingEvents: [], stops: [],
    });
    const live = mockRes();
    await getPublicTracking({ params: { token: "042fd17f-59d0-4739-9d95-22f59650a110" } } as any, live);
    expect(live.status).not.toHaveBeenCalledWith(404);
  });
});
