/**
 * One scanner for "which files write FIELD on a Prisma model".
 *
 * EXTRACTED, NOT INVENTED. The mechanism is carrierIdWriterDrift's, hardened
 * across two arcs against the shapes this repo's formatter actually produces.
 * It is parameterised here rather than copied, because the copy is how the
 * second one goes blind — and that is not hypothetical. The guard this was
 * extracted FOR (tenderLifecycleInvariants row 3) used a fixed CHARACTER window
 * and gave a different answer on Windows than on CI for byte-identical source:
 * CRLF costs one extra byte per line, so an 800-character window covered ~13
 * fewer lines locally than in CI. Row 3 passed at 18 files here and failed at 19
 * there, and the nineteenth was a `status` token ~30 lines below the call it was
 * attributed to, inside an unrelated object literal.
 *
 * So the span is bounded by the CALL — parens walked to the matching close —
 * never by a character count. That fixes the platform split and the
 * misattribution together, and is strictly stronger in both directions: a
 * payload longer than the old window was missed before and is read now.
 *
 * What it matches, each self-tested by the guards that use it:
 *   - `field:` colon form
 *   - `field` shorthand, followed by `,` `}` or newline
 *   - calls WRAPPED across lines
 *   - a HOISTED payload — `data.field = x`, `data["field"] = x`, or
 *     `data = { …field… }` — handed to the call as shorthand `data` or as
 *     `data: payload`
 *   - and NOT the same text inside a comment
 *
 * It lives here rather than being exported from a test file: importing a test
 * module for a helper EXECUTES that module's suite in the importer's context
 * (see the header of ./stripComments.ts for the case where that happened).
 */

import fs from "fs";
import path from "path";

export interface WriterHit {
  /** Path relative to the scanned root, forward-slashed. */
  file: string;
  line: number;
  /** The field rode as object shorthand rather than `field:`. */
  shorthand: boolean;
  /** The payload was hoisted; this is the identifier it arrived under. */
  hoisted?: string;
}

/**
 * Comment-strip that PRESERVES line numbers — block comments become blanks
 * rather than disappearing, so a reported line still matches the file a human
 * opens. The shared ./stripComments.ts collapses them, which is right for the
 * guards that only ask "does this text appear" and wrong here.
 */
export function stripCommentsKeepingLines(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

export function walkTs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walkTs(p, out);
    } else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * The text of one call, from its opening paren to the matching close.
 *
 * Quote-aware, so a paren inside a string literal cannot unbalance the walk and
 * run the span to end-of-file.
 */
export function callBodyAt(src: string, openParenIdx: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParenIdx; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(openParenIdx, i + 1);
    }
  }
  return src.slice(openParenIdx);
}

/** Every call matching `re`, with its paren-bounded body. `re` must be global and end at `(`. */
export function callBodies(src: string, re: RegExp): { body: string; index: number }[] {
  const out: { body: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    out.push({ body: callBodyAt(src, m.index + m[0].length - 1), index: m.index });
  }
  return out;
}

/**
 * Does the file assign `field` onto a hoisted payload identifier anywhere?
 *
 * File-scoped on purpose: an identifier reused across two functions in one file
 * is a false positive worth a human's minute, where a scoped search that misses
 * the assignment is a writer nobody sees.
 */
function hoistedAssigns(src: string, ident: string, field: string): boolean {
  const esc = ident.replace(/[$]/g, "\\$");
  const dot = new RegExp(`\\b${esc}\\s*\\.\\s*${field}\\s*=[^=]`);
  const bracket = new RegExp(`\\b${esc}\\s*\\[\\s*["']${field}["']\\s*\\]\\s*=[^=]`);
  const literal = new RegExp(`\\b${esc}\\s*(?::[^=]*)?=\\s*\\{[^}]*\\b${field}\\b`);
  return dot.test(src) || bracket.test(src) || literal.test(src);
}

export interface WriterScanOptions {
  /** Prisma model as it appears in the call, e.g. "load". */
  model: string;
  /** Column, e.g. "carrierId" or "status". */
  field: string;
  /** Alternation of verbs to scan. Defaults to the mutating four. */
  verbs?: string;
  root?: string;
  /** Fixture map (absolute path -> source) instead of walking the tree. */
  sources?: Map<string, string>;
}

export function findPrismaFieldWriters(opts: WriterScanOptions): WriterHit[] {
  const { model, field, verbs = "update|updateMany|create|upsert", root, sources } = opts;
  const scanRoot = root ?? process.cwd();
  const re = new RegExp(
    `(?:prisma|tx|client|db)\\s*\\.\\s*${model}\\s*\\.\\s*(?:${verbs})\\s*\\(`,
    "g",
  );
  const hits: WriterHit[] = [];
  const files = sources ? [...sources.keys()] : walkTs(scanRoot);

  for (const f of files) {
    const raw = sources ? sources.get(f)! : fs.readFileSync(f, "utf8");
    const src = stripCommentsKeepingLines(raw);
    const rel = path.relative(scanRoot, f).split(path.sep).join("/");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const body = callBodyAt(src, m.index + m[0].length - 1);
      const line = src.slice(0, m.index).split("\n").length;
      const dataIdx = Math.max(body.indexOf("data:"), body.indexOf("create:"));

      if (dataIdx >= 0) {
        const afterKey = body.slice(dataIdx).replace(/^(data|create):\s*/, "");
        if (!afterKey.startsWith("{")) {
          // `data: payload` — the payload is named elsewhere.
          const ident = /^([A-Za-z_$][\w$]*)/.exec(afterKey)?.[1];
          if (ident && hoistedAssigns(src, ident, field)) {
            hits.push({ file: rel, line, shorthand: false, hoisted: ident });
          }
          continue;
        }
        const data = body.slice(dataIdx);
        // Colon form OR shorthand (field followed by , } or end of line).
        if (!new RegExp(`\\b${field}\\s*(:|,|\\}|\\r?$)`, "m").test(data)) continue;
        hits.push({ file: rel, line, shorthand: !new RegExp(`\\b${field}\\s*:`).test(data) });
        continue;
      }

      // No `data:` / `create:` key at all: the payload rides as shorthand
      // `{ where, data }`. Find the identifier and look for a hoisted assignment.
      const sh = /[{,]\s*(data|payload|updateData|input)\s*[,}]/.exec(body);
      if (sh && hoistedAssigns(src, sh[1], field)) {
        hits.push({ file: rel, line, shorthand: true, hoisted: sh[1] });
      }
    }
  }
  return hits;
}
