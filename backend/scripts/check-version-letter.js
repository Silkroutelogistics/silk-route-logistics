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
 *  6. A LETTER ON ANY ORIGIN REF IS CLAIMED (2026-09-19). This guard read
 *     origin/main and nothing else. arc/carrier-archive-b1 was pushed to origin
 *     at 12:24 carrying v3.8.bdh–bdj; at 12:39 the guard cleared bdj for a
 *     commit on another branch, the pre-push run cleared the push, and both
 *     sets reached origin. Every ref under refs/remotes/origin/ now counts:
 *     main's last 40 subjects and its footer, and for every other ref the
 *     commits it holds that main does not. Claims are kept per ref and hash,
 *     so a refusal names what it found instead of asserting a maximum.
 *
 *  7. A BRANCH'S OWN UNMERGED LETTERS ARE CHECKED AGAINST ORIGIN, NOT ONLY THE
 *     LETTER YOU INTEND (2026-09-19, the same afternoon, the other session).
 *     Standing on b4a with bdh–bdj unmerged and origin/main at bdl, this guard
 *     printed both facts on adjacent lines and said OK for bdm: `mine` fed
 *     `highest` and was never intersected with what origin holds. Now any
 *     commit on this branch but not on origin/main whose letter origin claims
 *     under a DIFFERENT hash is a collision, named by both hashes. The remedy
 *     is rebase and re-letter; main keeps its letters (§13.3 Item 251:
 *     published history is not rewritten). Letters claimed by two origin refs
 *     are printed as DOUBLED so the next reader sees the state rather than
 *     inheriting it.
 *
 *  8. THE OTHER SESSIONS' BRANCHES ARE IN THIS .git ALREADY (2026-09-19, an
 *     addition beyond the ruling that closed 6 and 7, reported as such). Every
 *     worktree shares one object store and one refs/heads, so a peer's
 *     unpushed commits are visible here the moment they exist. On 2026-09-19
 *     arc/carrier-archive-b1 held bdh–bdj from 12:02, in this .git, and the
 *     guard cleared bdi at 12:21 and bdj at 12:39 without looking. Branches
 *     checked out in a worktree — a worktree is a session — now count, so a
 *     letter reserved by message (the peer's bdm, unpushed) is checked rather
 *     than trusted. Branches with no worktree are ignored: stale hold and
 *     feature branches carry letters main reused long ago.
 *
 * Exit 0 = safe to use. Exit 1 = collision or stale; the message says which.
 */

const { execSync } = require("child_process");

// maxBuffer: execSync defaults to 1 MiB and THROWS past it. VersionFooter.tsx
// crossed that at v3.8.bbt (2026-09-14); from then until 2026-09-19 every read
// of it threw, sh() swallowed the throw, and the guard printed "footer at HEAD:
// (none)" for five days — trap 1 switched off and reported as an absence.
const SH_OPTS = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 };
const sh = (cmd) => {
  try { return execSync(cmd, SH_OPTS).trim(); }
  catch { return ""; }
};
/** Like sh(), but a failure comes back as { error } so the caller can say WHY. */
const shStrict = (cmd) => {
  try { return { out: execSync(cmd, SH_OPTS).trim() }; }
  catch (e) { return { out: "", error: (e && (e.code || e.message)) || "unknown" }; }
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
  const r = shStrict(`git show ${ref}:${FOOTER}`);
  if (r.error) {
    // Loud, and by cause: the footer has carried SRL_VERSION since v3.7, and a
    // ref where it cannot be read is a broken instrument, not an absent value.
    console.error(`  WARNING: footer unreadable at ${ref} (${r.error}) — the guard cannot see SRL_VERSION there; the subjects still count.`);
    return null;
  }
  const m = /SRL_VERSION\s*=\s*["']([^"']+)["']/.exec(r.out);
  return m ? letterOf(m[1]) : null;
}

/**
 * The versioned commits in a range, each with its full hash — the hash is what
 * lets a claim on one ref be told apart from the same commit seen through
 * another ref (a pushed branch is on origin AND in origin/main..HEAD).
 */
function versionedCommitsIn(range, limit) {
  const log = sh(`git log --format=%H%x09%s ${limit ? `-${limit} ` : ""}${range}`);
  if (!log) return [];
  return log.split("\n").map((l) => {
    const [hash, ...rest] = l.split("\t");
    const subject = rest.join("\t");
    // \bv... — letterOf alone wants a word boundary before the digits, and
    // "v3.8.bax" has none; the first cut of this matched nothing (§19 SP16).
    const m = /\bv(\d+\.\d+\.[a-z]+)/.exec(subject);
    return { hash, subject, letter: m ? letterOf(m[1]) : null };
  }).filter((c) => c.hash && c.letter);
}

const short = (h) => (h ? h.slice(0, 8) : "footer");

const intended = letterOf(process.argv[2] || "");
if (!intended) {
  console.error("usage: node backend/scripts/check-version-letter.js <letter|version>");
  console.error("   eg: node backend/scripts/check-version-letter.js auf");
  process.exit(1);
}

// --prune, so a branch deleted on origin stops claiming letters here.
sh("git fetch -q --prune origin");

const originRef = sh("git rev-parse --verify -q origin/main") ? "origin/main" : null;
if (!originRef) {
  console.error("REFUSING: cannot resolve origin/main. Fetch first, then re-run.");
  process.exit(1);
}

// What origin already knows about, per trap 6: every ref, keyed by letter,
// each claim carrying the ref and hash that makes it. origin/main contributes
// its last 40 subjects and its footer (trap 1); every other origin ref
// contributes the commits it holds that main does not, because those are the
// letters it claims on its own account.
const originClaims = new Map(); // letter -> [{ ref, hash, subject }]
const claim = (letter, ref, hash, subject) => {
  if (!originClaims.has(letter)) originClaims.set(letter, []);
  originClaims.get(letter).push({ ref, hash, subject });
};
for (const c of versionedCommitsIn(originRef, 40)) claim(c.letter, originRef, c.hash, c.subject);
const originFooter = footerLetterAt(originRef);
if (originFooter) claim(originFooter, `${originRef} footer`, null, FOOTER);
const otherOriginRefs = sh("git for-each-ref --format=%(refname:short) refs/remotes/origin")
  .split("\n")
  .map((r) => r.trim())
  .filter((r) => r && r !== originRef && r !== "origin/HEAD");
for (const ref of otherOriginRefs) {
  for (const c of versionedCommitsIn(`${originRef}..${ref}`, 200)) claim(c.letter, ref, c.hash, c.subject);
}
// Trap 8: the branches the other worktrees have checked out, minus this one
// (its commits are `unmerged` below and are judged there, not here).
const headBranch = sh("git rev-parse --abbrev-ref HEAD");
const worktreeBranches = sh("git worktree list --porcelain")
  .split("\n")
  .filter((l) => l.startsWith("branch "))
  .map((l) => l.slice("branch ".length).trim().replace(/^refs\/heads\//, ""))
  .filter((b) => b && b !== headBranch);
for (const b of worktreeBranches) {
  for (const c of versionedCommitsIn(`${originRef}..${b}`, 200)) claim(c.letter, `worktree ${b}`, c.hash, c.subject);
}
const originMax = maxLetter([...originClaims.keys()]);
const describeClaims = (cs) => cs.map((c) => (c.hash ? `${c.ref} ${short(c.hash)}` : c.ref)).join(" | ");

// The versioned commits on this branch that origin/main does not have — my
// unpushed arc, a peer's unpushed arc in a shared tree (trap 5), or a pushed
// side branch (trap 7). Reusing one of these letters for a NEW commit is
// refused below; here they count toward `highest`.
const unmerged = versionedCommitsIn(`${originRef}..HEAD`);
const mine = unmerged.map((c) => c.letter);

console.log(`  highest claimed letter     : ${originMax || "(none)"}   (every refs/remotes/origin/* ref + every other worktree's branch)`);
console.log(`  claims, newest first (${originRef}: last 40 subjects + footer; other refs and worktrees: commits beyond main):`);
for (const L of [...originClaims.keys()].sort(cmp).reverse()) {
  console.log(`    ${L.padEnd(5)} ${describeClaims(originClaims.get(L))}`);
}
console.log(`  on this branch, not on ${originRef}: ${mine.length ? [...new Set(mine)].join(", ") : "(none)"}`);

// TRAP 7, the warning half. One letter claimed by two DIFFERENT origin refs is
// a duplicate waiting for a merge to make it permanent. Several commits under
// one letter on ONE ref is trap 2's normal arc and is not reported.
// "Doubled" is two DIFFERENT commits carrying the letter with no ref in
// common: the same commit seen through origin/arc/x AND worktree arc/x is one
// claim, and two commits of one arc on one ref (trap 2) share that ref. Only
// two claims that agree on nothing are two sessions.
const refsByHash = (cs) => {
  const m = new Map();
  for (const c of cs) { if (!c.hash) continue; if (!m.has(c.hash)) m.set(c.hash, new Set()); m.get(c.hash).add(c.ref); }
  return [...m.values()];
};
const disjointPair = (sets) => sets.some((a, i) => sets.some((b, j) => j > i && ![...a].some((r) => b.has(r))));
const doubled = [...originClaims.entries()].filter(([, cs]) => disjointPair(refsByHash(cs)));
if (doubled.length) {
  console.log(`\n  DOUBLED — one letter, two commits with no ref in common; merging the side branch duplicates it in main's history:`);
  for (const [L, cs] of doubled) console.log(`    ${L.padEnd(5)} ${describeClaims(cs.filter((c) => c.hash))}`);
  console.log(`  (a warning, not a refusal: the ref that is not ${originRef} re-letters from the next free letter; main keeps its own)`);
}

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

// TRAP 7, the refusing half, and it runs BEFORE the intended-letter checks:
// the post-commit re-check below answers "is HEAD the only claimant of the
// letter I just committed", and on a branch whose earlier commits are doubled
// that answer is yes while the branch cannot merge. A commit on this branch
// but not on origin/main, whose letter origin claims under a different hash,
// is a collision whatever letter is intended next.
const reused = unmerged
  .map((c) => ({ c, elsewhere: (originClaims.get(c.letter) || []).filter((o) => o.hash && o.hash !== c.hash) }))
  .filter((r) => r.elsewhere.length);
if (reused.length) {
  console.error(`\nCOLLISION: commits on this branch (not on ${originRef}) reuse letters already claimed under other commits:`);
  for (const { c, elsewhere } of reused) {
    console.error(`    v3.8.${c.letter}  ${short(c.hash)}  ${c.subject}`);
    console.error(`             duplicates  ${describeClaims(elsewhere)}`);
  }
  console.error(`Rebase onto ${originRef} and re-letter from ${expected}, or from the letter agreed by message.`);
  console.error(`${originRef} keeps its letters: published history is not rewritten (§13.3 Item 251).`);
  process.exit(1);
}

// Name the claimants, because the post-commit re-check (§19 Sub-pattern 19)
// runs this with the letter JUST committed, and the only thing separating
// "my own commit, as expected" from "a peer took it in the window" is which
// commits carry it. Exactly one claimant and it is HEAD: the re-check passes.
// Anything else — two claimants, or one that is not HEAD — is a collision,
// and the hashes are what let a session tell its own commit from another's.
const claimants = unmerged.filter((c) => c.letter === intended);
if (claimants.length) {
  const head = sh("git rev-parse HEAD");
  const onlyHead = claimants.length === 1 && claimants[0].hash === head;
  if (onlyHead) {
    console.log(`\n  OK — v3.8.${intended} is HEAD's own subject, the only unpushed claimant (post-commit re-check):`);
    console.log(`    ${short(claimants[0].hash)}  ${claimants[0].subject}`);
    console.log(`  If that commit is not yours, this is a collision, not an OK.`);
    process.exit(0);
  }
  console.error(`\nCOLLISION: v3.8.${intended} is already claimed by an unpushed commit on this branch:`);
  for (const c of claimants) console.error(`    ${short(c.hash)}  ${c.subject}`);
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

if (originClaims.has(intended)) {
  console.error(`\nCOLLISION: v3.8.${intended} is already claimed by ${describeClaims(originClaims.get(intended))}.`);
  console.error(`Another session holds it. Use ${expected} instead. Do not push over it.`);
  process.exit(1);
}

if (originMax && cmp(intended, originMax) <= 0) {
  console.error(`\nCOLLISION: v3.8.${intended} is below the highest claimed letter (${originMax}) — used before the 40-subject window.`);
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
