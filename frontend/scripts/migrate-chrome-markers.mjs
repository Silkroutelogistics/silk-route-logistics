#!/usr/bin/env node
// ONE-TIME migration: walks public/*.html, replaces the first top-level
// <nav>...</nav> and the first top-level <footer>...</footer> in each page
// with <!-- INCLUDE:nav --> / <!-- INCLUDE:footer --> markers. After this
// runs, inject-chrome.mjs (the permanent prebuild step) owns those regions.
//
// Deleted after initial use. Kept in source control for history.
//
// Usage: node frontend/scripts/migrate-chrome-markers.mjs [--dry]
//
// Safety: only touches the FIRST <nav> / <footer> match per file. If a page
// has nested nav/footer (unlikely in our case), it won't clobber them.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "..", "public");
const DRY = process.argv.includes("--dry");

const NAV_MARKER = "<!-- INCLUDE:nav -->\n  <!-- END INCLUDE:nav -->";
const FOOTER_MARKER = "<!-- INCLUDE:footer -->\n  <!-- END INCLUDE:footer -->";

// Non-greedy match on the outermost tag. Won't match nested same-tag cases
// (fine for the SRL site — nav/footer are flat, no nesting).
const NAV_RE = /<nav\b[^>]*>[\s\S]*?<\/nav>\s*(?:<!--\s*Mobile[\s\S]*?<div class="mobile-menu"[\s\S]*?<\/div>\s*)?/i;
const SIMPLE_NAV_RE = /<nav\b[^>]*>[\s\S]*?<\/nav>/i;
const FOOTER_RE = /<footer\b[^>]*>[\s\S]*?<\/footer>/i;

// Marketing surface only. `ae/**` (internal AE console) and `carrier/**`
// (carrier portal) and `auth/**` (auth screens) have their own scoped chrome
// and MUST NOT receive the marketing nav/footer.
const MARKETING_PAGES = new Set([
  "about.html", "blog.html", "careers.html", "carriers.html", "contact.html",
  "faq.html", "index.html", "login.html", "privacy.html", "register.html",
  "security-policy.html", "shippers.html", "terms.html", "tracking.html",
]);

async function walkHtml(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".html")) continue;
    if (!MARKETING_PAGES.has(ent.name)) continue;
    out.push(path.join(dir, ent.name));
  }
  return out;
}

function replaceFirstNav(html) {
  if (html.includes("<!-- INCLUDE:nav -->")) return { html, changed: false };
  // Try to also swallow an adjacent mobile-menu block so we don't leave a
  // stale mobile menu behind (index.html pattern).
  let m = html.match(NAV_RE);
  if (!m) m = html.match(SIMPLE_NAV_RE);
  if (!m) return { html, changed: false };
  const out = html.slice(0, m.index) + NAV_MARKER + html.slice(m.index + m[0].length);
  return { html: out, changed: true };
}

function replaceFirstFooter(html) {
  if (html.includes("<!-- INCLUDE:footer -->")) return { html, changed: false };
  const m = html.match(FOOTER_RE);
  if (!m) return { html, changed: false };
  const out = html.slice(0, m.index) + FOOTER_MARKER + html.slice(m.index + m[0].length);
  return { html: out, changed: true };
}

const files = await walkHtml(publicDir);
const report = [];
for (const f of files) {
  const before = await readFile(f, "utf8");
  const n = replaceFirstNav(before);
  const fr = replaceFirstFooter(n.html);
  const changed = n.changed || fr.changed;
  if (changed) {
    report.push({ file: path.relative(publicDir, f), nav: n.changed, footer: fr.changed });
    if (!DRY) await writeFile(f, fr.html, "utf8");
  }
}

console.log(`[migrate-chrome-markers] ${DRY ? "DRY — " : ""}rewrote ${report.length} file(s)`);
for (const r of report) console.log(`  ${r.file}  nav=${r.nav}  footer=${r.footer}`);
