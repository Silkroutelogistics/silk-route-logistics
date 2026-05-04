/**
 * audit-brand-conformance.ts — Static-code scanner for SRL brand-token
 * drift and surface-mode readability failures.
 *
 * Run from repo root or backend/:
 *   cd backend && npx ts-node scripts/audit-brand-conformance.ts
 *
 * Output: markdown report to stdout AND written to
 *   docs/audit-reports/brand-conformance-<ISO-stamp>.md
 *
 * Three passes (v1, 2026-05-03):
 *
 *   Pass 1 — Color literal violations.
 *            Hex literals, rgb()/rgba(), hsl()/hsla(), Tailwind
 *            color utility classes. Compared against canonical
 *            whitelist extracted from
 *            .claude/skills/srl-brand-design/references/tokens.md
 *            and the LEGACY-ALLOWED set explicitly retained per
 *            CLAUDE.md §2.1 (themes.css legacy navy #0D1B2A,
 *            IconTabs dark gold #854F0B, AE Console dark surfaces,
 *            portal canvas #faf9f7).
 *
 *   Pass 2 — Font-family violations.
 *            Non-canonical primary fonts in font-family
 *            declarations and @font-face. Canonical: Playfair
 *            Display (display), DM Sans (body), Georgia (tagline
 *            only), SF Mono (mono).
 *
 *   Pass 3 — Surface-mode contrast violations (MANDATORY in v1).
 *            For each (background-setting selector, child-color
 *            setting selector) pair in the same stylesheet,
 *            compute WCAG relative-luminance contrast ratio.
 *            Catches the /about footer invisible-text class and
 *            the /track navy-on-navy class that screenshots
 *            surfaced 2026-05-03.
 *            <3:1 = P0, 3:1-4.5:1 = P1, >=4.5:1 = pass.
 *
 * Heuristic, not AST. False positives expected. Every finding is
 * a CANDIDATE for manual review, not an automated fix.
 *
 * Triage note: drift detected alone doesn't classify severity.
 * Pass 3 contrast violations <3:1 are P0 (readability failure).
 * Pass 1 / Pass 2 token-drift defaults to P1. Comment-block
 * hex values + canonical hex literals (token-discipline drift,
 * not broken-color drift) classify as P2 informational. Cross-
 * check P1 findings against site-chrome.json — one source-of-
 * truth edit may resolve dozens of downstream findings.
 *
 * Revision log:
 *
 *   v1 (2026-05-03) — initial release with three passes (color
 *           literals, font families, surface-mode contrast).
 *           Documented in Sprint 2 directive.
 *
 *   v2 (2026-05-03) — alpha-overlay handling. Sprint 3 spot-check
 *           confirmed 3 of 5 v1 P0 findings were alpha artifacts
 *           (e.g. `rgba(255,255,255,0.05)` overlay in
 *           `.sidebar-nav a:hover` reported as 1.00:1 white-on-
 *           white when the real rendering composites to ~12:1
 *           white-on-slightly-lifted-navy). v1 stripped alpha and
 *           treated `rgba(R,G,B,α)` as solid `#RRGGBB` for
 *           contrast math; v2 preserves alpha through
 *           `resolveColor()`, then in Pass 3 finds the nearest
 *           opaque ancestor bg and applies standard sRGB
 *           composition (`composited.C = α × overlay.C +
 *           (1 − α) × parent.C`) before computing the contrast
 *           ratio. Same fix applied to fg-with-alpha (rare).
 *           Cascade-inheritance branch also composites the
 *           overlay before checking dark-surface luminance, so
 *           e.g. `rgba(239,68,68,0.10)` over white doesn't
 *           trigger as "dark bg" anymore. Pass 3 summary now
 *           reports `compositedCount` so the operator can see
 *           how many findings benefited from the new logic.
 *
 *           New helpers:
 *             - compositeAlpha(overlayHex, alpha, parentHex)
 *             - findOpaqueParentBg(child, bgRules, fileBodyBg,
 *               globalBodyBg)
 *             - findCascadeBg / buildGlobalCascadeBg (mirror of
 *               the existing color-cascade walkers, for body bg)
 *
 *           Behavior delta: v1 P0 contrast count drops sharply
 *           because the alpha-overlay class is no longer
 *           misclassified. Real readability failures (e.g. solid
 *           gold-on-white .btn-primary, marketing footer cascade)
 *           survive into v2. Sprint 5 P0 sweep is the operational
 *           consumer of v2's reduced output.
 *
 *   v3 (2026-05-04) — three cascade fixes that eliminate the
 *           ~80–100 false-positive class surfaced by the Sprint 5
 *           re-run. Targets:
 *
 *           Fix 1 — Pseudo-class rule cascading. v2's
 *           `isDescendantSelector` returned false for `.X:hover`
 *           vs `.X` (the `:` next-char failed the `[space,>,+,~]`
 *           check), so cascade-inherit walker treated pseudo
 *           rules as standalone — missing the base rule's color:
 *           that browsers cascade through per CSS specificity.
 *           v3 adds `stripPseudoSuffix` + `getAllBaseSelectors`
 *           and extends the cascade-inherit walker's
 *           `hasExplicitColor` check to ALSO consider base
 *           selectors. When base has explicit color, the
 *           pseudo-class rule is treated as having that
 *           inherited color → cascade-inherit finding skipped.
 *
 *           Fix 2 — Multi-mode token resolution. v2's
 *           `buildVarMap` swept all `--token: value;` lines
 *           regardless of selector context, so vars defined
 *           in `[data-mode="dark"]` blocks would overwrite
 *           default-mode values when the dark declaration
 *           appeared later in the file. Defaults like
 *           `--theme-text-heading: #FFFFFF` (dark mode)
 *           leaked into rules like `.export-card h3 { color:
 *           var(--theme-text-heading, #0d1b2a) }` producing
 *           white-on-white false positives. v3 adds
 *           `findDarkModeSkipRanges` (brace-counting walker)
 *           and modifies `buildVarMap` to skip declarations
 *           whose offset falls inside a dark-mode block.
 *           Default-mode rendering is what the scanner
 *           targets (no `data-mode` attribute set on the html
 *           element on silkroutelogistics.ai's public pages),
 *           so dark-mode values shouldn't influence the
 *           resolution.
 *
 *           Fix 3 — HTML cascade hints. v2's `findOpaqueParentBg`
 *           walked `bgRules` ancestors via CSS-selector descent
 *           only. Selectors like `.sidebar-nav` aren't recognized
 *           as descendants of `.sidebar` even though HTML nests
 *           them (`<aside class="sidebar"><nav class="sidebar-
 *           nav">`), so alpha overlays composited over the body
 *           bg fallback instead of the true opaque ancestor.
 *           v3 adds `HTML_CASCADE_HINTS` covering documented
 *           nesting patterns (`.sidebar-` inside `.sidebar`,
 *           `.modal-` inside `.modal`, `.card-` inside `.card`,
 *           `.notif-` inside `.notif-list`, `.action-item-` inside
 *           `.action-list`, `.badge-` inside `.card`, etc.) and
 *           consults them when CSS-selector descent finds no
 *           opaque ancestor. Hint lookup is a fallback — CSS
 *           descent runs first per directive priority.
 *           findOpaqueParentBg now returns a richer
 *           `OpaqueParentResult` with source tag (`css-descent` /
 *           `html-hint` / `file-body` / `global-body` / `default-
 *           white`) for finding-output trail.
 *
 *           Behavior delta: P0 contrast count drops sharply
 *           because the three known false-positive classes are
 *           eliminated. Remaining P0s are real readability
 *           issues — input for Sprint 7 fix sweep.
 *
 *   v4 (2026-05-04) — cross-file bgRules merging. v3's HTML
 *           cascade hints (and CSS-selector descent) only searched
 *           same-file bgRules, so themed selectors in themes.css
 *           (`html[data-mode="dark"] .sidebar-nav a:hover`) couldn't
 *           resolve their opaque parent bg because the parent rule
 *           (`.sidebar { background: var(--theme-sidebar-bg) }`)
 *           lives in console.css. The HTML hint correctly identified
 *           `.sidebar` as the parent class but the same-file lookup
 *           returned no match.
 *
 *           v4 builds a global bgRules index across all CSS files at
 *           Pass 3 startup (`buildGlobalBgRules`) with file
 *           attribution. `findOpaqueParentBg` extends to a 5-tier
 *           lookup chain:
 *             Tier 1 — same-file CSS-selector descent (existing)
 *             Tier 2 — same-file HTML cascade hint (existing)
 *             Tier 3 — global CSS-selector descent (NEW)
 *             Tier 4 — global HTML cascade hint (NEW)
 *             Tier 5 — body bg fallback chain (existing)
 *
 *           Same-file priority preserved so per-file overrides win
 *           when present (per directive confirmation #4). Mode-prefix
 *           stripping applied on both sides of the global match
 *           (`stripModePrefix`) so themed variants resolve to the
 *           canonical parent class regardless of `[data-mode="X"]` /
 *           `[data-theme="X"]` prefix presence.
 *
 *           Ambiguous global matches (multiple files defining the
 *           same selector — e.g., `.sidebar` in console.css and
 *           carrier-console.css with potentially different bg
 *           values) take first-match-wins per directive
 *           confirmation #1, with `ambiguousMatches` count
 *           surfaced in finding-output trail for human triage.
 *
 *           OpaqueParentResult source enum extended with
 *           `global-css-descent` and `global-html-hint`. Trail
 *           additions: `viaFile` for global hits, `ambiguousMatches`
 *           when applicable.
 *
 *           Behavior delta: themed-selector false positives
 *           eliminated when the parent class has an opaque bg rule
 *           anywhere in scope. Pass 3 summary surfaces
 *           `globalMatchCount` and `ambiguousGlobalCount` for
 *           operator visibility.
 *
 * v5 candidates deferred from this scope:
 *   - Tailwind class resolution on .tsx React components (the
 *     Lead Hunter / dashboard modal class of contrast issues
 *     where bg + color come from utility classes, not CSS rules)
 *   - full HTML-DOM cascade resolution (v3's hardcoded hint table
 *     covers documented patterns; v5 would parse HTML files to
 *     build a class-containment graph for arbitrary nesting)
 *   - @media query rules
 *   - pseudo-element styling (::before, ::after)
 *   - CSS-in-JS dynamic styles
 *   - PDF template colors (backend/src/services/pdfService.ts) —
 *     out of frontend scope per Sprint 2 directive
 *   - orphan-CSS detection (Sprint 3 spot-check 2 found
 *     `tracking.css` is dead code post-v3.8.q routing
 *     consolidation — scanner doesn't yet flag CSS files with
 *     zero HTML/TSX consumers)
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../..");
const FRONTEND_PUBLIC = path.join(REPO_ROOT, "frontend/public");
const FRONTEND_SRC = path.join(REPO_ROOT, "frontend/src");
const SITE_CHROME_JSON = path.join(REPO_ROOT, "frontend/src/lib/site-chrome.json");
const REPORT_DIR = path.join(REPO_ROOT, "docs/audit-reports");

// Canonical hex set — all values from tokens.md normalized to UPPERCASE.
const CANONICAL_HEX: Set<string> = new Set([
  // Navy 10-stop
  "#061629", "#0A2540", "#15365A", "#234A73", "#355E8A",
  "#5B7EA3", "#8AA5C0", "#BECEDE", "#E2EAF2",
  // Gold 4-stop
  "#C5A572", "#BA7517", "#DAC39C", "#FAEEDA",
  // Cream/surface (white serves as print canvas + web card elevation)
  "#FBF7F0", "#F5EEE0", "#EFE6D3", "#FFFFFF",
  // Foreground (--fg-1 #0A2540 already in navy set; --fg-on-navy #FBF7F0 in cream set)
  "#3A4A5F", "#6B7685", "#A7AEB8", "#C9D2DE",
  // Status pairs
  "#2F7A4F", "#E6F0E9", "#B07A1A", "#FBEFD4",
  "#9B2C2C", "#F6E3E3", "#2A5B8B",
  // Black is allowed for text shadow / pure-black contexts only — leaving
  // out so it surfaces; reviewer can suppress per-case.
]);

// LEGACY-ALLOWED — explicitly retained per CLAUDE.md §2.1 LEGACY block.
// Listed here so they don't pollute Pass 1 P1 noise. Migration to
// canonical tokens is tracked separately under Phase 6 — Theme System
// Cleanup.
const LEGACY_ALLOWED_HEX: Set<string> = new Set([
  "#0D1B2A",  // themes.css light-default navy (CLAUDE.md §2.1)
  "#854F0B",  // IconTabs + ContactsPanel dark gold (§2.1)
  "#0F1117", "#1A1A2E", "#0A1220",  // AE Console dark surfaces
  "#FAF9F7",  // portal canvas
  "#1A2D45",  // doc-header gradient stop (paired with #0D1B2A)
  "#C8A951", "#C8963E", "#B8862E", "#8B7535", "#B8963E",  // legacy gold
  "#F0F4F8", "#7A9BB8", "#8A9DB0",  // doc-header text
  "#0F1E30",  // login-dropdown legacy
]);

// rgba()/hsla() base-color triples (R,G,B) that are canonical regardless
// of alpha. Stored as comma-joined triples (whitespace-collapsed).
const CANONICAL_RGBA_BASES: Set<string> = new Set([
  "10,37,64",      // navy --bg-navy (#0A2540)
  "251,247,240",   // cream --fg-on-navy (#FBF7F0)
  "197,165,114",   // gold focus ring (#C5A572)
]);

// Canonical font primary names (the FIRST entry in font-family stacks).
const CANONICAL_FONTS: Set<string> = new Set([
  "Playfair Display",
  "DM Sans",
  "Georgia",
  "SF Mono",
]);

// Legitimate fallback names that may appear after the canonical primary
// in a font-family stack. Not flagged.
const FALLBACK_FONTS: Set<string> = new Set([
  "-apple-system", "BlinkMacSystemFont", "system-ui",
  "sans-serif", "serif", "monospace", "ui-sans-serif", "ui-serif",
  "ui-monospace", "Times New Roman", "Times", "Menlo", "Consolas",
  "Courier New", "Courier", "Helvetica", "Arial",
  "Lucide", // icon font
]);

// Tailwind palette names that are NOT canonical SRL — flag any utility
// class that uses these prefixes.
const NON_CANONICAL_TW_PALETTES: Set<string> = new Set([
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
  "fuchsia", "pink", "rose",
  "black", "white",  // utility variants like bg-black/50 are still flagged
]);

// Tailwind color utility class regex.
// Matches: bg-{palette}-{shade}, text-{palette}-{shade}, etc.
const TW_COLOR_CLASS_RE =
  /\b(bg|text|border|fill|stroke|ring|outline|divide|placeholder|caret|accent|from|via|to)-([a-z]+)(?:-([0-9]{2,3}))?(?:\/[0-9]+)?\b/g;

// ─── Shared helpers ────────────────────────────────────────────────────

function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(full);
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  return out;
}

function readFile(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function relPath(file: string): string {
  return path.relative(REPO_ROOT, file).replace(/\\/g, "/");
}

function normHex(hex: string): string {
  // Normalize to #RRGGBB uppercase. Accepts #RGB, #RRGGBB, #RRGGBBAA.
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (h.length === 8) {
    // Drop alpha for canonical comparison.
    return `#${h.slice(0, 6)}`.toUpperCase();
  }
  return `#${h}`.toUpperCase();
}

function isCanonicalHex(hex: string): boolean {
  return CANONICAL_HEX.has(normHex(hex));
}

function isLegacyHex(hex: string): boolean {
  return LEGACY_ALLOWED_HEX.has(normHex(hex));
}

// Strip multi-line block comments and single-line // comments from a
// string. Used to skip color literals in comments. Pragmatic, not a
// full CSS parser.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Detect whether the line index sits inside a /* ... */ block within
// the original source. Used by per-line passes that work on .split('\n').
function lineInBlockComment(lines: string[], lineIdx: number): boolean {
  let inside = false;
  for (let i = 0; i <= lineIdx; i++) {
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      if (!inside && line[j] === "/" && line[j + 1] === "*") {
        inside = true; j += 2; continue;
      }
      if (inside && line[j] === "*" && line[j + 1] === "/") {
        inside = false; j += 2; continue;
      }
      j++;
    }
    if (i === lineIdx) return inside || /^\s*\/\//.test(line);
  }
  return false;
}

// ─── WCAG contrast math (hand-rolled, no deps) ──────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6 || h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

// v2 — Composite an alpha overlay over an opaque parent in sRGB space.
// Uses straight-alpha (CSS-standard) compositing per A3 formula:
//   composited.C = α × overlay.C + (1 − α) × parent.C
// Returns #RRGGBB. Caller must guarantee the parent is opaque; nested
// transparency must be resolved by walking up the cascade first.
function compositeAlpha(overlayHex: string, alpha: number, parentHex: string): string {
  const o = hexToRgb(overlayHex);
  const p = hexToRgb(parentHex);
  if (!o || !p) return overlayHex;
  const a = Math.max(0, Math.min(1, alpha));
  const c = [0, 1, 2].map((i) => Math.round(a * o[i] + (1 - a) * p[i]));
  return `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

// ─── Pass 1: Color literal violations ──────────────────────────────────

type Severity = "P0" | "P1" | "P2";

interface ColorFinding {
  file: string;
  line: number;
  match: string;
  severity: Severity;
  reason: string;
  closest?: string;
}

function classifyHex(hex: string, isComment: boolean): { severity: Severity; reason: string } | null {
  if (isComment) return { severity: "P2", reason: "hex value in comment block (informational)" };
  const norm = normHex(hex);
  if (isCanonicalHex(norm)) {
    return { severity: "P2", reason: "canonical hex literal — token-discipline drift (use var(--token) instead)" };
  }
  if (isLegacyHex(norm)) return null; // allowed per CLAUDE.md §2.1
  return { severity: "P1", reason: "non-canonical hex literal — not in tokens.md whitelist or LEGACY-ALLOWED" };
}

function classifyRgba(triple: string, alpha: string | null, isComment: boolean): { severity: Severity; reason: string } | null {
  if (isComment) return { severity: "P2", reason: "rgba/hsla in comment block (informational)" };
  const norm = triple.replace(/\s+/g, "");
  if (CANONICAL_RGBA_BASES.has(norm)) return null; // canonical alpha-on-token
  return { severity: "P1", reason: `non-canonical rgba/hsla base (${norm})${alpha ? ` alpha=${alpha}` : ""}` };
}

function pass1Color(files: string[]): ColorFinding[] {
  const findings: ColorFinding[] = [];
  const hexRe = /#[0-9A-Fa-f]{8}\b|#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g;
  const rgbaRe = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)/g;

  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const inComment = lineInBlockComment(lines, i);

      // Hex literals
      let m: RegExpExecArray | null;
      hexRe.lastIndex = 0;
      while ((m = hexRe.exec(line)) !== null) {
        const c = classifyHex(m[0], inComment);
        if (c) findings.push({ file, line: i + 1, match: m[0], severity: c.severity, reason: c.reason });
      }

      // rgb/rgba/hsla
      rgbaRe.lastIndex = 0;
      while ((m = rgbaRe.exec(line)) !== null) {
        const triple = `${m[1]},${m[2]},${m[3]}`;
        const c = classifyRgba(triple, m[4] || null, inComment);
        if (c) findings.push({ file, line: i + 1, match: m[0], severity: c.severity, reason: c.reason });
      }

      // Tailwind utility classes (only relevant in .tsx / .ts / .html files
      // that include className= or class= contexts). Pragmatic: scan all
      // lines, but only report when preceded by className= / class=.
      if (/\b(className|class)\s*=/.test(line) || /\bclassName\s*=/.test(line)) {
        TW_COLOR_CLASS_RE.lastIndex = 0;
        while ((m = TW_COLOR_CLASS_RE.exec(line)) !== null) {
          const palette = m[2];
          if (NON_CANONICAL_TW_PALETTES.has(palette)) {
            findings.push({
              file, line: i + 1, match: m[0],
              severity: "P1",
              reason: `Tailwind utility uses non-canonical palette "${palette}" — should use SRL token (bg-navy, text-fg-1, etc.)`,
            });
          }
        }
      }
    }
  }
  return findings;
}

// ─── Pass 2: Font family violations ─────────────────────────────────────

interface FontFinding {
  file: string;
  line: number;
  match: string;
  severity: Severity;
  reason: string;
}

function pass2Fonts(files: string[]): FontFinding[] {
  const findings: FontFinding[] = [];
  const ffRe = /font-family\s*:\s*([^;{}]+)/gi;
  const fontFaceRe = /@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^'";\s]+)/gi;
  const importRe = /@import\s+url\s*\(\s*['"][^'"]*family=([^'":&)]+)/gi;

  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const inComment = lineInBlockComment(lines, i);
      if (inComment) continue;

      // font-family declarations
      let m: RegExpExecArray | null;
      ffRe.lastIndex = 0;
      while ((m = ffRe.exec(line)) !== null) {
        const stack = m[1].trim();
        // Take the first font in the stack (strip quotes + whitespace).
        const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
        if (CANONICAL_FONTS.has(first)) continue;
        if (FALLBACK_FONTS.has(first)) continue;
        // Allow var(--font-...) which delegates to a token-defined stack.
        if (/^var\(/.test(first)) continue;
        // Inherit / initial / unset are allowed.
        if (/^(inherit|initial|unset|revert)$/.test(first)) continue;

        findings.push({
          file, line: i + 1, match: stack.slice(0, 80),
          severity: "P1",
          reason: `non-canonical primary font "${first}" — canonical: Playfair Display / DM Sans / Georgia / SF Mono`,
        });
      }

      // @import url(...family=...) — fonts loaded from Google Fonts
      importRe.lastIndex = 0;
      while ((m = importRe.exec(line)) !== null) {
        const fam = decodeURIComponent(m[1]).replace(/\+/g, " ");
        if (CANONICAL_FONTS.has(fam)) continue;
        findings.push({
          file, line: i + 1, match: `@import family=${fam}`,
          severity: "P1",
          reason: `non-canonical Google Font import "${fam}"`,
        });
      }
    }

    // @font-face declarations (multi-line)
    fontFaceRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = fontFaceRe.exec(content)) !== null) {
      const fam = m[1];
      if (CANONICAL_FONTS.has(fam)) continue;
      const lineIdx = content.slice(0, m.index).split("\n").length;
      findings.push({
        file, line: lineIdx, match: `@font-face ${fam}`,
        severity: "P1",
        reason: `non-canonical @font-face declaration "${fam}"`,
      });
    }
  }
  return findings;
}

// ─── Pass 3: Surface-mode contrast ──────────────────────────────────────

interface ContrastFinding {
  file: string;
  selector: string;
  background: string;
  foreground: string;
  ratio: number;
  severity: Severity;
  note: string;
}

interface UnresolvedFinding {
  file: string;
  selector: string;
  property: "background" | "color";
  value: string;
  reason: string;
}

interface VarMap {
  [name: string]: string; // --token → resolved hex (best-effort)
}

// v3 — Find offset ranges of `[data-mode="dark"]` blocks in a CSS file
// using brace counting. Used by buildVarMap to skip variable
// declarations defined ONLY in dark mode, which would otherwise leak
// into default-mode resolution and produce false positives like
// .export-card h3 reporting #FFFFFF (dark-mode value) on white card.
//
// Per Sprint 6 directive Phase A2 confirmation #2: only the exact
// `[data-mode="dark"]` selector is treated as skip-worthy. Other named
// modes (e.g., `data-mode="silk-route-classic"`, `data-mode="midnight-
// blue"`) stay in the default map as additional theme variants — the
// public site's default state has no data-mode attribute, so all
// non-dark scoped vars are equivalent to default.
function findDarkModeSkipRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const openRe = /\[data-mode\s*=\s*["']dark["']\][^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(content)) !== null) {
    const blockStart = m.index;
    const openBraceIdx = m.index + m[0].length - 1;
    let depth = 1;
    let i = openBraceIdx + 1;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    ranges.push([blockStart, i]);
    openRe.lastIndex = i; // advance past the closed block
  }
  return ranges;
}

function isInRange(offset: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (offset >= s && offset < e) return true;
  }
  return false;
}

// Build a global variable map by scanning :root, @theme, and other
// top-level variable-declaring blocks across all CSS sources passed in.
//
// v3 — Skips var declarations inside `[data-mode="dark"]` blocks. This
// matches what browsers compute for the default render (no data-mode
// attribute set on the html element). Vars defined ONLY in dark mode
// become undefined in our map, so var(--name, fallback) syntax falls
// back to the literal default per CSS spec. Vars defined in BOTH
// default scope AND dark mode keep the default value because dark
// declarations are skipped.
function buildVarMap(cssFiles: string[]): VarMap {
  const vars: VarMap = {};
  // First pass: capture raw declarations, skipping dark-mode-only ones.
  const rawDecls: { [name: string]: string } = {};
  for (const file of cssFiles) {
    const content = readFile(file);
    const skipRanges = findDarkModeSkipRanges(content);
    // Match lines like:   --foo: #BA7517;   OR   --foo: var(--bar);
    const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (isInRange(m.index, skipRanges)) continue;
      const name = m[1];
      const val = m[2].trim();
      // Skip composite shorthand values (multiple words/commas without
      // a single resolvable color) for v1.
      if (/^#[0-9A-Fa-f]{3,8}$/.test(val) || /^var\(--[A-Za-z0-9_-]+\)$/.test(val) || /^rgba?\(/.test(val)) {
        rawDecls[name] = val;
      }
    }
  }
  // Second pass: resolve var(...) references with simple substitution
  // (max 5 hops to avoid loops).
  for (const name of Object.keys(rawDecls)) {
    let val = rawDecls[name];
    for (let i = 0; i < 5 && /^var\(--[A-Za-z0-9_-]+\)$/.test(val); i++) {
      const ref = val.match(/^var\((--[A-Za-z0-9_-]+)\)$/)![1];
      if (rawDecls[ref] === undefined) break;
      val = rawDecls[ref];
    }
    vars[name] = val;
  }
  return vars;
}

// Resolve a CSS value to a concrete hex string + optional alpha (0..1).
// alpha === undefined means opaque (alpha = 1). Preserving alpha is what
// enables Pass 3 v2 alpha-overlay compositing — see compositeAlpha().
function resolveColor(value: string, vars: VarMap): { hex: string | null; alpha?: number; unresolved?: string } {
  const v = value.trim();

  // Direct hex — including #RRGGBBAA which carries alpha.
  if (/^#[0-9A-Fa-f]{3,8}$/.test(v)) {
    const h = v.replace("#", "");
    const norm = normHex(v);
    if (h.length === 8) {
      const alpha = parseInt(h.slice(6, 8), 16) / 255;
      return alpha < 1 ? { hex: norm, alpha } : { hex: norm };
    }
    return { hex: norm };
  }

  // rgb / rgba — preserve alpha when present (4th argument).
  const rgbMatch = v.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)/);
  if (rgbMatch) {
    const [r, g, b] = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => parseInt(n, 10));
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    if (rgbMatch[4] !== undefined) {
      const alpha = parseFloat(rgbMatch[4]);
      return alpha < 1 ? { hex, alpha } : { hex };
    }
    return { hex };
  }

  // var(--token, fallback) — try to resolve var, then fall back to the
  // second argument if var is unresolvable.
  const varWithFallbackMatch = v.match(/^var\((--[A-Za-z0-9_-]+)\s*,\s*([^)]+)\)$/);
  if (varWithFallbackMatch) {
    const name = varWithFallbackMatch[1];
    const fallback = varWithFallbackMatch[2].trim();
    if (vars[name] !== undefined) return resolveColor(vars[name], vars);
    return resolveColor(fallback, vars);
  }
  const varMatch = v.match(/^var\((--[A-Za-z0-9_-]+)\)$/);
  if (varMatch) {
    const name = varMatch[1];
    if (vars[name] !== undefined) {
      return resolveColor(vars[name], vars);
    }
    return { hex: null, unresolved: name };
  }

  // CSS keywords that are not colors-with-hex — silently skip from
  // unresolved list (these are not contrast-relevant).
  const SKIP_KEYWORDS = new Set([
    "inherit", "initial", "unset", "revert", "revert-layer",
    "currentcolor", "none", "auto",
  ]);
  if (SKIP_KEYWORDS.has(v.toLowerCase())) {
    return { hex: null }; // no unresolved field — silently skipped
  }

  // Named keywords — minimal subset (white/black/transparent only).
  const keywordMap: { [k: string]: string } = {
    white: "#FFFFFF",
    black: "#000000",
    transparent: "TRANSPARENT",
  };
  if (keywordMap[v.toLowerCase()] !== undefined) {
    return { hex: keywordMap[v.toLowerCase()] };
  }

  return { hex: null, unresolved: v };
}

// Parse a CSS file into selector → { background, color } map.
// Pragmatic: top-level rules only; @media / nested @supports skipped (v2).
function parseCssRules(content: string): {
  rules: Array<{ selector: string; background?: string; color?: string }>;
  skippedMediaCount: number;
} {
  const rules: Array<{ selector: string; background?: string; color?: string }> = [];
  let skippedMediaCount = 0;

  // Strip block comments first to simplify parsing.
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "");

  // Walk the file character by character to track nesting.
  let i = 0;
  let inAtRule: string | null = null;
  let depth = 0;
  let pendingSelector = "";
  let pendingBody = "";
  let captureBody = false;

  while (i < noComments.length) {
    const ch = noComments[i];

    if (ch === "@" && depth === 0 && !captureBody) {
      // Read at-rule name
      let j = i + 1;
      while (j < noComments.length && /[a-zA-Z-]/.test(noComments[j])) j++;
      inAtRule = noComments.slice(i + 1, j);
      // Skip to matching { or ;
      while (j < noComments.length && noComments[j] !== "{" && noComments[j] !== ";") j++;
      if (noComments[j] === "{") {
        // Block at-rule (@media, @supports, @theme, @keyframes...)
        if (inAtRule === "media" || inAtRule === "supports" || inAtRule === "keyframes") {
          // Skip the whole block — count for reporting.
          if (inAtRule === "media") skippedMediaCount++;
          let bd = 1;
          let k = j + 1;
          while (k < noComments.length && bd > 0) {
            if (noComments[k] === "{") bd++;
            if (noComments[k] === "}") bd--;
            k++;
          }
          i = k;
          inAtRule = null;
          continue;
        }
        // Other at-rules (@theme, @font-face) — fall through and let
        // selector-less body capture its declarations.
        depth = 1;
        captureBody = true;
        pendingSelector = `@${inAtRule}`;
        pendingBody = "";
        i = j + 1;
        continue;
      }
      i = j + 1;
      inAtRule = null;
      continue;
    }

    if (ch === "{" && !captureBody) {
      captureBody = true;
      depth++;
      pendingBody = "";
      i++;
      continue;
    }

    if (ch === "}" && captureBody) {
      depth--;
      if (depth === 0) {
        // Parse declarations
        const decls = pendingBody.split(";").map((d) => d.trim()).filter(Boolean);
        const rule: { selector: string; background?: string; color?: string } = {
          selector: pendingSelector.trim(),
        };
        for (const d of decls) {
          const colonIdx = d.indexOf(":");
          if (colonIdx === -1) continue;
          const prop = d.slice(0, colonIdx).trim().toLowerCase();
          const val = d.slice(colonIdx + 1).trim();
          if (prop === "background-color" || prop === "background") {
            // For shorthand background, take the first color-shaped token.
            const m = val.match(/(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|var\(--[A-Za-z0-9_-]+\))/);
            if (m) rule.background = m[1];
          } else if (prop === "color") {
            rule.color = val;
          }
        }
        if (rule.background || rule.color) rules.push(rule);
        captureBody = false;
        pendingSelector = "";
        pendingBody = "";
      } else if (captureBody) {
        pendingBody += ch;
      }
      i++;
      continue;
    }

    if (captureBody) {
      pendingBody += ch;
    } else {
      pendingSelector += ch;
    }
    i++;
  }

  return { rules, skippedMediaCount };
}

// Severity based on contrast ratio.
function contrastSeverity(ratio: number): Severity | null {
  if (ratio < 3) return "P0";
  if (ratio < 4.5) return "P1";
  return null;
}

// Selector ancestor matcher — does `child` selector descend from `parent`?
// Pragmatic: check if child starts with parent followed by space / > / : / .
function isDescendantSelector(parent: string, child: string): boolean {
  if (parent === child) return false;
  if (!child.startsWith(parent)) return false;
  const next = child[parent.length];
  return next === " " || next === ">" || next === "+" || next === "~";
}

// v3 — Strip the outermost pseudo-class / functional-pseudo from a
// selector. Returns the stripped form (one level), or null if no
// strippable suffix is present. Used by the cascade-inherit walker to
// recognize that `.btn-navy:hover` shares its color cascade with
// `.btn-navy` per CSS specificity (a :hover rule that only changes bg
// keeps the base rule's `color:` declaration in effect).
//
// Patterns supported:
//   .X:hover               → .X
//   .X:focus-visible       → .X
//   .X:not(:disabled)      → .X
//   .X:hover:not(:disabled) → .X:hover (one level only — apply repeatedly)
//
// Per Sprint 6 directive Phase A confirmation #1: outermost-first
// repeated application via getAllBaseSelectors() below.
function stripPseudoSuffix(sel: string): string | null {
  // Functional pseudo: :foo(...)
  const fnMatch = sel.match(/^(.+):(?:not|is|where|has|nth-child|nth-of-type|first-child|first-of-type|last-child|last-of-type)\([^)]*\)$/);
  if (fnMatch) return fnMatch[1];
  // Simple pseudo: :foo (must come at very end, not mid-selector
  // descendants like `.parent:hover .child`).
  const simpleMatch = sel.match(/^(.+):(hover|focus|active|focus-visible|focus-within|checked|disabled|visited|link|first-child|last-child|only-child|empty|target)$/);
  if (simpleMatch) return simpleMatch[1];
  return null;
}

// v3 — Collect all base selectors by repeatedly stripping pseudo-class
// suffixes. Used to find every level of the cascade chain that may
// contribute color/bg via CSS specificity.
function getAllBaseSelectors(sel: string): string[] {
  const bases: string[] = [];
  let current = sel;
  for (let i = 0; i < 8; i++) {
    const next = stripPseudoSuffix(current);
    if (next === null || next === current) break;
    bases.push(next);
    current = next;
  }
  return bases;
}

// v3 — HTML cascade hints. CSS-selector descent in findOpaqueParentBg
// can't see HTML structure where elements share a class prefix without
// an explicit selector relationship (e.g., `<aside class="sidebar">
// <nav class="sidebar-nav">` — `.sidebar-nav` is NOT a descendant of
// `.sidebar` per CSS, but IS contained inside it per HTML). These hints
// hardcode the documented nesting patterns surfaced in Sprint 3 spot-
// checks + Sprint 5 false-positive analysis.
//
// Per Sprint 6 directive Phase A2 Option (a): hardcoded table covers the
// known cases; full HTML-DOM cascade is a v4 candidate.
//
// Priority per Sprint 6 directive confirmation #4: CSS-selector descent
// runs first; HTML hints are consulted only when CSS descent finds no
// opaque ancestor in bgRules.
interface CascadeHint { childRegex: RegExp; parentSelector: string; }
const HTML_CASCADE_HINTS: CascadeHint[] = [
  { childRegex: /^\.sidebar-/,     parentSelector: ".sidebar" },
  { childRegex: /^\.topbar-/,      parentSelector: ".topbar" },
  { childRegex: /^\.modal-/,       parentSelector: ".modal" },
  { childRegex: /^\.card-/,        parentSelector: ".card" },
  { childRegex: /^\.panel-/,       parentSelector: ".panel" },
  { childRegex: /^\.notif-/,       parentSelector: ".notif-list" },
  { childRegex: /^\.action-item-/, parentSelector: ".action-list" },
  { childRegex: /^\.badge-/,       parentSelector: ".card" },
];

// Find body/html/:root foreground color in a single rule list (per-file).
// Used by the cascade-inheritance detector to "walk up the cascade where
// possible" per Sprint 2 directive Step 5. Per-file lookup beats a single
// global color because marketing pages and AE Console pages have
// different body-color baselines and a single global value would mis-
// classify one or the other.
function findCascadeColor(
  rules: Array<{ selector: string; color?: string }>,
  vars: VarMap
): string | null {
  for (const r of rules) {
    if (!r.color) continue;
    const sel = r.selector.trim();
    if (sel === "body" || sel === "html" || sel === "html, body" || sel === ":root") {
      const res = resolveColor(r.color, vars);
      if (res.hex && res.hex !== "TRANSPARENT") return res.hex;
    }
  }
  return null;
}

// v2 — Per-file body/html/:root background lookup (opaque only).
// Used as a fallback when an alpha-overlay bg has no opaque ancestor in
// the same stylesheet. Mirrors findCascadeColor but for backgrounds.
function findCascadeBg(
  rules: Array<{ selector: string; background?: string }>,
  vars: VarMap
): string | null {
  for (const r of rules) {
    if (!r.background) continue;
    const sel = r.selector.trim();
    if (sel === "body" || sel === "html" || sel === "html, body" || sel === ":root") {
      const res = resolveColor(r.background, vars);
      if (res.hex && res.hex !== "TRANSPARENT" && (res.alpha === undefined || res.alpha >= 1)) {
        return res.hex;
      }
    }
  }
  return null;
}

// Global fallback — first body color found across all files. Used only
// when a CSS file has no local body/html/:root color rule.
function buildGlobalCascadeColor(cssFiles: string[], vars: VarMap): string | null {
  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules } = parseCssRules(content);
    const c = findCascadeColor(rules, vars);
    if (c) return c;
  }
  return null;
}

// v2 — Global body-bg fallback. Same per-file→global fallback pattern.
function buildGlobalCascadeBg(cssFiles: string[], vars: VarMap): string | null {
  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules } = parseCssRules(content);
    const c = findCascadeBg(rules, vars);
    if (c) return c;
  }
  return null;
}

// v2 — Walk bgRules for ancestors of childSelector and return the most-
// specific OPAQUE background. Used to resolve what an alpha overlay sits
// on top of for compositing.
//
// v3 — Falls through to HTML_CASCADE_HINTS when CSS-selector descent
// finds no opaque ancestor in bgRules. Hints cover documented HTML
// nesting patterns (`.sidebar-nav` inside `.sidebar`, etc.) where CSS
// selector relationships don't reflect the rendered DOM containment.
// Per Sprint 6 directive Phase A2 confirmation #4: CSS descent runs
// first; HTML hints are consulted as a fallback.
//
// Returns an object with the resolved hex plus a `source` tag for trail
// reporting in Pass 3 finding output: `css-descent` / `html-hint` /
// `global-css-descent` / `global-html-hint` (v4) / `file-body` /
// `global-body` / `default-white`.
interface BgRuleEntry { selector: string; bgHex: string; bgAlpha?: number; raw: string }
interface GlobalBgRuleEntry extends BgRuleEntry { file: string }
interface OpaqueParentResult {
  hex: string;
  source: "css-descent" | "html-hint" | "global-css-descent" | "global-html-hint" | "file-body" | "global-body" | "default-white";
  viaSelector?: string;
  viaFile?: string;          // v4 — origin file when source is global-*
  ambiguousMatches?: number; // v4 — count when multiple global files define same selector
}

// v4 — Strip `html[data-mode="X"]` and `html[data-theme="X"][data-mode="X"]`
// prefixes from a selector. Used by global bgRules matching so themed
// variants (`html[data-mode="dark"] .sidebar-nav a:hover`) resolve to
// the canonical class hierarchy (`.sidebar-nav a:hover`) for cross-file
// lookup.
function stripModePrefix(sel: string): string {
  // Combined theme + mode: html[data-theme="X"][data-mode="X"]
  let out = sel.replace(/^html\[data-theme\s*=\s*["'][^"']*["']\]\[data-mode\s*=\s*["'][^"']*["']\]\s*/, "");
  // Mode-only: html[data-mode="X"]
  out = out.replace(/^html\[data-mode\s*=\s*["'][^"']*["']\]\s*/, "");
  // Theme-only: html[data-theme="X"]
  out = out.replace(/^html\[data-theme\s*=\s*["'][^"']*["']\]\s*/, "");
  return out;
}

// v4 — Build global bgRules index across all CSS files. Used as a Tier-3
// fallback when same-file bgRules can't resolve the opaque parent (e.g.,
// themes.css sets `--theme-sidebar-bg` but the opaque `.sidebar`
// background rule lives in console.css). Each entry carries `file`
// attribution for ambiguity logging when multiple files define the same
// selector.
function buildGlobalBgRules(cssFiles: string[], vars: VarMap): GlobalBgRuleEntry[] {
  const out: GlobalBgRuleEntry[] = [];
  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules } = parseCssRules(content);
    for (const r of rules) {
      if (!r.background) continue;
      const res = resolveColor(r.background, vars);
      if (res.hex && res.hex !== "TRANSPARENT") {
        out.push({
          selector: r.selector,
          bgHex: res.hex,
          bgAlpha: res.alpha,
          raw: r.background,
          file,
        });
      }
    }
  }
  return out;
}

function findOpaqueParentBg(
  childSelector: string,
  bgRules: BgRuleEntry[],
  fileBodyBg: string | null,
  globalBodyBg: string | null,
  globalBgRules?: GlobalBgRuleEntry[]
): OpaqueParentResult {
  // Tier 1 — Same-file CSS-selector descent (v2 behavior, unchanged priority).
  let best: BgRuleEntry | null = null;
  for (const b of bgRules) {
    if (b.selector === childSelector) continue; // exclude self — we want strict ancestors
    if (!isDescendantSelector(b.selector, childSelector)) continue;
    const opaque = b.bgAlpha === undefined || b.bgAlpha >= 1;
    if (!opaque) continue;
    if (!best || b.selector.length > best.selector.length) best = b;
  }
  if (best) return { hex: best.bgHex, source: "css-descent", viaSelector: best.selector };

  // Tier 2 — v3 same-file HTML cascade hints. Extract the FIRST .className
  // token anywhere in childSelector (skipping html / body / attribute
  // prefixes), match against hint table, look up the parent class in
  // same-file bgRules.
  const leadingClassMatch = childSelector.match(/\.([A-Za-z][A-Za-z0-9_-]*)/);
  const leadingClass = leadingClassMatch ? "." + leadingClassMatch[1] : null;
  if (leadingClass) {
    for (const hint of HTML_CASCADE_HINTS) {
      if (!hint.childRegex.test(leadingClass)) continue;
      const parent = bgRules.find(
        (b) => b.selector === hint.parentSelector && (b.bgAlpha === undefined || b.bgAlpha >= 1)
      );
      if (parent) {
        return { hex: parent.bgHex, source: "html-hint", viaSelector: hint.parentSelector };
      }
    }
  }

  // v4 — Global bgRules fallback. Matches against a cross-file index
  // with `html[data-mode="X"]` / `html[data-theme="X"]` prefixes
  // stripped on both sides, so themed variants resolve to canonical
  // parent classes living in different files. Per Sprint 7 directive
  // confirmations: same-file priority preserved (Tier 1 + 2 first);
  // first-match-wins on ambiguity with `ambiguousMatches` count
  // surfaced for transparency.
  if (globalBgRules) {
    const normalizedChild = stripModePrefix(childSelector);

    // Tier 3 — Global CSS-selector descent.
    let bestGlobal: GlobalBgRuleEntry | null = null;
    let bestGlobalParentNorm = "";
    for (const b of globalBgRules) {
      const normalizedParent = stripModePrefix(b.selector);
      if (normalizedParent === normalizedChild) continue;
      if (!isDescendantSelector(normalizedParent, normalizedChild)) continue;
      const opaque = b.bgAlpha === undefined || b.bgAlpha >= 1;
      if (!opaque) continue;
      if (!bestGlobal || normalizedParent.length > bestGlobalParentNorm.length) {
        bestGlobal = b;
        bestGlobalParentNorm = normalizedParent;
      }
    }
    if (bestGlobal) {
      return {
        hex: bestGlobal.bgHex,
        source: "global-css-descent",
        viaSelector: bestGlobalParentNorm,
        viaFile: bestGlobal.file,
      };
    }

    // Tier 4 — Global HTML cascade hints.
    if (leadingClass) {
      for (const hint of HTML_CASCADE_HINTS) {
        if (!hint.childRegex.test(leadingClass)) continue;
        const matches = globalBgRules.filter(
          (b) =>
            stripModePrefix(b.selector) === hint.parentSelector &&
            (b.bgAlpha === undefined || b.bgAlpha >= 1)
        );
        if (matches.length > 0) {
          return {
            hex: matches[0].bgHex,
            source: "global-html-hint",
            viaSelector: hint.parentSelector,
            viaFile: matches[0].file,
            ambiguousMatches: matches.length > 1 ? matches.length : undefined,
          };
        }
      }
    }
  }

  // Tier 5 — Body-bg fallback chain (existing behavior).
  if (fileBodyBg) return { hex: fileBodyBg, source: "file-body" };
  if (globalBodyBg) return { hex: globalBodyBg, source: "global-body" };
  return { hex: "#FFFFFF", source: "default-white" };
}

function pass3Contrast(
  cssFiles: string[],
  vars: VarMap
): { findings: ContrastFinding[]; unresolved: UnresolvedFinding[]; resolved: number; skippedMedia: number; inferredBody: string | null; compositedCount: number; globalMatchCount: number; ambiguousGlobalCount: number } {
  const findings: ContrastFinding[] = [];
  const unresolved: UnresolvedFinding[] = [];
  let resolved = 0;
  let skippedMedia = 0;
  let compositedCount = 0;  // v2: tracks how many findings used alpha compositing
  let globalMatchCount = 0; // v4: tracks Tier-3 / Tier-4 global lookups
  let ambiguousGlobalCount = 0; // v4: tracks how many global matches had >1 file
  const globalBody = buildGlobalCascadeColor(cssFiles, vars);
  const globalBodyBg = buildGlobalCascadeBg(cssFiles, vars);
  // v4: cross-file bgRules index. Built once at start; passed to every
  // findOpaqueParentBg call as a Tier-3 / Tier-4 fallback when same-file
  // lookup misses (themed selectors in themes.css whose opaque parent
  // bg lives in console.css or page CSS).
  const globalBgRules = buildGlobalBgRules(cssFiles, vars);

  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules, skippedMediaCount } = parseCssRules(content);
    skippedMedia += skippedMediaCount;
    // Per-file cascade lookup: prefer file-local body/html/:root color
    // over the global fallback.
    const localBody = findCascadeColor(rules, vars);
    const inferredBody = localBody ?? globalBody;
    const localBodyBg = findCascadeBg(rules, vars);

    // Build per-file selector → bg map. v2: track alpha alongside hex.
    const bgRules: BgRuleEntry[] = [];
    for (const r of rules) {
      if (!r.background) continue;
      const res = resolveColor(r.background, vars);
      if (res.hex && res.hex !== "TRANSPARENT") {
        bgRules.push({
          selector: r.selector,
          bgHex: res.hex,
          bgAlpha: res.alpha,
          raw: r.background,
        });
        resolved++;
      } else if (res.unresolved && res.hex !== "TRANSPARENT") {
        unresolved.push({
          file, selector: r.selector, property: "background",
          value: r.background,
          reason: `cannot resolve to hex (var ${res.unresolved} undefined or composite value)`,
        });
      }
    }

    // For each child rule with `color`, find a parent bg rule and compute
    // contrast. v2: when parent bg has alpha < 1, composite over the
    // nearest opaque ancestor (or per-file/global body bg fallback)
    // before the contrast math runs.
    for (const r of rules) {
      if (!r.color) continue;
      const fgRes = resolveColor(r.color, vars);
      if (!fgRes.hex || fgRes.hex === "TRANSPARENT") {
        if (fgRes.unresolved) {
          unresolved.push({
            file, selector: r.selector, property: "color",
            value: r.color,
            reason: `cannot resolve to hex (var ${fgRes.unresolved} undefined or composite value)`,
          });
        }
        continue;
      }

      // Find parent bg — prefer most-specific match.
      let parent: BgRuleEntry | null = null;
      for (const b of bgRules) {
        if (b.selector === r.selector || isDescendantSelector(b.selector, r.selector)) {
          if (!parent || b.selector.length > parent.selector.length) {
            parent = b;
          }
        }
      }

      if (!parent) continue;

      // v2 — Composite alpha overlays. If the parent bg is non-opaque,
      // composite it over the nearest opaque ancestor (excluding the
      // parent itself, since we're trying to figure out what IT sits on).
      // v3 — findOpaqueParentBg now returns source metadata; threaded
      // into composedFromOverlay for finding-output trail.
      let effectiveBg = parent.bgHex;
      let composedFromOverlay: { overlay: string; parentBg: string; alpha: number; source: string; viaSelector?: string; viaFile?: string; ambiguousMatches?: number } | null = null;
      if (parent.bgAlpha !== undefined && parent.bgAlpha < 1) {
        const opaqueResult = findOpaqueParentBg(parent.selector, bgRules, localBodyBg, globalBodyBg, globalBgRules);
        effectiveBg = compositeAlpha(parent.bgHex, parent.bgAlpha, opaqueResult.hex);
        composedFromOverlay = {
          overlay: parent.bgHex,
          parentBg: opaqueResult.hex,
          alpha: parent.bgAlpha,
          source: opaqueResult.source,
          viaSelector: opaqueResult.viaSelector,
          viaFile: opaqueResult.viaFile,
          ambiguousMatches: opaqueResult.ambiguousMatches,
        };
        compositedCount++;
        if (opaqueResult.source === "global-css-descent" || opaqueResult.source === "global-html-hint") {
          globalMatchCount++;
          if (opaqueResult.ambiguousMatches) ambiguousGlobalCount++;
        }
      }

      // v2 — If the foreground itself has alpha (rare: rgba color or
      // #RRGGBBAA), composite it over the effective bg before measuring.
      let effectiveFg = fgRes.hex;
      let fgAlphaTrail: { fgOverlay: string; alpha: number } | null = null;
      if (fgRes.alpha !== undefined && fgRes.alpha < 1) {
        effectiveFg = compositeAlpha(fgRes.hex, fgRes.alpha, effectiveBg);
        fgAlphaTrail = { fgOverlay: fgRes.hex, alpha: fgRes.alpha };
      }

      const ratio = contrastRatio(effectiveBg, effectiveFg);
      if (ratio === null) continue;
      const sev = contrastSeverity(ratio);
      if (sev) {
        const noteParts: string[] = [
          parent.selector === r.selector
            ? "self-element contrast (same selector sets bg + color)"
            : "ancestor-bg vs descendant-color contrast",
        ];
        if (composedFromOverlay) {
          const ambig = composedFromOverlay.ambiguousMatches ? ` [ambiguousMatches=${composedFromOverlay.ambiguousMatches}]` : "";
          const fileSuffix = composedFromOverlay.viaFile ? ` in ${composedFromOverlay.viaFile.replace(/^.*\/frontend\//, "frontend/")}` : "";
          const sourceTrail =
            composedFromOverlay.source === "html-hint" && composedFromOverlay.viaSelector
              ? ` (parent bg from HTML hint → ${composedFromOverlay.viaSelector})`
              : composedFromOverlay.source === "css-descent" && composedFromOverlay.viaSelector
              ? ` (parent bg from CSS ancestor ${composedFromOverlay.viaSelector})`
              : composedFromOverlay.source === "global-css-descent" && composedFromOverlay.viaSelector
              ? ` (parent bg from global CSS ancestor ${composedFromOverlay.viaSelector}${fileSuffix}${ambig})`
              : composedFromOverlay.source === "global-html-hint" && composedFromOverlay.viaSelector
              ? ` (parent bg from global HTML hint → ${composedFromOverlay.viaSelector}${fileSuffix}${ambig})`
              : composedFromOverlay.source === "file-body" || composedFromOverlay.source === "global-body" || composedFromOverlay.source === "default-white"
              ? ` (parent bg from ${composedFromOverlay.source} fallback)`
              : "";
          noteParts.push(
            `composited overlay ${composedFromOverlay.overlay} α=${composedFromOverlay.alpha.toFixed(2)} over ${composedFromOverlay.parentBg} → ${effectiveBg}${sourceTrail}`
          );
        }
        if (fgAlphaTrail) {
          noteParts.push(`fg overlay ${fgAlphaTrail.fgOverlay} α=${fgAlphaTrail.alpha.toFixed(2)} → ${effectiveFg}`);
        }
        findings.push({
          file,
          selector: `${parent.selector} → ${r.selector}`,
          background: composedFromOverlay ? `${effectiveBg} (from ${composedFromOverlay.overlay} α=${composedFromOverlay.alpha.toFixed(2)})` : effectiveBg,
          foreground: fgAlphaTrail ? `${effectiveFg} (from ${fgAlphaTrail.fgOverlay} α=${fgAlphaTrail.alpha.toFixed(2)})` : effectiveFg,
          ratio: Math.round(ratio * 100) / 100,
          severity: sev,
          note: noteParts.join(" · "),
        });
      }
    }

    // Walking-the-cascade case: dark bg with no explicit color rule.
    // Per directive Step 5: walk up the cascade where possible. We use
    // the global inferred body/html color as the cascade fallback. When
    // it resolves, we compute the actual contrast ratio. When it doesn't,
    // we emit a "needs DOM inspection" finding (not a confirmed P0).
    // v2 — composite alpha bg over its opaque ancestor before the dark-
    // surface luminance check, so e.g. rgba(239,68,68,0.10) over white
    // (effective ≈ pale pink, lum > 0.18) doesn't trigger as "dark bg".
    for (const b of bgRules) {
      if (!b.bgHex) continue;
      let effectiveBg = b.bgHex;
      let composeTrail: { overlay: string; parentBg: string; alpha: number; source: string; viaSelector?: string; viaFile?: string; ambiguousMatches?: number } | null = null;
      if (b.bgAlpha !== undefined && b.bgAlpha < 1) {
        const opaqueResult = findOpaqueParentBg(b.selector, bgRules, localBodyBg, globalBodyBg, globalBgRules);
        effectiveBg = compositeAlpha(b.bgHex, b.bgAlpha, opaqueResult.hex);
        composeTrail = {
          overlay: b.bgHex,
          parentBg: opaqueResult.hex,
          alpha: b.bgAlpha,
          source: opaqueResult.source,
          viaSelector: opaqueResult.viaSelector,
          viaFile: opaqueResult.viaFile,
          ambiguousMatches: opaqueResult.ambiguousMatches,
        };
        if (opaqueResult.source === "global-css-descent" || opaqueResult.source === "global-html-hint") {
          globalMatchCount++;
          if (opaqueResult.ambiguousMatches) ambiguousGlobalCount++;
        }
      }
      const rgb = hexToRgb(effectiveBg);
      if (!rgb) continue;
      const lum = relativeLuminance(rgb);
      if (lum > 0.18) continue; // not a dark surface

      // v3 — Fix 1: pseudo-class rule cascading. If b.selector is a
      // pseudo-class rule (e.g., `.btn-navy:hover`), look up base
      // selectors (`.btn-navy`) for explicit color. Browser cascade
      // applies the base rule's color to the pseudo state when the
      // pseudo rule doesn't override it. Treat finding base color as
      // equivalent to having explicit color → skip cascade-inherit
      // emission (the real fg is the base color, not body inherited).
      const baseSelectors = getAllBaseSelectors(b.selector);
      const baseHasColor = baseSelectors.some((base) =>
        rules.some(
          (r) => r.color && (r.selector === base || isDescendantSelector(base, r.selector))
        )
      );

      const hasExplicitColor = rules.some(
        (r) => r.color && (r.selector === b.selector || isDescendantSelector(b.selector, r.selector))
      );
      if (hasExplicitColor || baseHasColor) continue;

      if (composeTrail) compositedCount++;

      if (inferredBody) {
        // v2: contrast against the composited (effective) bg, not the
        // raw overlay hex.
        const ratio = contrastRatio(effectiveBg, inferredBody);
        if (ratio === null) continue;
        const sev = contrastSeverity(ratio);
        if (sev) {
          const noteBase =
            "dark bg with no explicit `color:` — cascade resolves to body/html color. Set explicit `color: var(--fg-on-navy)` or equivalent.";
          let note = noteBase;
          if (composeTrail) {
            const ambig = composeTrail.ambiguousMatches ? ` [ambiguousMatches=${composeTrail.ambiguousMatches}]` : "";
            const fileSuffix = composeTrail.viaFile ? ` in ${composeTrail.viaFile.replace(/^.*\/frontend\//, "frontend/")}` : "";
            const sourceTrail =
              composeTrail.source === "html-hint" && composeTrail.viaSelector
                ? ` (parent bg from HTML hint → ${composeTrail.viaSelector})`
                : composeTrail.source === "css-descent" && composeTrail.viaSelector
                ? ` (parent bg from CSS ancestor ${composeTrail.viaSelector})`
                : composeTrail.source === "global-css-descent" && composeTrail.viaSelector
                ? ` (parent bg from global CSS ancestor ${composeTrail.viaSelector}${fileSuffix}${ambig})`
                : composeTrail.source === "global-html-hint" && composeTrail.viaSelector
                ? ` (parent bg from global HTML hint → ${composeTrail.viaSelector}${fileSuffix}${ambig})`
                : ` (parent bg from ${composeTrail.source} fallback)`;
            note = `${noteBase} · composited overlay ${composeTrail.overlay} α=${composeTrail.alpha.toFixed(2)} over ${composeTrail.parentBg} → ${effectiveBg}${sourceTrail}`;
          }
          findings.push({
            file,
            selector: `${b.selector} (cascade-inherited fg)`,
            background: composeTrail
              ? `${effectiveBg} (from ${composeTrail.overlay} α=${composeTrail.alpha.toFixed(2)})`
              : effectiveBg,
            foreground: `${inferredBody} (inferred from body/html cascade)`,
            ratio: Math.round(ratio * 100) / 100,
            severity: sev,
            note,
          });
        }
      } else {
        // Cascade unresolvable — emit advisory P1 ("needs DOM inspection")
        // rather than a confirmed P0 readability failure.
        findings.push({
          file,
          selector: `${b.selector} (no explicit color, cascade unresolvable)`,
          background: composeTrail
            ? `${effectiveBg} (from ${composeTrail.overlay} α=${composeTrail.alpha.toFixed(2)})`
            : effectiveBg,
          foreground: "(unresolved cascade)",
          ratio: 0,
          severity: "P1",
          note: "dark bg with no explicit color and no resolvable body/html cascade — needs DOM inspection. Confirm child text contrast against this background.",
        });
      }
    }
  }

  return { findings, unresolved, resolved, skippedMedia, inferredBody: globalBody, compositedCount, globalMatchCount, ambiguousGlobalCount };
}

// ─── Output formatter ───────────────────────────────────────────────────

function buildReport(
  scopeCounts: { html: number; css: number; tsx: number; ts: number },
  pass1: ColorFinding[],
  pass2: FontFinding[],
  pass3: { findings: ContrastFinding[]; unresolved: UnresolvedFinding[]; resolved: number; skippedMedia: number; inferredBody: string | null; compositedCount: number; globalMatchCount: number; ambiguousGlobalCount: number }
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  const allFindings = [
    ...pass1.map((f) => ({ ...f, pass: 1 as const })),
    ...pass2.map((f) => ({ ...f, pass: 2 as const })),
    ...pass3.findings.map((f) => ({ ...f, pass: 3 as const })),
  ];
  const counts = (sev: Severity) => allFindings.filter((f) => f.severity === sev).length;
  const passCounts = (n: 1 | 2 | 3, sev: Severity) =>
    allFindings.filter((f) => f.pass === n && f.severity === sev).length;

  lines.push(`# SRL Brand Conformance Audit — Run ${now}`);
  lines.push("");
  lines.push(`Tool: \`backend/scripts/audit-brand-conformance.ts\` v4 (alpha-overlay compositing + pseudo-class cascade + multi-mode tokens + HTML hints + cross-file bgRules merging)`);
  lines.push("");
  lines.push(`## Scope`);
  lines.push("");
  lines.push(`| Category | Files |`);
  lines.push(`|---|---:|`);
  lines.push(`| frontend/public/**/*.html | ${scopeCounts.html} |`);
  lines.push(`| frontend/public/**/*.css | ${scopeCounts.css} |`);
  lines.push(`| frontend/src/**/*.tsx | ${scopeCounts.tsx} |`);
  lines.push(`| frontend/src/**/*.ts | ${scopeCounts.ts} |`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Pass | Total scanned | P0 | P1 | P2 |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  lines.push(`| 1 — Color literals | ${pass1.length} | ${passCounts(1, "P0")} | ${passCounts(1, "P1")} | ${passCounts(1, "P2")} |`);
  lines.push(`| 2 — Font families | ${pass2.length} | ${passCounts(2, "P0")} | ${passCounts(2, "P1")} | ${passCounts(2, "P2")} |`);
  lines.push(`| 3 — Surface contrast | ${pass3.findings.length} | ${passCounts(3, "P0")} | ${passCounts(3, "P1")} | ${passCounts(3, "P2")} |`);
  lines.push(`| **Totals** | **${pass1.length + pass2.length + pass3.findings.length}** | **${counts("P0")}** | **${counts("P1")}** | **${counts("P2")}** |`);
  lines.push("");
  lines.push(`**Pass 3 variable resolution**: ${pass3.resolved} resolved · ${pass3.unresolved.length} unresolved · ${pass3.skippedMedia} \`@media\` blocks skipped (v2 candidate).`);
  lines.push("");
  lines.push(`**Pass 3 inferred cascade body color**: ${pass3.inferredBody ? `\`${pass3.inferredBody}\` (resolved from body/html/:root color rule)` : "**unresolved** — cascade-inheritance findings degraded to P1 advisory"}.`);
  lines.push("");
  lines.push(`**Pass 3 alpha-overlay compositing (v2)**: ${pass3.compositedCount} finding(s) used alpha compositing — overlay rgba/hex composited over nearest opaque ancestor before contrast math, eliminating the alpha-stripping false-positive class from v1.`);
  lines.push("");
  lines.push(`**Pass 3 cross-file bgRules merging (v4)**: ${pass3.globalMatchCount} finding(s) resolved their opaque parent bg via the global cross-file index (Tier 3 / Tier 4 fallback) — themed selectors in themes.css whose parent rule lives in console.css or page CSS. ${pass3.ambiguousGlobalCount} of those had ambiguous matches (multiple files defined the same selector); first-match-wins per directive, ambiguity count surfaced in finding-output trail for triage.`);
  lines.push("");

  // ── P0 section
  lines.push(`## P0 — Readability Failures (fix immediately)`);
  lines.push("");
  const p0 = allFindings.filter((f) => f.severity === "P0");
  if (p0.length === 0) {
    lines.push(`✅ No P0 findings.`);
  } else {
    lines.push(`Pass 3 contrast violations <3:1 + Pass 2 critical font fallbacks. Group by file below.`);
    lines.push("");
    const byFile = groupByFile(p0);
    for (const file of Object.keys(byFile).sort()) {
      lines.push(`### \`${relPath(file)}\``);
      lines.push("");
      for (const f of byFile[file]) {
        if ((f as any).pass === 3) {
          const cf = f as ContrastFinding & { pass: 3 };
          lines.push(`- **${cf.selector}** — bg \`${cf.background}\` · fg \`${cf.foreground}\` · ratio **${cf.ratio.toFixed(2)}:1**. ${cf.note}`);
        } else {
          const cf = f as (ColorFinding | FontFinding) & { pass: 1 | 2 };
          const lineRef = "line" in cf ? cf.line : 0;
          lines.push(`- L${lineRef} — \`${escapeMd(cf.match || "")}\` — ${cf.reason}`);
        }
      }
      lines.push("");
    }
  }

  // ── P1 section
  lines.push(`## P1 — Token Drift (fix in next sprint)`);
  lines.push("");
  const p1 = allFindings.filter((f) => f.severity === "P1");
  if (p1.length === 0) {
    lines.push(`✅ No P1 findings.`);
  } else {
    lines.push(`Pass 1 non-canonical hex/rgba/Tailwind palette + Pass 2 non-canonical fonts + Pass 3 borderline contrast (3:1 to 4.5:1). Sorted by frequency to surface root-cause candidates first.`);
    lines.push("");
    const groupedByMatch = groupByMatch(p1);
    const top = Object.entries(groupedByMatch).sort((a, b) => b[1].length - a[1].length).slice(0, 30);
    lines.push(`| Token / Pattern | Count | Example file:line |`);
    lines.push(`|---|---:|---|`);
    for (const [match, items] of top) {
      const ex = items[0];
      const lineRef = "line" in (ex as any) ? (ex as any).line : "—";
      lines.push(`| \`${escapeMd(match)}\` | ${items.length} | \`${relPath(ex.file)}:${lineRef}\` |`);
    }
    lines.push("");
    lines.push(`*Top 30 by occurrence shown. Cross-check against \`frontend/src/lib/site-chrome.json\` and \`frontend/public/shared/css/themes.css\` — one source-of-truth edit may resolve dozens of downstream findings.*`);
  }
  lines.push("");

  // ── P2 section
  lines.push(`## P2 — Informational`);
  lines.push("");
  const p2 = allFindings.filter((f) => f.severity === "P2");
  lines.push(`${p2.length} findings: comment-block hex values, canonical-hex literals (token-discipline drift — use \`var(--token)\` instead), and deferred edge cases.`);
  if (p2.length > 0) {
    const groupedByMatch = groupByMatch(p2);
    const top = Object.entries(groupedByMatch).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
    lines.push("");
    lines.push(`| Token / Pattern | Count | Reason class |`);
    lines.push(`|---|---:|---|`);
    for (const [match, items] of top) {
      lines.push(`| \`${escapeMd(match)}\` | ${items.length} | ${(items[0].reason || items[0].note || "").slice(0, 60)} |`);
    }
  }
  lines.push("");

  // ── Pass 3 unresolved variables
  if (pass3.unresolved.length > 0) {
    lines.push(`## Pass 3 — Unresolved variables (manual review needed)`);
    lines.push("");
    lines.push(`Variables that could not be resolved to a concrete hex during scanning. Cross-file cascade resolution is a v2 candidate. v1 surfaces these so the count signals whether v2 is necessary.`);
    lines.push("");
    lines.push(`| File | Selector | Property | Value | Reason |`);
    lines.push(`|---|---|---|---|---|`);
    for (const u of pass3.unresolved.slice(0, 50)) {
      lines.push(`| \`${relPath(u.file)}\` | \`${escapeMd(u.selector.slice(0, 40))}\` | ${u.property} | \`${escapeMd(u.value.slice(0, 30))}\` | ${u.reason.slice(0, 50)} |`);
    }
    if (pass3.unresolved.length > 50) {
      lines.push("");
      lines.push(`*${pass3.unresolved.length - 50} more truncated. See raw output.*`);
    }
    lines.push("");
  }

  // ── Notes
  lines.push(`## Notes for human triage`);
  lines.push("");
  lines.push(`- All findings are **CANDIDATES** — manual review required before fixing. Scanner is heuristic, not AST-aware.`);
  lines.push(`- Pass 3 unresolved-variable findings need DOM inspection or v2 cascade resolution; do not assume they are violations.`);
  lines.push(`- LEGACY-ALLOWED hex set (per CLAUDE.md §2.1) is suppressed from P1: \`#0D1B2A\`, \`#854F0B\`, \`#0F1117\`, \`#1A1A2E\`, \`#0A1220\`, \`#FAF9F7\`, plus doc-header gradient stop \`#1A2D45\` and assorted legacy gold values. Migration tracked under Phase 6 — Theme System Cleanup.`);
  lines.push(`- PDF templates at \`backend/src/services/pdfService.ts\` carry their own hardcoded PDFKit colors and are **out of frontend scope** per Sprint 2 directive. Separate PDF-conformance pass needed if/when PDFKit color migration is scheduled.`);
  lines.push(`- Pass 3 specifically catches: (a) the /about footer pattern — navy bg with no explicit \`color:\` declaration, child text inheriting --fg-1 navy → navy-on-navy; (b) the /track navy-on-navy class — same shape on portal canvas.`);
  lines.push(`- Pass 2 \`@import\` Google Fonts findings are root causes; one CSS file edit can eliminate downstream font-family violations on the same page.`);
  lines.push("");

  return lines.join("\n");
}

function groupByFile<T extends { file: string }>(items: T[]): { [file: string]: T[] } {
  const out: { [file: string]: T[] } = {};
  for (const it of items) {
    if (!out[it.file]) out[it.file] = [];
    out[it.file].push(it);
  }
  return out;
}

interface GroupItem {
  match?: string;
  selector?: string;
  reason?: string;
  note?: string;
  file: string;
  line?: number;
}

function groupByMatch(items: GroupItem[]): { [key: string]: GroupItem[] } {
  const out: { [key: string]: GroupItem[] } = {};
  for (const it of items) {
    const key =
      it.match ||
      it.selector ||
      (it.reason && it.reason.slice(0, 30)) ||
      (it.note && it.note.slice(0, 30)) ||
      "(unknown)";
    if (!out[key]) out[key] = [];
    out[key].push(it);
  }
  return out;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/`/g, "\\`");
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  console.error("[brand-audit] Walking frontend scope...");
  const htmlFiles = walkFiles(FRONTEND_PUBLIC, [".html"]);
  const cssFiles = walkFiles(FRONTEND_PUBLIC, [".css"]);
  const tsxFiles = walkFiles(FRONTEND_SRC, [".tsx"]);
  const tsFiles = walkFiles(FRONTEND_SRC, [".ts"]).filter((f) => !f.endsWith(".d.ts"));

  console.error(
    `[brand-audit] Scope: html=${htmlFiles.length} css=${cssFiles.length} tsx=${tsxFiles.length} ts=${tsFiles.length}`
  );

  const allFiles = [...htmlFiles, ...cssFiles, ...tsxFiles, ...tsFiles];
  if (fs.existsSync(SITE_CHROME_JSON)) allFiles.push(SITE_CHROME_JSON);

  console.error("[brand-audit] Pass 1 — color literals...");
  const pass1 = pass1Color(allFiles);
  console.error(`[brand-audit] Pass 1: ${pass1.length} findings.`);

  console.error("[brand-audit] Pass 2 — font families...");
  const pass2 = pass2Fonts([...htmlFiles, ...cssFiles, ...tsxFiles, ...tsFiles]);
  console.error(`[brand-audit] Pass 2: ${pass2.length} findings.`);

  console.error("[brand-audit] Pass 3 — surface contrast...");
  const vars = buildVarMap(cssFiles);
  console.error(`[brand-audit] Pass 3 var map: ${Object.keys(vars).length} CSS variables resolved.`);
  const pass3 = pass3Contrast(cssFiles, vars);
  console.error(
    `[brand-audit] Pass 3: ${pass3.findings.length} contrast findings, ${pass3.unresolved.length} unresolved vars, ${pass3.skippedMedia} @media blocks skipped.`
  );

  const report = buildReport(
    {
      html: htmlFiles.length,
      css: cssFiles.length,
      tsx: tsxFiles.length,
      ts: tsFiles.length,
    },
    pass1,
    pass2,
    pass3
  );

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const reportPath = path.join(REPORT_DIR, `brand-conformance-${stamp}.md`);
  fs.writeFileSync(reportPath, report);
  console.error(`\n[brand-audit] Report: ${relPath(reportPath)}`);
  console.error(
    `[brand-audit] Totals: P0=${pass1.filter(f => f.severity === "P0").length + pass2.filter(f => f.severity === "P0").length + pass3.findings.filter(f => f.severity === "P0").length} · P1=${pass1.filter(f => f.severity === "P1").length + pass2.filter(f => f.severity === "P1").length + pass3.findings.filter(f => f.severity === "P1").length} · P2=${pass1.filter(f => f.severity === "P2").length + pass2.filter(f => f.severity === "P2").length + pass3.findings.filter(f => f.severity === "P2").length}`
  );

  process.stdout.write(report);
}

main();
