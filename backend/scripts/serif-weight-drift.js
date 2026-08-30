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
  ".srl-tagline":
    "HALTED — 'Where Trust Travels.' shimmer. CLAUDE.md §20.8.2 ratifies Playfair italic bold; the skill says Georgia italic --gold-dark. Cross-canonical conflict, Wasi's call.",
  ".ops-chip-tagline":
    "HALTED — same shimmer treatment at 13px on /shippers. Same conflict.",
  ".commitment-teaser":
    "HALTED — editorial teaser line on /carriers. No sanctioned pattern covers an editorial italic; taste call.",
  ".tms-result":
    "HALTED — editorial result line on /. Same class of taste call.",
  ".heritage-line":
    "HALTED — editorial heritage line on /shippers. Same class of taste call.",
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
    }
  }
  return { violations, blocks };
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
  const loaders = scanLoaders();
  return {
    violations: [...react.violations, ...staticCss.violations, ...loaders.violations],
    stats: {
      reactElements: react.elements,
      staticBlocks: staticCss.blocks,
      nextFontWeights: loaders.declared,
      staticSegment: loaders.staticSegment,
      italicAllowlisted: Object.keys(ITALIC_ALLOWLIST).length,
    },
    allowlist: ITALIC_ALLOWLIST,
  };
}

module.exports = { scanSerifWeightDrift, ITALIC_ALLOWLIST };

if (require.main === module) {
  const { violations, stats } = scanSerifWeightDrift();
  console.log(`react serif elements: ${stats.reactElements}`);
  console.log(`static Playfair blocks: ${stats.staticBlocks}`);
  console.log(`next/font Playfair weights: [${stats.nextFontWeights.join(", ")}]`);
  console.log(`static loader segment: ${stats.staticSegment}`);
  console.log(`italic blocks allowlisted (halted): ${stats.italicAllowlisted}`);
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
