/**
 * Shipment-selecting jobs must ask the load whether it still matters.
 *
 * runPreTracing and runLateDetection select on Shipment.status and never looked
 * at the load. deleteLoad cascades deletedAt to three of Load's thirty-one
 * children and Shipment is not one of them, so a shipment left IN_TRANSIT under
 * a cancelled load kept runLateDetection emailing the broker every 30 minutes —
 * verified against production on 2026-09-02, two BKN shipments still BOOKED and
 * IN_TRANSIT under loads cancelled hours earlier.
 *
 * v3.8.ayv cascades the shipment to CANCELLED at the source. This is the
 * BACKSTOP: a shipment created before that cascade existed would otherwise
 * depend on a one-off data run alone, and these jobs should not assume a cascade
 * has ever run.
 *
 * Structural rather than behavioural on purpose. Both jobs are module-private,
 * registered through withLock inside startSchedulers, so there is no exported
 * function to drive. What is checkable — and what actually regressed — is
 * whether the where-clause carries the filter.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src/services/schedulerService.ts");
const src = fs.readFileSync(SRC, "utf8");

/** Strip comments: prose naming the filter must not satisfy a check about code. */
function codeOnly(s: string): string {
  return s.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "").replace(new RegExp("^[ \\t]*//.*$", "gm"), "");
}
const code = codeOnly(src);

/** The where-clause body of every prisma.shipment.findMany in the file. */
function shipmentSelections(): string[] {
  // Matched across line breaks — this formatter wraps long prisma chains and a
  // single-line pattern silently undercounts (§19 Sub-pattern 18).
  const re = new RegExp("prisma\\s*\\.\\s*shipment\\s*\\.\\s*findMany\\s*\\(\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\s*\\)", "g");
  return [...code.matchAll(re)].map((m) => m[1]);
}

const LOAD_GUARD = 'load: { is: { deletedAt: null, status: { not: "CANCELLED" } } }';

describe("shipment-selecting jobs guard on the load", () => {
  const selections = shipmentSelections();

  it("finds the shipment selections at all (vacuity tripwire)", () => {
    // A regex that stopped matching would report every selection guarded,
    // forever, and that failure looks exactly like success.
    expect(
      selections.length,
      "the shipment-selection scanner matched nothing — it is broken, not the file",
    ).toBeGreaterThanOrEqual(2);
  });

  it("every shipment selection filters on the load", () => {
    const unguarded = selections
      .map((w, i) => ({ i, w: w.replace(/\s+/g, " ").trim() }))
      .filter((x) => !/load:\s*\{\s*is:\s*\{/.test(x.w))
      .map((x) => `selection #${x.i}: ${x.w.slice(0, 110)}`);
    expect(
      unguarded,
      "a shipment selection with no load filter — a cancelled load's shipment would keep firing",
    ).toEqual([]);
  });

  it("the filter excludes BOTH cancelled and soft-deleted loads, not just one", () => {
    // Either alone is insufficient: the two BKN rows were cancelled AND
    // soft-deleted, but a load can be cancelled through the status path without
    // being deleted, and deleteLoad sets both.
    for (const w of selections) {
      const flat = w.replace(/\s+/g, " ");
      expect(flat, "missing deletedAt in the load filter").toContain("deletedAt: null");
      expect(flat, "missing CANCELLED exclusion in the load filter").toContain('status: { not: "CANCELLED" }');
    }
  });

  it("both named jobs carry it", () => {
    for (const fn of ["runPreTracing", "runLateDetection"]) {
      const i = code.indexOf(`function ${fn}`);
      expect(i, `${fn} not found — renamed?`).toBeGreaterThan(-1);
      const body = code.slice(i, i + 2000).replace(/\s+/g, " ");
      expect(body.includes(LOAD_GUARD.replace(/\s+/g, " ")), `${fn} does not guard on the load`).toBe(true);
    }
  });

  it("runLateDetection still selects on IN_TRANSIT — the guard narrows, it does not replace", () => {
    // Without this the suite would pass on a job whose original selection had
    // been gutted and replaced by the load filter alone.
    const i = code.indexOf("function runLateDetection");
    const body = code.slice(i, i + 2000);
    expect(body).toContain('status: "IN_TRANSIT"');
    expect(body).toContain("lastLocationAt");
  });

  it("runPreTracing still selects on BOOKED/DISPATCHED and the pickup window", () => {
    const i = code.indexOf("function runPreTracing");
    const body = code.slice(i, i + 2000);
    expect(body).toContain('"BOOKED", "DISPATCHED"');
    expect(body).toContain("pickupDate");
  });
});
