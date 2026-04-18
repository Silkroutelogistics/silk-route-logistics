#!/usr/bin/env node
// Marker-structure smoke check. CI-friendly — exits 0 on pass, 1 on fail.
// Catches the specific failure mode that produced the v3.6.f/g regression:
//   - END markers with orphan content immediately following
//   - INCLUDE without matching END (or vice versa)
//   - nested/duplicate markers
//
// Usage (from frontend/): npm run verify-chrome

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "public");

const MARKETING_PAGES = new Set([
  "about.html", "blog.html", "careers.html", "carriers.html", "contact.html",
  "faq.html", "index.html", "login.html", "privacy.html", "register.html",
  "security-policy.html", "shippers.html", "terms.html", "tracking.html",
]);

// Content immediately after an END marker must be a blank line, comment, or
// the next legit container element (section/main/article/header/div wrapper).
// An <a>, stray </div>, or inline element is suspicious — indicates an orphan
// fragment survived a migrator.
const SUSPICIOUS_AFTER_END = /<!-- END INCLUDE:(nav|footer) -->[ \t]*(?!$|\r?\n|<!--|<section\b|<main\b|<article\b|<header\b|<div\s+class="container"|<div\s+class="page|<div\s+class="doc)/gm;

async function walkHtml(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".html")) continue;
    if (!MARKETING_PAGES.has(ent.name)) continue;
    out.push(path.join(dir, ent.name));
  }
  return out;
}

const files = await walkHtml(publicDir);
const failures = [];

for (const f of files) {
  const rel = path.relative(root, f);
  const html = await readFile(f, "utf8");

  // 1. Balanced marker counts per tag.
  for (const tag of ["nav", "footer"]) {
    const open = (html.match(new RegExp(`<!-- INCLUDE:${tag} -->`, "g")) || []).length;
    const close = (html.match(new RegExp(`<!-- END INCLUDE:${tag} -->`, "g")) || []).length;
    if (open !== close) {
      failures.push(`${rel}: ${tag} markers unbalanced — ${open} INCLUDE / ${close} END`);
    }
    if (open > 1 || close > 1) {
      failures.push(`${rel}: ${tag} markers appear more than once — ${open} INCLUDE / ${close} END`);
    }
  }

  // 2. No content immediately on the same line as an END marker.
  //    Legit shape is either the END marker alone on its line, or followed by a comment/section.
  const afterEndMatches = [...html.matchAll(SUSPICIOUS_AFTER_END)];
  for (const m of afterEndMatches) {
    const lineStart = html.lastIndexOf("\n", m.index) + 1;
    const lineEnd = html.indexOf("\n", m.index);
    const line = html.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
    failures.push(`${rel}: orphan content after END INCLUDE:${m[1]} — "${line.slice(0, 80)}${line.length > 80 ? "…" : ""}"`);
  }
}

if (failures.length === 0) {
  console.log(`[verify-chrome] pass — ${files.length} marketing HTML files, all marker regions clean`);
  process.exit(0);
}

console.error(`[verify-chrome] ${failures.length} failure(s):`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
