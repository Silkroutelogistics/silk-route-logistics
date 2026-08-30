/**
 * Serif WEIGHT and STYLE drift.
 *
 * WHY THIS EXISTS, AND WHY SEPARATELY FROM font-drift.js. That guard asserts the
 * FAMILY is one the skill names, and it held at zero violations while every
 * heading in the React app rendered Playfair at weight 600 in italic — both
 * explicitly forbidden. It was green because it was answering a different
 * question. The founder caught it by eye, from a screenshot.
 *
 *   A guard proves the property it asserts, not the property you meant.
 *
 * The skill (references/tokens.md §8):
 *   - Playfair Display: Regular 400, Bold 700 ONLY — no medium, no semibold.
 *     Italic permitted FOR TAGLINES.
 *   - Hero / page title: Playfair 700.  Section heads: Playfair 700.
 *   - The one sanctioned Playfair-italic pattern is the document tagline
 *     ("First Call…"), Playfair 400 italic, --gold-dark.
 *
 * Three checks:
 *   1. React serif elements carry no italic and no weight outside {400, 700}.
 *   2. Static CSS Playfair blocks carry no weight outside {400, 700}; italic
 *      blocks must be on the allowlist, each with the reason it is there.
 *   3. The LOADERS themselves request only sanctioned faces — so a re-added 600
 *      fails CI before any component can reach for it.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK: DM Sans weights.
 *
 * The skill allows DM Sans 400, 500 and 700 — not 600 — and both loaders
 * request 600. Roughly 1,077 elements use it (140 in static CSS, 937
 * font-semibold in React): it is the dominant UI weight in the product. A guard
 * that failed on it would be red from the moment it was written, and a guard
 * nobody can make green is one people learn to skip.
 *
 * So the gap is CHOSEN, not overlooked. It is on the post-launch register with
 * an owner and a trigger (Design, the Oct 2026 hire). When that lands, extend
 * scanReactSerif to the sans axis and delete this paragraph.
 *
 * Runnable:  node backend/scripts/serif-weight-drift.js
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO, "frontend", "src");
const PUBLIC_CSS = path.join(REPO, "frontend", "public", "shared", "css");
const LAYOUT = path.join(REPO, "frontend", "src", "app", "layout.tsx");
const INJECTOR = path.join(REPO, "frontend", "scripts", "inject-chrome.mjs");

/** Tailwind weight utilities that are NOT 400 or 700. */
/** Selectors that name a heading element or read as a heading class. */
const HEADINGISH =
  /(^|[\s,>+~])h[1-6]([\s,:.\[{]|$)|headline|heading|hero-title|page-title|section-title|\btitle\b/i;

const FORBIDDEN_WEIGHT_CLASSES = [
  "font-thin", "font-extralight", "font-light",
  "font-medium", "font-semibold", "font-extrabold", "font-black",
];

/**
 * Static CSS selectors permitted to carry italic Playfair, each with its reason.
 *
 * All five are HALTED for Wasi rather than fixed, and the distinction matters:
 * the two tagline blocks are not drift at all — CLAUDE.md §20.8.2 ratifies the
 * shimmer tagline as "Playfair italic bold", which CONTRADICTS the skill's
 * "Georgia italic, --gold-dark". Two canons disagree; resolving that is a
 * product decision, not a cleanup. The three editorial lines have no sanctioned
 * pattern covering them either way.
 *
 * Removing an entry here without fixing the block turns this guard red, which is
 * the intent: the halt cannot be forgotten quietly.
 */
const ITALIC_ALLOWLIST = {
  // Empty by design, and that is the ratified end state.
  //
  // The skill sanctions Playfair italic for exactly ONE pattern — the document
  // tagline ("First Call…"), Playfair 400 italic, --gold-dark — which lives in
  // the PDF chrome (backend/src/lib/srl-chrome.ts), not in web CSS. So zero
  // entries here is correct, not an oversight.
  //
  // Five blocks sat here as HALTED through v3.8.avj. All five resolved
  // 2026-08-30: the two "Where Trust Travels." taglines moved to the skill's
  // Georgia italic --gold-dark (superseding CLAUDE.md §20.8.2, which named a
  // Playfair 700 italic face the loader has never carried — what shipped was
  // synthesised, so nobody had ever approved its render), and the three
  // editorial italics no pattern covered moved to roman.
  //
  // Adding an entry here means claiming a NEW sanctioned italic pattern. Say
  // which pattern, and say HALTED if it is pending a decision.
};

/**
 * Static heading-class selectors permitted to carry Playfair 400, each with its
 * reason.
 *
 * WHY THIS EXISTS. 400 is a sanctioned Playfair weight, so the weight check
 * below passes it — and the skill's PATTERN for a section head is 700. That is
 * the identical distinction that let 46 React page titles render light while
 * this guard was green: legality of the weight is not the same question as the
 * pattern for the element. The React half learned it in v3.8.avj; the static
 * half was still blind, and proof-by-render caught it on the homepage.
 *
 * All four are HALTED rather than fixed. Three are live section heads on two
 * pages whose editorial register CLAUDE.md §20.6 records as ratified — the
 * homepage "full editorial register locked" (v3.8.aeq) and /track swept clean
 * (v3.8.amp). The skill says 700; a ratified page-lock has them at 400. Two
 * canons disagree, exactly as they do over the shimmer tagline, and resolving
 * it changes the weight of the headline on the most-reviewed brand surface
 * there is. That is Wasi's call, not a cleanup.
 */
const HEADING_WEIGHT_ALLOWLIST = {
  // Empty by design. Four blocks sat here as HALTED through v3.8.avj —
  // index.css .headline (four homepage section heads), track.css .hero h1,
  // track.css .explainer-text h2, and a dead contact.css copy. All resolved
  // 2026-08-30: the three live ones moved to 700 per the skill, and the dead
  // one was deleted (contact.html carries zero .headline elements).
  //
  // CLAUDE.md §20.6 recorded those pages' registers as locked at v3.8.aeq and
  // v3.8.amp. That supersession is dated in §20.6 itself: the skill is canon,
  // and the register captured a pre-skill state.
};

/**
 * Selectors that carry `font-style: italic` on an element which INHERITS
 * Playfair rather than declaring it, each with its reason.
 *
 * WHY A THIRD ALLOWLIST. The static check above only sees blocks that DECLARE
 * font-family, so `.hero h1 em { font-style: italic }` was invisible to it —
 * the em inherits Playfair from the page's `h1, h2, h3, h4` rule several hundred
 * lines earlier. Seven pages render Playfair italic that way and the guard
 * reported zero. Same blind spot as the weight axis (v3.8.avj) and the
 * heading-pattern axis, now a third time: the check answered a narrower question
 * than its name implied.
 *
 * Found by trying to prune the italic faces from the font link and asking what
 * still requests them. The prune is what forced the question.
 */
const INHERITED_ITALIC_ALLOWLIST = {
  // Empty, and that is the ratified end state.
  //
  // Seven .hero h1 em rules sat here as HALTED through v3.8.avm — the hero-title
  // emphasis device on every legal and content page. Resolved 2026-08-30
  // (v3.8.avn): roman, gold retained. The colour was always what carried the
  // emphasis; the slant was a browser-synthesised approximation of a face
  // neither loader has ever carried, so nobody had approved how it rendered.
  //
  // With this empty, NO element anywhere requests an italic Playfair face, which
  // is what finally permitted pruning ital from the Google Fonts link.
  //
  // An entry here claims a new sanctioned italic pattern. Say which, and say
  // HALTED if it is pending a decision.
};

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "out", "dist"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, exts, out);
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

/** 1. React serif elements. */
function scanReactSerif() {
  const violations = [];
  let elements = 0;
  for (const p of walkFiles(SRC, [".tsx"])) {
    if (/VersionFooter/.test(p)) continue;
    const rel = path.relative(REPO, p).split(path.sep).join("/");
    fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (!line.includes("font-serif")) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment, not an element
      const cls =
        (line.match(/className="([^"]*font-serif[^"]*)"/) || [])[1] ||
        (line.match(/className=\{`([^`]*font-serif[^`]*)`/) || [])[1];
      if (!cls) return;
      elements += 1;
      if (/\bitalic\b/.test(cls)) {
        violations.push({ file: rel, line: i + 1, problem: "italic on a serif element", cls });
      }
      for (const w of FORBIDDEN_WEIGHT_CLASSES) {
        if (new RegExp(`\\b${w}\\b`).test(cls)) {
          violations.push({ file: rel, line: i + 1, problem: `${w} — Playfair is 400 or 700 only`, cls });
        }
      }

      // A serif HEADING with no weight class renders 400, not bold: Tailwind's
      // preflight resets headings to `font-weight: inherit`, so they take the
      // body's 400 rather than the browser's default bold. The skill is explicit
      // that heroes, page titles and section heads are 700.
      //
      // This check was NOT in the first cut of this guard, which treated a
      // weightless heading as conformant on the reasoning that 400 is a
      // sanctioned Playfair weight. True, and the wrong test — 46 portal page
      // titles were rendering light. Legality of the weight is not the same
      // question as the pattern for the element.
      const tag = (line.match(/<([a-zA-Z][a-zA-Z0-9]*)/) || [])[1] || "";
      const isHeadingTag = /^h[1-6]$/i.test(tag);
      const declaresWeight = new RegExp(
        `\\bfont-(${["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"].join("|")})\\b`
      ).test(cls);
      if (isHeadingTag && !declaresWeight) {
        violations.push({
          file: rel, line: i + 1,
          problem: `<${tag}> serif heading declares no weight — renders 400 via Tailwind preflight; the skill specifies 700`,
          cls,
        });
      }
    });
  }
  return { violations, elements };
}

/** 2. Static CSS Playfair blocks. */
function scanStaticSerif() {
  const violations = [];
  let blocks = 0;
  const files = walkFiles(PUBLIC_CSS, [".css"]);

  // which local custom properties resolve to Playfair
  const tokens = new Set();
  for (const f of files) {
    const css = fs.readFileSync(f, "utf8");
    const re = /--([a-z0-9-]+)\s*:\s*([^;]*Playfair[^;]*);/gi;
    let m;
    while ((m = re.exec(css))) tokens.add(m[1]);
  }

  for (const f of files) {
    const rel = path.relative(REPO, f).split(path.sep).join("/");
    const css = fs.readFileSync(f, "utf8");
    for (const raw of css.split("}")) {
      if (!/font-family/.test(raw)) continue;
      const fam = (raw.match(/font-family\s*:\s*([^;]+)/i) || [])[1] || "";
      const isPlayfair =
        /Playfair/i.test(fam) || [...tokens].some((t) => fam.includes(`--${t}`));
      if (!isPlayfair) continue;
      blocks += 1;
      const sel = (raw.split("{")[0] || "").trim().split("\n").pop().trim();
      const w = (raw.match(/font-weight\s*:\s*([0-9]+)/i) || [])[1];
      const italic = /font-style\s*:\s*italic/i.test(raw);

      if (w && !["400", "700"].includes(w)) {
        violations.push({ file: rel, line: sel, problem: `font-weight ${w} — Playfair is 400 or 700 only`, cls: sel });
      }
      if (italic) {
        const key = Object.keys(ITALIC_ALLOWLIST).find((k) => sel.includes(k));
        if (!key) {
          violations.push({
            file: rel, line: sel,
            problem: "italic Playfair outside the tagline allowlist",
            cls: sel,
          });
        }
      }

      // A heading-class selector at an explicit 400. Legal weight, wrong pattern
      // — the skill puts heroes, page titles and section heads at 700. Static
      // pages get the browser's default bold when no weight is declared (no
      // Tailwind preflight here), so only an EXPLICIT 400 is a finding; that
      // keeps this at zero false positives.
      if (w === "400" && HEADINGISH.test(sel)) {
        const page = path.basename(rel, ".css");
        const key = Object.keys(HEADING_WEIGHT_ALLOWLIST).find(
          (k) => k.startsWith(page + " ") && sel.includes(k.slice(page.length + 1))
        );
        if (!key) {
          violations.push({
            file: rel, line: sel,
            problem: "heading-class selector at Playfair 400 — the skill puts section heads and page titles at 700",
            cls: sel,
          });
        }
      }
    }
  }
  return { violations, blocks };
}

/**
 * 2b. Italic applied to an element that INHERITS Playfair.
 *
 * A stylesheet whose global heading rule sets Playfair makes every h1-h4
 * descendant a Playfair element, so an italic on one of those is a Playfair
 * italic even though its own block names no family.
 */
function scanInheritedItalic() {
  const violations = [];
  let checked = 0;
  let filesScanned = 0;
  for (const f of walkFiles(PUBLIC_CSS, [".css"])) {
    const css = fs.readFileSync(f, "utf8");
    if (!/h1,\s*h2[^{]*\{[^}]*Playfair/i.test(css)) continue;
    filesScanned += 1;
    const base = path.basename(f);
    const rel = path.relative(REPO, f).split(path.sep).join("/");
    const lines = css.split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (!/font-style\s*:\s*italic/i.test(ln)) return;
      let sel = "";
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(/^\s*([^{}]+)\{/);
        if (m) { sel = m[1].trim(); break; }
      }
      if (!HEADINGISH.test(sel)) return;
      checked += 1;
      if (!INHERITED_ITALIC_ALLOWLIST[base + " " + sel]) {
        violations.push({
          file: rel,
          line: i + 1,
          problem: "italic on " + sel + " — inherits Playfair from this stylesheet global heading rule; the skill sanctions Playfair italic for taglines only",
          cls: sel,
        });
      }
    });
  }
  // filesScanned is the tripwire, not `checked`. Zero italic-on-heading hits
  // is the CORRECT state once the device is retired; zero FILES reached would
  // mean the scan had stopped working and was reporting clean for the wrong
  // reason — which is the exact failure this whole guard exists to prevent.
  return { violations, checked, filesScanned };
}

/** 3. The loaders themselves. */
function scanLoaders() {
  const violations = [];

  const layout = fs.readFileSync(LAYOUT, "utf8");
  const weights = layout.match(/Playfair_Display\([^)]*weight:\s*\[([^\]]*)\]/);
  const declared = weights
    ? weights[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean)
    : [];
  if (declared.length === 0) {
    violations.push({ file: "frontend/src/app/layout.tsx", line: "Playfair_Display", problem: "could not read the weight array — parser or config changed", cls: "" });
  }
  for (const w of declared) {
    if (!["400", "700"].includes(w)) {
      violations.push({
        file: "frontend/src/app/layout.tsx", line: "Playfair_Display",
        problem: `next/font requests Playfair ${w} — only 400 and 700 are sanctioned`,
        cls: declared.join(","),
      });
    }
  }

  const inj = fs.readFileSync(INJECTOR, "utf8");
  const seg = (inj.match(/Playfair\+Display:([^&"']*)/) || [])[1] || "";
  // roman faces appear as 0,<weight>
  for (const m of seg.matchAll(/0,(\d{3})/g)) {
    if (!["400", "700"].includes(m[1])) {
      violations.push({
        file: "frontend/scripts/inject-chrome.mjs", line: "Google Fonts link",
        problem: `static loader requests Playfair roman ${m[1]} — only 400 and 700 are sanctioned`,
        cls: seg,
      });
    }
  }
  if (!seg) {
    violations.push({ file: "frontend/scripts/inject-chrome.mjs", line: "Google Fonts link", problem: "no Playfair segment found — parser or link changed", cls: "" });
  }

  return { violations, declared, staticSegment: seg };
}

function scanSerifWeightDrift() {
  const react = scanReactSerif();
  const staticCss = scanStaticSerif();
  const inherited = scanInheritedItalic();
  const loaders = scanLoaders();
  return {
    violations: [...react.violations, ...staticCss.violations, ...inherited.violations, ...loaders.violations],
    stats: {
      reactElements: react.elements,
      staticBlocks: staticCss.blocks,
      nextFontWeights: loaders.declared,
      staticSegment: loaders.staticSegment,
      italicAllowlisted: Object.keys(ITALIC_ALLOWLIST).length,
      headingWeightAllowlisted: Object.keys(HEADING_WEIGHT_ALLOWLIST).length,
      inheritedItalicChecked: inherited.checked,
      inheritedItalicFilesScanned: inherited.filesScanned,
      inheritedItalicAllowlisted: Object.keys(INHERITED_ITALIC_ALLOWLIST).length,
    },
    allowlist: ITALIC_ALLOWLIST,
    headingAllowlist: HEADING_WEIGHT_ALLOWLIST,
    inheritedItalicAllowlist: INHERITED_ITALIC_ALLOWLIST,
  };
}

module.exports = { scanSerifWeightDrift, ITALIC_ALLOWLIST, HEADING_WEIGHT_ALLOWLIST, INHERITED_ITALIC_ALLOWLIST };

if (require.main === module) {
  const { violations, stats } = scanSerifWeightDrift();
  console.log(`react serif elements: ${stats.reactElements}`);
  console.log(`static Playfair blocks: ${stats.staticBlocks}`);
  console.log(`next/font Playfair weights: [${stats.nextFontWeights.join(", ")}]`);
  console.log(`static loader segment: ${stats.staticSegment}`);
  console.log(`italic blocks allowlisted (halted): ${stats.italicAllowlisted}`);
  console.log(`heading-weight blocks allowlisted (halted): ${stats.headingWeightAllowlisted}`);
  console.log(`inherited-Playfair italic scan: ${stats.inheritedItalicFilesScanned} stylesheets reached, ${stats.inheritedItalicChecked} italic heading(s), ${stats.inheritedItalicAllowlisted} halted`);
  if (violations.length === 0) {
    console.log("\nNo serif weight/style drift.");
    process.exit(0);
  }
  console.log(`\n${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.log(`  ${v.file}  [${v.line}]`);
    console.log(`      ${v.problem}`);
    if (v.cls) console.log(`      ${String(v.cls).slice(0, 110)}`);
  }
  process.exit(1);
}
