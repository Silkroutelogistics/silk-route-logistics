/**
 * Every place that ASSIGNS onboardingStatus, and whether the same object also
 * assigns status.
 *
 * WHY IT SEARCHES THIS WAY. The first two versions looked for CarrierProfile
 * WRITE CALLS and then read inside them, and that shape has to know how a write
 * is spelled. It was wrong three times:
 *
 *   v1  required `prisma.carrierProfile.<op>(` — missed every write inside a
 *       $transaction, which are `tx.carrierProfile.<op>(`. That silently
 *       excluded approvalService.approveCarrier, the canonical approve path and
 *       the entire reason this census exists. It printed 18 and a tidy summary.
 *   v2  allowed any client identifier — still missed NESTED writes, where the
 *       profile is created through its parent as
 *       `prisma.user.create({ data: { carrierProfile: { create: {…} } } })`.
 *       That excluded registerCarrier.
 *
 * Each fix found the next blind spot, which is the signal to stop matching call
 * shapes. Assignments do not vary: `onboardingStatus:` is `onboardingStatus:`
 * however the write around it is written. So find the assignment, brace-walk
 * OUT to its enclosing object literal, and look for a sibling.
 *
 * This is the same lesson as the tool this borrows from — a pattern that
 * excludes the codebase's real formatting returns a false negative that looks
 * exactly like a true one — arrived at from three different directions.
 *
 * Read-only. Prints a table.
 */
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "src");
const REPO = path.join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Blank out comments so prose about a field is not read as an assignment. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

/** Walk backwards from i to the `{` that opens the object literal holding it. */
function enclosingObject(src: string, i: number): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let k = i; k >= 0; k--) {
    const c = src[k];
    if (c === "}" || c === ")" || c === "]") depth++;
    else if (c === "{" || c === "(" || c === "[") {
      if (depth === 0) { if (c !== "{") return null; start = k; break; }
      depth--;
    }
  }
  if (start === -1) return null;

  depth = 0;
  for (let k = start; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) return { start, end: k }; }
  }
  return null;
}

/** Is this assignment a WRITE (inside data:/create:/update:) or a filter (where:)? */
function classifyContext(src: string, objStart: number): "write" | "where" | "other" {
  const before = src.slice(Math.max(0, objStart - 200), objStart);
  const lastData = Math.max(
    before.lastIndexOf("data:"), before.lastIndexOf("create:"),
    before.lastIndexOf("update:"), before.lastIndexOf("upsert:"),
  );
  const lastWhere = before.lastIndexOf("where:");
  if (lastData > lastWhere) return "write";
  if (lastWhere > -1) return "where";
  return "other";
}

interface Row {
  file: string; line: number; ctx: string;
  onb: string; status: string | null;
}
const rows: Row[] = [];

for (const file of walk(SRC)) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const rel = path.relative(REPO, file).replace(/\\/g, "/");
  const re = /\bonboardingStatus\s*:\s*([^,\n}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const obj = enclosingObject(src, m.index);
    if (!obj) continue;
    const body = src.slice(obj.start, obj.end + 1);
    // A sibling `status:` in the SAME literal — not onboardingStatus itself.
    const sib = /(?:^|[{,\s])status\s*:\s*([^,\n}]+)/.exec(body);
    rows.push({
      file: rel,
      line: src.slice(0, m.index).split("\n").length,
      ctx: classifyContext(src, obj.start),
      onb: m[1].trim(),
      status: sib ? sib[1].trim() : null,
    });
  }
}

const writes = rows.filter((r) => r.ctx === "write");
const both = writes.filter((r) => r.status);
const onbOnly = writes.filter((r) => !r.status);

console.log(`onboardingStatus assignments found: ${rows.length}`);
console.log(`  in WRITE position: ${writes.length}   (where/other: ${rows.length - writes.length})\n`);

console.log(`COMPLIANT — sets both (${both.length})`);
for (const r of both) console.log(`  ${r.file}:${r.line}   onb=${r.onb}  status=${r.status}`);

console.log(`\nNON-COMPLIANT — onboardingStatus only (${onbOnly.length})`);
for (const r of onbOnly) console.log(`  ${r.file}:${r.line}   onb=${r.onb}`);

console.log(`\nSUMMARY  writes=${writes.length}  both=${both.length}  onboarding-only=${onbOnly.length}`);
