/**
 * Per-column usage verdicts for Prisma schema fields.
 *
 * WHY A NEW TOOL RATHER THAN A FLAG ON PASS 2.
 *
 * Pass 2 of audit-completeness answers one question — "does this identifier
 * appear anywhere" — and that question has now been wrong in both directions
 * inside a week:
 *
 *   TOO PERMISSIVE. It matches raw file text, so a field named only in a COMMENT
 *   reads as referenced. A comment in trackingController explaining that
 *   accessCount and lastAccessedAt are deliberately NOT written made both
 *   disappear from the unreferenced list — two dead columns "cleared" on the
 *   strength of prose describing their deadness.
 *
 *   TOO BLUNT WHEN FIXED. Stripping comments and re-counting moved ~80 fields
 *   between buckets and was reverted, because a single yes/no count cannot say
 *   WHY a field matched. "Referenced" spans a live writer, a read in a select,
 *   and a name inside a log string, and those are three different facts.
 *
 * So the fix is not a better regex. It is reporting the KIND of reference:
 *
 *   WRITTEN       something assigns it — a Prisma `data:` payload or `x.f = ...`
 *   READ          something consults it — property access, select, include, where
 *   STRING_ONLY   the name survives only inside a string literal
 *   UNREFERENCED  nothing outside the schema mentions it at all
 *
 * A column that is READ but never WRITTEN is the interesting failure: code
 * depends on a value nothing produces. A column that is WRITTEN but never READ
 * is work thrown away. Neither is visible to a yes/no count.
 *
 * HEURISTIC, AND HONEST ABOUT IT. Distinguishing `data: { f: 1 }` from
 * `select: { f: true }` is done by looking back for the nearest enclosing
 * context keyword. That is not a parser and it will misjudge deeply nested or
 * unusual shapes. It is reported per match so a wrong verdict is visible rather
 * than silently folded into a total — which is the property the previous two
 * versions lacked.
 *
 * Usage:
 *   npx tsx scripts/audit-field-usage.ts                 # summary
 *   npx tsx scripts/audit-field-usage.ts --field w9Url   # one column, verbose
 *   npx tsx scripts/audit-field-usage.ts --self-test     # fixture verification
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOTS = ["backend/src", "frontend/src"];
const PRISMA_SCHEMA = path.join(REPO_ROOT, "backend/prisma/schema.prisma");

// DB_WRITTEN is not a fourth flavour of application usage — it is the
// classifier saying the question does not apply. See schemaFields().
export type UsageKind = "WRITTEN" | "READ" | "STRING_ONLY" | "UNREFERENCED" | "DB_WRITTEN";

export interface Match {
  file: string;
  line: number;
  kind: Exclude<UsageKind, "UNREFERENCED">;
  snippet: string;
}

/**
 * Remove comments, and record which spans were string literals.
 *
 * Comments become spaces so every byte offset still lines up with the original,
 * which is what lets a match report a correct line number.
 */
export function analyze(src: string): { code: string; stringSpans: Array<[number, number]> } {
  let out = "";
  const stringSpans: Array<[number, number]> = [];
  let i = 0;
  let quote: string | null = null;
  let stringStart = -1;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (quote) {
      if (ch === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (ch === quote) {
        quote = null;
        stringSpans.push([stringStart, i]);
      }
      out += ch; i++; continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch; stringStart = i; out += ch; i++; continue;
    }

    // Line comment -> spaces, offsets preserved.
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      continue;
    }

    // Block comment -> spaces, newlines kept so line numbers hold.
    if (ch === "/" && next === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " "; i++;
      }
      out += "  "; i += 2; continue;
    }

    out += ch; i++;
  }

  return { code: out, stringSpans };
}

function inSpan(idx: number, spans: Array<[number, number]>): boolean {
  for (const [a, b] of spans) if (idx > a && idx < b) return true;
  return false;
}

/**
 * Which Prisma context encloses this offset.
 *
 * Walks BACKWARD tracking brace depth to find the brace that opens the object
 * this match sits in, then reads the key in front of it.  writes; the
 * rest read.
 *
 * The first version looked back a fixed 600 characters for the nearest keyword,
 * and that was wrong in a way that mattered: a Prisma create payload here is
 * routinely forty-odd fields, so  sat far outside the window and every
 * later field in the block was reported READ-never-WRITTEN. withTenderController
 * assigns destContactName literally inside a data block and was classified as a
 * read — which would have sent someone to "fix" a field that was already
 * written. Depth-walking has no window to outgrow.
 */
function nearestContext(code: string, idx: number): "data" | "read" | null {
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    const ch = code[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        // The key immediately before this opening brace names the context.
        const before = code.slice(Math.max(0, i - 80), i);
        const m = before.match(/(\w+)\s*:\s*$/);
        if (!m) {
          // THE FIFTH BLIND SPOT (Arc 12 Phase 3). A payload is routinely built
          // as `const data = { ... }` and handed to prisma on the next line,
          // rather than written inline as `data: { ... }`. The key-before-brace
          // rule only sees the inline form, so every field in a hoisted payload
          // looked like a read.
          //
          // Found on DriverCourseProgress.bestScorePct, which driverTraining
          // assigns at the top of a hoisted payload and then upserts. The tool
          // called it READ-never-WRITTEN; a driver's best quiz score has been
          // recorded correctly the whole time.
          //
          // Narrow on purpose: only a variable actually NAMED data / payload /
          // createData / updateData counts. Treating every `const x = {` as a
          // write would call half the codebase written and make the audit
          // useless in the other direction.
          const assigned = before.match(/(?:const|let|var)\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*$/);
          if (assigned && /^(data|payload|createData|updateData)$/.test(assigned[1])) return "data";
          return null;
        }
        const key = m[1];
        if (key === "data") return "data";
        if (key === "select" || key === "include" || key === "where") return "read";
        // Nested object inside a payload (e.g. ) — keep going
        // outward rather than guessing.
        return nearestContext(code, i - 1);
      }
      depth--;
    }
  }
  return null;
}

export function classifyField(field: string, files: Array<{ file: string; src: string }>): {
  verdict: UsageKind;
  matches: Match[];
} {
  const matches: Match[] = [];
  const word = new RegExp("\\b" + field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");

  for (const { file, src } of files) {
    const { code, stringSpans } = analyze(src);
    let m: RegExpExecArray | null;
    word.lastIndex = 0;
    while ((m = word.exec(code))) {
      const idx = m.index;
      const lineNo = code.slice(0, idx).split("\n").length;
      const lineText = code.split("\n")[lineNo - 1]?.trim().slice(0, 120) ?? "";

      if (inSpan(idx, stringSpans)) {
        matches.push({ file, line: lineNo, kind: "STRING_ONLY", snippet: lineText });
        continue;
      }

      const after = code.slice(idx + field.length, idx + field.length + 40);
      const before = code.slice(Math.max(0, idx - 40), idx);
      const isAssignment = /^\s*=[^=]/.test(after);
      const isProperty = /^\s*:/.test(after);

      // THE FOURTH BLIND SPOT (Arc 12 Phase 3). Object shorthand — `{ x }`
      // rather than `{ x: x }` — carries no colon, so it fell through to READ.
      // tenderController writes `data: { status: "COUNTERED", counterRate,
      // respondedAt }`, an unambiguous write, and the tool called that field
      // READ-never-WRITTEN. Shorthand is idiomatic in this codebase, so this
      // was never going to be one stray case.
      //
      // A shorthand property is a bare identifier followed by a comma or a
      // closing brace, NOT preceded by a dot (property access) or a colon (the
      // value half of `k: field`).
      //
      // The `data` context check is what keeps it honest: a destructure —
      // `const { counterRate } = schema.parse(body)` — has the same shape and
      // is a READ. It sits outside any `data:` payload, so it stays one.
      const isShorthand = /^s*[,}]/.test(after) && !/[.:]s*$/.test(before);

      let kind: Match["kind"] = "READ";
      if (isAssignment) kind = "WRITTEN";
      else if (isProperty || isShorthand) kind = nearestContext(code, idx) === "data" ? "WRITTEN" : "READ";

      matches.push({ file, line: lineNo, kind, snippet: lineText });
    }
  }

  if (!matches.length) return { verdict: "UNREFERENCED", matches };
  if (matches.some((x) => x.kind === "WRITTEN")) return { verdict: "WRITTEN", matches };
  if (matches.some((x) => x.kind === "READ")) return { verdict: "READ", matches };
  return { verdict: "STRING_ONLY", matches };
}

// ── file collection ─────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

function loadCorpus(): Array<{ file: string; src: string }> {
  const files: string[] = [];
  for (const r of SCAN_ROOTS) walk(path.join(REPO_ROOT, r), files);
  return files.map((f) => ({
    file: path.relative(REPO_ROOT, f).split(path.sep).join("/"),
    src: fs.readFileSync(f, "utf8"),
  }));
}

const COMMON = new Set(["id", "name", "email", "status", "type", "amount", "notes", "createdAt", "updatedAt", "userId"]);

function schemaFields(): Array<{ model: string; field: string; dbSupplied: boolean }> {
  const content = fs.readFileSync(PRISMA_SCHEMA, "utf8");
  const out: Array<{ model: string; field: string; dbSupplied: boolean }> = [];
  let model: string | null = null;
  for (const line of content.split("\n")) {
    const mm = line.match(/^model\s+(\w+)\s*\{/);
    if (mm) { model = mm[1]; continue; }
    if (line.trim() === "}") { model = null; continue; }
    if (!model || line.trim().startsWith("//") || line.trim().startsWith("@@") || !line.trim()) continue;
    const fm = line.match(/^\s+(\w+)\s+(\w+\??)/);
    if (!fm) continue;
    const [, field, type] = fm;
    const scalar = ["String", "Int", "Float", "Boolean", "DateTime", "Json", "Decimal", "Bytes", "BigInt"];
    if (/^[A-Z]/.test(type) && !scalar.includes(type.replace("?", ""))) continue;
    if (COMMON.has(field)) continue;
    // THE THIRD BLIND SPOT (Arc 11 Phase 5). A column carrying @default or
    // @updatedAt is written by Postgres on every insert, with no literal write
    // site anywhere in the application — so the classifier saw it consulted and
    // never assigned, and called it READ-never-WRITTEN.
    //
    // Found on CarrierScorecard.calculatedAt, whose banked verdict was
    // "WIRE — trivially set where the scorecard is computed". It already has
    // @default(now()). Acting on that verdict would have added an explicit
    // write for something the database already does, and the audit would have
    // manufactured the busywork it exists to prevent.
    const dbSupplied = /@default\(|@updatedAt/.test(line);
    out.push({ model, field, dbSupplied });
  }
  return out;
}

// ── self-test: the two failure modes, as a fixture ──────────────────────────

function selfTest(): number {
  const fixture = [
    {
      // Arc 12 — object shorthand, both directions. The write and the
      // destructure have the SAME shape; only the enclosing context tells them
      // apart, so both belong here or the disambiguation is untested.
      file: "fixture/shorthand.ts",
      src: [
        "const { plantedShorthandRead } = counterSchema.parse(req.body);",
        "await prisma.thing.update({ where: { id }, data: { status: \"X\", plantedShorthandWrite, updatedAt: new Date() } });",
      ].join(String.fromCharCode(10)),
    },
    {
      // Arc 12 — a payload hoisted into a local before the prisma call. Both
      // shapes are here: the one that IS a write because the variable is named
      // data, and the one that is NOT because it is an ordinary local. Without
      // the second, the narrowing rule is untested and could be widened to every
      // `const x = {` without a fixture noticing.
      file: "fixture/hoisted.ts",
      src: [
        "const data = { plantedHoistedWrite: 1, other: 2 };",
        "await prisma.thing.update({ where: { id }, data });",
        "const opts = { plantedHoistedNotAPayload: 3 };",
        "doSomething(opts);",
      ].join(String.fromCharCode(10)),
    },
    {
      file: "fixture/commentOnly.ts",
      src: [
        "// plantedCommentOnly is deliberately never written — see the triage doc.",
        "/* plantedCommentOnly again, in a block comment */",
        'log.info("plantedCommentOnly appears here only inside a string");',
        "",
        "await prisma.thing.update({ where: { id }, data: { plantedRealWrite: new Date() } });",
        "const x = row.plantedRealRead;",
        "// KNOWN LIMITATION, kept as a fixture so it is not rediscovered:",
        "// a column written through a spread never appears literally at the write",
        "// site, so identifier matching cannot see it. This bit for real — the",
        "// settlement doc-flag sync wrote its columns via data: { ...flags } and",
        "// the classifier reported them READ-never-WRITTEN. The fix was to write",
        "// them out explicitly, because code invisible to its own audit tool is",
        "// the problem, not the tool. If this verdict ever changes, the matcher",
        "// has grown real dataflow analysis and this case should be revisited.",
        "await prisma.thing.update({ data: { ...computedFlags } });",
      ].join("\n"),
    },
  ];

  const cases: Array<[string, UsageKind]> = [
    ["plantedCommentOnly", "STRING_ONLY"], // comments stripped; only the string survives
    ["plantedRealWrite", "WRITTEN"],
    ["plantedRealRead", "READ"],
    ["plantedNeverMentioned", "UNREFERENCED"],
    // Documents the spread blind spot rather than pretending it is handled.
    ["plantedSpreadWrite", "UNREFERENCED"],
    ["plantedShorthandWrite", "WRITTEN"],
    ["plantedShorthandRead", "READ"],
    ["plantedHoistedWrite", "WRITTEN"],
    ["plantedHoistedNotAPayload", "READ"],
  ];

  let failed = 0;
  console.log("SELF-TEST");
  for (const [field, expected] of cases) {
    const { verdict } = classifyField(field, fixture);
    const ok = verdict === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${field.padEnd(24)} expected ${expected.padEnd(13)} got ${verdict}`);
  }
  return failed;
}

// ── main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--self-test")) {
    const failed = selfTest();
    if (failed) { console.error(`\n${failed} self-test case(s) failed.`); process.exit(1); }
    console.log("\nAll self-test cases passed.");
    return;
  }

  const corpus = loadCorpus();
  const fieldArg = args.indexOf("--field");

  if (fieldArg >= 0) {
    const field = args[fieldArg + 1];
    const { verdict, matches } = classifyField(field, corpus);
    console.log(`\n${field}: ${verdict}\n`);
    for (const m of matches) console.log(`  ${m.kind.padEnd(12)} ${m.file}:${m.line}  ${m.snippet}`);
    if (!matches.length) console.log("  (no references outside the schema)");
    return;
  }

  // --surface: READ-never-WRITTEN split by whether a frontend file consumes it.
  // A column read by a page is a user being shown false emptiness; a column read
  // only by backend code is an internal assumption. They deserve different
  // urgency, so they are reported apart rather than as one list of 217.
  if (args.includes("--surface")) {
    const fields = schemaFields();
    const ui = []; const internal = [];
    for (const f of fields) {
      const { verdict, matches } = classifyField(f.field, corpus);
      if (verdict !== "READ") continue;
      // Postgres writes it. Not a case of code depending on a value nothing
      // produces, which is the only thing this list is for.
      if (f.dbSupplied) continue;
      const onScreen = matches.some((m) => m.file.startsWith("frontend/src"));
      (onScreen ? ui : internal).push({ ...f, files: [...new Set(matches.map((m) => m.file))] });
    }
    console.log(`
READ-never-WRITTEN, by consumer surface
`);
    console.log(`  FRONTEND-VISIBLE  ${ui.length}   (a screen renders a value nothing produces)`);
    console.log(`  BACKEND-ONLY      ${internal.length}
`);
    console.log("── FRONTEND-VISIBLE ──");
    for (const f of ui) console.log(`  ${(f.model + "." + f.field).padEnd(46)} ${f.files.filter((x) => x.startsWith("frontend")).join(", ")}`);
    return;
  }

  const fields = schemaFields();
  const buckets: Record<UsageKind, Array<{ model: string; field: string }>> = {
    WRITTEN: [], READ: [], STRING_ONLY: [], UNREFERENCED: [], DB_WRITTEN: [],
  };
  for (const f of fields) {
    const v = classifyField(f.field, corpus).verdict;
    // A @default / @updatedAt column reported READ is the tool not knowing who
    // wrote it, not a defect in the code. Reclassified rather than silently
    // dropped, so the count stays honest about where the fields went.
    buckets[v === "READ" && f.dbSupplied ? "DB_WRITTEN" : v].push(f);
  }

  console.log(`\nFIELD USAGE — ${fields.length} non-common scalar fields\n`);
  console.log(`  WRITTEN       ${buckets.WRITTEN.length}`);
  console.log(`  READ          ${buckets.READ.length}   (consulted, never assigned — code depends on a value nothing produces)`);
  console.log(`  STRING_ONLY   ${buckets.STRING_ONLY.length}   (name survives only inside a string literal)`);
  console.log(`  UNREFERENCED  ${buckets.UNREFERENCED.length}\n`);

  for (const kind of ["READ", "STRING_ONLY", "UNREFERENCED"] as UsageKind[]) {
    if (!buckets[kind].length) continue;
    console.log(`── ${kind} ──`);
    for (const f of buckets[kind]) console.log(`  ${f.model}.${f.field}`);
    console.log("");
  }
}

if (require.main === module) main();
