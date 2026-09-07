/**
 * Every onboardingStatus this codebase WRITES is a value the enum still has.
 *
 * v3.8.ajd condensed OnboardingStatus from the legacy six to the canonical six,
 * merging DOCUMENTS_SUBMITTED and UNDER_REVIEW into REVIEWING. One writer kept
 * the retired literal:
 *
 *   updateData.onboardingStatus = "DOCUMENTS_SUBMITTED";
 *
 * in uploadCarrierDocuments, the carrier-facing compliance-document endpoint.
 * Prisma rejects a value outside the enum, so that handler threw — AFTER the
 * files had reached storage and their Document rows had committed. The carrier
 * saw a 500, retried, and duplicated the upload. It fired only when a filename
 * contained w9, insurance, cert or authority: precisely the documents the
 * endpoint exists to receive.
 *
 * TYPESCRIPT COULD NOT SEE IT. The payload is a
 * `Record<string, boolean | string>`, so the literal is just a string as far as
 * tsc is concerned, and the mistake survived three and a half months of green
 * builds and green suites.
 *
 * This reads the enum out of schema.prisma rather than restating it, because a
 * second copy of the members is the thing that goes stale.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.join(__dirname, "../../..");
const SRC = path.join(BACKEND, "src");
const SCHEMA = path.join(BACKEND, "prisma", "schema.prisma");

/** The enum's members, from the schema. */
function onboardingStatusMembers(): string[] {
  const schema = fs.readFileSync(SCHEMA, "utf8");
  const block = schema.match(/enum\s+OnboardingStatus\s*\{([^}]*)\}/);
  if (!block) throw new Error("OnboardingStatus enum not found in schema.prisma");
  return block[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => /^[A-Z_]+$/.test(l));
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(f, out);
    else if (f.endsWith(".ts")) out.push(f);
  }
  return out;
}

/** Comments and template literals blanked, offsets kept. Quoted strings survive
 *  because the literal under test is one. */
function blankNoise(src: string): string {
  const out = src.split("");
  const BACKTICK = String.fromCharCode(96);
  const ESC = String.fromCharCode(92);
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; } continue; }
    if (c === "/" && d === "*") {
      out[i] = out[i + 1] = " "; i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] !== "\n") out[i] = " "; i++; }
      if (i < src.length) { out[i] = out[i + 1] = " "; i += 2; }
      continue;
    }
    if (c === BACKTICK) {
      out[i] = " "; i++;
      while (i < src.length) {
        if (src[i] === ESC) { out[i] = " "; if (src[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
        if (src[i] === BACKTICK) { out[i] = " "; i++; break; }
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * Both write shapes. The object-literal form is the common one; the
 * property-assignment form is what the defect used, and is the shape §19
 * Sub-pattern 18 names as the one a key-colon pattern walks past.
 *
 * `[^=]` after `=` keeps `x.onboardingStatus === "APPROVED"` comparisons out —
 * those are reads, and counting them would bury the real writes in noise.
 */
const OBJECT_FORM = /onboardingStatus\s*:\s*"([A-Z_]+)"/g;
const ASSIGN_FORM = /([A-Za-z_$][\w$]*)\s*\.onboardingStatus\s*=\s*"([A-Z_]+)"/g;

type Hit = { file: string; line: number; value: string };

function writtenLiterals(): Hit[] {
  const hits: Hit[] = [];
  for (const abs of walkTs(SRC)) {
    const raw = fs.readFileSync(abs, "utf8");
    const src = blankNoise(raw);
    const rel = path.relative(SRC, abs).split(path.sep).join("/");

    for (const m of src.matchAll(OBJECT_FORM)) {
      // A `where:` nearer than a `data:` is a filter, and a filter naming a
      // retired value is dead rather than fatal — a different defect, and one
      // this guard would only cry wolf about.
      const back = src.slice(Math.max(0, m.index! - 600), m.index!);
      const lastWhere = back.lastIndexOf("where:");
      const lastData = Math.max(back.lastIndexOf("data:"), back.lastIndexOf("create:"), back.lastIndexOf("update:"));
      if (lastData <= lastWhere) continue;
      hits.push({ file: rel, line: raw.slice(0, m.index!).split("\n").length, value: m[1] });
    }

    for (const m of src.matchAll(ASSIGN_FORM)) {
      if (m[1] === "where") continue;
      hits.push({ file: rel, line: raw.slice(0, m.index!).split("\n").length, value: m[2] });
    }
  }
  return hits;
}

describe("no writer sets an onboardingStatus the enum no longer has", () => {
  it("every written literal is a current member", () => {
    const members = onboardingStatusMembers();
    const bad = writtenLiterals().filter((h) => !members.includes(h.value));
    expect(
      bad.map((h) => `${h.file}:${h.line} writes "${h.value}"`),
      `Prisma rejects a value outside the enum, so this is a runtime 500 rather than a\n` +
        `type error — the payloads are loose Records and tsc cannot see it.\n` +
        `Current members: ${members.join(", ")}\n` +
        bad.map((h) => `  ${h.file}:${h.line} -> ${h.value}`).join("\n"),
    ).toEqual([]);
  });

  it("the retired values are gone from every write site", () => {
    // Named, because these two are the ones the v3.8.ajd migration merged away
    // and the ones a future edit is most likely to reach for out of habit.
    const written = new Set(writtenLiterals().map((h) => h.value));
    expect(written.has("DOCUMENTS_SUBMITTED")).toBe(false);
    expect(written.has("UNDER_REVIEW")).toBe(false);
  });

  it("the scanner reads the real enum and finds real writes", () => {
    // Vacuity tripwire in both directions. A scanner matching nothing, or an
    // enum parse returning nothing, would report a clean tree either way.
    const members = onboardingStatusMembers();
    expect(members).toContain("REVIEWING");
    expect(members).toContain("APPROVED");
    expect(members).not.toContain("DOCUMENTS_SUBMITTED");
    expect(writtenLiterals().length).toBeGreaterThan(5);
  });
});
