/**
 * The scorecard endpoint returns what the scorecard page reads.
 *
 * WHAT WAS WRONG. /carrier/dashboard/scorecard destructures `metrics`,
 * `history`, `bonuses`, `milestone`, `milestoneLoads` and `daysActive` from
 * GET /carrier/scorecard. The endpoint returned none of them. Nothing errored,
 * nothing logged, and nothing failed a gate -- every optional chain simply took
 * its default. The carrier saw seven Compass gauges at a flat 0.0%, an empty
 * trend chart, no bonuses table at all, and a milestone panel reporting 0 loads,
 * 0% on-time and 0 days active against the §10 thresholds.
 *
 * THE KEY-PARITY CASE IS THE ONE THAT MATTERS. The defect was two sides of one
 * contract disagreeing about field names, which is §19 Sub-pattern 5, and
 * nothing in the type system spans an HTTP boundary. So the parity case reads
 * the page's own KPI_LABELS out of the source and asserts the payload carries
 * exactly those keys. A test that merely asserted "metrics is present" would
 * have passed against a payload the page cannot read.
 *
 * Phase 1 of the mandatory-ELD arc, commit 4 of 7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    carrierProfile: { findUnique: vi.fn() },
    carrierScorecard: { findMany: vi.fn() },
    carrierBonus: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../src/config/database";
import { getScorecard, getCarrierScore } from "../../../src/controllers/carrierController";
import { tenureDays } from "../../../src/services/caravanService";

const p = vi.mocked(prisma) as any;

function res() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

function card(overallScore: number, calculatedAt: string, over: Record<string, number> = {}) {
  return {
    overallScore,
    calculatedAt: new Date(calculatedAt),
    onTimePickupPct: 90,
    onTimeDeliveryPct: 95,
    communicationScore: 80,
    claimRatio: 1,
    documentSubmissionTimeliness: 75,
    acceptanceRate: 60,
    gpsCompliancePct: 0,
    ...over,
  };
}

const PROFILE = {
  id: "cp-1",
  tier: "SILVER",
  eldEnabled: false,
  milestone: "M4_PARTNER",
  cppTotalLoads: 14,
  cppJoinedDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
};

async function callScorecard(profile: any = PROFILE, cards: any[] = [card(88, "2026-09-01")], bonuses: any[] = []) {
  p.carrierProfile.findUnique.mockResolvedValue(profile);
  p.carrierScorecard.findMany.mockResolvedValue(cards);
  p.carrierBonus.findMany.mockResolvedValue(bonuses);
  const r = res();
  await getScorecard({ user: { id: "u-1" } } as any, r);
  return r.json.mock.calls[0][0];
}

beforeEach(() => vi.clearAllMocks());

describe("every field the page destructures is present", () => {
  it("returns metrics, history, bonuses, milestone, milestoneLoads and daysActive", async () => {
    const body = await callScorecard();
    for (const k of ["metrics", "history", "bonuses", "milestone", "milestoneLoads", "daysActive"]) {
      expect(body, `the page reads ${k}`).toHaveProperty(k);
    }
  });

  // THE PARITY CASE. Derived from the page's own source rather than from a copy
  // of its key list here, because a copy is a third place for these names to
  // live and the defect was two places already disagreeing.
  it("metrics carries exactly the keys the page's gauges index by", async () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../../../frontend/src/app/carrier/dashboard/scorecard/page.tsx"),
      "utf8",
    );
    const block = page.slice(page.indexOf("const KPI_LABELS"));
    const keys = [...block.slice(0, block.indexOf("};")).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);

    expect(keys.length, "the KPI_LABELS block must still be findable").toBe(7);
    const body = await callScorecard();
    expect(Object.keys(body.metrics).sort()).toEqual([...keys].sort());
  });

  it("its own key extractor really reads the page, not an empty match", () => {
    const sample = "const KPI_LABELS: Record<string, string> = {\n  aPct: \"A\",\n  bScore: \"B\",\n};";
    const block = sample.slice(sample.indexOf("const KPI_LABELS"));
    const keys = [...block.slice(0, block.indexOf("};")).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(["aPct", "bScore"]);
  });

  it("metrics is null when no scorecard has ever been written", async () => {
    const body = await callScorecard(PROFILE, []);
    // Honest rather than a zeroed object: there is genuinely nothing recorded,
    // and the page renders that as 0 with no claim attached.
    expect(body.metrics).toBe(null);
    expect(body.history).toEqual([]);
  });
});

describe("history is oldest-first, because the chart labels in array order", () => {
  it("reverses the stored newest-first order", async () => {
    const body = await callScorecard(PROFILE, [
      card(90, "2026-09-08"),
      card(80, "2026-09-01"),
      card(70, "2026-08-25"),
    ]);
    // Handing the page the stored order would draw an improving carrier's trend
    // line as a decline, which is worse than showing no chart.
    expect(body.history.map((h: any) => h.overallScore)).toEqual([70, 80, 90]);
  });

  it("leaves `scorecards` newest-first for its existing readers", async () => {
    const body = await callScorecard(PROFILE, [card(90, "2026-09-08"), card(70, "2026-08-25")]);
    expect(body.scorecards.map((s: any) => s.overallScore)).toEqual([90, 70]);
  });
});

describe("milestone progress comes from the fields the §10 gate itself counts", () => {
  it("passes through cppTotalLoads and the gate's own tenure calculation", async () => {
    const body = await callScorecard();
    expect(body.milestoneLoads).toBe(14);
    expect(body.milestone).toBe("M4_PARTNER");
    // Same function checkMilestoneAdvancement uses, so the panel telling a
    // carrier how far they are cannot disagree with the gate that decides it.
    expect(body.daysActive).toBe(tenureDays(PROFILE.cppJoinedDate));
    expect(body.daysActive).toBe(100);
  });

  it("a carrier with no milestone recorded reads as M1, not as blank", async () => {
    const body = await callScorecard({ ...PROFILE, milestone: null, cppTotalLoads: null, cppJoinedDate: null });
    expect(body.milestone).toBe("M1_FIRST_LOAD");
    expect(body.milestoneLoads).toBe(0);
    expect(body.daysActive).toBe(0);
  });
});

describe("tenureDays", () => {
  it("a null join date is day zero, not a very long tenure", () => {
    expect(tenureDays(null)).toBe(0);
  });

  it("counts whole elapsed days", () => {
    const now = Date.UTC(2026, 8, 8);
    expect(tenureDays(new Date(Date.UTC(2026, 8, 1)), now)).toBe(7);
    expect(tenureDays(new Date(Date.UTC(2026, 8, 8)), now)).toBe(0);
  });

  it("never reports a negative tenure for a future join date", () => {
    const now = Date.UTC(2026, 8, 8);
    expect(tenureDays(new Date(Date.UTC(2026, 8, 20)), now)).toBe(0);
  });
});

describe("both scorecard surfaces are built from one payload", () => {
  it("the AE-facing handler returns the same fields plus its identity", async () => {
    p.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, companyName: "Acme" });
    p.carrierScorecard.findMany.mockResolvedValue([card(88, "2026-09-01")]);
    p.carrierBonus.findMany.mockResolvedValue([]);
    const r = res();
    await getCarrierScore({ params: { id: "cp-1" } } as any, r);
    const body = r.json.mock.calls[0][0];

    expect(body.carrierId).toBe("cp-1");
    expect(body.companyName).toBe("Acme");
    for (const k of ["metrics", "history", "bonuses", "milestone", "milestoneLoads", "daysActive"]) {
      expect(body, `the AE surface must not drift from the carrier's own: ${k}`).toHaveProperty(k);
    }
  });

  // Structural, and narrow. Two handlers that each build their own body are two
  // bodies that agree today and diverge on the next field — which is how the
  // six missing fields came to be missing from only one of them.
  it("neither handler builds its own body", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/controllers/carrierController.ts"),
      "utf8",
    );
    const calls = src.match(/buildScorecardPayload\(/g) ?? [];
    expect(calls.length, "one definition and two callers").toBe(3);
  });
});

describe("bonuses reach the carrier's own screen", () => {
  it("returns the rows the table is gated on", async () => {
    const rows = [{ period: "2026-Q3", type: "TIER", amount: 250, status: "PENDING", description: "x" }];
    const body = await callScorecard(PROFILE, [card(88, "2026-09-01")], rows);
    // The table renders on `bonuses && bonuses.length > 0`, so an absent field
    // meant it could never appear however many bonuses a carrier had earned.
    expect(body.bonuses).toEqual(rows);
  });
});
