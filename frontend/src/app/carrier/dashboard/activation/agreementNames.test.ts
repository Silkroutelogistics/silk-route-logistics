/**
 * Carriers see the agreements by name, never by version (2026-09-26).
 *
 * The activation page read "I have read and agree to the Broker-Carrier
 * Agreement (v2026-09-03-F11)" and "... the Caravan Quick Pay Agreement
 * (v2026-09-04-v5)", and the same version string sat under each review pane,
 * in the signed-status line, beside the onboarding Print button and in the
 * onboarding print header. Ratified: a carrier sees "Broker-Carrier Agreement"
 * and "Caravan Quick Pay Agreement" and nothing more.
 *
 * The version itself is not gone. The server still stamps it on the signature
 * row, and it stays inside the signed text and the executed PDF, where it is
 * the proof of which text was signed. This guard covers only what a carrier
 * reads on screen; the page still POSTS the served version back so a stale tab
 * gets the 409, and that payload line is not a render.
 *
 * Source read, not a render. The patterns are the shapes a version render took
 * on these pages; a render written some other way would pass, so the positive
 * assertions below pin the two consent sentences exactly.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "../../..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [p] : [];
  });
}

const SURFACES = [...walk(path.join(APP, "carrier")), path.join(APP, "onboarding/page.tsx")];

/** JSX that prints an agreement version. */
const VERSION_RENDERS: RegExp[] = [
  /\bv\{[\w.?]*[vV]ersion\w*\}/, //            v{bca.version}
  /\(v\$\{[\w.?]*[vV]ersion\w*\}\)/, //         (v${qp.version})
  /\(version \{[\w.?]*[vV]ersion\w*\}\)/, //     (version {data.bca.version})
  /Version<\/span>\s*\{[\w.?]*[vV]ersion/, //   <span>Version</span> {bcaVersion...}
  /[—-] Version \{[\w.?]*[vV]ersion/, //         — Version {bcaVersionResolved ...}
];

describe("agreement names on carrier screens", () => {
  it("scans the carrier portal and onboarding", () => {
    // Vacuity tripwire: a walk that found nothing would pass every check.
    expect(SURFACES.length).toBeGreaterThan(15);
    expect(SURFACES.some((f) => f.endsWith(path.join("activation", "page.tsx")))).toBe(true);
  });

  it("prints no agreement version anywhere a carrier reads", () => {
    const hits: string[] = [];
    for (const file of SURFACES) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const re of VERSION_RENDERS) {
          if (re.test(line)) hits.push(`${path.relative(APP, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(hits, `Agreement versions rendered to carriers:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("names each agreement in its consent sentence without a version", () => {
    const src = fs.readFileSync(path.join(APP, "carrier/dashboard/activation/page.tsx"), "utf8");
    expect(src).toContain("I have read and agree to the Broker-Carrier Agreement on behalf of my company.");
    expect(src).toContain("I have read and agree to the Caravan Quick Pay Agreement on behalf of my company.");
  });

  it("the patterns catch the renders this change removed", () => {
    // Each line below is the exact shape that shipped before 2026-09-26.
    const removed = [
      "I have read and agree to the Broker-Carrier Agreement (v{bca?.version}) on behalf of my company.",
      "{bca.title} v{bca.version}. The full executed agreement governs.",
      'the Caravan Quick Pay Agreement{qp ? ` (v${qp.version})` : ""} on behalf',
      "{data.bca.version ? <> (version {data.bca.version})</> : null}.",
      '<span className="x">Version</span> {bcaVersionResolved ?? "loading…"}',
      'Broker-Carrier Agreement (Click-Through) — Version {bcaVersionResolved ?? "not loaded"} — Printed',
    ];
    for (const line of removed) {
      expect(VERSION_RENDERS.some((re) => re.test(line)), line).toBe(true);
    }
    // And the payload that must stay is not a render.
    expect(VERSION_RENDERS.some((re) => re.test('bcaVersion: bca?.version ?? "",'))).toBe(false);
  });
});
