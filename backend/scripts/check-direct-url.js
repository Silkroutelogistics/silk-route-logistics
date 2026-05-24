#!/usr/bin/env node
// v3.8.ajs — Pre-migrate DIRECT_URL configuration guard.
//
// Runs at build time BEFORE `prisma migrate deploy`. Fails fast (exit 1)
// with a clear diagnostic message if DIRECT_URL is missing or contains
// `-pooler` in the hostname. This catches the misconfiguration class
// that hit v3.8.ajr's deploy (Render env var was set but to the pooled
// URL by mistake → Prisma still routed migrate through the pooler →
// P1002 advisory-lock timeout in 10s).
//
// Without this guard, the failure mode is a silent 10-second P1002
// timeout that gives no hint about WHY it happened. With this guard,
// the build fails in <1s with a self-explanatory message + the exact
// remediation steps.
//
// Banks the four-location checklist (CLAUDE.md §19 Sub-pattern 11
// case study #2) as enforced code, not just docs.

"use strict";

const url = process.env.DIRECT_URL;

function fail(message, ...lines) {
  console.error("");
  console.error("╔════════════════════════════════════════════════════════════════╗");
  console.error("║ ❌ DIRECT_URL configuration error                              ║");
  console.error("╚════════════════════════════════════════════════════════════════╝");
  console.error("");
  console.error(message);
  if (lines.length > 0) {
    console.error("");
    for (const line of lines) console.error(line);
  }
  console.error("");
  console.error("Remediation (Render dashboard):");
  console.error("  1. Go to silk-route-logistics service → Environment tab");
  console.error("  2. Edit the DIRECT_URL row");
  console.error("  3. Set it to Neon's DIRECT (unpooled) endpoint:");
  console.error("     - Neon dashboard → Branches → production branch");
  console.error("     - Connection Details → toggle to 'Direct / Unpooled'");
  console.error("     - Copy the postgresql:// URL");
  console.error("     - The hostname must NOT contain '-pooler'");
  console.error("  4. Click 'Save Changes'");
  console.error("  5. Manual Deploy → Deploy latest commit");
  console.error("");
  console.error("See CLAUDE.md §2.2 + §11 v3.8.ajg row for full rationale.");
  console.error("");
  process.exit(1);
}

if (!url) {
  fail(
    "DIRECT_URL env var is not set.",
    "Prisma's `directUrl = env(\"DIRECT_URL\")` in schema.prisma:27 requires this var",
    "for migrate operations. Without it, all migrate calls route through the pooler",
    "and hit P1002 advisory-lock contention.",
  );
}

// Parse the URL to extract the hostname. Use URL constructor for robust parsing
// (handles edge cases like passwords with @ signs, etc).
let hostname;
try {
  const parsed = new URL(url);
  hostname = parsed.hostname;
} catch (err) {
  fail(
    "DIRECT_URL is set but cannot be parsed as a valid URL.",
    `Error: ${err.message}`,
    "Value should start with 'postgresql://' and contain a valid hostname.",
  );
}

if (hostname.includes("-pooler")) {
  fail(
    `DIRECT_URL hostname contains '-pooler' (got: ${hostname}).`,
    "This is the POOLED Neon endpoint — must be the DIRECT (unpooled) endpoint",
    "to avoid the P1002 advisory-lock contention class.",
    "",
    "The pooler keeps connections cached between requests, so the advisory lock",
    "(pg_advisory_lock(72707369)) acquired by `prisma migrate deploy` is held by",
    "a cached connection that doesn't release until Neon's idle timer expires",
    "(~5 min). Every migrate-bearing deploy plays roulette against that cache.",
  );
}

// Optional belt-and-suspenders sanity check: DATABASE_URL and DIRECT_URL should
// share the same project ID (i.e., the hostname prefix up to the first dot
// should be IDENTICAL except for the `-pooler` suffix). Warn (not fail) if not.
if (process.env.DATABASE_URL) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const dbProject = dbUrl.hostname.replace("-pooler", "").split(".")[0];
    const directProject = hostname.split(".")[0];
    if (dbProject !== directProject) {
      console.warn("");
      console.warn("⚠️  WARNING: DATABASE_URL and DIRECT_URL point at DIFFERENT Neon projects.");
      console.warn(`   DATABASE_URL project: ${dbProject}`);
      console.warn(`   DIRECT_URL project:   ${directProject}`);
      console.warn("   They should be the same project — only the -pooler segment differs.");
      console.warn("   Continuing anyway, but verify this is intentional.");
      console.warn("");
    }
  } catch {
    // DATABASE_URL parse failure isn't fatal here — Prisma will surface it.
  }
}

console.log(`✓ DIRECT_URL configured correctly (hostname: ${hostname}, no -pooler)`);
