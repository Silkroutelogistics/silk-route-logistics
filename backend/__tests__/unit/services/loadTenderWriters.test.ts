/**
 * `LoadTender` rows have one creator, and tender STATE has one writer.
 *
 * WHY. The tender-lifecycle audit found SIX independent creators across six
 * files and 28 `LoadTender` write sites in total. Each creator had its own idea
 * of what a tender is: some set `status` explicitly, some relied on the column
 * default; one staggered expiry; one took `expiresAt` straight from a request
 * body with no bound. None guaranteed a transition row.
 *
 * A state machine over rows that six places can conjure — and that any of
 * twenty-eight sites can move — is a state machine in name only. Consolidating
 * them is what makes the rest of the lifecycle enforceable; this guard is what
 * keeps them consolidated.
 *
 * TWO SEPARATE INVARIANTS, deliberately:
 *
 *   CREATION — only `tenderCreationService` may insert a LoadTender, so every
 *   tender starts with a transition row and a bounded expiry.
 *
 *   STATE — only that service and the transition service may write `status`,
 *   so a tender cannot change state without the change being recorded.
 *
 * Sites that write OTHER columns (respondedAt on its own, counterRate,
 * declineReason, soft deletes) are not restricted. This guard is about the
 * state machine, not about the table.
 *
 * The scanner matches shorthand as well as `key:`, matches wrapped chains, and
 * ignores comments — §19 Sub-pattern 18, the defect that made the carrierId
 * audit report nine writers where there were eleven. All three are self-tested
 * below, because a scanner that has silently stopped matching reports a
 * perfectly clean tree.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..", "..", "..", "src");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

type Hit = { file: string; line: number; method: string; writesStatus: boolean };

export function findLoadTenderWrites(root = SRC, sources?: Map<string, string>): Hit[] {
  const re = /(?:prisma|tx|client|db)\s*\.\s*loadTender\s*\.\s*(create|createMany|update|updateMany|upsert)\s*\(/g;
  const hits: Hit[] = [];
  const files = sources ? [...sources.keys()] : walk(root);

  for (const f of files) {
    const raw = sources ? sources.get(f)! : fs.readFileSync(f, "utf8");
    const src = stripComments(raw);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      let depth = 0, end = -1;
      for (let i = m.index + m[0].length - 1; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      const body = src.slice(m.index, end + 1);
      const dataIdx = Math.max(body.indexOf("data:"), body.indexOf("create:"));
      const data = dataIdx >= 0 ? body.slice(dataIdx) : "";
      hits.push({
        file: path.relative(SRC, f).replace(/\\/g, "/"),
        line: src.slice(0, m.index).split("\n").length,
        method: m[1],
        // colon form OR shorthand
        writesStatus: /\bstatus\s*(:|,|\}|\r?$)/m.test(data),
      });
    }
  }
  return hits;
}

/** The only place a LoadTender row may be born. */
const CREATORS = new Set(["services/tenderCreationService.ts"]);

/**
 * The only places tender STATE may move.
 *
 * `tenderController` holds accept / accept-on-behalf / counter / decline and the
 * expiry sweep — the transitions themselves. Adding a file here is asserting
 * that a new place may move a tender between states, which is the thing this
 * guard exists to make deliberate.
 */
const STATE_WRITERS = new Set([
  "services/tenderCreationService.ts",
  "controllers/tenderController.ts",     // accept / accept-on-behalf / counter / decline / expiry sweep
  "routes/carrierLoads.ts",              // carrier decline + sibling withdraw on self-accept
  "services/waterfallEngineService.ts",  // cascade decline / compliance skip
  "services/integrationService.ts",      // load cancelled -> withdraw
  "services/broadcastTenderService.ts",  // broadcast accepted -> siblings withdrawn
  "routes/waterfalls.ts",                // AE skips a cascade position -> withdraw
  "services/carrierReleaseService.ts",   // release (ACCEPTED -> RELEASED) + withdraw
]);

/**
 * SEVEN is too many, and that is recorded rather than hidden.
 *
 * The list is honest about today: each of these genuinely moves a tender
 * between states, and each was read before being added. But the target is one
 * transition service, and every entry here is a place that could word a
 * transition differently from the others — which is exactly how EXPIRED came to
 * mean "SRL pulled the offer" in two of them.
 *
 * The guard still earns its place at seven: it caught those two on its first
 * run, and it makes the eighth entry a deliberate act rather than an accident.
 * Consolidating the withdraw paths behind one helper is commit 8's work
 * (releaseCarrier + withdraw), and this list should shrink when it lands.
 */

describe("LoadTender rows have one creator", () => {
  it("nothing outside tenderCreationService creates a tender", () => {
    const offenders = findLoadTenderWrites()
      .filter((h) => h.method === "create" || h.method === "createMany")
      .filter((h) => !CREATORS.has(h.file));
    expect(
      offenders.map((o) => `${o.file}:${o.line}`),
      "A tender created outside tenderCreationService gets no transition row and " +
        "no bounded expiry. Call createTender instead. Offending site(s)",
    ).toEqual([]);
  });

  it("nothing outside the known set writes tender status", () => {
    const offenders = findLoadTenderWrites()
      .filter((h) => h.writesStatus)
      .filter((h) => !STATE_WRITERS.has(h.file));
    expect(
      offenders.map((o) => `${o.file}:${o.line}`),
      "Moving a tender between states outside the known writers means the move " +
        "is not recorded. Offending site(s)",
    ).toEqual([]);
  });

  it("the allow-lists have no stale entries", () => {
    // Dead permission silently widens a guard the day something else takes
    // that path.
    const seen = findLoadTenderWrites();
    for (const f of CREATORS) {
      expect(seen.some((h) => h.file === f && (h.method === "create" || h.method === "createMany")),
        `allow-listed creator ${f} no longer creates tenders`).toBe(true);
    }
    for (const f of STATE_WRITERS) {
      expect(seen.some((h) => h.file === f && h.writesStatus),
        `allow-listed state writer ${f} no longer writes status`).toBe(true);
    }
  });

  it("matches shorthand — the form that made the carrierId audit undercount", () => {
    const fx = new Map([[path.join(SRC, "__sh__.ts"),
      `await prisma.loadTender.update({ where: { id }, data: { respondedAt, status } });\n`]]);
    const hits = findLoadTenderWrites(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].writesStatus).toBe(true);
  });

  it("matches chains wrapped across lines", () => {
    const fx = new Map([[path.join(SRC, "__wr__.ts"),
      `await prisma.loadTender\n  .create({\n    data: {\n      loadId,\n      status: "OFFERED",\n    },\n  });\n`]]);
    const hits = findLoadTenderWrites(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].method).toBe("create");
  });

  it("does NOT match a call written inside a comment", () => {
    const fx = new Map([[path.join(SRC, "__cm__.ts"),
      `// await prisma.loadTender.create({ data: { status: "OFFERED" } });\n/* prisma.loadTender.update({ data: { status } }) */\n`]]);
    expect(findLoadTenderWrites(SRC, fx)).toHaveLength(0);
  });

  it("does NOT treat a where-clause match as a status write", () => {
    const fx = new Map([[path.join(SRC, "__wh__.ts"),
      `await prisma.loadTender.updateMany({ where: { status: "OFFERED" }, data: { counterRate: 5 } });\n`]]);
    const hits = findLoadTenderWrites(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].writesStatus).toBe(false);
  });
});
