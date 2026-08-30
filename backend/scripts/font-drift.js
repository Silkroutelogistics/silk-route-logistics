/**
 * Font drift scanner.
 *
 * Reports every font-family / fontFamily declaration whose first NAMED family is
 * not one the srl-brand-design skill names. The canon is not hardcoded here — it
 * is read out of the skill's own token stylesheet at run time, so the guard and
 * the brand cannot drift apart. Rename a face in the skill and this follows.
 *
 * A declaration that consumes a token (`var(--font-*)`) is the correct shape and
 * is skipped. That is the whole point: this fails literals, not tokens.
 *
 * Used by backend/__tests__/unit/ci/typographyTokens.test.ts (the CI guard) and
 * runnable directly:  node backend/scripts/font-drift.js
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const SKILL_TOKENS = path.join(
  REPO, ".claude", "skills", "srl-brand-design", "scripts", "srl_tokens.css"
);

/** Families that are not a brand choice — they are CSS keywords or OS fallbacks. */
const GENERIC = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
  "inherit", "initial", "unset", "revert", "revert-layer",
  "-apple-system", "blinkmacsystemfont", "emoji", "math", "fangsong",
]);

/**
 * Read the canonical families out of the skill. Returns lowercase family names.
 * Throws rather than defaulting — a guard that silently falls back to a guessed
 * canon is worse than no guard.
 */
function readCanon() {
  if (!fs.existsSync(SKILL_TOKENS)) {
    throw new Error(
      `srl-brand-design token stylesheet not found at ${SKILL_TOKENS}. ` +
      `The font canon is read from the skill; this guard cannot run without it.`
    );
  }
  const css = fs.readFileSync(SKILL_TOKENS, "utf8");
  const canon = new Set();
  const re = /--font-(?:display|body|tagline|mono)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css))) {
    for (const raw of m[1].split(",")) {
      const fam = raw.trim().replace(/^['"]|['"]$/g, "").trim().toLowerCase();
      if (fam && !GENERIC.has(fam)) canon.add(fam);
    }
  }
  if (canon.size === 0) {
    throw new Error(`Parsed zero canonical families from ${SKILL_TOKENS} — parser is broken.`);
  }
  return canon;
}

const SCAN_EXT = new Set([".ts", ".tsx", ".css", ".html", ".js", ".mjs", ".svg"]);
const SKIP_DIR = new Set([
  "node_modules", ".next", "out", "dist", ".git", "coverage",
  "_archived_migrations_2026-05-09", "playwright-report", "test-results",
]);

/**
 * Files exempt, each with the reason it is exempt. An entry here is a decision on
 * the record, not a way to quiet the guard — anything added needs a reason that
 * survives being read back in six months.
 */
const ALLOWLIST = {
  "frontend/src/app/global-error.tsx":
    "Replaces the whole document when React itself fails; webfonts may not have " +
    "loaded at that point, so a system stack is deliberate. Ratified in the " +
    "typography audit as a decision rather than a defect.",

  // --- Dead surfaces. Present in the tree, reachable by nothing. Documented in
  // docs/internal/typography-audit.md section 5 so nobody 'fixes' a rule that
  // draws nothing. Delete these and the entries go with them.
  "frontend/public/auth/login.html":
    "Shadowed by the React route at the same path (audit section 2) — renders nowhere.",
  "frontend/public/auth/forgot-password.html":
    "Shadowed by the React route at the same path — renders nowhere.",
  "frontend/public/auth/reset-password.html":
    "Shadowed by the React route at the same path — renders nowhere.",
  "frontend/public/shared/css/pages/auth/login.css":
    "Attached only to a shadowed orphan page — never loaded.",
  "frontend/public/shared/css/pages/auth/forgot-password.css":
    "Attached only to a shadowed orphan page — never loaded.",
  "frontend/public/shared/css/pages/auth/reset-password.css":
    "Attached only to a shadowed orphan page — never loaded.",
  "frontend/public/shared/css/pages/auth/carrier-login.css":
    "Orphan stylesheet — referenced by no HTML in public/.",
  "frontend/public/shared/css/pages/auth/carrier-register.css":
    "Orphan stylesheet — referenced by no HTML in public/.",
  "frontend/public/shared/css/pages/auth/carrier-forgot-password.css":
    "Orphan stylesheet — referenced by no HTML in public/.",
  "frontend/public/shared/css/pages/auth/root-login.css":
    "Orphan stylesheet — referenced by no HTML in public/.",
  "frontend/public/shared/css/pages/auth/root-register.css":
    "Orphan stylesheet — referenced by no HTML in public/.",
  "frontend/public/shared/css/pages/tracking.css":
    "Orphan stylesheet — tracking.html does not exist in public/.",
  "frontend/public/js/session-timeout.js":
    "Marked ORPHANED at the top of the file; nothing loads it.",
  "frontend/public/logo.svg":
    "Brand asset, not a stylesheet. Changing the wordmark's embedded family is a " +
    "brand-asset decision (skill section 20.8: the live export Wasi supplies is " +
    "canonical), not a typography cleanup.",
  "frontend/public/hero-map.svg":
    "Orphan asset — referenced by no HTML or component in the repo. Renders nowhere.",

  // --- Email. Out of scope by decision, not oversight: mail clients do not load
  // webfonts reliably, so a system or Arial stack is correct practice there rather
  // than drift. Recorded in docs/internal/typography-audit.md section 3.
  "backend/src/services/emailService.ts": "Email — webfonts unreliable in mail clients.",
  "backend/src/services/complianceMonitorService.ts": "Email bodies — webfonts unreliable in mail clients.",
  "backend/src/services/sentryAlertService.ts": "Email — webfonts unreliable in mail clients.",
  "backend/src/services/insuranceVerificationService.ts": "Email — webfonts unreliable in mail clients.",
  "backend/src/services/healthDigestService.ts": "Email digest — webfonts unreliable in mail clients.",
  "backend/src/controllers/complianceController.ts": "Email body — webfonts unreliable in mail clients.",
  "backend/src/email/builder.ts": "Email chrome — webfonts unreliable in mail clients.",
  "backend/src/config/signatures/whaider.html": "Email signature — webfonts unreliable in mail clients.",
};

/** Paths scanned. Everything that can put type on a screen. */
const SCAN_ROOTS = ["frontend/src", "frontend/public", "backend/src"];

function firstNamedFamily(stack) {
  for (const raw of stack.split(",")) {
    const fam = raw.trim().replace(/^['"]|['"]$/g, "").trim().toLowerCase();
    if (!fam) continue;
    if (GENERIC.has(fam)) continue;
    return fam;
  }
  return null; // pure generic stack — no brand claim either way
}

function scanFile(abs, rel, canon, hits, stats) {
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    // CSS `font-family:` and the JSX `fontFamily=` / `fontFamily:` forms.
    const reFamily = /(?:font-family\s*[:=]|fontFamily\s*[:=])\s*(["'{]?)([^;}\n]*)/gi;
    let m;
    while ((m = reFamily.exec(line))) {
      let stack = m[2];
      stats.declarations += 1;
      if (/var\(\s*--/.test(stack)) { stats.tokenized += 1; continue; }
      // strip a leading quote/brace left by the JSX forms, and anything past the close
      stack = stack.replace(/^\s*["'{]?\s*/, "").replace(/["'}].*$/, "");
      const fam = firstNamedFamily(stack);
      if (!fam) continue;
      if (canon.has(fam)) { stats.canonical += 1; continue; }
      hits.push({ file: rel, line: i + 1, family: fam, text: line.trim().slice(0, 120) });
    }

    // The CSS `font:` shorthand, handled separately because a size is MANDATORY in
    // it. That is what separates a real shorthand from a PDFKit object literal like
    // `{ font: FONT_BODY, size: 10 }`, which an unanchored pattern reported as a
    // family called "font_body". A guard with false positives is one people learn
    // to ignore, so the size is required rather than assumed.
    const reShorthand =
      /(?:^|[;{\s])font\s*:\s*((?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)\s+)*[\d.]+(?:px|pt|rem|em|%)[^;}\n]*)/gi;
    let ms;
    while ((ms = reShorthand.exec(line))) {
      let stack = ms[1];
      stats.declarations += 1;
      if (/var\(\s*--/.test(stack)) { stats.tokenized += 1; continue; }
      stack = stack.replace(/^\s*(?:[\d.]+(?:px|pt|rem|em|%)?(?:\s*\/\s*[\d.]+)?\s*)+/, "");
      const fam = firstNamedFamily(stack);
      if (!fam) continue;
      if (canon.has(fam)) { stats.canonical += 1; continue; }
      hits.push({ file: rel, line: i + 1, family: fam, text: line.trim().slice(0, 120) });
    }
  });
}

function scanFontDrift() {
  const canon = readCanon();
  const hits = [];
  const stats = { files: 0, declarations: 0, tokenized: 0, canonical: 0, allowlisted: 0 };

  for (const root of SCAN_ROOTS) {
    const abs = path.join(REPO, root);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const dir = stack.pop();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIR.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { stack.push(p); continue; }
        if (!SCAN_EXT.has(path.extname(e.name))) continue;
        const rel = path.relative(REPO, p).replace(/\\/g, "/");
        stats.files += 1;
        scanFile(p, rel, canon, hits, stats);
      }
    }
  }

  const violations = hits.filter((h) => {
    if (ALLOWLIST[h.file]) { stats.allowlisted += 1; return false; }
    return true;
  });

  return { canon: [...canon].sort(), violations, stats, allowlist: ALLOWLIST };
}

module.exports = { scanFontDrift, readCanon, ALLOWLIST, SCAN_ROOTS };

if (require.main === module) {
  const { canon, violations, stats } = scanFontDrift();
  console.log(`canon (from skill): ${canon.join(", ")}`);
  console.log(
    `scanned ${stats.files} files · ${stats.declarations} declarations · ` +
    `${stats.tokenized} tokenized · ${stats.canonical} canonical · ` +
    `${stats.allowlisted} allowlisted`
  );
  if (violations.length === 0) {
    console.log("\nNo font drift.");
    process.exit(0);
  }
  console.log(`\n${violations.length} non-canonical font declaration(s):\n`);
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}  ->  ${v.family}`);
    console.log(`      ${v.text}`);
  }
  process.exit(1);
}
