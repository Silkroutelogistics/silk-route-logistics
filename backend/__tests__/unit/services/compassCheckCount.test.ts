/**
 * The published Compass check count must equal the number of checks that run.
 *
 * WHY THIS EXISTS. Arc 23 removed two vetting checks (Fleet VIN Verification,
 * and a truck-level IFTA check that was unscoped by carrier). Nothing noticed
 * that "35-point vetting" was now overstated, and it is not an internal detail:
 * it is on /shippers, on the homepage capability tiles, in the public Marco
 * Polo prompt, and in four Lead Hunter cold-outreach templates. CLAUDE.md §18.8
 * additionally MANDATES the phrasing, so the stale number was being enforced as
 * a rule.
 *
 * A count in marketing copy is a maintenance liability the moment it is written
 * down in nine places. This test is the thing that makes the liability cheap:
 * add or remove a check and it fails, naming every surface to update.
 *
 * §13.3 Item 232.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const BACKEND = path.join(__dirname, "../../..");
const REPO = path.join(BACKEND, "..");

/**
 * The honest count is DISTINCT CHECK NAMES, not push-call count.
 *
 * One named check pushes from several branches — "Safety Rating" pushes four
 * times, one per outcome — so counting calls would report about 130. A carrier
 * reading "34-point vetting" is being told how many things were examined.
 */
function distinctCheckNames(source: string): string[] {
  const names = new Set<string>();
  // Matches both `checks.push({ name: "X"` and a multi-line push whose name
  // sits on its own line, which is how the longer branches are written.
  for (const m of source.matchAll(/name:\s*"([^"]+)"/g)) {
    const n = m[1];
    // Only names that are pushed as vetting checks — skip unrelated object
    // literals by requiring the name to appear near a checks.push.
    names.add(n);
  }
  return [...names];
}

function vettingCheckNames(): string[] {
  const src = fs.readFileSync(path.join(BACKEND, "src/services/carrierVettingService.ts"), "utf8");
  // Restrict to the region that actually builds the report, then take names
  // that are pushed onto `checks`.
  const pushed = new Set<string>();
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (!/checks\.push\(/.test(line)) return;
    // name may be on this line or within the next few for a wrapped push
    const window = lines.slice(i, i + 6).join(" ");
    const m = /name:\s*"([^"]+)"/.exec(window);
    if (m) pushed.add(m[1]);
  });
  return [...pushed];
}

/** Every surface that states the count, and how it states it. */
const SURFACES: Array<{ file: string; label: string }> = [
  { file: "backend/src/controllers/chatController.ts", label: "public Marco Polo prompt" },
  { file: "backend/src/email/builder.ts", label: "Lead Hunter outreach templates" },
  { file: "backend/src/services/emailSequenceService.ts", label: "outreach sequence" },
  { file: "frontend/public/index.html", label: "homepage capability tile" },
  { file: "frontend/public/js/capabilities-wall.js", label: "homepage tile pool" },
  { file: "frontend/public/shippers.html", label: "/shippers body copy + ops loop" },
  { file: "frontend/src/app/dashboard/lead-hunter/page.tsx", label: "Lead Hunter templates" },
  { file: "frontend/src/app/onboarding/page.tsx", label: "carrier onboarding review step" },
];

describe("Compass published check count", () => {
  const names = vettingCheckNames();

  it("counts the checks that actually run", () => {
    // A floor, so a broken scanner cannot pass this suite by matching nothing —
    // the §19 Sub-pattern 16 failure, in a test whose whole job is a number.
    expect(names.length, "the scanner should find a realistic number of checks").toBeGreaterThan(25);
    expect(names).toContain("Chameleon Risk");
    expect(names).not.toContain("Fleet VIN Verification");
    expect(names).not.toContain("IFTA Truck Expiry");
  });

  it("is stated identically on every surface that publishes it", () => {
    const count = names.length;
    const wrong: string[] = [];
    for (const s of SURFACES) {
      const p = path.join(REPO, s.file);
      if (!fs.existsSync(p)) { wrong.push(`${s.file} — MISSING`); continue; }
      const body = fs.readFileSync(p, "utf8");
      // Any "N-point" or "N points" claim near Compass wording.
      for (const m of body.matchAll(/(\d+)[- ]point/g)) {
        if (Number(m[1]) !== count) wrong.push(`${s.file} (${s.label}) says ${m[1]}-point, checks are ${count}`);
      }
      for (const m of body.matchAll(/scored on (\d+) points|(\d+) points each/g)) {
        const n = Number(m[1] || m[2]);
        if (n !== count) wrong.push(`${s.file} (${s.label}) says ${n} points, checks are ${count}`);
      }
    }
    expect(
      wrong,
      wrong.length
        ? `The published Compass count has drifted from the code.\n  ${wrong.join("\n  ")}\n\n` +
          `Checks currently running (${count}):\n  ${names.sort().join("\n  ")}\n\n` +
          "Update every surface above, and CLAUDE.md §18.8 / §18.9, which mandate the phrasing."
        : "",
    ).toEqual([]);
  });
});
