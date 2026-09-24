/**
 * The Cloudflare Pages deploy check stays wired, and its two halves agree.
 *
 * WHY THIS EXISTS. Cloudflare Pages builds outside GitHub Actions, so no
 * Actions job is evidence about what Cloudflare served — citing one as
 * frontend deploy verification is the §19 Sub-pattern 16 shape. The
 * replacement is a pair: `stamp-build.mjs` writes the commit into the export
 * as a postbuild step, and `check-pages-deploy.mjs` reads it back off the live
 * origin. Both halves are needed and neither is self-evidently present, so
 * each has a failure mode that is SILENT:
 *
 *   - postbuild removed      -> every later deploy ships unstamped, and the
 *                               check reports "marker absent" forever with no
 *                               indication that the cause is here
 *   - the two paths drift    -> the stamp writes one filename, the check reads
 *                               another, and the check can never pass
 *   - the no-store rule goes -> the edge may answer from cache, so the check
 *                               can pass on the PREVIOUS deploy, which is
 *                               worse than failing
 *
 * None of those breaks a build, a type, or any other test. This is the only
 * thing that would notice.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Strip comments, so prose describing the wiring is never read as the wiring. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const STAMP = "frontend/scripts/stamp-build.mjs";
const CHECK = "frontend/scripts/check-pages-deploy.mjs";
const HEADERS = "frontend/public/_headers";
const PKG = "frontend/package.json";

/** The filename the stamp WRITES, read out of the stamp itself. */
function stampedFilename(): string {
  const m = code(read(STAMP)).match(/path\.join\(\s*OUT_DIR\s*,\s*["']([^"']+)["']\s*\)/);
  expect(m, "stamp-build.mjs no longer joins a filename onto OUT_DIR").not.toBeNull();
  return m![1];
}

/** The path the checker READS, read out of the checker itself. */
function checkedPath(): string {
  const m = code(read(CHECK)).match(/MARKER_PATH\s*=\s*["']([^"']+)["']/);
  expect(m, "check-pages-deploy.mjs no longer declares MARKER_PATH").not.toBeNull();
  return m![1];
}

describe("Cloudflare Pages deploy check", () => {
  it("both halves are present and substantial (vacuity tripwire)", () => {
    // A scanner that has stopped finding either file would report a perfectly
    // wired pair forever.
    expect(code(read(STAMP)).length, "stamp-build.mjs is missing or empty").toBeGreaterThan(400);
    expect(code(read(CHECK)).length, "check-pages-deploy.mjs is missing or empty").toBeGreaterThan(
      1500,
    );
  });

  it("the build stamps itself — postbuild runs the stamp script", () => {
    const pkg = JSON.parse(read(PKG));
    expect(
      pkg.scripts?.postbuild,
      "frontend has no postbuild script. Cloudflare runs `npm run build`; without " +
        "postbuild nothing writes the marker, and the deploy check can never pass.",
    ).toBeTruthy();
    expect(
      pkg.scripts.postbuild,
      "postbuild no longer invokes stamp-build.mjs",
    ).toContain("stamp-build.mjs");
  });

  it("the stamp writes the same filename the check reads", () => {
    // Two literals in two files. This is the drift this guard exists for: if
    // they disagree the check fails as "marker absent" and points at
    // Cloudflare's build command, which would be the wrong place to look.
    const written = stampedFilename();
    const checked = checkedPath();
    expect(
      "/" + written,
      `stamp-build.mjs writes out/${written} but check-pages-deploy.mjs reads ${checked}`,
    ).toBe(checked);
  });

  it("the stamp writes the key the check reads, and records where the sha came from", () => {
    const stamp = code(read(STAMP));
    // `sha` is what the check compares; `source` is how a reader tells a real
    // Cloudflare deploy from a local build somebody uploaded.
    expect(stamp, "the marker no longer carries a `sha` field").toMatch(/\bsha\b\s*[,:]/);
    expect(stamp, "the marker no longer records its `source`").toMatch(/\bsource\b\s*[,:]/);
    // Assert the READ, not the bare token. The first cut of this used
    // `toContain("CF_PAGES_COMMIT_SHA")` and stayed GREEN when the injection
    // repointed `process.env.CF_PAGES_COMMIT_SHA` at a different variable —
    // because the string also appears as the `source:` label, so the token was
    // still "present" while nothing read it. That is not a pedantic miss: it
    // would pass a stamp that labels its marker "CF_PAGES_COMMIT_SHA" while
    // reading something else, i.e. a marker that lies about where its sha came
    // from. §19 Sub-pattern 16, in this guard's own assertion.
    expect(
      stamp,
      "the stamp no longer READS process.env.CF_PAGES_COMMIT_SHA — on Cloudflare " +
        "that is the only source of the deployed commit",
    ).toMatch(/process\.env\.CF_PAGES_COMMIT_SHA/);
  });

  it("the marker is never answered from a cache", () => {
    // Without this the check can pass on the PREVIOUS deploy — a green that
    // means nothing, which is worse than a red.
    //
    // Read LINE-WISE, never with an embedded "\n". The first cut of this
    // assertion searched for `marker + "\n"` and went red against a perfectly
    // correct _headers, because the file is CRLF on this machine and the rule
    // it was looking for was right there. §19 Sub-pattern 22 / §13.3 Item 268:
    // a matcher that lets line endings decide the outcome fails in the
    // direction that wastes a diagnosis on working code.
    const lines = read(HEADERS).split(/\r?\n/);
    const marker = checkedPath();
    const idx = lines.findIndex((l) => l.trim() === marker);
    expect(idx, `_headers has no rule for ${marker}`).toBeGreaterThan(-1);
    // A rule block is its path line followed by indented directives, ending at
    // the next unindented line.
    const directives: string[] = [];
    for (let i = idx + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) {
      directives.push(lines[i]);
    }
    expect(
      directives.join("\n"),
      `${marker} is in _headers but its rule does not say no-store, so the edge may ` +
        "serve a cached copy and the check could pass on the previous deploy",
    ).toMatch(/Cache-Control:.*no-store/);
  });

  it("the check never reports success on a state it could not read", () => {
    const check = code(read(CHECK));
    // Each distinct failure has its own exit code, because the remedies
    // differ; a single non-zero would send a reader to the wrong place.
    for (const c of [1, 2, 3, 4]) {
      expect(check, `exit code ${c} is no longer produced`).toMatch(
        new RegExp("fail\\(\\s*" + c + "\\s*,"),
      );
    }
    // The absent/unreachable/unparseable branches must not be able to return 0.
    expect(
      check.match(/return 0;/g)?.length ?? 0,
      "more than one success path — every other one must be justified, because a " +
        "second `return 0` is how 'could not tell' becomes 'deployed'",
    ).toBe(1);
  });

  it("CLAUDE.md tells the next session to run this instead of reading a job name", () => {
    // The rule is only useful if it is findable where the halt-card format is
    // defined — otherwise the next arc reaches for an Actions job again.
    const claude = read("CLAUDE.md");
    expect(
      claude,
      "CLAUDE.md does not mention check-pages-deploy.mjs, so nothing points the next " +
        "session at it",
    ).toContain("check-pages-deploy.mjs");
  });
});
