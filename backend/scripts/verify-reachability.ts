/** v3.8.asb — REACHABILITY GATE.
 *
 *  WHY THIS EXISTS. Across one arc this repo shipped correct work onto a dead
 *  surface three separate times:
 *
 *    1. v3.8.arn changed a detention default in frontend/public/ae/tender.html.
 *       `_redirects` 301s /ae/tender* away. The page is never served, so the
 *       edit had no effect at all.
 *    2. autoRateConfirmationService computed `quickPayCellValue`, a display
 *       string "pre-measured" for the rate confirmation's QUICK PAY cell. The
 *       renderer never read it. Its only consumers were three tests asserting
 *       it had been written, which is what made a dead value look alive.
 *    3. The accessorial approve/reject control existed only in
 *       frontend/public/ae/track-trace.html — also redirected, also never
 *       served. Detention was computed, stored, and could never be approved,
 *       so it reached neither the carrier nor the customer.
 *
 *  Every one of those passed tsc, passed the test suite, and passed review. A
 *  grep for the SYMBOL finds it and looks healthy; only a grep for its
 *  CONSUMERS shows the truth. That asymmetry is the whole defect class, and it
 *  is what this script checks.
 *
 *  WHAT IT CHECKS, against a git baseline:
 *    1. ROUTES     every frontend page added since the baseline is served and
 *                  is not swallowed by a _redirects rule
 *    2. ENDPOINTS  every backend route added since the baseline has at least
 *                  one frontend caller, counting dynamically-built paths
 *    3. VALUES     every exported function added since the baseline has at
 *                  least one consumer outside its own definition
 *
 *  USAGE
 *    npx tsx scripts/verify-reachability.ts               # vs origin/main
 *    npx tsx scripts/verify-reachability.ts <git-ref>     # vs any ref
 *
 *  EXIT CODES  0 = every item reachable · 1 = at least one dead item
 *
 *  ON FALSE POSITIVES. A literal-string search under-reports paths built from
 *  template literals — `api.post(`/carriers/${id}/quickpay/${action}`)` will not
 *  match "/quickpay/approve". Check 2 therefore also matches on the path's
 *  distinctive final segment. It can still be wrong, so a FAIL here is a
 *  prompt to look, not a verdict. A PASS is the meaningful signal.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(__dirname, "..", "..");
const BASELINE = process.argv[2] || "origin/main";

const git = (args: string[]): string => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
};

/** Every tracked source file, read once. Searching this in memory is far faster
 *  than shelling out to grep per symbol, and it keeps the check hermetic. */
function sourceCorpus(): { file: string; body: string }[] {
  // v3.8.asc — backend/scripts and backend/prisma added. They were missing, and
  // the gate reported three healthy exports as DEAD because their only consumers
  // are a verification script and the SOP seeds. Seeds and build-time scripts are
  // real consumers: a constant read only by prisma/seed-sops.ts still decides what
  // an AE reads in production. The omission made the gate wrong in the direction
  // that gets working code deleted, which is the worse direction for a gate to
  // fail in — it trains people to ignore it.
  // v3.8.asz — backend/__tests__ added, for the same reason and with the same
  // failure mode. This gate HAS a "consumed only by tests" verdict, which is a
  // REVIEW rather than a failure — but backend unit tests were not in the corpus,
  // so that branch could never fire for them and a test-only export was reported
  // DEAD instead. Reporting an export as unreachable when a test reaches it sends
  // someone to delete a helper their test depends on. e2e/ was already listed;
  // this closes the gap for backend/__tests__.
  const files = git([
    "ls-files",
    "backend/src", "backend/scripts", "backend/prisma", "backend/__tests__",
    "frontend/src", "frontend/public", "e2e",
  ])
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter((f) => /\.(ts|tsx|js|jsx|html)$/.test(f));
  const out: { file: string; body: string }[] = [];
  for (const f of files) {
    try {
      out.push({ file: f, body: fs.readFileSync(path.join(REPO, f), "utf8") });
    } catch {
      /* deleted between ls-files and read */
    }
  }
  return out;
}

// The baseline must resolve, and this must be checked BEFORE any diff.
//
// git() swallows failures and returns "", which is right for an optional lookup and
// catastrophic here: an unresolvable baseline produces an empty diff, the gate finds
// nothing to check, and it PASSES. A gate that silently checks nothing is worse than
// no gate, because it is trusted.
//
// That is not hypothetical. This gate now runs in CI against `HEAD^`, and
// actions/checkout defaults to a depth-1 clone where `HEAD^` does not exist. The
// workflow sets fetch-depth: 2 — but if anyone removes it, or a future event type
// checks out differently, this is the line that says so instead of going quiet.
{
  const resolved = git(["rev-parse", "--verify", "--quiet", `${BASELINE}^{commit}`]).trim();
  if (!resolved) {
    console.error(`\n  Baseline ref "${BASELINE}" does not resolve in this clone.`);
    console.error(`  Nothing can be diffed, so this gate would pass while checking nothing.`);
    console.error(`  In CI: actions/checkout needs fetch-depth >= 2 for HEAD^.`);
    console.error(`  Locally: pass a ref that exists, e.g. origin/main.\n`);
    process.exit(2);
  }
}

/** Lines added since the baseline, per file. */
function addedLines(pathspec: string): { file: string; text: string }[] {
  const diff = git(["diff", BASELINE, "--unified=0", "--", pathspec]);
  const out: { file: string; text: string }[] = [];
  let current = "";
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) current = line.slice(6).trim();
    else if (line.startsWith("+") && !line.startsWith("+++")) out.push({ file: current, text: line.slice(1) });
  }
  return out;
}

type Verdict = { item: string; where: string; verdict: "SERVED" | "REACHED" | "DEAD" | "REVIEW"; note: string };
const results: Verdict[] = [];

// ── CHECK 1 — routes are served and not redirected ──────────────────────────
const redirectsPath = path.join(REPO, "frontend", "public", "_redirects");
const redirectRules = fs.existsSync(redirectsPath)
  ? fs
      .readFileSync(redirectsPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const [from, to, code] = l.split(/\s+/);
        return { from, to, code: code || "" };
      })
  : [];

/** Does any rule swallow this route? A `200` rule is a rewrite and keeps the
 *  URL, so it does not make a page unreachable. A 301/302 sends it elsewhere. */
function swallowedBy(routePath: string): string | null {
  for (const r of redirectRules) {
    if (!r.code.startsWith("30")) continue;
    const pattern = r.from.replace(/\*$/, "");
    if (r.from.endsWith("*") ? routePath.startsWith(pattern) : routePath === r.from) {
      return `${r.from} -> ${r.to} ${r.code}`;
    }
  }
  return null;
}

const newPages = git(["diff", BASELINE, "--name-only", "--diff-filter=A", "--", "frontend/src/app"])
  .split(/\r?\n/)
  .filter((f) => f.endsWith("/page.tsx"));

for (const p of newPages) {
  const route = "/" + p.replace(/^frontend\/src\/app\//, "").replace(/\/page\.tsx$/, "");
  const swallowed = swallowedBy(route);
  results.push(
    swallowed
      ? { item: route, where: p, verdict: "DEAD", note: `redirected away by ${swallowed}` }
      : { item: route, where: p, verdict: "SERVED", note: "no redirect rule matches" },
  );
}

// Any NEW work landing in frontend/public/ae is dead on arrival — CLAUDE.md §2
// calls those pages legacy scaffolding and _redirects sends every one of them
// to a React route.
for (const { file } of addedLines("frontend/public/ae")) {
  if (!file) continue;
  const url = "/" + file.replace(/^frontend\/public\//, "");
  results.push({
    item: url,
    where: file,
    verdict: "DEAD",
    note: "legacy /ae scaffolding — redirected away and never served (CLAUDE.md §2)",
  });
}

// ── CHECK 2 — endpoints have a caller ───────────────────────────────────────
const corpus = sourceCorpus();
const frontend = corpus.filter((c) => c.file.startsWith("frontend/"));

const endpointPaths = new Set<string>();
for (const { text } of addedLines("backend/src/routes")) {
  const m = text.match(/^\s*(?:router\.(?:get|post|put|patch|delete)\(\s*)?"(\/[^"]*)"/);
  if (m && m[1]) endpointPaths.add(m[1]);
}

for (const ep of [...endpointPaths].sort()) {
  // Distinctive segments only: ":id" and bare "/" tell us nothing.
  const segs = ep.split("/").filter((s) => s && !s.startsWith(":"));
  if (!segs.length) continue;
  const needle = segs[segs.length - 1];
  const hits = frontend.filter((f) => f.body.includes(ep) || f.body.includes(needle));
  results.push(
    hits.length
      ? { item: `endpoint ${ep}`, where: hits[0].file, verdict: "REACHED", note: `${hits.length} caller file(s)` }
      : { item: `endpoint ${ep}`, where: "backend/src/routes", verdict: "DEAD", note: "no frontend caller found" },
  );
}

// ── CHECK 3 — exported values have a consumer ───────────────────────────────
const exports_ = new Set<string>();
for (const { text } of addedLines("backend/src")) {
  const m = text.match(/export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (m && m[1]) exports_.add(m[1]);
}

for (const name of [...exports_].sort()) {
  const definition = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`);
  const word = new RegExp(`\\b${name}\\b`, "g");

  // Consumers in OTHER files.
  const consumers = corpus.filter((c) => word.test(c.body) && !definition.test(c.body));

  // Usage inside the defining file counts as reachable — a helper called by its
  // own module is not dead, it merely may not need to be exported. Excluding
  // the home file (the first version of this gate did) reported three live
  // helpers as dead, which would have sent someone deleting working code.
  // Count occurrences beyond the single definition.
  const home = corpus.find((c) => definition.test(c.body));
  const homeUses = home ? (home.body.match(word) || []).length - 1 : 0;

  const testOnly =
    consumers.length > 0 &&
    homeUses === 0 &&
    consumers.every((c) => c.file.includes("__tests__") || c.file.startsWith("e2e/"));

  if (!consumers.length && homeUses > 0) {
    results.push({
      item: `export ${name}`,
      where: home?.file ?? "backend/src",
      verdict: "REACHED",
      note: `${homeUses} use(s) in its own module — export may be unnecessary`,
    });
  } else if (!consumers.length) {
    results.push({ item: `export ${name}`, where: "backend/src", verdict: "DEAD", note: "no consumer anywhere" });
  } else if (testOnly) {
    // This is exactly how quickPayCellValue looked healthy: written, asserted,
    // and read by nothing that ships.
    results.push({
      item: `export ${name}`,
      where: consumers[0].file,
      verdict: "REVIEW",
      note: "consumed ONLY by tests — no production reader",
    });
  } else {
    results.push({
      item: `export ${name}`,
      where: consumers.find((c) => !c.file.includes("__tests__"))?.file ?? consumers[0].file,
      verdict: "REACHED",
      note: `${consumers.length} consumer file(s)`,
    });
  }
}

// ── CHECK 4 — new schema columns are both written AND read ──────────────────
//
// This is the check that would have caught `carrierInvoiceId` and
// `shipperInvoiceId`: foreign keys designed for the accessorial-to-invoice
// link, migrated, and then referenced NOWHERE in the codebase for months. A
// column that nothing writes is a promise the schema makes and the code does
// not keep; one that nothing reads is work thrown away after it is done.
// Only SCALAR columns. A Prisma relation field (`invoices Invoice[]`,
// `reviewedBy User?`) exists so Prisma can build its relation graph and is
// never referenced by name in application code unless someone uses it in an
// `include` — so checking it for readers reports healthy relations as dead.
// The first version of this check did exactly that and flagged five.
const SCALARS = new Set([
  "String", "Int", "Float", "Boolean", "DateTime", "Json", "Decimal", "BigInt", "Bytes",
]);
const schemaEnums = new Set(
  (fs.readFileSync(path.join(REPO, "backend", "prisma", "schema.prisma"), "utf8").match(/^enum\s+(\w+)/gm) || [])
    .map((l) => l.replace(/^enum\s+/, "")),
);
const schemaFields = new Set<string>();
for (const { text } of addedLines("backend/prisma/schema.prisma")) {
  const m = text.match(/^\s{2,}([a-z][A-Za-z0-9_]*)\s+([A-Za-z]+)/);
  if (!m) continue;
  const [, field, type] = m;
  if (SCALARS.has(type) || schemaEnums.has(type)) schemaFields.add(field);
}

const backendSrc = corpus.filter((c) => c.file.startsWith("backend/src"));
for (const field of [...schemaFields].sort()) {
  const word = new RegExp(`\\b${field}\\b`);
  const files = backendSrc.filter((c) => word.test(c.body));
  // A write looks like `field:` in an object literal; a read looks like
  // `.field` or a `select`/`where` mention. Crude, but it separates the two
  // failure modes, which are different bugs with different fixes.
  const written = files.some((c) => new RegExp(`\\b${field}\\s*:`).test(c.body));
  const read = files.some((c) => new RegExp(`\\.${field}\\b`).test(c.body));
  if (!files.length) {
    results.push({ item: `column ${field}`, where: "schema.prisma", verdict: "DEAD", note: "referenced nowhere in backend/src" });
  } else if (!written) {
    results.push({ item: `column ${field}`, where: files[0].file, verdict: "REVIEW", note: "read but never written — will always be null" });
  } else if (!read) {
    results.push({ item: `column ${field}`, where: files[0].file, verdict: "REVIEW", note: "written but never read — verify something consumes it" });
  } else {
    results.push({ item: `column ${field}`, where: files[0].file, verdict: "REACHED", note: `written and read across ${files.length} file(s)` });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\nREACHABILITY GATE — everything added since ${BASELINE}\n`);
if (!results.length) {
  console.log("  nothing new to check.\n");
  process.exit(0);
}
const width = Math.max(...results.map((r) => r.item.length));
for (const r of results) {
  const mark = r.verdict === "DEAD" ? "FAIL" : r.verdict === "REVIEW" ? "REVIEW" : "ok";
  console.log(`  ${r.item.padEnd(width)}  ${r.verdict.padEnd(7)} ${mark.padEnd(7)} ${r.note}`);
  if (r.verdict !== "REACHED" && r.verdict !== "SERVED") console.log(`  ${" ".repeat(width)}  -> ${r.where}`);
}

const dead = results.filter((r) => r.verdict === "DEAD");
const review = results.filter((r) => r.verdict === "REVIEW");
console.log(
  `\n  ${results.length} checked · ${dead.length} dead · ${review.length} test-only\n`,
);
if (dead.length) {
  console.log("  DEAD items ship work nobody can reach. Wire them or delete them.\n");
  process.exit(1);
}
if (review.length) {
  console.log("  Test-only items are not a failure, but confirm each is genuinely\n  consumed in production before shipping.\n");
}
console.log("  ALL REACHABLE\n");
