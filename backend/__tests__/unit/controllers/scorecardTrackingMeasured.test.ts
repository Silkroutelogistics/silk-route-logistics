/**
 * Every reader of CarrierScorecard.gpsCompliancePct knows whether it is a
 * measurement.
 *
 * The column is Float @default(0) and cannot hold null, so an unmeasured
 * carrier's row carries the sentinel 0 (lib/trackingFactor). A reader that
 * prints the column as a percentage without asking whether anything measured
 * it tells a carrier they track 0% of their loads, which is the same lie as
 * the constant 100 it replaced, pointing the other way. The two scorecard
 * handlers therefore return trackingMeasured, and every page and assistant
 * context that renders the column gates on it.
 *
 * The census at the bottom is the part that outlives this commit: a reader
 * added later that prints the column without the gate fails here by path.
 *
 * Phase 0 of the mandatory-ELD arc.
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

const mockPrisma = vi.mocked(prisma) as unknown as {
  carrierProfile: { findUnique: ReturnType<typeof vi.fn> };
  carrierScorecard: { findMany: ReturnType<typeof vi.fn> };
  carrierBonus: { findMany: ReturnType<typeof vi.fn> };
};

function res() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

const ROW = { overallScore: 88, gpsCompliancePct: 0, calculatedAt: new Date() };

describe("scorecard handlers report whether tracking was measured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.carrierScorecard.findMany.mockResolvedValue([ROW]);
    mockPrisma.carrierBonus.findMany.mockResolvedValue([]);
  });

  it("getScorecard: false for a carrier with no location source", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", tier: "SILVER", eldEnabled: false });
    const r = res();
    await getScorecard({ user: { id: "u-1" } } as any, r);
    const body = r.json.mock.calls[0][0];
    expect(body.trackingMeasured).toBe(false);
    expect(body.scorecards).toEqual([ROW]);
  });

  it("getScorecard: true once eldEnabled is set", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", tier: "SILVER", eldEnabled: true });
    const r = res();
    await getScorecard({ user: { id: "u-1" } } as any, r);
    expect(r.json.mock.calls[0][0].trackingMeasured).toBe(true);
  });

  it("getCarrierScore: false for a carrier with no location source", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-2", tier: "GOLD", companyName: "X", eldEnabled: false });
    const r = res();
    await getCarrierScore({ params: { id: "cp-2" }, user: { id: "ae-1" } } as any, r);
    const body = r.json.mock.calls[0][0];
    expect(body.trackingMeasured).toBe(false);
    expect(body.carrierId).toBe("cp-2");
  });

  it("getCarrierScore: a null eldEnabled is not measured either", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-2", tier: "GOLD", companyName: "X", eldEnabled: null });
    const r = res();
    await getCarrierScore({ params: { id: "cp-2" }, user: { id: "ae-1" } } as any, r);
    expect(r.json.mock.calls[0][0].trackingMeasured).toBe(false);
  });
});

/**
 * Reader census. Every file that reads the column, other than the three that
 * define its meaning, must carry the gate token for its side of the wire:
 * `trackingMeasured` on a page, `eldEnabled` in a backend context builder.
 */
const BACKEND = path.join(__dirname, "../../..");
const REPO = path.join(BACKEND, "..");
const DEFINERS = new Set([
  "backend/src/services/integrationService.ts",
  "backend/src/services/tierService.ts",
  "backend/src/lib/trackingFactor.ts",
  "backend/src/controllers/carrierController.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe("every reader of gpsCompliancePct gates on whether it was measured", () => {
  const files = [
    ...walk(path.join(REPO, "backend/src")),
    ...walk(path.join(REPO, "frontend/src/app")),
  ];
  const readers = files
    .map((p) => ({ rel: path.relative(REPO, p).replace(/\\/g, "/"), src: fs.readFileSync(p, "utf8") }))
    .filter((f) => f.src.includes("gpsCompliancePct") && !DEFINERS.has(f.rel));

  it("finds the readers it exists to check", () => {
    // Vacuity tripwire: three pages and the assistant. A scanner that finds
    // fewer has stopped looking, not proven a clean tree.
    expect(readers.map((r) => r.rel).sort()).toEqual([
      "backend/src/services/marcoPoloService.ts",
      "frontend/src/app/carrier/dashboard/scorecard/page.tsx",
      "frontend/src/app/dashboard/scorecard/page.tsx",
      "frontend/src/app/dashboard/violations/page.tsx",
    ]);
  });

  it("each reader carries its gate token", () => {
    const ungated = readers
      .filter((r) => !(r.rel.startsWith("backend/") ? r.src.includes("eldEnabled") : r.src.includes("trackingMeasured")))
      .map((r) => r.rel);
    expect(ungated, "a reader prints the column without asking whether anything measured it").toEqual([]);
  });

  it("the assistant no longer coerces the sentinel into a percentage", () => {
    const marco = readers.find((r) => r.rel.endsWith("marcoPoloService.ts"))!;
    expect(marco.src).not.toContain("gpsCompliancePct: latestScorecard?.gpsCompliancePct || 0,");
  });
});
