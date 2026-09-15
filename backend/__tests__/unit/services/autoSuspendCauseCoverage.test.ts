/**
 * Sprint A0 (v3.8.bbu): every suspension write carries a structured cause.
 *
 * The auto-reversal switches on CarrierProfile.autoSuspendCause and never on
 * the prose column. A writer that sets onboardingStatus SUSPENDED without a
 * cause therefore produces a row the reversal must hold for an AE forever,
 * and nothing else would notice. This guard:
 *
 *   1. finds every carrierProfile update payload in backend/src that writes the
 *      literal onboardingStatus: "SUSPENDED" (inline, wrapped chain, or inside
 *      a transaction client), and fails if any of them omits autoSuspendCause,
 *      autoSuspendedAt or autoSuspendReason;
 *   2. freezes the inventory per file, so a ninth writer must be added here
 *      with its cause rather than silently;
 *   3. holds the AutoSuspendCause enum and the written values to each other:
 *      every member has a writer, every written value is a member.
 *
 * Deliberately NOT covered, with the reason: carrierController.updateCarrier
 * assembles a hoisted payload (`data.onboardingStatus = onboardingStatus`) from
 * a request body, so it can write SUSPENDED with no cause. That is the generic
 * field-edit path banked at section 13.3 (Sprint A0), and a scanner keyed on a
 * literal cannot see it. It is listed below so its absence here is a decision.
 *
 * Self-tested against fixtures of every shape it must count and must not count
 * (section 19 Sub-patterns 16 and 18): a green run over a scanner that matched
 * nothing would be the failure this file exists to prevent.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const SCHEMA = path.resolve(__dirname, "../../../prisma/schema.prisma");

/** Frozen inventory: file -> number of literal SUSPENDED payloads. */
const EXPECTED: Record<string, number> = {
  "services/complianceMonitorService.ts": 6,
  "services/ofacScreeningService.ts": 1,
  "controllers/complianceController.ts": 1,
};

/** Writers the scanner cannot see, each with the reason it is not covered. */
const EXCLUDED_BY_DESIGN: Record<string, string> = {
  "controllers/carrierController.ts":
    "updateCarrier hoists a request-supplied onboardingStatus into a payload; " +
    "generic field-edit path, banked at section 13.3 Sprint A0",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Blank comments and string contents so prose cannot read as code. Keeps offsets. */
function blankNoise(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      // keep the quotes and the literal so `onboardingStatus: "SUSPENDED"` and
      // `autoSuspendCause: "X"` stay readable; blank only template ${} bodies
      const q = c; out += c; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        out += src[i]; i++;
      }
      out += q; i++;
    } else { out += c; i++; }
  }
  return out;
}

/** Every balanced `data: { ... }` body that follows a carrierProfile.update( call. */
export function suspensionPayloads(code: string): string[] {
  const clean = blankNoise(code);
  const re = /carrierProfile\s*\.\s*update(?:Many)?\s*\(/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const dataIdx = clean.indexOf("data:", m.index);
    if (dataIdx < 0) continue;
    const open = clean.indexOf("{", dataIdx);
    if (open < 0) continue;
    // the payload must belong to THIS call: no other update( between
    const nextCall = clean.indexOf("carrierProfile", m.index + 10);
    if (nextCall >= 0 && nextCall < dataIdx) continue;
    let depth = 0;
    let j = open;
    for (; j < clean.length; j++) {
      if (clean[j] === "{") depth++;
      else if (clean[j] === "}") { depth--; if (depth === 0) break; }
    }
    const body = clean.slice(open, j + 1);
    if (/onboardingStatus\s*:\s*"SUSPENDED"/.test(body)) out.push(body);
  }
  return out;
}

function scan(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    const bodies = suspensionPayloads(fs.readFileSync(file, "utf8"));
    if (bodies.length) found.set(rel, bodies);
  }
  return found;
}

function enumMembers(): string[] {
  const schema = fs.readFileSync(SCHEMA, "utf8");
  const m = schema.match(/enum AutoSuspendCause \{([\s\S]*?)\}/);
  if (!m) throw new Error("AutoSuspendCause enum not found in schema.prisma");
  return m[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

describe("autoSuspendCause coverage: every suspension write carries a structured cause", () => {
  const found = scan();

  it("the scanner sees real writes (vacuity tripwire)", () => {
    const total = [...found.values()].reduce((n, b) => n + b.length, 0);
    expect(total, "a scanner that finds no SUSPENDED write proves nothing").toBeGreaterThan(0);
  });

  it("every literal SUSPENDED payload also writes cause, timestamp and reason", () => {
    const bad: string[] = [];
    for (const [rel, bodies] of found) {
      bodies.forEach((b, i) => {
        for (const key of ["autoSuspendCause", "autoSuspendedAt", "autoSuspendReason"]) {
          if (!new RegExp(key + "\\s*:").test(b)) bad.push(`${rel} payload #${i + 1} lacks ${key}`);
        }
      });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("the writer inventory is frozen per file", () => {
    const actual: Record<string, number> = {};
    for (const [rel, bodies] of found) actual[rel] = bodies.length;
    expect(actual, "a new or removed SUSPENDED writer: update EXPECTED with its cause").toEqual(EXPECTED);
  });

  it("excluded files are excluded for a written reason and still carry no literal write", () => {
    for (const [rel, why] of Object.entries(EXCLUDED_BY_DESIGN)) {
      expect(why.length, rel).toBeGreaterThan(20);
      expect(found.has(rel), `${rel} now writes a literal SUSPENDED payload; move it into EXPECTED`).toBe(false);
      const raw = fs.readFileSync(path.join(SRC, rel), "utf8");
      expect(raw, `${rel} no longer hoists onboardingStatus; drop it from EXCLUDED_BY_DESIGN`).toMatch(
        /data\.onboardingStatus\s*=\s*onboardingStatus/,
      );
    }
  });

  it("every enum member has a writer and every written value is a member", () => {
    const members = enumMembers();
    expect(members).toEqual([
      "FMCSA_AUTHORITY", "FMCSA_OUT_OF_SERVICE", "FMCSA_RATING", "INSURANCE_EXPIRED",
      "VETTING_CRITICAL", "OFAC_MATCH", "AE_MANUAL",
    ]);
    const written = new Set<string>();
    for (const bodies of found.values()) {
      for (const b of bodies) {
        // the whole value expression to end of line: a ternary carries two
        // candidates and both must be members
        for (const expr of b.matchAll(/autoSuspendCause\s*:\s*([^\n]+)/g)) {
          // an array literal inside the expression is a condition (the
          // authority-change writer tests `["OUT_OF_SERVICE", "OOS"].includes`),
          // not a written value; drop it before reading the branches. The
          // inline one-line payloads end with ` },` and carry no array.
          const branches = expr[1].replace(/\[[^\]]*\]/g, "").split("}")[0];
          for (const v of branches.matchAll(/"([A-Z_]+)"/g)) written.add(v[1]);
        }
      }
    }
    for (const m of members) expect(written.has(m), `enum member ${m} has no writer`).toBe(true);
    for (const w of written) expect(members.includes(w), `written value ${w} is not an enum member`).toBe(true);
  });
});

describe("autoSuspendCause coverage: scanner self-tests", () => {
  it("counts an inline payload and flags a missing cause", () => {
    const fx = `await prisma.carrierProfile.update({ where: { id }, data: { onboardingStatus: "SUSPENDED", status: "SUSPENDED" } });`;
    const b = suspensionPayloads(fx);
    expect(b).toHaveLength(1);
    expect(/autoSuspendCause\s*:/.test(b[0])).toBe(false);
  });

  it("counts a wrapped chain and a transaction client", () => {
    const fx = `await prisma.carrierProfile\n  .update({\n    where: { id },\n    data: {\n      onboardingStatus: "SUSPENDED",\n      autoSuspendCause: "OFAC_MATCH",\n    },\n  });\nawait tx.carrierProfile.update({ where: { id }, data: { onboardingStatus: "SUSPENDED", autoSuspendCause: "AE_MANUAL" } });`;
    expect(suspensionPayloads(fx)).toHaveLength(2);
  });

  it("does not count a where-clause read or a comment", () => {
    const fx = `const rows = await prisma.carrierProfile.findMany({ where: { onboardingStatus: "SUSPENDED" } });\n// prisma.carrierProfile.update({ data: { onboardingStatus: "SUSPENDED" } })\nawait prisma.carrierProfile.update({ where: { onboardingStatus: "SUSPENDED" }, data: { tier: "GUEST" } });`;
    expect(suspensionPayloads(fx)).toHaveLength(0);
  });
});
