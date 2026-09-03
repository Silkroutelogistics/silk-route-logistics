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
  const lines = src.split(/\r?\n/);
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
const SURFACES: Array<{ file: string; label: string; headLines?: number }> = [
  // The engine's OWN header. It was not on this list, and was consequently
  // stale through two removals — still claiming 35, still listing fleet VIN
  // verification (deleted Arc 23) and IRP/IFTA. The most authoritative-looking
  // statement of the number was the one thing the guard could not see.
  //
  // headLines because the body of this file legitimately discusses DEDUCTIONS
  // in points ("the 5-point deduction waived"), which the count regex cannot
  // tell from a count claim. Scanning the whole file reported those as drift —
  // a guard crying wolf on its first run is a guard nobody will keep.
  { file: "backend/src/services/carrierVettingService.ts", label: "vetting engine header", headLines: 20 },
  { file: "backend/src/controllers/chatController.ts", label: "public Marco Polo prompt" },
  { file: "backend/src/email/builder.ts", label: "Lead Hunter outreach templates" },
  { file: "backend/src/services/emailSequenceService.ts", label: "outreach sequence" },
  { file: "frontend/public/index.html", label: "homepage capability tile" },
  { file: "frontend/public/js/capabilities-wall.js", label: "homepage tile pool" },
  { file: "frontend/public/shippers.html", label: "/shippers body copy + ops loop" },
  { file: "frontend/src/app/dashboard/lead-hunter/page.tsx", label: "Lead Hunter templates" },
  // Promoted out of DEFERRED in v3.8.aza: the concurrent session that owned this
  // file finished, the count was corrected to 33, and the inverted assertion
  // fired exactly as designed to say so. It is a guarded surface again.
  { file: "frontend/src/app/onboarding/page.tsx", label: "carrier onboarding review step" },
];

/**
 * Surfaces KNOWINGLY left stale, because another session owns the file.
 *
 * frontend/src/app/onboarding/page.tsx:1841 still says 34-point. It is being
 * edited concurrently, and §2.2 makes a file another session is working
 * theirs — editing it would race their work.
 *
 * This is NOT a hole in the guard. The assertion for these entries is
 * INVERTED: it requires them to be STILL WRONG. The moment anyone updates the
 * file, this test fails and tells them to delete the deferral. An exemption
 * that cannot outlive its own reason is the only kind worth having — a plain
 * allowlist would quietly become permanent.
 */
const DEFERRED: Array<{ file: string; label: string; staleCount: number; why: string }> = [];

describe("Compass published check count", () => {
  const names = vettingCheckNames();

  it("counts the checks that actually run", () => {
    // A floor, so a broken scanner cannot pass this suite by matching nothing —
    // the §19 Sub-pattern 16 failure, in a test whose whole job is a number.
    expect(names.length, "the scanner should find a realistic number of checks").toBeGreaterThan(25);
    expect(names).toContain("Chameleon Risk");
    expect(names).not.toContain("Fleet VIN Verification");
    expect(names).not.toContain("IFTA Truck Expiry");
    // Deleted in the B1 slot. Both read CarrierProfile columns nothing writes
    // (irpStatus, iftaStatus), so each was a standing -5 on every carrier for
    // data no code path could supply — and `lastVettingScore < 40` is a tender
    // block, so the phantom -10 was not cosmetic.
    expect(names).not.toContain("IRP Registration");
    expect(names).not.toContain("IFTA Compliance");
  });

  it("no check reads a column nothing writes", () => {
    // The rule the three removals share. Named here so the NEXT check written
    // against an aspirational column fails on arrival rather than costing every
    // carrier five points until someone audits the scorer.
    const src = fs.readFileSync(path.join(BACKEND, "src/services/carrierVettingService.ts"), "utf8");
    for (const dead of ["irpStatus", "iftaStatus"]) {
      expect(
        src.includes(`.${dead}`),
        `${dead} has no writer anywhere in backend/src or frontend/src — a check ` +
          `reading it can only ever take its "not confirmed" branch.`,
      ).toBe(false);
    }
  });

  it("is stated identically on every surface that publishes it", () => {
    const count = names.length;
    const wrong: string[] = [];
    for (const s of SURFACES) {
      const p = path.join(REPO, s.file);
      if (!fs.existsSync(p)) { wrong.push(`${s.file} — MISSING`); continue; }
      const whole = fs.readFileSync(p, "utf8");
      const body = s.headLines
        ? whole.split(/\r?\n/).slice(0, s.headLines).join("\n")
        : whole;
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

  it("the PDF category map covers every check exactly once", () => {
    // The map is POSITIONAL — array index, not name — so any check added or
    // removed upstream silently re-points every heading after it. Nothing
    // crashes: a dangling index is dropped by `if (!check) continue;`.
    //
    // It drifted for a whole arc undetected. #27 was removed and this was not
    // re-indexed, so three checks rendered under the wrong heading on every
    // shipped Compass PDF — a customer-facing artifact. The count guard above
    // could never have caught it: compassPdfService was not a SURFACE, and its
    // stale text said "35 checks", which matches neither of its regexes.
    const src = fs.readFileSync(path.join(BACKEND, "src/services/compassPdfService.ts"), "utf8");
    const block = src.slice(src.indexOf("const CATEGORIES"), src.indexOf("];", src.indexOf("const CATEGORIES")));
    const indices = [...block.matchAll(/indices:\s*\[([^\]]+)\]/g)]
      .flatMap((m) => m[1].split(",").map((n) => Number(n.trim())))
      .filter((n) => Number.isFinite(n));

    expect(indices.length, "the parser should find real indices, not nothing").toBeGreaterThan(20);

    const count = names.length;
    const seen = new Map<number, number>();
    for (const i of indices) seen.set(i, (seen.get(i) ?? 0) + 1);

    const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([i]) => i);
    const dangling = indices.filter((i) => i > count || i < 1);
    const uncovered = Array.from({ length: count }, (_, k) => k + 1).filter((i) => !seen.has(i));

    const problems: string[] = [];
    if (duplicated.length) problems.push(`duplicated (later listing is unreachable): ${duplicated.join(", ")}`);
    if (dangling.length) problems.push(`dangling past the ${count} checks that exist: ${dangling.join(", ")}`);
    if (uncovered.length) problems.push(`uncovered, falls to OTHER CHECKS: ${uncovered.join(", ")}`);

    expect(
      problems,
      problems.length
        ? `The Compass PDF category map has drifted from the checks.\n  ${problems.join("\n  ")}\n\n` +
          `These are 1-based RUNTIME positions. Re-derive them against the order the engine ` +
          `pushes checks in — not the inline "// ── N." comment numbers, which no longer match ` +
          `after any removal.`
        : "",
    ).toEqual([]);
  });

  it("deferred surfaces are still stale — the exemption expires itself", () => {
    // INVERTED on purpose. These are surfaces another session owns, so they
    // could not be updated. If one is now correct, the deferral has served its
    // purpose and must be deleted rather than left to rot into a permanent
    // hole. This fails LOUDLY on being fixed, which is the point.
    const count = names.length;
    const resolved: string[] = [];
    for (const d of DEFERRED) {
      const p = path.join(REPO, d.file);
      if (!fs.existsSync(p)) { resolved.push(`${d.file} — file is gone; drop the deferral`); continue; }
      const body = fs.readFileSync(p, "utf8");
      const stated = [...body.matchAll(/(\d+)[- ]point/g)].map((m) => Number(m[1]));
      if (stated.length === 0) {
        resolved.push(`${d.file} no longer states a count; drop the deferral`);
      } else if (stated.every((n) => n === count)) {
        resolved.push(
          `${d.file} (${d.label}) now correctly says ${count}-point — the deferral is spent. ` +
            `Delete it from DEFERRED and add the file back to SURFACES.`,
        );
      } else if (!stated.includes(d.staleCount)) {
        resolved.push(
          `${d.file} says ${stated.join("/")}, expected the known-stale ${d.staleCount}. ` +
            `Somebody changed it to a third value — reconcile before trusting this guard.`,
        );
      }
    }
    expect(resolved, resolved.join("\n  ")).toEqual([]);
  });
});
