/**
 * DECLINED is carrier-initiated, and only ever that.
 *
 * WHY THIS GUARD EXISTS. Until v3.8.aww–awz, five SRL-side code paths wrote
 * `DECLINED` onto a LoadTender on behalf of carriers who had done nothing:
 * three sibling-withdraw sites, a load-cancellation sweep, and — worst — the
 * waterfall compliance skip, which fired on a carrier who had just TRIED TO
 * ACCEPT. `carrierController` derives `tendersDeclined` and an `acceptanceRate`
 * from this column and §9 scores acceptance rate at 10% of Compass, so each one
 * charged a carrier for something SRL did.
 *
 * The fix was five edits. Without a guard, the sixth is one refactor away, and
 * it would be invisible: nothing errors, no test fails, a number on a scorecard
 * just quietly gets worse for carriers who did nothing wrong.
 *
 * WHAT IT ASSERTS, IN TWO PARTS, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 * Statically: only the transition service may write the literal. That is now
 * nearly trivial to satisfy and is kept as a tripwire against a new direct
 * write appearing.
 *
 * Behaviourally: `settleTender` refuses DECLINED unless the actor is the
 * carrier or the caller says `onBehalf`. This is the half with teeth, and it
 * exists because the file-level list was SATISFIED BY A ROUTE THAT ADMITS AEs.
 * The entry read "declinePosition — carrier declines a cascade offer"; the
 * route behind it is `authorize("CARRIER", ...AE_ROLES)`, so an AE clicking
 * decline wrote a real refusal onto that carrier's acceptance rate and the
 * guard was green about it. Presence is not function (§19 Sub-pattern 16) —
 * an allow-list over FILES cannot see who is calling.
 *
 * The scanner is multi-line-aware and strips comments, per §19 Sub-pattern 18:
 * a pattern requiring model and method on one line misses this codebase's
 * wrapped Prisma chains, and a pattern matching prose finds the discussion of a
 * call instead of the call. It also self-tests against a synthetic wrapped
 * fixture, so a scanner that has stopped matching anything fails loudly rather
 * than reporting a clean tree.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { settleTender } from "../../../src/services/tenderTransitionService";

const SRC = path.resolve(__dirname, "..", "..", "..", "src");

/** Comments are prose. A call named in a comment is not a call site. */
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

/** Every loadTender write whose data block sets status DECLINED. */
export function findDeclineWriters(root = SRC, sources?: Map<string, string>) {
  const re = /(?:prisma|tx|client)\s*\.\s*loadTender\s*\.\s*(update|updateMany|upsert|create)\s*\(/g;
  const hits: { file: string; line: number }[] = [];
  const files = sources ? [...sources.keys()] : walk(root);

  for (const f of files) {
    const raw = sources ? sources.get(f)! : fs.readFileSync(f, "utf8");
    const src = stripComments(raw);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      // Walk to the balanced close paren so a wrapped chain is one call.
      let depth = 0, end = -1;
      for (let i = m.index + m[0].length - 1; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      const body = src.slice(m.index, end + 1);
      const dataIdx = Math.max(body.indexOf("data:"), body.indexOf("create:"));
      if (dataIdx < 0) continue;
      if (!/status\s*:\s*["']DECLINED["']/.test(body.slice(dataIdx))) continue;
      hits.push({ file: path.relative(SRC, f).replace(/\\/g, "/"), line: src.slice(0, m.index).split("\n").length });
    }
  }
  return hits;
}

/**
 * EMPTY, and that is the point.
 *
 * No file writes the literal any more: the transition service writes
 * `status: input.to`, so the string "DECLINED" appears in no Prisma payload
 * anywhere. A name back on this list means somebody has written a direct
 * decline again, and they have to justify it here.
 */
const CARRIER_INITIATED = new Set<string>([]);

describe("DECLINED is carrier-initiated", () => {
  beforeEach(() => {
    // The behavioural cases are about the refusal, not about the database. An
    // empty snapshot makes every permitted settle a no-op that still resolves,
    // so a rejection can only have come from the check under test.
    (prisma.loadTender.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("no SRL-side path writes DECLINED onto a tender", () => {
    const offenders = findDeclineWriters().filter((h) => !CARRIER_INITIATED.has(h.file));
    expect(
      offenders.map((o) => `${o.file}:${o.line}`),
      "SRL must never write DECLINED on a carrier's behalf — it feeds tendersDeclined " +
        "and acceptanceRate, which §9 scores at 10% of Compass. Use WITHDRAWN with a " +
        "statusReason instead. Offending site(s)",
    ).toEqual([]);
  });

  it("the allow-list is empty, and stays honest if it is not", () => {
    // Dead permission silently widens a guard the day something else takes that
    // path, so an entry here must correspond to a real writer.
    const seen = new Set(findDeclineWriters().map((h) => h.file));
    expect([...CARRIER_INITIATED], "nothing should need direct-decline permission").toEqual([]);
    for (const f of CARRIER_INITIATED) expect(seen, `allow-listed ${f} no longer writes DECLINED`).toContain(f);
  });

  it("settleTender refuses DECLINED from an AE", async () => {
    // The case the file-level list could not see: an AE on a route that admits
    // both. Refused by code, at the call, where the actor is known.
    await expect(
      settleTender({ tenderId: "t1", to: "DECLINED", actor: { id: "u1", type: "USER" } }),
    ).rejects.toMatchObject({ code: "DECLINE_NOT_CARRIER_INITIATED" });
  });

  it("settleTender refuses DECLINED from the system", async () => {
    await expect(settleTender({ tenderId: "t1", to: "DECLINED" }))
      .rejects.toMatchObject({ code: "DECLINE_NOT_CARRIER_INITIATED" });
  });

  it("a carrier may decline, and an AE may record one they were given", async () => {
    // Not a loophole. An AE recording a decline a carrier phoned in is a real
    // operational act, the same shape as accept-on-behalf — but it has to say
    // so, and the transition row keeps that distinction.
    await expect(
      settleTender({ tenderId: "t1", to: "DECLINED", actor: { id: "c1", type: "CARRIER" } }),
    ).resolves.toBeDefined();
    await expect(
      settleTender({ tenderId: "t1", to: "DECLINED", onBehalf: true, actor: { id: "u1", type: "USER" } }),
    ).resolves.toBeDefined();
  });

  it("nothing else is refused — the check is scoped to DECLINED", async () => {
    // A guard that refused every settle would pass the two tests above while
    // being useless, so this is the tripwire on the refusal itself.
    await expect(settleTender({ tenderId: "t1", to: "WITHDRAWN", reason: "ae_withdrew" }))
      .resolves.toBeDefined();
    await expect(settleTender({ tenderId: "t1", to: "EXPIRED" })).resolves.toBeDefined();
  });

  it("the scanner actually matches — wrapped chains and all (vacuity tripwire)", () => {
    // Without this, a scanner that has stopped matching anything reports a
    // perfectly clean tree. Fixture reproduces the wrapped formatting the
    // repo's own formatter produces (§19 Sub-pattern 18).
    const fixture = new Map([[
      path.join(SRC, "__fixture__.ts"),
      `await prisma.loadTender\n  .updateMany({ where: { id }, data: { status: "DECLINED" } });\n`,
    ]]);
    expect(findDeclineWriters(SRC, fixture)).toHaveLength(1);

    // And it must NOT match the same text inside a comment.
    const commented = new Map([[
      path.join(SRC, "__fixture2__.ts"),
      `// await prisma.loadTender.updateMany({ data: { status: "DECLINED" } });\n`,
    ]]);
    expect(findDeclineWriters(SRC, commented)).toHaveLength(0);
  });
});
