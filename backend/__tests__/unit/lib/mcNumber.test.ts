/**
 * A carrier's MC number is printed once, with one prefix.
 *
 * THE BUG THIS EXISTS FOR. `CarrierProfile.mcNumber` is free text, the FMCSA
 * lookups hand the onboarding form `MC-116980`, and the form saves what it is
 * given, so 8 of the 9 live carriers on 2026-09-28 stored the prefix. Every
 * surface that printed "MC-" or "MC# " in front of the raw value printed it
 * twice. The owner saw "DREAM TRANS INC · MC-MC-116980" on that carrier's own
 * portal home page, and the email SRL sends a carrier's insurance agent had
 * "MC# MC-116980" in its subject line.
 *
 * Three surfaces had already fixed it for themselves, each with its own regex.
 * The rest had not. So the rule now lives in one function per tree
 * (`mcDigits`), and this file holds three things: the rule, the two copies
 * equal, and every labelled MC value in the source going through it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { mcDigits } from "../../../src/lib/mcNumber";

const REPO = join(__dirname, "../../../../");
const read = (p: string) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");

describe("mcDigits: the digits, whatever prefix was stored", () => {
  it.each([
    ["MC-116980", "116980"],
    ["MC116980", "116980"],
    ["MC# 116980", "116980"],
    ["MC#116980", "116980"],
    ["mc 116980", "116980"],
    ["MC: 116980", "116980"],
    ["  MC-116980  ", "116980"],
    ["116980", "116980"],
  ])("%j -> %j", (raw, want) => {
    expect(mcDigits(raw)).toBe(want);
  });

  it("returns null for nothing, so a surface's own fallback shows", () => {
    expect(mcDigits(null)).toBeNull();
    expect(mcDigits(undefined)).toBeNull();
    expect(mcDigits("")).toBeNull();
    expect(mcDigits("   ")).toBeNull();
  });

  it("strips only when digits follow, so a word that starts with MC is left alone", () => {
    expect(mcDigits("MCALLEN")).toBe("MCALLEN");
  });

  it("a stored prefix with nothing after it is no number, not a second prefix", () => {
    // Before this, "MC-" survived the digit lookahead and printed "MC-MC-".
    for (const raw of ["MC", "MC-", "MC#", "MC# ", "mc :"]) expect(mcDigits(raw), raw).toBeNull();
  });
});

/** The function body with comments and whitespace removed. */
function body(src: string): string {
  const at = src.indexOf("export function mcDigits");
  expect(at, "vacuity: mcDigits must be defined").toBeGreaterThan(-1);
  return src
    .slice(at)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, "");
}

describe("the frontend and backend copies are the same rule", () => {
  it("function bodies match exactly", () => {
    const be = body(read("backend/src/lib/mcNumber.ts"));
    const fe = body(read("frontend/src/lib/mcNumber.ts"));
    expect(fe).toBe(be);
  });
});

// ── The census ─────────────────────────────────────────────────────────────

/**
 * The shapes a label and a value take in this codebase. Each is a pattern whose
 * group 1 is the value expression. Four shapes, because the first review of
 * this guard found a live doubled prefix it could not see: the label sat in its
 * own element, `<span>MC#:</span> {fmcsaResult.mcNumber}`.
 */
const SHAPES: RegExp[] = [
  // "MC-{x}", "MC# ${x}", "MC: {x}", "MC#: ${x}": a label then an interpolation.
  /\bMC#?[:-]?\s*\$?\{([^}]*)\}/g,
  // The label in its own element: <span>MC#:</span> {x}
  /\bMC#?[:-]?\s*<\/[a-zA-Z]+>\s*\{([^}]*)\}/g,
  // A label string concatenated with a value: 'MC# ' + c.mc
  /["'`]MC#?[:-]?\s*["'`]\s*\+\s*([\w.?]+)/g,
  // A signature-field prefill keyed by the label: prefilled["MC #"] = x
  /\[\s*["']MC\s?#["']\s*\]\s*=\s*([^;\n]+)/g,
];
/** The expression names a carrier's stored MC value. */
const STORED_MC = /\bmcNumber\b|\bcarrierMc\b|\.mc\b|^\s*mc\b/;

/**
 * Exact hits allowed without mcDigits, each with the reason. Keyed by the
 * matched text, not the file, so an exemption cannot quietly cover a new line
 * in the same file. A stale entry fails the suite, because dead permission is an
 * exemption granted to code that moved.
 */
const ALLOWED: Record<string, Record<string, string>> = {
  // Where the prefixed value is BUILT: FMCSA returns the docket as bare digits
  // and this is the one place that adds "MC-" to them.
  "backend/src/services/fmcsaService.ts": {
    "MC-${carrier.mcNumber}": "FMCSA's carrier.mcNumber is the bare docket; this line adds the prefix",
    "MC-${mc.docketNumber}": "FMCSA's docketNumber is bare digits; this line adds the prefix",
  },
  // The value arrives already stripped: verifyController sends
  // mc: mcDigits(...), asserted below.
  "frontend/public/verify.html": {
    "'MC# ' + c.mc": "c.mc is stripped by verifyController before it is sent",
  },
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(REPO, dir))) {
    const rel = `${dir}/${name}`;
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(join(REPO, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|html)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

function findUnstripped(src: string): string[] {
  const hits: string[] = [];
  const text = stripComments(src);
  for (const re of SHAPES) {
    for (const m of text.matchAll(re)) {
      const expr = m[1];
      if (!STORED_MC.test(expr)) continue;
      if (/mcDigits\(/.test(expr)) continue;
      if (/BRAND\.mc\b|MC_NUMBER|MC_LABEL/.test(expr)) continue; // SRL's own number
      hits.push(m[0]);
    }
  }
  return hits;
}

describe("every labelled carrier MC value goes through mcDigits", () => {
  const files = [...walk("frontend/src"), ...walk("backend/src"), ...walk("frontend/public")];

  it("the scanner sees the fixtures it must catch, and passes the fixed shapes", () => {
    expect(findUnstripped('<span>MC-{carrier.mcNumber}</span>')).toHaveLength(1);
    expect(findUnstripped('MC: {c.mcNumber || "N/A"}')).toHaveLength(1);
    expect(findUnstripped("subject: `(MC# ${carrier.mcNumber || \"N/A\"})`")).toHaveLength(1);
    expect(findUnstripped("MC#: ${carrierData.mcNumber}")).toHaveLength(1);
    expect(findUnstripped("MC# {c.mc}")).toHaveLength(1);
    expect(findUnstripped("MC#  {c.mc}")).toHaveLength(1);
    expect(findUnstripped("parts.push('MC# ' + c.mc)")).toHaveLength(1);
    expect(findUnstripped("parts.push(`MC# ` + c.mc)")).toHaveLength(1);
    expect(findUnstripped('<span className="font-medium">MC#:</span> {fmcsaResult.mcNumber}')).toHaveLength(1);
    expect(findUnstripped('prefilled["MC #"] = carrier.mcNumber;')).toHaveLength(1);
    expect(findUnstripped('<span>MC-{mcDigits(carrier.mcNumber)}</span>')).toHaveLength(0);
    expect(findUnstripped('<span className="font-medium">MC#:</span> {mcDigits(fmcsaResult.mcNumber)}')).toHaveLength(0);
    expect(findUnstripped('prefilled["MC #"] = mcShown;')).toHaveLength(0);
    expect(findUnstripped("`MC# ${BRAND.mc}`")).toHaveLength(0);
    expect(findUnstripped("// MC-{carrier.mcNumber} in a comment")).toHaveLength(0);
  });

  it("finds no unstripped MC value outside the allow-list", () => {
    expect(files.length, "vacuity: the walk must see the source").toBeGreaterThan(300);
    expect(files.filter((f) => f.endsWith(".html")).length, "vacuity: the public pages are walked").toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const f of files) {
      for (const hit of findUnstripped(read(f))) {
        if (ALLOWED[f]?.[hit]) continue;
        offenders.push(`${f}: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the allow-list is not stale: each exact entry still matches", () => {
    for (const [f, entries] of Object.entries(ALLOWED)) {
      const hits = findUnstripped(read(f));
      for (const hit of Object.keys(entries)) expect(hits, `${f}: "${hit}" no longer needs its exemption`).toContain(hit);
    }
  });

  it("the public verify page gets digits: verifyController sends mc through mcDigits", () => {
    expect(read("backend/src/controllers/verifyController.ts")).toContain("mc: mcDigits(match.carrier.carrierProfile?.mcNumber)");
  });

  it("vacuity: mcDigits is actually used across both trees", () => {
    let uses = 0;
    for (const f of files) uses += (read(f).match(/mcDigits\(/g) ?? []).length;
    expect(uses).toBeGreaterThanOrEqual(20);
  });
});
