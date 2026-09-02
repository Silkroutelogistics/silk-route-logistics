/**
 * TYPOGRAPHY GUARD — the brand font must reach every surface, and no new
 * hardcoded family may be introduced outside the token layer.
 *
 * Why this exists. Playfair Display was downloaded on all 114 React routes and
 * rendered on none of them, for months. The cause was a one-word naming error:
 * `globals.css` declared `--font-family-serif` inside Tailwind v4's `@theme`,
 * where the font namespace is `--font-*`. No utility was generated, Tailwind's
 * stock stacks survived, and every `font-serif` heading in all four portals and
 * every login screen rendered Georgia. Nothing failed. tsc was clean, the build
 * was clean, CI was green. The marketing site rendered Playfair correctly, so
 * the homepage looked right and nobody looked further.
 *
 * That class of failure is silent by construction, which is why it needs a
 * guard rather than a fix. Full account: docs/internal/typography-audit.md.
 *
 * Two halves:
 *   1. The token contract — the theme keys exist under the names Tailwind reads,
 *      carry the brand families, and reach every route through the root layout.
 *   2. The drift lint — no font-family naming a family the skill does not name.
 *
 * Both are injection-verified in the audit's close-out: removing the theme key
 * turns half 1 red, and adding a hardcoded family turns half 2 red.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const { scanFontDrift: runFontDrift, readCanon } = require("../../../scripts/font-drift.js");
const { scanSerifWeightDrift: runSerifWeightDrift } = require("../../../scripts/serif-weight-drift.js");

/**
 * Both scanners walk the whole repo, and between them the cases below called
 * them SEVEN times — twice for font drift, five for serif weight. Each walk
 * costs ~750ms in isolation and far more under the parallel load of the full
 * suite, so once the suite grew past ~1,560 tests these cases began exceeding
 * vitest's default 5s timeout and failed intermittently, naming a different
 * case each run. Nothing in the tree changes between cases within a run, so one
 * walk each is the identical answer for a seventh of the cost.
 *
 * Memoised rather than given a longer timeout on purpose: a raised timeout
 * hides the cost and lets it grow again the next time the suite does. This
 * removes it. What the cases assert is untouched.
 */
let fontDriftCache: any = null;
const scanFontDrift = () => (fontDriftCache ??= runFontDrift());
let serifDriftCache: any = null;
const scanSerifWeightDrift = () => (serifDriftCache ??= runSerifWeightDrift());

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const GLOBALS = path.join(REPO, "frontend", "src", "app", "globals.css");
const ROOT_LAYOUT = path.join(REPO, "frontend", "src", "app", "layout.tsx");
const INJECTOR = path.join(REPO, "frontend", "scripts", "inject-chrome.mjs");
const APP_DIR = path.join(REPO, "frontend", "src", "app");
const OUT_DIR = path.join(REPO, "frontend", "out");

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("typography guard — the token contract", () => {
  it("the font canon is readable from the skill, and is the brand's", () => {
    const canon: Set<string> = readCanon();
    // Tripwire: a parser that returns nothing would make every later check vacuous.
    expect(canon.size).toBeGreaterThan(0);
    expect(canon.has("playfair display")).toBe(true);
    expect(canon.has("dm sans")).toBe(true);
  });

  it("globals.css declares the font keys under the names Tailwind v4 actually reads", () => {
    const css = read(GLOBALS);

    // The exact defect: --font-family-* matches no Tailwind namespace and
    // silently generates nothing. It must never come back.
    expect(css).not.toMatch(/--font-family-(serif|sans|mono)\s*:/);

    // Tailwind v4 derives font-serif / font-sans / font-mono from --font-*.
    expect(css).toMatch(/--font-serif\s*:/);
    expect(css).toMatch(/--font-sans\s*:/);
    expect(css).toMatch(/--font-mono\s*:/);
  });

  it("those keys carry the brand faces, not a stock stack", () => {
    const css = read(GLOBALS);
    const serif = css.match(/--font-serif\s*:\s*([^;]+);/)?.[1] ?? "";
    const sans = css.match(/--font-sans\s*:\s*([^;]+);/)?.[1] ?? "";
    const mono = css.match(/--font-mono\s*:\s*([^;]+);/)?.[1] ?? "";

    expect(serif).toContain("--font-playfair");
    expect(sans).toContain("--font-dm-sans");
    expect(mono.toLowerCase()).toContain("sf mono");

    // A stock stack in first position is the bug wearing the right variable name.
    expect(serif.trim()).not.toMatch(/^ui-serif/);
    expect(sans.trim()).not.toMatch(/^ui-sans-serif/);
  });

  it("the font variables sit on <html>, where :root can see them", () => {
    const layout = read(ROOT_LAYOUT);
    expect(layout).toMatch(/next\/font\/google/);
    expect(layout).toMatch(/variable:\s*["']--font-dm-sans["']/);
    expect(layout).toMatch(/variable:\s*["']--font-playfair["']/);

    // This assertion exists because the first version of this guard did NOT make
    // it, and passed while every heading in production was still wrong.
    //
    // Tailwind's @theme declares --font-serif on :root as `var(--font-playfair), …`.
    // A var() inside a custom property is substituted where that property is
    // DECLARED, not where it is used. With the font variables on <body>,
    // --font-playfair was undefined at :root, so --font-serif resolved to the
    // guaranteed-invalid value and inherited as invalid — and every font-serif
    // heading fell back to the body face. The compiled CSS was correct throughout;
    // only a browser could see it. Hence: on <html>, not merely somewhere.
    // Match the JSX element, not the word "<html>" in a comment. The first cut of
    // this matched the prose above the element and failed on correct code.
    const src = layout.replace(/^\s*\/\/.*$/gm, "");
    const html = src.match(/<html\s+lang=[^>]*>/)?.[0] ?? "";
    expect(html, "<html> must carry the next/font .variable classes so :root sees them")
      .toContain(".variable");
    expect(html).toContain("dmSans.variable");
    expect(html).toContain("playfair.variable");

    // The body face is what every route inherits as its base font.
    const body = layout.match(/<body[^>]*className=\{[^}]*\}/)?.[0] ?? "";
    expect(body).toContain(".className");
  });

  it("no nested layout overrides the inherited font — new routes inherit or this fails", () => {
    const layouts: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "layout.tsx" && p !== ROOT_LAYOUT) layouts.push(p);
      }
    };
    walk(APP_DIR);

    // Tripwire: this project has six nested layouts. Zero would mean the walk
    // broke and the assertion below proved nothing.
    expect(layouts.length).toBeGreaterThanOrEqual(6);

    for (const l of layouts) {
      const src = read(l);
      const rel = path.relative(REPO, l).replace(/\\/g, "/");
      // A nested layout may not re-declare a family. It inherits, or it drifts.
      expect(
        /font-family|fontFamily/.test(src),
        `${rel} declares its own font-family; nested layouts must inherit from the root layout`
      ).toBe(false);
    }
  });

  it("the chrome injector ships the font link and the token stylesheet to static pages", () => {
    const src = read(INJECTOR);
    expect(src).toContain("fonts.googleapis.com/css2");
    expect(src).toContain("Playfair+Display");
    expect(src).toContain("DM+Sans");
    expect(src).toContain("/shared/css/srl-tokens.css");
  });
});

describe("typography guard — the built output", () => {
  // The backend CI job does not build the frontend, so these run wherever a build
  // exists (locally, and in the frontend job) and report their own reach rather
  // than passing silently on an absent artifact.
  const built = fs.existsSync(OUT_DIR);

  it("reports whether a build was available to check", () => {
    if (!built) {
      console.warn(
        "[typography guard] frontend/out/ absent — built-output assertions skipped. " +
        "Source-contract assertions above still ran and are the CI-resident gate."
      );
    }
    expect(true).toBe(true);
  });

  it.skipIf(!built)("the compiled CSS resolves font-serif to Playfair, not Georgia", () => {
    const cssDir = path.join(OUT_DIR, "_next", "static", "css");
    const files = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"));
    expect(files.length).toBeGreaterThan(0);

    const all = files.map((f) => read(path.join(cssDir, f))).join("\n");

    // The retired names must be gone from the artifact, not merely from source.
    expect(all).not.toContain("--font-family-serif");

    const serif = all.match(/--font-serif:([^;}]+)/)?.[1] ?? "";
    expect(serif).toContain("--font-playfair");
    expect(all).toMatch(/\.font-serif\{font-family:var\(--font-serif\)\}/);
  });

  it.skipIf(!built)("every exported static page carries the font link and token stylesheet", () => {
    const pages = fs
      .readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".html") && !["404.html"].includes(f));

    // Tripwire: an empty page list would make the loop below assert nothing.
    expect(pages.length).toBeGreaterThanOrEqual(10);

    const missing: string[] = [];
    for (const p of pages) {
      const html = read(path.join(OUT_DIR, p));
      // React-exported pages self-host via next/font and carry no link — correct.
      if (html.includes("__className_")) continue;
      if (!html.includes("fonts.googleapis.com/css2") || !html.includes("srl-tokens.css")) {
        missing.push(p);
      }
    }
    expect(missing, `static pages exported without the brand font chain: ${missing.join(", ")}`)
      .toEqual([]);
  });
});

describe("typography guard — the drift lint", () => {
  it("no font-family names a family the brand skill does not name", () => {
    const { violations, stats } = scanFontDrift();

    // Tripwire: if the scan stops reaching files, "no violations" means nothing.
    expect(stats.files).toBeGreaterThan(300);
    expect(stats.declarations).toBeGreaterThan(100);

    const report = violations
      .map((v: any) => `  ${v.file}:${v.line} -> ${v.family}\n      ${v.text}`)
      .join("\n");

    expect(
      violations.length,
      violations.length === 0
        ? ""
        : `\n${violations.length} non-canonical font declaration(s). Use a token ` +
          `(var(--font-body) / var(--font-display)) or a family the srl-brand-design ` +
          `skill names. If a file is genuinely exempt, add it to ALLOWLIST in ` +
          `backend/scripts/font-drift.js WITH the reason.\n\n${report}\n`
    ).toBe(0);
  });

  it("no serif element carries a forbidden weight or an unsanctioned italic", () => {
    // This is the check that did NOT exist while every heading in the React app
    // rendered Playfair at 600 in italic. The family guard above was green
    // throughout, because it asserts the family and nothing else. A guard proves
    // the property it asserts, not the property you meant.
    const { violations, stats } = scanSerifWeightDrift();

    // Tripwires: a scan that stopped reaching files would make "no violations"
    // meaningless in exactly the way this whole guard exists to prevent.
    expect(stats.reactElements).toBeGreaterThan(50);
    expect(stats.staticBlocks).toBeGreaterThan(50);

    const report = violations
      .map((v: any) => `  ${v.file} [${v.line}]\n      ${v.problem}`)
      .join("\n");
    expect(
      violations.length,
      violations.length === 0
        ? ""
        : `\n${violations.length} serif weight/style violation(s). Playfair is 400 or ` +
          `700 only, and italic is sanctioned solely for the document-tagline ` +
          `pattern. Fix the element, or — if a static block is a genuine ` +
          `exception — add its selector to ITALIC_ALLOWLIST in ` +
          `backend/scripts/serif-weight-drift.js WITH the reason.\n\n${report}\n`
    ).toBe(0);
  });

  it("the loaders request only the sanctioned Playfair faces", () => {
    // Pinned here so a re-added 500 or 600 fails CI before any component can
    // reach for it — the loader is upstream of every element that could use it.
    const { stats } = scanSerifWeightDrift();
    expect(stats.nextFontWeights.sort()).toEqual(["400", "700"]);
    expect(stats.staticSegment).not.toMatch(/0,500/);
    expect(stats.staticSegment).not.toMatch(/0,600/);
  });

  it("any allowlisted italic states why — and empty is the ratified end state", () => {
    // Five blocks sat here as HALTED through v3.8.avj; all five resolved
    // 2026-08-30. Empty is correct: the skill sanctions Playfair italic for
    // exactly one pattern, the document tagline, and that lives in the PDF
    // chrome rather than web CSS. So this asserts the SHAPE of any future
    // entry rather than requiring one to exist.
    const { allowlist } = scanSerifWeightDrift();
    for (const [sel, reason] of Object.entries(allowlist as Record<string, string>)) {
      expect(reason.length, `${sel} is allowlisted without a real reason`).toBeGreaterThan(40);
      expect(reason, `${sel} must say it is halted, not merely tolerated`).toMatch(/HALTED/);
    }
  });

  it("every halted heading-weight block states why it is halted", () => {
    // 400 is a legal Playfair weight, so the weight check above passes these —
    // and the skill's pattern for a section head is 700. That gap is how 46
    // React page titles rendered light while this guard was green (v3.8.avj),
    // and the static layer had the same blind spot until proof-by-render found
    // four section heads at 400 on the homepage and /track.
    const { headingAllowlist } = scanSerifWeightDrift();
    const entries = Object.entries(headingAllowlist as Record<string, string>);
    for (const [sel, reason] of entries) {
      expect(reason.length, `${sel} is allowlisted without a real reason`).toBeGreaterThan(40);
      expect(reason, `${sel} must say it is halted or dead, not merely tolerated`)
        .toMatch(/HALTED|DEAD/);
    }
  });

  it("the heading-selector regex actually matches a bare heading tag", () => {
    // This assertion exists because the regex it guards was BROKEN when written
    // and nothing noticed. Inserted through a JS string, its backslashes were
    // eaten: it read /(^|[s,>+~])h[1-6].../ rather than [\\s,>+~], so the
    // h1-h6 branch never matched. Both injections that "verified" it happened to
    // use selectors containing the literal words "headline" and "title", which
    // matched a different alternative — so the guard passed for the wrong reason
    // and seven Playfair italics stayed invisible.
    //
    // A selector that can ONLY match via the character-class branch.
    const { INHERITED_ITALIC_ALLOWLIST } = require("../../../scripts/serif-weight-drift.js");
    expect(INHERITED_ITALIC_ALLOWLIST).toBeTruthy();
    const src = fs.readFileSync(
      path.join(REPO, "backend", "scripts", "serif-weight-drift.js"), "utf8"
    );
    const m = src.match(/const HEADINGISH =\s*(\/.*\/i);/);
    expect(m, "HEADINGISH must be a readable regex literal").toBeTruthy();
    // eslint-disable-next-line no-eval
    const re: RegExp = eval(m![1]);
    expect(re.test(".promo-band h3"), "must match a bare heading tag").toBe(true);
    expect(re.test(".hero h1 em"), "must match a heading with a descendant").toBe(true);
    expect(re.test(".ops-chip-tagline"), "must NOT match a non-heading").toBe(false);
  });

  it("any halted inherited-Playfair italic states why, and the scan reaches files", () => {
    const { inheritedItalicAllowlist, stats } = scanSerifWeightDrift();
    // The tripwire is FILES REACHED, not italics found.
    //
    // Seven .hero h1 em rules were halted here through v3.8.avm and resolved in
    // v3.8.avn — roman, gold retained — so zero italic headings is now the
    // CORRECT state. Asserting on the hit count would fail for the right outcome.
    // Zero FILES reached is the thing that must never pass silently: that is the
    // scan having stopped working while reporting clean, which is the exact
    // failure this guard exists to catch.
    expect(stats.inheritedItalicFilesScanned).toBeGreaterThan(0);
    expect(stats.inheritedItalicChecked).toBe(0);
    for (const [sel, reason] of Object.entries(inheritedItalicAllowlist as Record<string, string>)) {
      expect(reason.length, `${sel} is allowlisted without a real reason`).toBeGreaterThan(40);
      expect(reason, `${sel} must say it is halted`).toMatch(/HALTED/);
    }
  });

  it("the allowlist is reasoned, not a dumping ground", () => {
    const { allowlist } = scanFontDrift();
    for (const [file, reason] of Object.entries(allowlist as Record<string, string>)) {
      expect(reason.length, `${file} is allowlisted without a real reason`).toBeGreaterThan(30);
    }
  });
});
