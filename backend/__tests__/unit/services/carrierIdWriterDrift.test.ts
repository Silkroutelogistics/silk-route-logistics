/**
 * `Load.carrierId` has exactly one writer.
 *
 * WHY. Which carrier is on a load decides who gets paid, who the rate
 * confirmation names, who the BOL names, and who the shipper is told is coming.
 * The tender-lifecycle audit found ELEVEN writers across seven files —
 * including one where a carrier assigned themselves, bypassing the compliance
 * gate entirely, so a carrier with a terminated Broker-Carrier Agreement could
 * take a posted load that an AE was forbidden to tender them.
 *
 * Consolidating those eleven does not prevent a twelfth. This does.
 *
 * THE SCANNER IS THE INTERESTING PART, because the audit's first count was
 * WRONG and looked right. It required `carrierId:` with a colon, so it returned
 * NINE — object shorthand (`data: { status, carrierId }`) carries no colon and
 * was invisible, hiding `instantBookService` and `loadComplianceService`. Nine
 * is a plausible number; nothing about it invites a second look. That is §19
 * Sub-pattern 18, and it is why this matches:
 *
 *   - `carrierId:` colon form
 *   - `carrierId` shorthand, followed by `,` `}` or newline
 *   - calls WRAPPED across lines, which this repo's formatter produces
 *   - and NOT the same text inside a comment
 *
 * All four are self-tested against fixtures below. A guard whose scanner has
 * silently stopped matching reports a perfectly clean tree, which is worse than
 * no guard at all.
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

/** Every `load` write whose data block assigns carrierId, colon or shorthand. */
export function findCarrierIdWriters(root = SRC, sources?: Map<string, string>) {
  const re = /(?:prisma|tx|client|db)\s*\.\s*load\s*\.\s*(update|updateMany|create|upsert)\s*\(/g;
  const hits: { file: string; line: number; shorthand: boolean }[] = [];
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
      if (dataIdx < 0) continue;
      const data = body.slice(dataIdx);
      // Colon form OR shorthand (carrierId followed by , } or end of line).
      if (!/\bcarrierId\s*(:|,|\}|\r?$)/m.test(data)) continue;
      hits.push({
        file: path.relative(SRC, f).replace(/\\/g, "/"),
        line: src.slice(0, m.index).split("\n").length,
        shorthand: !/\bcarrierId\s*:/.test(data),
      });
    }
  }
  return hits;
}

/**
 * The single sanctioned writer. This list is meant to stay length 1.
 *
 * Adding to it is asserting that a second place may decide which carrier is on
 * a load — which is the condition this guard exists to prevent. If a new path
 * needs to assign a carrier, it calls assignCarrier / clearCarrier.
 */
const SANCTIONED = new Set(["services/carrierAssignmentService.ts"]);

describe("Load.carrierId has one writer", () => {
  it("nothing outside carrierAssignmentService writes it", () => {
    const offenders = findCarrierIdWriters().filter((h) => !SANCTIONED.has(h.file));
    expect(
      offenders.map((o) => `${o.file}:${o.line}${o.shorthand ? " (shorthand)" : ""}`),
      "Load.carrierId decides who gets paid and who appears on the RC and BOL. " +
        "Call assignCarrier / clearCarrier from services/carrierAssignmentService " +
        "instead of writing the column. Offending site(s)",
    ).toEqual([]);
  });

  it("the sanctioned writer still exists (no stale allow-list)", () => {
    // Dead permission is worse than no permission: it silently widens the guard
    // the day something else takes that path.
    const seen = new Set(findCarrierIdWriters().map((h) => h.file));
    for (const f of SANCTIONED) expect(seen, `sanctioned ${f} no longer writes carrierId`).toContain(f);
  });

  it("matches shorthand — the form that made the audit undercount 11 as 9", () => {
    const fx = new Map([[
      path.join(SRC, "__shorthand__.ts"),
      `await prisma.load.update({ where: { id }, data: { status, carrierId } });\n`,
    ]]);
    const hits = findCarrierIdWriters(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].shorthand).toBe(true);
  });

  it("matches chains wrapped across lines — this repo's formatter produces them", () => {
    const fx = new Map([[
      path.join(SRC, "__wrapped__.ts"),
      `await prisma.load\n  .update({\n    where: { id },\n    data: {\n      carrierId: x.y,\n    },\n  });\n`,
    ]]);
    expect(findCarrierIdWriters(SRC, fx)).toHaveLength(1);
  });

  it("does NOT match the same call written inside a comment", () => {
    const fx = new Map([[
      path.join(SRC, "__comment__.ts"),
      `// await prisma.load.update({ data: { carrierId: x } });\n/* data: { carrierId } */\n`,
    ]]);
    expect(findCarrierIdWriters(SRC, fx)).toHaveLength(0);
  });

  it("does NOT match a read — where-clauses and selects are not writes", () => {
    const fx = new Map([[
      path.join(SRC, "__read__.ts"),
      `await prisma.load.update({ where: { carrierId: x }, data: { status: "BOOKED" } });\n`,
    ]]);
    expect(findCarrierIdWriters(SRC, fx)).toHaveLength(0);
  });
});
