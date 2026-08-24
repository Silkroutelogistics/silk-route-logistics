/**
 * Multi-line-aware Prisma call finder.
 *
 * WHY THIS EXISTS. Arc 34's Step 0 reconnaissance used
 * `grep -oE "staffSession\.[a-zA-Z]+"`, which requires the model and the method
 * on the SAME LINE. This codebase's formatter breaks long Prisma chains:
 *
 *     await prisma.staffSession
 *       .upsert({ ... })
 *
 * So the scan reported "no writer exists anywhere" for a writer that sits at
 * ssoAuth.ts:186, and I repeated that across three refs — each check inheriting
 * the same blind spot, which made the wrong answer look corroborated. Production
 * had 6 rows the whole time.
 *
 * This is the identical defect §13.3 Item 230.3 fixed in the endpoint extractor
 * ("matched router.VERB( and the path on a single line"). Fixing it there did
 * not fix it in my hands, so it is fixed here as a tool.
 *
 * THE LESSON, one line: a grep whose pattern excludes the codebase's dominant
 * formatting returns a false negative that looks exactly like a true one.
 *
 * Usage:
 *   npx tsx scripts/find-prisma-calls.ts staffSession
 *   npx tsx scripts/find-prisma-calls.ts            # every model
 *   npx tsx scripts/find-prisma-calls.ts --self-test
 */

import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Comments are prose. A model named in a comment is not a call site. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

export type Call = { file: string; line: number; model: string; method: string; multiline: boolean };

/**
 * `\s*` spanning newlines is the entire fix. Everything else here is bookkeeping
 * to report a useful line number and to tell single-line from wrapped.
 */
export function findPrismaCalls(source: string, file = "<memory>"): Call[] {
  const clean = stripComments(source);
  const re = /\b(?:prisma|tx)\s*\.\s*([a-z][A-Za-z0-9_]*)\s*\.\s*([a-z][A-Za-z0-9_]*)/g;
  const out: Call[] = [];
  for (const m of clean.matchAll(re)) {
    const before = clean.slice(0, m.index ?? 0);
    out.push({
      file,
      line: before.split("\n").length,
      model: m[1],
      method: m[2],
      multiline: /\n/.test(m[0]),
    });
  }
  return out;
}

function selfTest(): void {
  // The exact formatting that defeated the original scan.
  const fixture = `
  await prisma.staffSession
    .upsert({
      where: { tokenHash: getTokenHash(token) },
      create: { tokenHash: getTokenHash(token), userId: user.id, rememberMe },
    })
    .catch((err) => log.error({ err }, "[SSO] staff_sessions write failed"));

  await prisma.staffSession.delete({ where: { tokenHash } });

  // prisma.staffSession.createMany({}) — a mention in prose, not a call.
`;
  const calls = findPrismaCalls(fixture, "fixture");
  const methods = calls.filter((c) => c.model === "staffSession").map((c) => c.method).sort();

  const problems: string[] = [];
  if (!methods.includes("upsert")) problems.push("MISSED the wrapped .upsert — the exact false negative this exists to stop");
  if (!methods.includes("delete")) problems.push("missed the single-line .delete");
  if (methods.includes("createMany")) problems.push("matched a commented-out call — comments are prose");
  if (!calls.some((c) => c.multiline)) problems.push("did not flag the wrapped call as multiline");

  if (problems.length) {
    console.log("SELF-TEST FAILED — this finder cannot be trusted:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`self-test passed — wrapped .upsert found, single-line .delete found, commented mention ignored (${methods.join(", ")})`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();

  const want = args[0];
  const all: Call[] = [];
  for (const f of walk(SRC)) {
    all.push(...findPrismaCalls(fs.readFileSync(f, "utf8"), path.relative(path.resolve(__dirname, "..", ".."), f).split(path.sep).join("/")));
  }
  const hits = want ? all.filter((c) => c.model === want) : all;

  if (want) {
    console.log(`prisma.${want} — ${hits.length} call site(s)\n`);
    for (const c of hits.sort((a, b) => a.file.localeCompare(b.file))) {
      console.log(`  ${c.method.padEnd(12)} ${c.multiline ? "[wrapped]" : "[inline] "}  ${c.file}:${c.line}`);
    }
  } else {
    const wrapped = all.filter((c) => c.multiline).length;
    console.log(`${all.length} prisma call sites; ${wrapped} are WRAPPED across lines`);
    console.log(`(a same-line-only grep silently misses every one of those ${wrapped})`);
  }
}

if (require.main === module) main();
