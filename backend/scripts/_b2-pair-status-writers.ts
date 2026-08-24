/**
 * Add the paired `status:` beside every CarrierProfile `onboardingStatus:`
 * write that lacks one.
 *
 * Mechanical on purpose: 20 sites across 8 files, all the same edit, and
 * hand-editing 20 near-identical blocks is how one gets missed. Restricted to
 * carrier-side files by an explicit allowlist, because Customer carries an
 * `onboardingStatus` too and its `status` is a free-form string rather than
 * this enum — pairing there would write nonsense.
 *
 * ONE PASS: collect every edit, then apply back-to-front so earlier offsets stay
 * valid. The first version re-scanned the file after each insertion and hung.
 * A rescan loop has to prove it always shrinks the remaining work; that one did
 * not, and collecting first makes the question moot.
 *
 * Idempotent — skips any object literal that already has a sibling `status:`.
 * Run with --check to report without writing.
 */
import fs from "fs";
import path from "path";

const BACKEND = path.join(__dirname, "..");
const CHECK = process.argv.includes("--check");

/** Carrier-side only. Customer's onboardingStatus belongs to a different model. */
const FILES = [
  "src/controllers/carrierController.ts",
  "src/controllers/complianceController.ts",
  "src/services/approvalService.ts",
  "src/services/complianceMonitorService.ts",
  "src/services/infoRequestService.ts",
  "src/services/ofacScreeningService.ts",
  "src/services/onboardingLifecycleService.ts",
  "src/services/rejectionService.ts",
];

/** Mirrors pairedApplicationStatus() in lib/carrierOperational. */
const PAIR: Record<string, string> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
  PENDING: "NEW",
  REVIEWING: "REVIEW",
  INFO_REQUESTED: "REVIEW",
};

/** Blank comments in place, preserving offsets, so prose is not read as code. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function enclosingObject(src: string, i: number): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let k = i; k >= 0; k--) {
    const c = src[k];
    if (c === "}" || c === ")" || c === "]") depth++;
    else if (c === "{" || c === "(" || c === "[") {
      if (depth === 0) {
        if (c !== "{") return null;
        start = k;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return null;
  depth = 0;
  for (let k = start; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) return { start, end: k };
    }
  }
  return null;
}

/** A write (data:/create:/update:) rather than a filter (where:). */
function isWrite(src: string, objStart: number): boolean {
  const before = src.slice(Math.max(0, objStart - 200), objStart);
  const d = Math.max(
    before.lastIndexOf("data:"),
    before.lastIndexOf("create:"),
    before.lastIndexOf("update:"),
    before.lastIndexOf("upsert:"),
  );
  return d > before.lastIndexOf("where:");
}

let patched = 0;
const manual: string[] = [];

for (const rel of FILES) {
  const file = path.join(BACKEND, rel);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.split("\r\n").join("\n");

  const masked = stripComments(text);
  const re = /\bonboardingStatus\s*:\s*("(\w+)"|[A-Za-z_$][\w$.]*)/g;
  const edits: Array<{ at: number; text: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(masked))) {
    const obj = enclosingObject(masked, m.index);
    if (!obj || !isWrite(masked, obj.start)) continue;
    const body = masked.slice(obj.start, obj.end + 1);
    if (/(?:^|[{,\s])status\s*:/.test(body)) continue; // already paired

    const line = text.slice(0, m.index).split("\n").length;
    const literal = m[2];
    if (!literal) {
      manual.push(rel + ":" + line + "  onboardingStatus: " + m[1] + "  (dynamic)");
      continue;
    }
    const paired = PAIR[literal];
    if (!paired) {
      manual.push(rel + ":" + line + "  no pairing for " + literal);
      continue;
    }

    // Insert INSIDE the object, immediately before its closing brace.
    //
    // The first version inserted after the LINE holding the assignment, which
    // is only correct when the object spans multiple lines. For a single-line
    // `data: { onboardingStatus: "SUSPENDED" }` it placed the new key OUTSIDE
    // the object — a sibling of `where:` — and Prisma's arg type has no such
    // key, so tsc reported `Type 'string' is not assignable to type 'never'`.
    // Anchoring to the brace works for both shapes.
    const multiline = masked.slice(obj.start, obj.end).includes("\n");
    if (multiline) {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const indentMatch = /^[ \t]*/.exec(text.slice(lineStart));
      const indent = indentMatch ? indentMatch[0] : "";
      edits.push({
        at: text.indexOf("\n", m.index),
        text: "\n" + indent + 'status: "' + paired + '", // B2 — paired; see lib/carrierOperational',
      });
    } else {
      edits.push({
        at: obj.end,
        text: ', status: "' + paired + '"',
      });
    }
    patched++;
    console.log("  paired  " + rel + ":" + line + "  " + literal + ' -> "' + paired + '"');
  }

  for (const e of edits.sort((a, b) => b.at - a.at)) {
    text = text.slice(0, e.at) + e.text + text.slice(e.at);
  }

  if (!CHECK && edits.length) {
    fs.writeFileSync(file, crlf ? text.split("\n").join("\r\n") : text);
  }
}

console.log("\npatched=" + patched);
if (manual.length) {
  console.log("\nNEEDS A HAND (" + manual.length + "):");
  for (const s of manual) console.log("  " + s);
}
