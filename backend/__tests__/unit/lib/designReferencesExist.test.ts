/**
 * Every design reference cited from source must exist in the tree.
 *
 * WHY. srl-chrome.ts derives real geometry from these files and says so by
 * path — the letterhead gutter, the signature column count, the fine-print
 * override, the BCA cover. A citation is only worth as much as the reader's
 * ability to open it, and until this commit all three of the HTML references
 * were UNTRACKED: cited by five lines of source, present on one machine, absent
 * from the repository. A clean clone had citations pointing at nothing.
 *
 * WHAT IT ALREADY CAUGHT. pdfService.ts:1600 cited "docs/design/rc.html" while
 * the file on disk was "rc.html.html". A dangling reference nobody could
 * follow, sitting in source, invisible to tsc and to every other gate.
 *
 * SCOPE IS BOTH FILES, not just srl-chrome. The brief named srl-chrome because
 * that is where the citations cluster, but pdfService cites the same references
 * and held the broken one — scoping this to one file would have left the actual
 * defect uncovered.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const REPO = path.resolve(__dirname, "../../../..");

/** Source files that cite design references by path. */
const CITING_FILES = [
  "backend/src/lib/srl-chrome.ts",
  "backend/src/services/pdfService.ts",
];

/**
 * A citation is `docs/design/<name>` followed by a path-safe filename.
 *
 * Trailing punctuation is stripped because these live in prose — "…per
 * docs/design/rc.html." ends in a sentence period that is not part of the name.
 */
const CITATION = /docs\/design\/([A-Za-z0-9._-]+)/g;

function citations(): Array<{ file: string; line: number; ref: string }> {
  const out: Array<{ file: string; line: number; ref: string }> = [];
  for (const rel of CITING_FILES) {
    const body = fs.readFileSync(path.join(REPO, rel), "utf8");
    body.split(/\r?\n/).forEach((text, i) => {
      for (const m of text.matchAll(CITATION)) {
        const ref = m[1].replace(/[.,;:)]+$/, "");
        if (ref) out.push({ file: rel, line: i + 1, ref });
      }
    });
  }
  return out;
}

describe("design references cited from source exist in the tree", () => {
  it("finds citations at all (vacuity tripwire)", () => {
    // A regex that stopped matching would make the assertion below pass over an
    // empty set, which is the shape §19 Sub-pattern 16 keeps naming.
    const found = citations();
    expect(
      found.length,
      "no docs/design citations found — the matcher is broken, or the comments " +
        "that derive geometry from the design files are gone",
    ).toBeGreaterThanOrEqual(6);
    expect(new Set(found.map((c) => c.file)).size, "only one file matched").toBe(CITING_FILES.length);
  });

  it("every cited file is present", () => {
    const missing = citations()
      .filter((c) => !fs.existsSync(path.join(REPO, "docs/design", c.ref)))
      .map((c) => `${c.file}:${c.line}  ->  docs/design/${c.ref}`);
    expect(
      missing,
      "these citations point at files that are not in the tree:\n  " + missing.join("\n  ") +
        "\nEither the file was renamed and the citation was not, or a design " +
        "reference was deleted while source still derives geometry from it.",
    ).toEqual([]);
  });

  it("the references are TRACKED, not merely present on disk", () => {
    // Presence is not enough. These were untracked for months: real on one
    // machine, absent from every clone, and nothing said so. A file that exists
    // locally and not in git is a citation that works only for its author.
    const { execFileSync } = require("child_process") as typeof import("child_process");
    const tracked = new Set(
      execFileSync("git", ["ls-files", "docs/design"], { cwd: REPO, encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean)
        .map((p) => p.replace(/^docs\/design\//, "")),
    );
    expect(tracked.size, "git ls-files returned nothing — the probe is broken").toBeGreaterThan(0);

    const untracked = [...new Set(citations().map((c) => c.ref))]
      .filter((ref) => !tracked.has(ref));
    expect(
      untracked,
      "these design references are cited from source but are not tracked by " +
        "git, so they exist only in this working copy:\n  " + untracked.join("\n  "),
    ).toEqual([]);
  });

  it("the matcher tolerates trailing prose punctuation (self-test)", () => {
    const sample = "// see docs/design/rc.html, and docs/design/bca.html.";
    const refs = [...sample.matchAll(CITATION)].map((m) => m[1].replace(/[.,;:)]+$/, ""));
    expect(refs).toEqual(["rc.html", "bca.html"]);
  });
});
