/**
 * §21.2 PERMANENCE GUARD.
 *
 * The numbering scheme has been centralised twice now. It drifted the first time
 * because centralising is not the same as being the only way — lib/documentNumber
 * existed and three call sites still built their own identifier, one of which
 * double-prefixed in production and printed RC-SRL-SRL-121488 on every page
 * header of every Rate Confirmation.
 *
 * So this fails on any of three things, which are the three ways the scheme comes
 * apart:
 *
 *   1. A NUMBER BUILT OUTSIDE documentNumber.ts. One allocator or none.
 *   2. A TYPE- FILENAME PREFIX. The download folder is where a customer meets the
 *      string, and BOL-5001.pdf sorts by type across every load they ever saved —
 *      the one ordering nobody wants, and the exact thing the scheme exists to
 *      prevent.
 *   3. A LETTER ASSIGNED OUTSIDE ACCESSORIAL_LETTER. Two assignment sites is how
 *      two accessorial types come to share a letter and two supplementals on one
 *      load become the same document.
 *
 * COMMENTS ARE STRIPPED BEFORE SCANNING. documentNumber.ts describes the retired
 * scheme at length and pdfController now carries a comment explaining why the
 * settlement batch keeps STL-, so a guard that reads prose as code would either
 * fire on its own documentation or be silently disabled to stop it (§19
 * Sub-pattern 17 — the instrument whose reach excludes, or includes, the wrong
 * thing).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const BACKEND_SRC = join(__dirname, "../../../src");
const OWNER = "lib/documentNumber.ts"; // the one module allowed to assign

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Remove block and line comments and their contents. Crude but sufficient: this
 *  only needs to stop prose being read as code, and a string containing "//" is
 *  not a shape any of the three patterns below can match anyway. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = walk(BACKEND_SRC);
const rel = (p: string) => p.replace(/\\/g, "/").split("/src/")[1];
const isOwner = (p: string) => rel(p) === OWNER;

// ── 1. a number built outside documentNumber.ts ────────────────────────────
//
// `SRL-${...}` is a LOAD number being assembled. It is deliberately narrower
// than "any SRL- string": SRL-Certificate-${slug} and SRL-training-transcript-
// are brand filenames for documents that are not load documents, and the rule
// does not reach them. The interpolation must open immediately after the dash.
export const LOAD_NUMBER_BUILD = /`SRL-\$\{/;

// ── 2. a TYPE- filename prefix ─────────────────────────────────────────────
//
// Asserted as a MIRROR rather than by hunting prefixes: every download filename
// on a load document must be produced by documentFilename(). A positive rule
// catches a prefix nobody thought to add to a denylist.
const LOAD_DOCUMENT_CONTROLLERS = [
  "controllers/pdfController.ts",
  "controllers/rateConfirmationController.ts",
];
/** The one sanctioned exception, and it is a decision rather than an oversight:
 *  the Settlement BATCH is one carrier over one period, spans many loads, and
 *  structurally cannot carry a load number (§21.2 ruling 2). */
const BATCH_FILENAME = "${settlement.settlementNumber}.pdf";

// ── 3. a letter assigned outside the constant ──────────────────────────────
const ACCESSORIAL_TYPES = [
  "LUMPER",
  "DETENTION_PU",
  "DETENTION_DEL",
  "TONU",
  "LAYOVER",
  "HAZMAT",
  "DEADHEAD",
  "DRIVER_ASSIST",
  "REEFER_FUEL",
  "INSIDE_DELIVERY",
  "LIFTGATE",
  "PALLET_EXCHANGE",
];
/** `LUMPER: "A"` — a type mapped straight to a single letter. */
export function letterAssignments(src: string): string[] {
  const hits: string[] = [];
  for (const t of ACCESSORIAL_TYPES) {
    const re = new RegExp(t + '\\s*:\\s*["\']([A-Z])["\']');
    const m = src.match(re);
    if (m) hits.push(t + " -> " + m[1]);
  }
  return hits;
}

describe("§21.2 permanence guard", () => {
  it("scanned a real corpus (vacuity tripwire)", () => {
    // A guard that silently stops matching reports a clean tree, which is the
    // failure mode every check below would otherwise share.
    expect(FILES.length, "no backend source files walked").toBeGreaterThan(100);
    expect(FILES.some(isOwner), "documentNumber.ts not found in the walk").toBe(true);
    // and the patterns can still find their subject where it is legitimate
    const owner = stripComments(readFileSync(FILES.find(isOwner)!, "utf8"));
    expect(letterAssignments(owner).length, "the letter map is not where it should be").toBe(12);
  });

  it("1. no load number is built outside documentNumber.ts", () => {
    const offenders = FILES.filter((p) => !isOwner(p))
      .filter((p) => LOAD_NUMBER_BUILD.test(stripComments(readFileSync(p, "utf8"))))
      .map(rel);
    expect(
      offenders,
      "a load number is assembled outside lib/documentNumber.ts — one allocator or none",
    ).toEqual([]);
  });

  it("2. every load-document filename goes through documentFilename()", () => {
    const offenders: string[] = [];
    for (const relPath of LOAD_DOCUMENT_CONTROLLERS) {
      const full = FILES.find((p) => rel(p) === relPath);
      expect(full, `${relPath} not found — repoint this guard`).toBeTruthy();
      const src = stripComments(readFileSync(full!, "utf8"));
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("attachment; filename=")) return;
        // the filename may be built on this line or assigned to `filename` above it
        const window = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
        if (window.includes(BATCH_FILENAME)) return; // ruling 2, sanctioned (window, not line: the
        // filename is assigned a few lines above the header call)
        if (!window.includes("documentFilename(")) {
          offenders.push(`${relPath}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      "a load-document download filename is built without documentFilename() — a TYPE- prefix sorts a customer's folder by type, across every load they ever saved",
    ).toEqual([]);
  });

  it("3. no accessorial letter is assigned outside ACCESSORIAL_LETTER", () => {
    const offenders = FILES.filter((p) => !isOwner(p))
      .map((p) => ({ file: rel(p), hits: letterAssignments(stripComments(readFileSync(p, "utf8"))) }))
      .filter((r) => r.hits.length > 0)
      .map((r) => `${r.file}: ${r.hits.join(", ")}`);
    expect(
      offenders,
      "an accessorial type is mapped to a letter outside lib/documentNumber.ts — two assignment sites is how two types come to share a letter",
    ).toEqual([]);
  });
});

describe("the guard's own patterns (self-test)", () => {
  it("strips comments, so prose about the retired scheme is not read as code", () => {
    expect(stripComments('// was `SRL-${n}`\nconst a = 1;')).not.toMatch(LOAD_NUMBER_BUILD);
    expect(stripComments('/* `SRL-${n}` */\nconst a = 1;')).not.toMatch(LOAD_NUMBER_BUILD);
    // but real code is still seen
    expect(stripComments('const x = `SRL-${n}`;')).toMatch(LOAD_NUMBER_BUILD);
  });

  it("does not fire on a brand filename for a non-load document", () => {
    expect('`SRL-Certificate-${slug}.pdf`').not.toMatch(LOAD_NUMBER_BUILD);
    expect('`SRL-training-transcript-${today}.csv`').not.toMatch(LOAD_NUMBER_BUILD);
  });

  it("detects a letter assignment in either quote style", () => {
    expect(letterAssignments('const m = { LUMPER: "A" };')).toEqual(["LUMPER -> A"]);
    expect(letterAssignments("const m = { TONU: 'D' };")).toEqual(["TONU -> D"]);
    expect(letterAssignments("const m = { LUMPER: someVar };")).toEqual([]);
  });
});
