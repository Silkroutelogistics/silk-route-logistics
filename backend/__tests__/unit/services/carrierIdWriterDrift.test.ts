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
 *   - a HOISTED payload — `data.carrierId = x` (or `data = { …carrierId… }`)
 *     assigned earlier and handed to the call as shorthand `data` or
 *     `data: payload` (carrier-archive recut B2d, 2026-09-21: updateLoad wrote
 *     Load.carrierId this way for months and this guard reported 8/8 green over
 *     it — its own comment "exactly one writer" was untrue of the tree)
 *   - and NOT the same text inside a comment
 *
 * All five are self-tested against fixtures below. A guard whose scanner has
 * silently stopped matching reports a perfectly clean tree, which is worse than
 * no guard at all.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { findPrismaFieldWriters, walkTs, stripCommentsKeepingLines } from "../../helpers/prismaWriterScan";

const SRC = path.resolve(__dirname, "..", "..", "..", "src");

/**
 * The scanner moved to __tests__/helpers/prismaWriterScan.ts, unchanged in
 * behaviour and parameterised on the field, because a SECOND guard needed the
 * same five shapes and a second copy is how one of them goes blind.
 *
 * The fixture cases below are what make that move checkable: they exercise
 * shorthand, the hoisted payload in both forms, the wrapped call and the
 * comment case. If the extraction had drifted, they fail here.
 */
const findCarrierIdWriters = (root = SRC, sources?: Map<string, string>) =>
  findPrismaFieldWriters({ model: "load", field: "carrierId", root, sources });

/**
 * The single sanctioned writer. This list is meant to stay length 1.
 *
 * Adding to it is asserting that a second place may decide which carrier is on
 * a load — which is the condition this guard exists to prevent. If a new path
 * needs to assign a carrier, it calls assignCarrier / clearCarrier.
 */
const SANCTIONED = new Set(["services/carrierAssignmentService.ts"]);

/**
 * Taking a carrier OFF a load is one act, in one place.
 *
 * Putting one ON has seven legitimate callers — accept, on-behalf, bid accept,
 * waterfall, instant book, automation, fall-off re-assign — and they are all
 * assignments. Taking one off is not symmetric with that: it settles the
 * tender, voids live paper, returns the load to where it came from and records
 * a fall-off. A second place doing part of that is a load in a state nobody
 * meant.
 *
 * It was two until v3.8.axn. The other was a STAGING write in the compliance
 * gate that put a carrier on a load so a read-only check could find them and
 * then rolled it back — so for the duration of the check a concurrent reader
 * saw a carrier on a load they had not accepted, and a crash mid-check left
 * them there. Passing the candidate as an argument removed the write and its
 * rollback together.
 */
function findClearCarrierCallers(): string[] {
  const out: string[] = [];
  for (const f of walkTs(SRC)) {
    const rel = path.relative(SRC, f).replace(/\\/g, "/");
    if (rel === "services/carrierAssignmentService.ts") continue; // the definition
    const body = stripCommentsKeepingLines(fs.readFileSync(f, "utf8"));
    if (/\bclearCarrier\s*\(/.test(body)) out.push(rel);
  }
  return out;
}

describe("Load.carrierId has one writer", () => {
  it("only carrierReleaseService takes a carrier OFF a load", () => {
    const callers = findClearCarrierCallers();
    expect(
      callers,
      "clearCarrier settles the tender, voids paper and records a fall-off. A " +
        "second caller doing part of that leaves a load in a state nobody meant. " +
        "Caller(s)",
    ).toEqual(["services/carrierReleaseService.ts"]);
  });

  it("the clearCarrier scanner is not silently matching nothing", () => {
    // A scanner that has stopped matching reports a perfectly clean tree, and
    // the assertion above would pass with an empty array if the name changed.
    expect(findClearCarrierCallers().length).toBeGreaterThan(0);
  });

  it("nothing outside carrierAssignmentService writes it", () => {
    const offenders = findCarrierIdWriters().filter((h) => !SANCTIONED.has(h.file));
    expect(
      offenders.map((o) => `${o.file}:${o.line}${o.hoisted ? ` (hoisted payload \`${o.hoisted}\`)` : o.shorthand ? " (shorthand)" : ""}`),
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

  it("matches a HOISTED payload — `data.carrierId = x` handed to the call as shorthand `data` (the updateLoad shape)", () => {
    const fx = new Map([[
      path.join(SRC, "__hoisted__.ts"),
      `const data: any = {};\nif (carrierId !== undefined) {\n  data.carrierId = carrierId;\n}\nconst load = await prisma.load.update({ where: { id: req.params.id }, data });\n`,
    ]]);
    const hits = findCarrierIdWriters(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].hoisted).toBe("data");
  });

  it("matches a hoisted payload passed by name — `data: payload` with `payload = { carrierId }` above", () => {
    const fx = new Map([[
      path.join(SRC, "__hoisted2__.ts"),
      `const payload = { status: "BOOKED", carrierId: userId };\nawait prisma.load.update({ where: { id }, data: payload });\n`,
    ]]);
    const hits = findCarrierIdWriters(SRC, fx);
    expect(hits).toHaveLength(1);
    expect(hits[0].hoisted).toBe("payload");
  });

  it("does NOT match a hoisted payload that never assigns carrierId", () => {
    const fx = new Map([[
      path.join(SRC, "__hoisted3__.ts"),
      `const data: any = {};\ndata.status = "BOOKED";\ndata.carrierRate = 5;\nawait prisma.load.update({ where: { id }, data });\n`,
    ]]);
    expect(findCarrierIdWriters(SRC, fx)).toHaveLength(0);
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
