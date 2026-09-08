/**
 * A carrier can read their own Compass vetting verdict, and only that.
 *
 * WHAT WAS WRONG. The compliance page requested GET /carrier/vetting-report,
 * which did not exist, caught the 404, and FELL BACK TO THE SCORECARD -- deriving
 * a grade, a risk level and a recommendation from the Compass SCORE. Those are
 * different things: the Score is §9 performance (how well a carrier hauls), the
 * vetting report is the Engine's verdict (authority, safety rating, OFAC,
 * identity, chameleon risk, insurance, documents). A carrier was shown a vetting
 * grade computed from their on-time percentage. The fallback also returned an
 * empty checks array, so the category bars rendered as "nothing passed" rather
 * than as "nothing was fetched".
 *
 * TWO PROPERTIES ARE PINNED, and both fail silently if they break:
 *
 *   1. SCOPE. The route takes no id and resolves the profile from the session,
 *      so there is nothing to tamper with -- but that is a property of the code
 *      rather than of the route, so it is asserted.
 *   2. WITHHOLDING. The stored row also holds each check's `deduction`, the raw
 *      FMCSA snapshot, the identity block (emailProvider, phoneType, sosStatus,
 *      chameleonRiskLevel) and the internal flags and recommendation. A spread
 *      would leak all of it and nothing would complain, so the reduction is
 *      field-by-field and the leak cases are explicit.
 *
 * Phase 1 of the mandatory-ELD arc, commit 5 of 7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    carrierProfile: { findUnique: vi.fn() },
    vettingReport: { findFirst: vi.fn() },
  },
}));

import { prisma } from "../../../src/config/database";
import { getOwnVettingReport } from "../../../src/controllers/carrierController";

const p = vi.mocked(prisma) as any;

function res() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

// A stored row as vetAndStoreReport actually writes it, including everything
// that must NOT come back out.
const STORED = {
  score: 82,
  grade: "B",
  riskLevel: "LOW",
  recommendation: "APPROVE",
  trendDirection: "IMPROVING",
  createdAt: new Date("2026-09-05T10:00:00.000Z"),
  flagsJson: ["authority under 24 months"],
  fmcsaSnapshot: { operatingStatus: "ACTIVE", safetyRating: "SATISFACTORY" },
  identityData: { chameleonRiskLevel: "MEDIUM", phoneType: "VOIP", sosStatus: "GOOD" },
  checksJson: [
    { name: "FMCSA Operating Authority", result: "PASS", detail: "Active", deduction: 0, source: "FMCSA" },
    { name: "OFAC/SDN Screening", result: "WARNING", detail: "Manual review", deduction: 10, source: "OFAC" },
  ],
};

async function call(profile: any = { id: "cp-1" }, report: any = STORED) {
  p.carrierProfile.findUnique.mockResolvedValue(profile);
  p.vettingReport.findFirst.mockResolvedValue(report);
  const r = res();
  await getOwnVettingReport({ user: { id: "u-1" } } as any, r);
  return r;
}

beforeEach(() => vi.clearAllMocks());

describe("it answers about the caller's own carrier and nothing else", () => {
  it("resolves the profile from the session, never from a parameter", async () => {
    await call();
    expect(p.carrierProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-1" } }),
    );
  });

  it("scopes the report query to that profile", async () => {
    await call({ id: "cp-1" });
    expect(p.vettingReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { carrierId: "cp-1" } }),
    );
  });

  it("reads the most recent report", async () => {
    await call();
    const arg = p.vettingReport.findFirst.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
  });

  it("404s when the caller has no carrier profile, which is how a non-carrier lands", async () => {
    const r = await call(null);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(p.vettingReport.findFirst).not.toHaveBeenCalled();
  });

  // Absent beats invented. The card is gated on the response, so this is what
  // makes an unvetted carrier see NO Compass card rather than a fabricated one.
  it("404s when the carrier has never been vetted, rather than synthesising one", async () => {
    const r = await call({ id: "cp-1" }, null);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json.mock.calls[0][0].error).toMatch(/no vetting report/i);
  });
});

describe("it returns the verdict, and withholds the internals", () => {
  it("returns score, grade, risk level, checks and when it was run", async () => {
    const body = (await call()).json.mock.calls[0][0];
    expect(body.score).toBe(82);
    expect(body.grade).toBe("B");
    expect(body.riskLevel).toBe("LOW");
    expect(body.vettedAt).toEqual(STORED.createdAt);
    expect(body.checks).toHaveLength(2);
  });

  it("each check carries name, result and detail -- and nothing else", async () => {
    const body = (await call()).json.mock.calls[0][0];
    for (const c of body.checks) {
      expect(Object.keys(c).sort()).toEqual(["detail", "name", "result"]);
    }
    expect(body.checks[1]).toEqual({
      name: "OFAC/SDN Screening",
      result: "WARNING",
      detail: "Manual review",
    });
  });

  // The scoring weight. Publishing per-check deductions hands anyone this is
  // forwarded to a map of how SRL scores carriers.
  it("never returns a check's deduction or its data source", async () => {
    const body = (await call()).json.mock.calls[0][0];
    const json = JSON.stringify(body);
    expect(json).not.toContain("deduction");
    expect(json).not.toContain("source");
  });

  // Telling a carrier their chameleon risk level tells a fraudulent one whether
  // they have been detected.
  it("never returns the identity block, the FMCSA snapshot, the flags or the recommendation", async () => {
    const body = (await call()).json.mock.calls[0][0];
    expect(body).not.toHaveProperty("identityData");
    expect(body).not.toHaveProperty("fmcsaSnapshot");
    expect(body).not.toHaveProperty("flagsJson");
    expect(body).not.toHaveProperty("flags");
    expect(body).not.toHaveProperty("recommendation");

    const json = JSON.stringify(body);
    for (const leak of ["chameleonRiskLevel", "VOIP", "sosStatus", "APPROVE", "authority under 24 months"]) {
      expect(json, `withheld: ${leak}`).not.toContain(leak);
    }
  });

  // checksJson is a Json column, so its shape is whatever was written. A row
  // from an older writer, or a hand-edited one, must not crash the endpoint the
  // carrier's compliance page depends on.
  it("survives a checksJson that is not the expected shape", async () => {
    for (const bad of [null, "not an array", 42, [null, "str", 7, []]]) {
      const r = await call({ id: "cp-1" }, { ...STORED, checksJson: bad });
      expect(r.status).not.toHaveBeenCalledWith(500);
      expect(Array.isArray(r.json.mock.calls[0][0].checks)).toBe(true);
    }
  });
});

describe("the route is mounted where a carrier can reach it, and gated", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/carrier.ts"), "utf8");
  const line = src.split(/\r?\n/).find((l) => l.includes('router.get("/vetting-report"')) ?? "";

  it("carries an explicit CARRIER gate", () => {
    // /api/carrier is the audience-mixed mount (§13.3 Item 161): its
    // carrier-facing siblings have no authorize, and a new route must not
    // inherit that. routeAuthorizeCoverage also freezes the ungated inventory.
    expect(line).toContain('authorize("CARRIER")');
  });

  it("takes no id, so there is no parameter to scope wrongly", () => {
    expect(line).toContain('"/vetting-report"');
    expect(line).not.toMatch(/:\w+/);
  });

  it("sits after authenticate rather than in the public block", () => {
    const authAt = src.indexOf("router.use(authenticate)");
    expect(authAt).toBeGreaterThan(-1);
    expect(src.indexOf('router.get("/vetting-report"')).toBeGreaterThan(authAt);
  });
});

describe("the page no longer manufactures a verdict from the score", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../../../../frontend/src/app/carrier/dashboard/compliance/page.tsx"),
    "utf8",
  );
  const code = page.replace(/^\s*\/\/.*$/gm, "");

  it("does not call the scorecard endpoint from the compliance page", () => {
    // The fallback derived grade, riskLevel and recommendation from
    // sc.overallScore -- a performance number presented as a vetting verdict.
    expect(code).not.toContain("/carrier/scorecard");
  });

  it("asks for the vetting report and lets a 404 be a 404", () => {
    expect(code).toContain('api.get("/carrier/vetting-report")');
    expect(code).toContain("retry: false");
  });

  it("its own matcher would still see the old fallback", () => {
    const before = 'const res = await api.get("/carrier/scorecard");';
    expect(before.includes("/carrier/scorecard")).toBe(true);
  });
});
