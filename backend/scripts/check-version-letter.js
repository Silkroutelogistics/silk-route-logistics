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
 *  4. (inline below) ANOTHER SESSION'S UNCOMMITTED FILES claim letters git
 *     cannot see. The unstaged diff is scanned and each claim named by file.
 *
 *  5. AN UNPUSHED COMMIT IS A CLAIM WHOEVER MADE IT (2026-09-07). The working
 *     tree is shared, so the local branch is shared, so a commit in
 *     origin/main..HEAD can be a PEER'S. Trap 2's allowance treated every such
 *     letter as "my own arc, free to reuse" and left it out of `highest` —
 *     which, with a peer's v3.8.bax sitting unpushed, told this session the
 *     next free letter was bax: the exact duplicate the guard exists to
 *     prevent, reported as OK. Unpushed subjects and the HEAD footer now count
 *     toward `highest`, and reusing one is refused. Continuing an arc under one
 *     letter is done with UNVERSIONED commits (no letter in the subject), which
 *     is how every arc since v3.8.aws has worked and what §3.1 says anyway.
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

// Arc 27 — report WHICH FILE claims each letter, not just the letter.
//
// This scan cannot tell a CLAIM from a historical REFERENCE. An arc that
// documents its own history writes "v3.8.atu" into prose and trips its own
// guard; teaching it that difference means teaching it semantics. Naming the
// file instead lets a human decide in one glance, which is all that was ever
// needed.
//
// Arc 26 nearly dismissed a REAL collision for want of exactly this. The output
// said only "auj", and part of that signal WAS self-inflicted (its own version
// bump) — which made the whole of it look explainable. The other part was
// another session's schema.prisma, and a file name would have said so
// immediately. A guard that cries wolf is one people learn to ignore, and the
// cost of ignoring this one is two sessions shipping the same version.
const claimsByLetter = new Map();
for (const block of dirty.split(/^diff --git /m)) {
  const fileMatch = block.match(/^a\/(\S+)/m);
  const file = fileMatch ? fileMatch[1] : "(unknown file)";
  for (const m of block.matchAll(/^\+.*\bv(\d+\.\d+\.[a-z]+)/gm)) {
    const L = letterOf(m[1]);
    if (!L) continue;
    if (!claimsByLetter.has(L)) claimsByLetter.set(L, new Set());
    claimsByLetter.get(L).add(file);
  }
}
const claimedInTree = [...claimsByLetter.keys()];
if (claimedInTree.length) {
  console.log("  claimed in uncommitted work:");
  for (const [L, files] of claimsByLetter) {
    console.log(`    ${L.padEnd(5)} ${[...files].join(", ")}`);
  }
}

// The next free letter has to clear what origin knows, what is committed but
// unpushed on this branch (trap 5 — possibly a peer's), the footer as it
// stands at HEAD, and what is merely sitting in the tree. Computing it from
// origin alone told me `auf` was next while another session was already
// writing `auf` into files; computing it without the unpushed subjects told me
// `bax` was next while a peer's v3.8.bax commit was sitting in HEAD.
const headFooter = footerLetterAt("HEAD");
const highest = maxLetter([originMax, headFooter, ...mine, ...claimedInTree]);
const expected = highest ? nextLetter(highest) : intended;
console.log(`  footer at HEAD             : ${headFooter || "(none)"}`);
console.log(`  next free letter           : ${expected}`);
console.log(`  you intend                 : ${intended}`);

// Name the claimants, because the post-commit re-check (§19 Sub-pattern 19)
// runs this with the letter JUST committed, and the only thing separating
// "my own commit, as expected" from "a peer took it in the window" is which
// commits carry it. Exactly one claimant and it is HEAD: the re-check passes.
// Anything else — two claimants, or one that is not HEAD — is a collision,
// and the hashes are what let a session tell its own commit from another's.
const claimants = sh(`git log --format=%h%x09%s ${originRef}..HEAD`)
  .split("\n")
  .map((l) => { const [hash, ...rest] = l.split("\t"); return { hash, subject: rest.join("\t") }; })
  // Same extraction subjectLettersIn uses. letterOf alone wants a word
  // boundary before the digits, and "v3.8.bax" has none — the first cut of this
  // filter matched nothing and the refusal never fired (§19 Sub-pattern 16).
  .filter((c) => {
    const m = /\bv(\d+\.\d+\.[a-z]+)/.exec(c.subject);
    return c.hash && m && letterOf(m[1]) === intended;
  });
if (claimants.length) {
  const head = sh("git rev-parse --short HEAD");
  const onlyHead = claimants.length === 1 && (claimants[0].hash.startsWith(head) || head.startsWith(claimants[0].hash));
  if (onlyHead) {
    console.log(`\n  OK — v3.8.${intended} is HEAD's own subject, the only unpushed claimant (post-commit re-check):`);
    console.log(`    ${claimants[0].hash}  ${claimants[0].subject}`);
    console.log(`  If that commit is not yours, this is a collision, not an OK.`);
    process.exit(0);
  }
  console.error(`\nCOLLISION: v3.8.${intended} is already claimed by an unpushed commit on this branch:`);
  for (const c of claimants) console.error(`    ${c.hash}  ${c.subject}`);
  console.error(`In a shared working tree that commit may be another session's (git log ${originRef}..HEAD).`);
  console.error(`A commit is a claim whoever made it. Use ${expected}; an unversioned commit needs no letter.`);
  process.exit(1);
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
