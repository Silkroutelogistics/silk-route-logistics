/**
 * audit-schema-drift.ts — does every field a handler reads survive validation?
 *
 *   cd backend && npx tsx scripts/audit-schema-drift.ts [--strict]
 *
 * `validateBody` REPLACES req.body with the Zod result (middleware/validate.ts),
 * and Zod strips unknown keys. So a field the handler reads but the schema does
 * not declare is silently `undefined` at runtime. No type error. No runtime
 * error. The value simply is not there.
 *
 * That cost a P0 on 2026-08-19: a 422 gate required `tonuFaultSide`, read it off
 * req.body, and `updateLoadStatusSchema` declared only `status` — so the gate
 * rejected EVERY TONU including ones sending a valid fault side. TONU became
 * impossible to record and it shipped, because the unit tests covered the policy
 * function and the writer and nothing covered the wire between them. The same
 * stripping had been eating `reason`/`cancellationReason` far longer, so every
 * voided CarrierPay note read "no reason provided" whatever the AE typed.
 *
 * §19 Pattern 6 Sub-pattern 5 (audit-both-ends-of-data-flow) is the lens; this
 * is that lens made mechanical, because doing it by eye across 71 routes is not
 * something anyone will keep doing.
 *
 * VERDICTS
 *   UNDECLARED-READ  handler reads a key the schema does not declare → the P0
 *                    class. This is the one that ships broken silently.
 *   DECLARED-UNREAD  schema declares a key no handler read → dead contract
 *                    surface, or read somewhere this scanner cannot see.
 *   CLEAN            the two agree.
 *
 * HEURISTIC, like the other audit tools here. It reads text, not an AST, so it
 * cannot follow a body object passed into a helper, spread into a service, or
 * destructured behind an alias. Under-reporting is possible; every finding is a
 * candidate to verify, not a verdict. `// schema-drift-ok: <reason>` on the line
 * above a route suppresses it with the reason recorded in the source.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKEND_SRC = path.join(REPO_ROOT, "backend/src");
const ROUTES_DIR = path.join(BACKEND_SRC, "routes");

const STRICT = process.argv.includes("--strict");

// Keys every Express handler touches that are not body fields.
const NON_BODY = new Set(["params", "query", "user", "headers", "cookies", "files", "file", "ip"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const read = (f: string) => fs.readFileSync(f, "utf8");
const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");

/**
 * Blank out comments, preserving length and newlines so offsets and line numbers
 * still line up with the original.
 *
 * Not cosmetic. Prose contains commas and unbalanced parens, which wrecked both
 * the brace-depth tracking and the key splitting — the very comment explaining
 * the tonuFaultSide P0 made the scanner report tonuFaultSide as undeclared,
 * which is a nicely circular way to learn this lesson. Comments also mention
 * things like `req.body.foo`, which would otherwise register as real reads.
 *
 * String-literal aware, so a `"https://…"` is not mistaken for a line comment.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (ch === quote) quote = null;
      out += ch; i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; out += ch; i++; continue; }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (ch === "/" && next === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2; continue;
    }
    out += ch; i++;
  }
  return out;
}

/** Text from an opening brace/paren to its match, so a nested object does not end it early. */
function balanced(src: string, startIdx: number, open: string, close: string): string {
  let depth = 0;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  return src.slice(startIdx);
}

/**
 * Top-level keys of a `z.object({ ... })` body — nested objects skipped by depth.
 *
 * `balanced` returns the braces as well, and leaving the opening one in place
 * put a `{` at the head of the first segment so its key never matched — every
 * schema read as declaring nothing, and every handler read looked undeclared.
 * Strip the outer braces before splitting.
 */
function zodKeys(raw: string): string[] {
  const objectBody = raw.trim().startsWith("{") ? raw.trim().slice(1, -1) : raw;
  const keys: string[] = [];
  let depth = 1; // inside the object already, since the outer brace is gone
  let line = "";
  for (const ch of objectBody) {
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 1) {
      const m = /^\s*["']?([A-Za-z_$][\w$]*)["']?\s*:/.exec(line);
      if (m) keys.push(m[1]);
      line = "";
      continue;
    }
    line += ch;
  }
  const m = /^\s*["']?([A-Za-z_$][\w$]*)["']?\s*:/.exec(line);
  if (m) keys.push(m[1]);
  return keys;
}

/**
 * Every `const <name> = z.object({...})`, keyed by FILE then name.
 *
 * Keyed by file because schema names are only unique per file — `createSchema`
 * exists in several route files, and a flat name-keyed map silently resolved to
 * whichever was parsed last. That reported infoRequests' createSchema as
 * declaring another file's keys, which looked exactly like a real drift finding.
 * A scanner that fabricates findings is worse than one that misses them.
 */
function collectSchemas(): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  const files = [...walk(path.join(BACKEND_SRC, "validators")), ...walk(ROUTES_DIR)];
  for (const f of files) {
    const perFile = new Map<string, string[]>();
    out.set(f, perFile);
    const src = stripComments(read(f));
    const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*z\s*\.object\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const braceIdx = src.indexOf("{", m.index + m[0].length - 1);
      if (braceIdx === -1) continue;
      const body = balanced(src, braceIdx, "{", "}");
      // `.extend({...})` chained on — fold those keys in too.
      const after = src.slice(braceIdx + body.length, braceIdx + body.length + 400);
      const keys = zodKeys(body);
      const ext = /\.extend\s*\(\s*\{/.exec(after);
      if (ext) {
        const eIdx = braceIdx + body.length + ext.index + ext[0].length - 1;
        keys.push(...zodKeys(balanced(src, eIdx, "{", "}")));
      }
      perFile.set(m[1], [...new Set(keys)]);
    }
  }
  return out;
}


/**
 * Resolve a schema name from the file that uses it: same file first, then
 * validators/, then anywhere. Same-file-first is what stops a generic name like
 *  binding to another route file's definition.
 */
function resolveSchema(all: Map<string, Map<string, string[]>>, fromFile: string, name: string): string[] | null {
  const own = all.get(fromFile)?.get(name);
  if (own) return own;
  for (const [f, m] of all) if (f.includes('validators') && m.has(name)) return m.get(name)!;
  for (const [, m] of all) if (m.has(name)) return m.get(name)!;
  return null;
}

/** Every key read off req.body in a chunk of handler source. */
function bodyReads(src: string): Set<string> {
  const keys = new Set<string>();

  // req.body.foo / req.body?.foo
  for (const m of src.matchAll(/\breq\.body\s*\??\.\s*([A-Za-z_$][\w$]*)/g)) {
    if (!NON_BODY.has(m[1])) keys.add(m[1]);
  }

  // const { a, b: c, d = 1 } = req.body   (and `= req.body as X`, `?? {}`)
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*req\.body\b/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.split(":")[0].split("=")[0].trim().replace(/^\.\.\./, "");
      if (name && /^[A-Za-z_$][\w$]*$/.test(name) && !NON_BODY.has(name)) keys.add(name);
    }
  }
  return keys;
}

/** The body of a named exported function, wherever it lives under src/. */
function findFunctionBody(name: string, allFiles: string[]): string | null {
  for (const f of allFiles) {
    const src = stripComments(read(f));
    const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
    const m = re.exec(src);
    if (!m) continue;
    const brace = src.indexOf("{", m.index + m[0].length);
    if (brace === -1) continue;
    return balanced(src, brace, "{", "}");
  }
  return null;
}

interface Finding {
  file: string;
  line: number;
  route: string;
  schema: string;
  undeclared: string[];
  unread: string[];
  note?: string;
}

export interface DriftResult {
  clean: number;
  unresolvable: number;
  suppressed: number;
  undeclared: Finding[];
  unread: Finding[];
}

/** The scan, as data. The CLI prints it; the guard test asserts on it. */
export function scanDrift(): DriftResult {
  const schemas = collectSchemas();
  const allSrc = walk(BACKEND_SRC);
  const routeFiles = walk(ROUTES_DIR);

  const findings: Finding[] = [];
  let clean = 0;
  let unresolvable = 0;
  let suppressed = 0;

  for (const file of routeFiles) {
    const src = stripComments(read(file));
    const lines = src.split(/\r?\n/);

    for (const m of src.matchAll(/router\.(post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      const callStart = m.index!;
      const call = balanced(src, src.indexOf("(", callStart), "(", ")");
      const vb = /validateBody\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(call);
      const vbInline = /validateBody\s*\(\s*z\s*\.object\s*\(/.exec(call);
      if (!vb && !vbInline) continue;

      const lineNo = src.slice(0, callStart).split(/\r?\n/).length;
      if (lines[lineNo - 2]?.includes("schema-drift-ok")) { suppressed++; continue; }

      const route = `${m[1].toUpperCase()} ${m[2]}`;

      // Declared keys
      let declared: string[] | null = null;
      let schemaName: string;
      if (vb) {
        schemaName = vb[1];
        declared = resolveSchema(schemas, file, vb[1]);
      } else {
        schemaName = "(inline)";
        const objIdx = call.indexOf("{", vbInline!.index + vbInline![0].length - 1);
        declared = objIdx === -1 ? null : zodKeys(balanced(call, objIdx, "{", "}"));
      }
      if (!declared) { unresolvable++; continue; }

      // Handler body: inline arrow inside the route call, else the named handler.
      let body = "";
      const arrow = /(?:async\s*)?\([^)]*\)\s*=>\s*\{/.exec(call);
      if (arrow) {
        body = balanced(call, call.indexOf("{", arrow.index + arrow[0].length - 1), "{", "}");
      } else {
        const tail = call.slice(call.lastIndexOf(",") + 1).trim().replace(/\)$/, "").trim();
        const named = /^[A-Za-z_$][\w$]*$/.test(tail) ? tail : null;
        if (named) body = findFunctionBody(named, allSrc) ?? "";
      }
      if (!body) { unresolvable++; continue; }

      const readKeys = bodyReads(body);
      const undeclared = [...readKeys].filter((k) => !declared!.includes(k)).sort();
      const unread = declared.filter((k) => !readKeys.has(k)).sort();

      if (undeclared.length === 0 && unread.length === 0) { clean++; continue; }
      findings.push({ file: rel(file), line: lineNo, route, schema: schemaName, undeclared, unread });
    }
  }

  const undeclaredFindings = findings.filter((f) => f.undeclared.length > 0);
  const unreadFindings = findings.filter((f) => f.undeclared.length === 0 && f.unread.length > 0);

  return { clean, unresolvable, suppressed, undeclared: undeclaredFindings, unread: unreadFindings };
}

function main() {
  const {
    clean,
    unresolvable,
    suppressed,
    undeclared: undeclaredFindings,
    unread: unreadFindings,
  } = scanDrift();

  console.log("\nSCHEMA DRIFT — fields a handler reads vs fields the schema declares\n");
  console.log(`  ${clean} clean · ${undeclaredFindings.length} UNDECLARED-READ · ${unreadFindings.length} declared-unread · ${unresolvable} unresolvable · ${suppressed} suppressed\n`);

  if (undeclaredFindings.length) {
    console.log("  UNDECLARED-READ — handler reads what validateBody strips. Always undefined at runtime.\n");
    for (const f of undeclaredFindings) {
      console.log(`    ${f.route}`);
      console.log(`      ${f.file}:${f.line}  schema=${f.schema}`);
      console.log(`      reads but does not declare: ${f.undeclared.join(", ")}`);
    }
    console.log("");
  }

  if (unreadFindings.length) {
    console.log("  declared-unread — advisory. Dead contract surface, or read where this scanner cannot follow.\n");
    for (const f of unreadFindings) {
      console.log(`    ${f.route}  ${f.file}:${f.line}  unread: ${f.unread.join(", ")}`);
    }
    console.log("");
  }

  if (undeclaredFindings.length === 0) {
    console.log("  NO UNDECLARED READS.\n");
  }

  if (STRICT && undeclaredFindings.length > 0) {
    console.error("  A field read but not declared is undefined at runtime. Declare it or stop reading it.\n");
    process.exit(1);
  }
}

main();
