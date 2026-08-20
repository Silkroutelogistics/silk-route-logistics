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

export type UsageKind = "WRITTEN" | "READ" | "STRING_ONLY" | "UNREFERENCED";

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
 * Looks back a bounded window for the nearest of data / select / include /
 * where. `data:` is the only one that writes; the rest read.
 */
function nearestContext(code: string, idx: number): "data" | "read" | null {
  const WINDOW = 600;
  const start = Math.max(0, idx - WINDOW);
  const before = code.slice(start, idx);

  let best: { kind: "data" | "read"; at: number } | null = null;
  for (const [kw, kind] of [
    ["data:", "data"],
    ["select:", "read"],
    ["include:", "read"],
    ["where:", "read"],
  ] as Array<[string, "data" | "read"]>) {
    const at = before.lastIndexOf(kw);
    if (at >= 0 && (!best || at > best.at)) best = { kind, at };
  }
  return best ? best.kind : null;
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
      const isAssignment = /^\s*=[^=]/.test(after);
      const isProperty = /^\s*:/.test(after);

      let kind: Match["kind"] = "READ";
      if (isAssignment) kind = "WRITTEN";
      else if (isProperty) kind = nearestContext(code, idx) === "data" ? "WRITTEN" : "READ";

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

function schemaFields(): Array<{ model: string; field: string }> {
  const content = fs.readFileSync(PRISMA_SCHEMA, "utf8");
  const out: Array<{ model: string; field: string }> = [];
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
    out.push({ model, field });
  }
  return out;
}

// ── self-test: the two failure modes, as a fixture ──────────────────────────

function selfTest(): number {
  const fixture = [
    {
      file: "fixture/commentOnly.ts",
      src: [
        "// plantedCommentOnly is deliberately never written — see the triage doc.",
        "/* plantedCommentOnly again, in a block comment */",
        'log.info("plantedCommentOnly appears here only inside a string");',
        "",
        "await prisma.thing.update({ where: { id }, data: { plantedRealWrite: new Date() } });",
        "const x = row.plantedRealRead;",
      ].join("\n"),
    },
  ];

  const cases: Array<[string, UsageKind]> = [
    ["plantedCommentOnly", "STRING_ONLY"], // comments stripped; only the string survives
    ["plantedRealWrite", "WRITTEN"],
    ["plantedRealRead", "READ"],
    ["plantedNeverMentioned", "UNREFERENCED"],
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

  const fields = schemaFields();
  const buckets: Record<UsageKind, Array<{ model: string; field: string }>> = {
    WRITTEN: [], READ: [], STRING_ONLY: [], UNREFERENCED: [],
  };
  for (const f of fields) buckets[classifyField(f.field, corpus).verdict].push(f);

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
