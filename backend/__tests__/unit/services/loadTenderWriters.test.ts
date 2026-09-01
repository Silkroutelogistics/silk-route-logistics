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
      // Is the payload written out here, or handed in from somewhere else?
      //
      // `data: { ... }` can be read — UNLESS it spreads something, because
      // `data: { ...payload, x: 1 }` is a literal whose interesting half is not
      // here. Both forms have now gone blind on this scanner in turn: first a
      // bare `data` parameter, then a spread. Its own stale-entry check caught
      // each, which is the only reason either was noticed.
      //
      // `data` (shorthand) and `data: payload` are unreadable outright.
      const looksLiteral = /^(?:data|create)\s*:\s*\{/.test(data.trimStart());
      const spreadsSomething = /\.\.\.\s*[A-Za-z_$]/.test(data);
      const literal = looksLiteral && !spreadsSomething;
      hits.push({
        file: path.relative(SRC, f).replace(/\\/g, "/"),
        line: src.slice(0, m.index).split("\n").length,
        method: m[1],
        // Colon form OR shorthand when the object is right here; UNKNOWN counts
        // as yes, because the alternative is a guard with a documented bypass.
        writesStatus: literal ? /\bstatus\s*(:|,|\}|\r?$)/m.test(data) : true,
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
  "services/tenderCreationService.ts",     // a tender is born
  "services/tenderTransitionService.ts",   // it moves
  "services/carrierReleaseService.ts",     // it is taken back
]);

/**
 * THREE, reached in v3.8.axk. A tender is born in one place, moves in one
 * place, and is taken back in one place.
 *
 * It was eleven when the audit ran, and the number is asserted rather than only
 * the membership because membership alone is satisfied by ADDING a file --
 * which is exactly the drift the list exists to prevent. A count has to be
 * edited deliberately and shows up in a diff as a number going the wrong way.
 *
 * A fourth entry is not forbidden. It is a decision, and this is where somebody
 * has to make it in writing.
 */
const STATE_WRITER_TARGET = 3;

/**
 * The guard earned its place on the way down: it caught two EXPIRED mislabels
 * on its first run, caught carrierReleaseService arriving unlisted on the next
 * commit, and its stale-entry check fired the moment integrationService and
 * broadcastTenderService stopped writing status.
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

  it("exactly three files may move a tender", () => {
    // Growth means a new file learned to move a tender. That is the thing this
    // guard exists to make deliberate, so it fails rather than warns.
    expect(
      [...STATE_WRITERS].sort(),
      "Files that may write tender status. Three: create / transition / " +
        "release. A fourth is a decision, not an accident -- say why here.",
    ).toHaveLength(STATE_WRITER_TARGET);
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

  it("counts a literal that SPREADS an unreadable object as a status write", () => {
    // `data: { ...payload }` looks like a literal and is not one. This is the
    // second time this scanner went blind in the same direction; the first was
    // a bare `data` parameter.
    const fx = new Map([[path.join(SRC, "__spread__.ts"),
      `await prisma.loadTender.updateMany({ where: { id }, data: { ...payload, respondedAt } });
`]]);
    const hits = findLoadTenderWrites(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].writesStatus, "a spread payload must count as a status write").toBe(true);
  });

  it("counts a payload it cannot read as a status write", () => {
    // The consolidation put the update behind a helper that takes `data` as a
    // parameter, and the scanner reported the transition service as writing no
    // status at all — its own stale-entry check caught that. Left alone, any
    // file could have hoisted its payload into a variable and passed.
    const fx = new Map([[path.join(SRC, "__hoist__.ts"),
      `const payload = { status: "DECLINED" };
await prisma.loadTender.update({ where: { id }, data: payload });
`]]);
    const hits = findLoadTenderWrites(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].writesStatus, "an unreadable payload must count as a status write").toBe(true);
  });

  it("does NOT treat a where-clause match as a status write", () => {
    const fx = new Map([[path.join(SRC, "__wh__.ts"),
      `await prisma.loadTender.updateMany({ where: { status: "OFFERED" }, data: { counterRate: 5 } });\n`]]);
    const hits = findLoadTenderWrites(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].writesStatus).toBe(false);
  });
});
