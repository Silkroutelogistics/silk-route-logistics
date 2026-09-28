/**
 * Ruling 2026-09-27: "Overdue is set only by the hourly aging job, on the due
 * date, for every customer including Tipalti. The reminder emailer never sets
 * overdue."
 *
 * v3.8.bmh took the emailer's two writes out and v3.8.bmi put the aging job's
 * rule in services/invoiceAging.ts. This holds the "only": no other file in
 * backend/src writes OVERDUE. Three jobs had written it before (the hourly
 * aging job, the retired 11:00 job, and the emailer), each on its own clock.
 *
 * A write is `status: "OVERDUE"` (or `status: { set: "OVERDUE" }`) inside an
 * object whose nearest deciding key is `data`, `create` or `update`, or inside
 * an object with no key at all (a payload built first and passed later), or an
 * assignment `x.status = "OVERDUE"`. Inside `where` it is a read. What this
 * cannot see: a status that arrives in a variable, e.g. from a request body —
 * the AE invoice edit can still set OVERDUE by hand.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { stripCommentsKeepingLines, walkTs } from "../../helpers/prismaWriterScan";

const SRC = path.join(__dirname, "../../../src");
const Q = `["'\`]`;
const INLINE = new RegExp(`\\bstatus\\s*:\\s*(?:\\{\\s*set\\s*:\\s*)?${Q}OVERDUE${Q}`, "g");
const ASSIGN = new RegExp(`(?:\\.status|\\[\\s*${Q}status${Q}\\s*\\])\\s*=\\s*${Q}OVERDUE${Q}`, "g");

function decide(src: string, idx: number): "write" | "read" {
  let depth = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const c = src[i];
    if (c === "}" || c === "]" || c === ")") { depth++; continue; }
    if (c !== "{" && c !== "[" && c !== "(") continue;
    if (depth > 0) { depth--; continue; }
    if (c === "(") return "write"; // reached a call without a deciding key: count it
    if (c === "{") {
      const key = src.slice(Math.max(0, i - 40), i).match(/([A-Za-z_$][\w$]*)\s*:\s*$/)?.[1];
      if (key === "where") return "read";
      if (key === "data" || key === "create" || key === "update") return "write";
    }
  }
  return "write";
}

function overdueWriteLines(raw: string): number[] {
  const src = stripCommentsKeepingLines(raw);
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;
  const out: number[] = [];
  for (const m of src.matchAll(INLINE)) if (decide(src, m.index!) === "write") out.push(lineOf(m.index!));
  for (const m of src.matchAll(ASSIGN)) out.push(lineOf(m.index!));
  return out;
}

const WALK_MS = 30_000; // a whole-tree walk; see §13.3 Item 273.7

describe("only services/invoiceAging.ts writes OVERDUE", () => {
  it("the scanner tells a write from a read (fixtures)", () => {
    const writes = [
      `prisma.invoice.update({ where: { id }, data: { status: "OVERDUE" } })`,
      `tx.invoice.updateMany({ where: { dueDate: { lt: now } }, data: { ...rest, status: "OVERDUE" } })`,
      `updateData.status = "OVERDUE";`,
      `updateData["status"] = 'OVERDUE';`,
      `const payload = { status: "OVERDUE" };`,
      `prisma.invoice.update({ where: { id }, data: { status: { set: "OVERDUE" } } })`,
      `prisma.invoice.update({\n  where: { id },\n  data: {\n    status: "OVERDUE",\n  },\n})`,
    ];
    const reads = [
      `prisma.invoice.count({ where: { status: "OVERDUE" } })`,
      `prisma.invoice.findMany({ where: { AND: [{ status: "OVERDUE" }] } })`,
      `prisma.invoice.findMany({ where: { status: { in: ["SENT", "OVERDUE"] } } })`,
      `if (inv.status === "OVERDUE") return;`,
      `if (inv.status !== "OVERDUE") return;`,
      `// data: { status: "OVERDUE" }`,
      `/* data: { status: "OVERDUE" } */`,
    ];
    for (const w of writes) expect(overdueWriteLines(w), w).toHaveLength(1);
    for (const r of reads) expect(overdueWriteLines(r), r).toEqual([]);
  });

  it("across backend/src, the aging service is the only writer", () => {
    const writers = walkTs(SRC)
      .filter((f) => overdueWriteLines(fs.readFileSync(f, "utf8")).length > 0)
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
      .sort();
    // Not vacuous: the scanner must find the one real writer.
    expect(writers).toContain("services/invoiceAging.ts");
    expect(writers).toEqual(["services/invoiceAging.ts"]);
  }, WALK_MS);
});
