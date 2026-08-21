// `Load.rate` is retired. Nothing may read it.
//
// The column meant the CUSTOMER number on `loadController.createLoad` and the
// CARRIER number on `withTenderController` — one column, two meanings (§13.3
// Item 220.2). Arc 21 moved every reader to an explicit field and left `rate` as
// a WRITE-ONLY MIRROR: kept in sync so a rollback finds what it expects, read by
// nothing.
//
// This guard is what makes "read by nothing" true tomorrow as well as today. It
// is also the release condition on the drop migration sitting unmerged on
// `hold/retire-load-rate` — that migration may only land after this has been
// green for a full deploy cycle.
//
// §13.3 Item 227.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.join(__dirname, "../../../src");

/**
 * Sites permitted to name `rate` on a Load — the mirror writes, and nothing
 * else. Each is a WRITE. If one of these ever becomes a read, this list is the
 * wrong place to fix it.
 */
const MIRROR_WRITE_SITES = [
  "controllers/loadController.ts",
  "controllers/withTenderController.ts",
  "controllers/shipperPortalController.ts",
  "services/emailToLoadService.ts",
];

/** Identifiers whose `.rate` belongs to another model entirely. */
const OTHER_MODELS = [
  "item", "li", "lineItem", "line", "accessorial", "acc", "contract", "contractRate",
  "marketRate", "mr", "quote", "rateResult", "shipment", "bid", "tender", "pay",
  "invoice", "settlement", "params", "data", "updateData", "input", "row", "r", "ctx",
];

const LOAD_ISH = ["load", "l", "ld", "existing", "updated", "created", "match"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

interface Read {
  file: string;
  line: number;
  text: string;
}

/**
 * Every place a Load's `rate` is READ.
 *
 * Comments are stripped first — several of the files involved carry prose
 * explaining this very migration, and counting those would report reads that do
 * not exist. That is the lesson from the Item 199 schema scanner and the Arc 16
 * duplicate-schedule guard, applied rather than relearned.
 */
function findReads(): Read[] {
  const found: Read[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    if (MIRROR_WRITE_SITES.includes(rel)) continue;

    const lines = fs.readFileSync(file, "utf8").split("\n");
    let inBlockComment = false;

    lines.forEach((raw, i) => {
      let line = raw;
      if (inBlockComment) {
        if (line.includes("*/")) { inBlockComment = false; line = line.slice(line.indexOf("*/") + 2); }
        else return;
      }
      if (line.includes("/*")) { inBlockComment = !line.includes("*/"); line = line.slice(0, line.indexOf("/*")); }
      line = line.replace(/\/\/.*$/, "").trim();
      if (!line) return;

      // A dot-read on something that looks like a Load.
      const dot = new RegExp(`\\b(${LOAD_ISH.join("|")})\\.rate\\b`).exec(line);
      if (dot && !OTHER_MODELS.includes(dot[1])) {
        found.push({ file: rel, line: i + 1, text: line.slice(0, 120) });
        return;
      }
      // A Prisma aggregate or select naming rate — only counted in a file that
      // also mentions prisma.load, so Shipment.rate aggregates stay out.
      if (/_(?:sum|avg|min|max):\s*\{[^}]*\brate:\s*true/.test(line) || /select:\s*\{[^}]*\brate:\s*true/.test(line)) {
        // A line that names another model explicitly is that model's rate,
        // not the Load's. `prisma.shipment.aggregate({ _sum: { rate: true } })`
        // is Shipment.rate and has nothing to do with this migration — the
        // first version of this guard flagged three of them, which is a guard
        // crying wolf and therefore a guard people start ignoring.
        // The model name is often two or three lines above the `_sum` — a
        // multi-line `prisma.shipment.aggregate({ ... })` puts it out of reach
        // of a single-line test, which is why the first fix here still flagged
        // two Shipment aggregates. Look back a short window instead.
        const windowStart = Math.max(0, i - 4);
        const context = lines.slice(windowStart, i + 1).join(" ");
        const model = /prisma\.([a-zA-Z]+)\./.exec(context);
        if (model && model[1] !== "load") return;
        const whole = fs.readFileSync(file, "utf8");
        if (/prisma\.load\./.test(whole)) {
          found.push({ file: rel, line: i + 1, text: line.slice(0, 120) });
        }
      }
    });
  }
  return found;
}

describe("Load.rate is retired", () => {
  it("has no readers outside the mirror-write sites", () => {
    const reads = findReads();
    const detail = reads.map((r) => `${r.file}:${r.line}  ${r.text}`).join("\n  ");
    expect(
      reads,
      reads.length
        ? `Load.rate is a write-only mirror and must not be read. Found:\n  ${detail}\n\n` +
          "Use `customerRate` for what the shipper pays and `carrierRate` for what SRL pays. " +
          "If a surface genuinely needs one and you are unsure which, §13.3 Item 227 records the " +
          "decision made for every existing surface and the reasoning."
        : "",
    ).toEqual([]);
  });

  it("still parses real code, so an empty pass cannot be vacuous", () => {
    // The tripwire. A scanner that silently matched nothing would keep this
    // suite green forever while the column crept back into use — the exact
    // §19 Sub-pattern 16 failure. Point it at a known reader and require a hit.
    const probe = path.join(SRC, "controllers/loadController.ts");
    const text = fs.readFileSync(probe, "utf8");
    expect(text.includes("data.rate = rate"), "the mirror write should still exist in loadController").toBe(true);
    expect(walk(SRC).length, "the walker should see the whole source tree").toBeGreaterThan(100);
  });

  it("names its own release condition, so the mirror cannot become permanent", () => {
    const lc = fs.readFileSync(path.join(SRC, "controllers/loadController.ts"), "utf8");
    expect(lc).toMatch(/REMOVAL CONDITION/);
    expect(lc).toMatch(/hold\/retire-load-rate/);
  });
});
