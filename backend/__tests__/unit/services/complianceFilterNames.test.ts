/**
 * The carrier compliance page groups Compass checks by name, and every name
 * it uses must be one the vetting engine actually emits.
 *
 * Six of the nine names on that page were stale ("Operating Authority",
 * "FMCSA Grade", "Chameleon Detection", "TIN Verification", "ELD Validation")
 * or named a check removed in Arc 23 ("VIN Verification"), so the category
 * bars counted nothing and rendered as if every group were empty. Nothing
 * fails when a filter matches no rows; that is why this exists.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const BACKEND = path.join(__dirname, "../../..");
const REPO = path.join(BACKEND, "..");
const PAGE = path.join(REPO, "frontend/src/app/carrier/dashboard/compliance/page.tsx");
const ENGINE = path.join(BACKEND, "src/services/carrierVettingService.ts");

/** Same algorithm as compassCheckCount.test.ts: distinct names pushed onto checks. */
function liveCheckNames(): Set<string> {
  const lines = fs.readFileSync(ENGINE, "utf8").split(/\r?\n/);
  const names = new Set<string>();
  lines.forEach((line, i) => {
    if (!/checks\.push\(/.test(line)) return;
    const m = /name:\s*"([^"]+)"/.exec(lines.slice(i, i + 6).join(" "));
    if (m) names.add(m[1]);
  });
  return names;
}

/** Every string literal inside a `[...].includes(c.name)` filter on the page. */
function pageFilterNames(): string[] {
  const src = fs.readFileSync(PAGE, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/\[((?:\s*"[^"]+"\s*,?)+)\]\.includes\(c\.name\)/g)) {
    for (const n of m[1].matchAll(/"([^"]+)"/g)) out.push(n[1]);
  }
  return out;
}

describe("carrier compliance page check names", () => {
  const live = liveCheckNames();
  const used = pageFilterNames();

  it("finds the filters it exists to check", () => {
    // Vacuity tripwire: three category filters, several names each.
    expect(used.length).toBeGreaterThanOrEqual(8);
    expect(live.size).toBeGreaterThan(25);
  });

  it("every name the page filters on is a check that runs", () => {
    const stale = used.filter((n) => !live.has(n));
    expect(stale, "the page groups on names the vetting engine never emits").toEqual([]);
  });

  it("the check removed in Arc 23 is gone from the page", () => {
    expect(fs.readFileSync(PAGE, "utf8")).not.toContain("VIN Verification");
  });
});
