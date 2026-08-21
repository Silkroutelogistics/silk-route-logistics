/**
 * ARC 21 — every reader and writer of `Load.rate`, as of HEAD.
 *
 * WHY A TOOL AND NOT A GREP. `.rate` is one of the most overloaded identifiers
 * in this codebase: invoice line items, contract rates, accessorial rates,
 * market rates and shipment rates all carry it. A raw grep returns forty-odd
 * hits of which most are unrelated, and a census that is 60% noise is a census
 * nobody can act on. This narrows to references that are plausibly the LOAD's
 * column and prints the surrounding line so each can be classified by reading
 * rather than guessing.
 *
 * IT DOES NOT DECIDE ANYTHING. Every verdict in the arc is a human read of the
 * lines this prints — the tool's job is to make sure the list is complete and
 * small enough to actually read. Item 8.10's lesson: a narrow grep can be
 * correct and its inference still wrong.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Files to walk. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * Identifiers that carry a `.rate` belonging to something OTHER than a Load.
 * Each is a real model or DTO in this repo with its own rate concept.
 */
const NOT_A_LOAD = [
  "item", "li", "lineItem", "line", "accessorial", "acc", "contract", "contractRate",
  "marketRate", "mr", "quote", "rateResult", "shipment", "bid", "tender", "pay",
  "invoice", "settlement", "params", "data", "updateData", "input", "row", "r",
];

/** How a Load's rate tends to be referenced. */
const LOAD_ISH = ["load", "l", "ld", "existing", "updated", "created", "match", "ctx"];

interface Hit {
  file: string;
  line: number;
  text: string;
  kind: "READ" | "WRITE" | "QUERY" | "AGGREGATE" | "COMMENT";
}

const hits: Hit[] = [];

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split("\n");

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    // Comments are recorded separately — they are not code, but a stale comment
    // about `load.rate` is worth seeing during a migration that removes it.
    const isComment = line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");

    // dot-access on a load-ish identifier
    const dot = new RegExp(`\\b(${LOAD_ISH.join("|")})\\.rate\\b`).exec(line);
    // prisma aggregate over loads
    const agg = /_(?:sum|avg|min|max)\.rate\b/.exec(line);
    // a where-clause or data payload naming rate on a load query
    const bare = /^\s*rate\s*[:=]/.test(raw) || /where\.rate\b/.test(line) || /data\.rate\b/.test(line);

    if (!dot && !agg && !bare) return;

    // Exclude the obvious non-Load owners.
    if (dot) {
      const owner = dot[1];
      if (NOT_A_LOAD.includes(owner)) return;
    }

    hits.push({
      file: rel,
      line: i + 1,
      text: line.length > 150 ? line.slice(0, 150) + "…" : line,
      kind: isComment ? "COMMENT" : agg ? "AGGREGATE" : bare ? "WRITE" : "READ",
    });
  });
}

// Group by file so a reviewer reads one surface at a time rather than a flat list.
const byFile = new Map<string, Hit[]>();
for (const h of hits) {
  const list = byFile.get(h.file) ?? [];
  list.push(h);
  byFile.set(h.file, list);
}

const order = [...byFile.keys()].sort();
console.log(`Load.rate census — ${hits.length} candidate reference(s) across ${order.length} file(s)\n`);

for (const f of order) {
  console.log(`── ${f}`);
  for (const h of byFile.get(f)!) {
    console.log(`   ${String(h.line).padStart(5)}  ${h.kind.padEnd(9)}  ${h.text}`);
  }
  console.log("");
}

const counts = hits.reduce<Record<string, number>>((a, h) => ((a[h.kind] = (a[h.kind] ?? 0) + 1), a), {});
console.log("by kind:", JSON.stringify(counts));
console.log("\nEvery line above still needs reading. This narrows the field; it does not judge.");
