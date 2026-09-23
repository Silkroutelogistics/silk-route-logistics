/**
 * C4a — WHICH paths record an acceptance, frozen.
 *
 * R8c says no stamp ever originates from finalize, from PATCH /loads/:id/status
 * to DISPATCHED, or from an on-behalf waterfall accept. Those are NEGATIVE
 * properties about code that does not exist, and the only way to hold them is
 * to enumerate the code that does: a behavioural test can show one path stamps,
 * and cannot show that a sixth file was not added last week.
 *
 * This is the carrierIdWriterDrift shape. It may SHRINK and never GROW without
 * somebody editing this list and saying why.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "../../../src");

/** Every .ts under src/, recursively. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Line comments then block comments — a "//" inside a block must not eat the file. */
const strip = (s: string) =>
  s.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

const FILES = walk(SRC);

/** Files that CALL the writer — an import alone does not count. */
function callers(): string[] {
  const hits: string[] = [];
  for (const f of FILES) {
    const rel = path.relative(SRC, f).split(path.sep).join("/");
    if (rel === "lib/acceptanceEvidence.ts") continue;
    const src = strip(fs.readFileSync(f, "utf8"));
    // The call, not the import line: `stampCarrierAcceptance(` preceded by
    // await/return/= rather than by `import {`.
    if (/(?:await|return|=)\s*stampCarrierAcceptance\s*\(/.test(src)) hits.push(rel);
  }
  return hits.sort();
}

/** The `via` literals a file passes. */
function viasIn(rel: string): string[] {
  const src = strip(fs.readFileSync(path.join(SRC, rel), "utf8"));
  return [...src.matchAll(/via:\s*"([A-Z_]+)"/g)].map((m) => m[1]).sort();
}

const EXPECTED: Record<string, string[]> = {
  "controllers/tenderController.ts": ["TENDER_ACCEPT"],
  "routes/carrierLoads.ts": ["PICKUP_ARRIVAL"],
  "routes/loadBids.ts": ["BID_AWARD_ACCEPT"],
  "routes/rcSign.ts": ["RC_SIGNATURE"],
  "services/waterfallEngineService.ts": ["TENDER_ACCEPT"],
};

describe("the acceptance-evidence writer has exactly these callers", () => {
  it("scans a real corpus — the tripwire, so a broken matcher cannot read as a clean tree", () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(callers().length).toBeGreaterThan(0);
  });

  it("names them, and the list may shrink but never grow silently", () => {
    expect(callers()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("each path stamps the via it is supposed to", () => {
    for (const [rel, vias] of Object.entries(EXPECTED)) {
      expect(viasIn(rel), `${rel} vias`).toEqual(vias);
    }
  });
});

describe("R8c — the paths that reach DISPATCHED with no carrier act stamp nothing", () => {
  // Each of these CAN put a load in a state that looks accepted. None of them
  // observed a carrier accepting anything, so none may say one did.
  const MUST_NOT_STAMP = [
    // finalize: TENDERED -> DISPATCHED, an SRL-side act on the rate confirmation
    "controllers/rateConfirmationController.ts",
    // PATCH /loads/:id/status, including straight to DISPATCHED
    "controllers/loadController.ts",
    // the single writer of Load.carrierId — assignment is not acceptance
    "services/carrierAssignmentService.ts",
  ];

  it.each(MUST_NOT_STAMP)("%s does not record an acceptance", (rel) => {
    expect(callers()).not.toContain(rel);
  });

  it("the guarded files exist, so the assertions above are about real code", () => {
    for (const rel of MUST_NOT_STAMP) {
      expect(fs.existsSync(path.join(SRC, rel)), rel).toBe(true);
    }
  });
});
