#!/usr/bin/env node
/**
 * Version-letter collision guard.
 *
 *   node backend/scripts/check-version-letter.js auf
 *
 * WHY THIS EXISTS. Two sessions worked this repo at once and both took
 * v3.8.aud. Nothing noticed. The letter is assigned from memory of "what came
 * last", and memory is exactly the thing a second session invalidates.
 *
 * THREE TRAPS THIS AVOIDS, each of which a naive guard falls into:
 *
 *  1. READING ONLY THE FOOTER IS NOT ENOUGH. An arc bumps SRL_VERSION in ONE
 *     commit while every commit in the arc already carries the new letter in
 *     its subject. Mid-arc the footer lags the subjects — verified standing at
 *     067c7bbe, where the footer read `aud` and the log subjects read `aue`. A
 *     footer-only guard computes the next letter as one already in use. So we
 *     take the MAXIMUM over the footer AND the commit subjects.
 *
 *  2. A REPEATED LETTER IS NOT A COLLISION. One arc legitimately ships several
 *     commits under one letter (three share v3.8.aue right now; CLAUDE.md §11
 *     records v3.8.ee shipping four). A duplicate-detector would cry wolf on
 *     every normal arc, and a guard that cries wolf gets ignored. What we
 *     actually check is whether the letter is already claimed ON ORIGIN by work
 *     that is not yours.
 *
 *  3. THE ANSWER GOES STALE WITHIN A SESSION. origin/main moved under this arc
 *     twice. Run this immediately before the commit, never once at kickoff.
 *
 * Exit 0 = safe to use. Exit 1 = collision or stale; the message says which.
 */

const { execSync } = require("child_process");

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};

/** "3.8.aud" / "v3.8.aud" / bare "aud" -> "aud" */
const letterOf = (v) => {
  const s = (v || "").trim();
  const full = /\b\d+\.\d+\.([a-z]+)\b/.exec(s);
  if (full) return full[1];
  // The usage line advertises a bare letter, so accept one. Anchored, or a
  // stray word in a commit subject would read as a version.
  return /^[a-z]{1,4}$/.test(s) ? s : null;
};

/** Letters order by length first, then alphabetically: z < aa, aa < ab. */
const cmp = (a, b) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0);
const maxLetter = (list) => list.filter(Boolean).sort(cmp).pop() || null;

/** aud -> aue, az -> ba, zz -> aaa */
function nextLetter(l) {
  const a = l.split("");
  let i = a.length - 1;
  for (;;) {
    if (a[i] === "z") { a[i] = "a"; i--; if (i < 0) return "a" + a.join(""); }
    else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); return a.join(""); }
  }
}

const FOOTER = "frontend/src/components/ui/VersionFooter.tsx";

function footerLetterAt(ref) {
  const body = sh(`git show ${ref}:${FOOTER}`);
  const m = /SRL_VERSION\s*=\s*["']([^"']+)["']/.exec(body);
  return m ? letterOf(m[1]) : null;
}

function subjectLettersIn(range) {
  const log = sh(`git log --format=%s ${range}`);
  if (!log) return [];
  return log.split("\n").map((s) => {
    const m = /\bv(\d+\.\d+\.[a-z]+)/.exec(s);
    return m ? letterOf(m[1]) : null;
  }).filter(Boolean);
}

const intended = letterOf(process.argv[2] || "");
if (!intended) {
  console.error("usage: node backend/scripts/check-version-letter.js <letter|version>");
  console.error("   eg: node backend/scripts/check-version-letter.js auf");
  process.exit(1);
}

sh("git fetch -q origin");

const originRef = sh("git rev-parse --verify -q origin/main") ? "origin/main" : null;
if (!originRef) {
  console.error("REFUSING: cannot resolve origin/main. Fetch first, then re-run.");
  process.exit(1);
}

// What origin already knows about — footer AND subjects, per trap 1.
const originClaimed = [footerLetterAt(originRef), ...subjectLettersIn(`${originRef} -40`)].filter(Boolean);
const originMax = maxLetter(originClaimed);

// Letters used by MY unpushed commits. Reusing one of these is continuing my
// own arc, which is normal and must not fail (trap 2).
const mine = subjectLettersIn(`${originRef}..HEAD`);

console.log(`  origin/main highest letter : ${originMax || "(none)"}`);
console.log(`  my unpushed commits use    : ${mine.length ? [...new Set(mine)].join(", ") : "(none)"}`);

// TRAP 4, found the first time this guard ran for real. Another session's
// work is UNCOMMITTED in the same working tree, so git knows nothing about it.
// The guard cleared `auf` as free while a second session was already writing
// `v3.8.auf` into files it had not committed yet. Anything claiming a letter in
// the working-tree diff is claiming it, committed or not.
// UNSTAGED only. What you have staged is deliberately yours and will carry
// your letter; scanning it makes the guard flag you for your own bump. What is
// unstaged and not yours is the other session's work in progress — which is the
// thing git cannot otherwise see.
const dirty = sh("git diff");
const claimedInTree = [...new Set(
  [...dirty.matchAll(/^\+.*\bv(\d+\.\d+\.[a-z]+)/gm)].map((m) => letterOf(m[1])).filter(Boolean),
)];
if (claimedInTree.length) console.log(`  claimed in uncommitted work: ${claimedInTree.join(", ")}`);

// The next free letter has to clear BOTH what origin knows and what is merely
// sitting in the tree. Computing it from origin alone told me `auf` was next
// while another session was already writing `auf` into files.
const highest = maxLetter([originMax, ...claimedInTree]);
const expected = highest ? nextLetter(highest) : intended;
console.log(`  next free letter           : ${expected}`);
console.log(`  you intend                 : ${intended}`);

if (mine.includes(intended)) {
  console.log(`\n  OK — ${intended} is your own unpushed arc; continuing it.`);
  process.exit(0);
}

if (claimedInTree.includes(intended)) {
  console.error(`\nCOLLISION: v3.8.${intended} appears in UNCOMMITTED work in this tree.`);
  console.error(`git cannot see another session's uncommitted commits, but their files can.`);
  console.error(`Check 'git status' for files you did not edit, then take the next free letter.`);
  process.exit(1);
}

if (originMax && cmp(intended, originMax) <= 0) {
  console.error(`\nCOLLISION: v3.8.${intended} is already claimed on origin/main.`);
  console.error(`Another session almost certainly holds it. Use ${expected} instead.`);
  console.error(`This is the v3.8.aud collision, caught. Do not push over it.`);
  process.exit(1);
}

if (intended !== expected) {
  console.error(`\nSEQUENCE BREAK: §3.1 says letters are continuous. Expected ${expected}, got ${intended}.`);
  console.error(`Skipping a letter is never correct; if you meant to continue an arc, commit it first.`);
  process.exit(1);
}

console.log(`\n  OK — ${intended} is free and continuous.`);
process.exit(0);
