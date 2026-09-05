/**
 * InfoRequest category labels — one definition, and it stays one.
 *
 * THE DRIFT THIS CLOSES. The labels lived in two hand-maintained copies, in two
 * trees, and had already diverged: the AE dropdown called OTHER "Other (custom
 * message)" while the thread card, the carrier email, the AE resolved-email,
 * the answered confirmation and the withdrawal notice all called it "Additional
 * information". One ask, two names, depending on which surface you looked at.
 *
 * WHY THE BACKEND STRING WON. Eight surfaces render these labels and only ONE is
 * a dropdown. The other seven put the label inside a sentence — "Our {label}
 * request has been withdrawn" — where "Other (custom message)" reads as broken
 * English and leaks a UI affordance into a carrier's inbox.
 *
 * A guard rather than a comment, because a single definition is only single
 * until the next person who needs a label in a hurry pastes one.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  INFO_REQUEST_CATEGORY_LABELS,
  INFO_REQUEST_CATEGORIES,
} from "../../../../shared/constants/infoRequestCategories";

const BACKEND = path.join(__dirname, "../../..");
const REPO = path.join(BACKEND, "..");

// The working tree is CRLF. Line-anchored matching against un-normalised text
// fails silently against correct code.
const raw = (rel: string) =>
  fs.readFileSync(path.join(REPO, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Source with comments removed.
 *
 * ANCHOR ON WHAT RUNS, NOT ON A WORD IN A COMMENT ABOUT WHAT RUNS. The first
 * version of this guard read raw text and went red against correct code twice:
 * once on the sentence explaining why the OTHER label literal was removed, and
 * once on the note recording that getCategoryTemplate had been deleted. Both
 * comments exist precisely BECAUSE the thing is gone, so a prose-matching guard
 * fails hardest on the files that did the work. §19 Sub-pattern 16, ninth fire.
 *
 * IT IS A TOKENIZER, NOT A PAIR OF REGEXES, AND IT TOOK THREE TRIES TO GET
 * THERE. Attempt one read raw text and matched the prose explaining a deletion.
 * Attempt two stripped blocks first and ate the file: a line comment containing
 * "@shared" + slash-star carries a block OPENER, so the block pass ran to the
 * next close and swallowed the import it was meant to find. Attempt three
 * reordered the passes and looked right — while silently corrupting
 * frontend/vitest.config.ts down to 19% of itself, because
 * `include: ["src/**` + `/*.test.{ts,tsx}"]` puts a block opener inside a STRING.
 * The @shared assertion still passed, by luck rather than by soundness.
 *
 * That is the failure that matters here: every absence assertion in this file
 * passes trivially on text that was EATEN rather than text that is absent. A
 * stripper that removes too much cannot fail — it can only false-pass.
 *
 * So: a single left-to-right walk that knows what a string is. Quotes suspend
 * comment detection, and a backslash inside one skips the next character.
 * `https://` needs no special case any more because it lives inside a string.
 *
 * RESIDUAL LIMIT, stated rather than hidden: regex literals are not tracked, so
 * a pattern containing a literal slash-slash or slash-star would be misread.
 * None exists in the four files scanned here, and the fixtures below pin the
 * cases that do.
 */
function stripComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const next = src[i + 1];

    if (quote) {
      if (c === "\\") { out += c + (src[i + 1] ?? ""); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c; i++;
  }
  return out;
}

const read = (rel: string) => stripComments(raw(rel));

const SERVICE = "backend/src/services/infoRequestService.ts";
const MODAL = "frontend/src/components/carriers/InfoRequestModal.tsx";
const SCHEMA = "backend/prisma/schema.prisma";

describe("the label set matches the enum it is keyed by", () => {
  it("covers every InfoRequestCategory in the Prisma enum, and invents none", () => {
    const schema = read(SCHEMA);
    const block = schema.slice(schema.indexOf("enum InfoRequestCategory"));
    const body = block.slice(block.indexOf("{") + 1, block.indexOf("}"));

    // [A-Z0-9_]+, not [A-Z_]+. W9_UPDATE contains a digit, and a key regex
    // without the digit class silently drops it and reports 8 where there are
    // 9 — which reads as "the backend is missing W9_UPDATE" (§19 Sub-pattern 18).
    const enumValues = [...body.matchAll(/^\s*([A-Z0-9_]+)\s*$/gm)].map((m) => m[1]).sort();

    expect(enumValues).toHaveLength(9);
    expect(Object.keys(INFO_REQUEST_CATEGORY_LABELS).sort()).toEqual(enumValues);
    expect([...INFO_REQUEST_CATEGORIES].sort()).toEqual(enumValues);
  });

  it("gives every category a non-empty label", () => {
    // A blank label renders an empty option in the dropdown and an empty noun
    // in six sentences: "Our  request has been withdrawn."
    for (const [key, label] of Object.entries(INFO_REQUEST_CATEGORY_LABELS)) {
      expect(label.trim(), `${key} has no label`).not.toBe("");
    }
  });

  it("keeps OTHER readable inside a sentence", () => {
    // The whole reason the backend string won. This is the label that goes into
    // "Our {label} request has been withdrawn", so it must be a noun phrase and
    // not dropdown help text.
    expect(INFO_REQUEST_CATEGORY_LABELS.OTHER).toBe("Additional information");
    expect(INFO_REQUEST_CATEGORY_LABELS.OTHER).not.toMatch(/\(/);
  });
});

describe("no surface keeps a second copy", () => {
  const service = read(SERVICE);
  const modal = read(MODAL);

  it("neither the service nor the modal re-declares a label", () => {
    const offenders: string[] = [];
    for (const [key, label] of Object.entries(INFO_REQUEST_CATEGORY_LABELS)) {
      if (service.includes(`"${label}"`)) offenders.push(`${SERVICE} → ${key}`);
      if (modal.includes(`"${label}"`)) offenders.push(`${MODAL} → ${key}`);
    }
    expect(
      offenders,
      `a label literal is back in a consumer — the point of the shared module is that these live in exactly one place:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("both consumers reach the shared module rather than a local map", () => {
    expect(service).toMatch(/shared\/constants\/infoRequestCategories/);
    expect(modal).toMatch(/@shared\/constants\/infoRequestCategories/);
  });

  it("the frontend test runner can resolve @shared", () => {
    // next build and tsc both honour tsconfig paths, so a component importing
    // @shared compiles and ships while the vitest suite alone fails to resolve
    // it — in the job that gates the deploy. §19 Sub-pattern 11.
    expect(read("frontend/vitest.config.ts")).toMatch(/"@shared":\s*path\.resolve/);
  });

  it("reads real files with real content in them", () => {
    // Vacuity tripwire. Every assertion above is a substring search; if a read
    // returned "" they would all pass while checking nothing.
    expect(service.length).toBeGreaterThan(2_000);
    expect(modal.length).toBeGreaterThan(2_000);
    expect(Object.keys(INFO_REQUEST_CATEGORY_LABELS)).toHaveLength(9);
  });

  it("the comment stripper strips comments and nothing else", () => {
    // The stripper is what stands between this guard and a false green, so it
    // gets fixtures. A stripper that removes too much cannot fail — every
    // absence assertion above would pass on text that was EATEN rather than
    // text that is absent.
    const src = raw(SERVICE);
    expect(src).toMatch(/getCategoryTemplate/); // present, in the deletion note
    expect(service).not.toMatch(/getCategoryTemplate/); // stripped from code view
    expect(service).toMatch(/export function getCategoryLabel/); // real code survives
    expect(service).toMatch(/https:\/\/silkroutelogistics\.ai/); // a URL is not a comment
  });

  it("a comment delimiter inside a STRING is not a comment", () => {
    // The case that was silently corrupting vitest.config.ts. Each of these
    // opened a comment under the previous regex-pair stripper and swallowed
    // everything to the next close.
    expect(stripComments('const g = "src/**/*.test.ts"; const k = 1;')).toBe(
      'const g = "src/**/*.test.ts"; const k = 1;',
    );
    expect(stripComments('const u = "https://x.test/a"; const k = 1;')).toBe(
      'const u = "https://x.test/a"; const k = 1;',
    );
    expect(stripComments("const t = `a//b`; const k = 1;")).toBe("const t = `a//b`; const k = 1;");
    // An escaped quote must not end the string early.
    expect(stripComments('const e = "a\\"//b"; const k = 1;')).toBe('const e = "a\\"//b"; const k = 1;');
  });

  it("still removes the two comment forms it exists to remove", () => {
    expect(stripComments("const a = 1; // getCategoryTemplate\nconst b = 2;")).toBe(
      "const a = 1; \nconst b = 2;",
    );
    expect(stripComments("const a = 1; /* getCategoryTemplate */ const b = 2;")).toBe(
      "const a = 1;  const b = 2;",
    );
    // A block comment containing a line-comment marker is one block, not two.
    expect(stripComments("const a = 1; /* x // y */ const b = 2;")).toBe("const a = 1;  const b = 2;");
  });

  it("does not corrupt the config file this guard reads", () => {
    // The vacuity tripwire below covers the service and the modal and said
    // nothing about this file — which is how a strip that mangled it went
    // unnoticed while the @shared assertion passed anyway, by luck.
    //
    // ASSERT CONTENT, NOT A RATIO. The first version of this check compared
    // stripped-to-raw length against 0.4 and went red against a now-correct
    // stripper, because this file is genuinely ~80% comment prose. A size proxy
    // cannot tell "mostly comments" from "ate the code"; naming the two lines
    // that must survive can.
    const cfg = read("frontend/vitest.config.ts");
    // The glob is the canary: it contains a block-comment opener inside a
    // string, and the previous regex stripper turned it into "src*.test.{ts,tsx}".
    expect(cfg).toMatch(/include:\s*\["src\/\*\*\/\*\.test\.\{ts,tsx\}"\]/);
    expect(cfg).toMatch(/"@shared":\s*path\.resolve/);
    expect(cfg).toMatch(/environment:\s*"jsdom"/);
    expect(cfg).toMatch(/esbuild:\s*\{\s*jsx:\s*"automatic"\s*\}/);
  });
});

describe("the two unreachable surfaces stay deleted", () => {
  it("getCategoryTemplate is gone, and so is the map only it read", () => {
    // Zero consumers in backend/src, backend/scripts, backend/__tests__, e2e or
    // frontend/src. The templates pre-fill a textarea in the browser; the server
    // never read them.
    const service = read(SERVICE);
    expect(service).not.toMatch(/getCategoryTemplate/);
    expect(service).not.toMatch(/CATEGORY_TEMPLATES/);
  });

  it("the ?status= list filter is gone from BOTH the schema and the handler", () => {
    // Both halves, deliberately: validateQuery replaces req.query with the Zod
    // result, so a destructure left behind is `undefined` forever — harmless in
    // a spread, and the exact shape of the TONU 422 defect (§19 Sub-pattern 5).
    const routes = read("backend/src/routes/infoRequests.ts");
    const listBlock = routes.slice(routes.indexOf("const listSchema"), routes.indexOf("router.patch"));

    // The word `status` must not appear ANYWHERE in the block, in any form.
    // The first version required it to be followed by `}` or `,`, which a
    // reader could evade without noticing: re-adding the filter as
    // `const s = (req.query as any).status` and a ternary `where` left all
    // three assertions green while ?status= was fully functional again. A
    // filter that can come back through a spelling the guard does not know is
    // a filter the guard is not guarding.
    expect(listBlock).not.toMatch(/status/i);
    // carrierId stays required — it is the tenancy scope, not a filter.
    expect(listBlock).toMatch(/carrierId:\s*z\.string\(\)\.min\(1\)/);
    // Tripwire: the slice must actually contain the schema and the handler,
    // or the absence assertion above is measuring an empty string.
    expect(listBlock).toMatch(/router\.get\(/);
    expect(listBlock.length).toBeGreaterThan(200);
  });
});
