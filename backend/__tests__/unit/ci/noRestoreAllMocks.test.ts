/**
 * No suite calls `vi.restoreAllMocks()`, because it does collateral damage that
 * looks like somebody else's bug.
 *
 * WHAT IT ACTUALLY DOES HERE. `__tests__/setup.ts` builds the prisma double from
 * a `vi.mock` factory, and ~48 of its members carry defaults --
 * `infoRequest.findMany: vi.fn().mockResolvedValue([])`, `count: … (0)`,
 * `updateMany: … ({ count: 0 })`. Those are `vi.fn()`s, not spies, and
 * `restoreAllMocks` calls `mockRestore()` on every mock it knows about, which
 * for a plain `vi.fn()` strips the implementation. So the defaults are gone for
 * the rest of the file.
 *
 * MEASURED, NOT REASONED ABOUT (§13.3 Item 318). A probe appended to each of the
 * four suites that used it observed `infoRequest.findMany()` resolve
 * **`undefined`** instead of `[]`; with the call scoped or removed, the same
 * probe observed `[]`. In controller code that `undefined` is a TypeError on the
 * next property read, which reads as a defect in the code under test rather than
 * as test-harness damage. setup.ts's own comment says exactly why those defaults
 * exist: "Absent here, every one of those controllers throws on a bare property
 * read rather than failing an assertion."
 *
 * THE CROSS-FILE STORY IS NOT TRUE, AND THIS GUARD DELIBERATELY DOES NOT CLAIM
 * IT. Item 318 explained the fault as leaking into whichever file shares the
 * worker next. It cannot: `setupFiles` re-run per test file, so the factory is
 * re-evaluated and the next file gets brand-new `vi.fn()`s with their defaults
 * intact. Proven both ways -- a probe file that mutates a default in `afterAll`
 * does not affect a later file even with `--no-isolate`, while the same mutation
 * inside one file is observed immediately. The hazard is real and it is IN-FILE.
 *
 * WHAT TO USE INSTEAD. Restore the specific spies the suite installed:
 * `(log.info as unknown as { mockRestore?: () => void }).mockRestore?.()`.
 * `vi.clearAllMocks()` is NOT a universal substitute -- it clears call history
 * WITHOUT uninstalling, so a suite that stubs `process.exit` would leave it
 * stubbed for every later test in the file.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const TESTS = path.resolve(__dirname, "../../..", "__tests__");

/**
 * Comment-stripped, line-wise.
 *
 * THIS IS THE LOAD-BEARING PART OF THE GUARD. A bare grep for the identifier
 * counted two files that mention it only in a comment explaining why they do
 * NOT use it -- including the file Item 318 itself had already fixed. That
 * over-count went into the backlog as "five remaining" when the truth was four.
 * A census that reads prose as code is the §19 Sub-pattern 17/18 failure, so
 * this strips comments and the self-tests below pin that it still does.
 */
/**
 * ONE PASS, handling strings and comments TOGETHER — and that is not tidiness.
 *
 * STRINGS HAVE TO GO, AND THIS FILE IS WHY. Its own failure message names the
 * function, so with comments alone stripped the guard flagged ITSELF on its
 * first run. The tempting fix — allow-listing this file — would exempt the one
 * file whose job is policing the rule, which is the mistake §13.3 Item 252
 * records against the production-rail guard. So the matcher got narrower
 * instead, and this guard stays subject to its own rule.
 *
 * THE TWO-PASS VERSION OF THAT WAS WORSE THAN THE PROBLEM. Stripping comments
 * first and strings second cuts every line at its first `//` — including the
 * `//` inside `"postgresql://…"`, which leaves an unterminated quote. The string
 * scanner then swallowed the entire rest of the file, `codeOnly` returned
 * effectively nothing, and the census reported a clean tree over an empty
 * corpus. It only surfaced because a DIFFERENT assertion in this file went red
 * on a file it could no longer see; on its own the census would have passed
 * vacuously forever (§19 Sub-pattern 16).
 *
 * Hand-rolled rather than a regex, because a quote-matching regex written
 * through a shell is how escapes got eaten three times in the previous arc
 * (§19 Sub-pattern 22).
 */
function codeOnly(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    // Comments — only recognised outside a string, which is the whole point.
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // Strings — consumed whole, escapes honoured, newline in out kept so line
    // structure survives for anything that cares.
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const CALL = /vi\s*\.\s*restoreAllMocks\s*\(/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

const files = walk(TESTS).map((f) => ({
  rel: path.relative(TESTS, f).split(path.sep).join("/"),
  raw: fs.readFileSync(f, "utf8"),
}));

/**
 * A suite may keep the call only with a reason recorded here. Empty today, and
 * that is the point: there is no suite whose spies cannot be restored by name.
 */
const ALLOWED: Record<string, string> = {};

describe("no suite calls vi.restoreAllMocks()", () => {
  it("the matcher tells a CALL from a MENTION (self-test, both directions)", () => {
    // The narrowing above is the risky part, so it is fixtured. Without the
    // negative case a matcher that had come to strip everything would report a
    // clean tree forever; without the positive case, one that strips nothing
    // would flag every file that merely discusses the rule.
    const realCall = "afterEach(() => { vi.restoreAllMocks(); });";
    const inString = 'expect(x, "do not call vi.restoreAllMocks() here").toBe(1);';
    const inLineComment = "// vi.restoreAllMocks() would wipe the defaults";
    const inBlockComment = "/* vi.restoreAllMocks() would wipe the defaults */";
    expect(CALL.test(codeOnly(realCall)), "a real call must be caught").toBe(true);
    expect(CALL.test(codeOnly(inString)), "a mention inside a string is not a call").toBe(false);
    expect(CALL.test(codeOnly(inLineComment)), "a line comment is not a call").toBe(false);
    expect(CALL.test(codeOnly(inBlockComment)), "a block comment is not a call").toBe(false);
    // And a call on the same line as a trailing comment is still a call.
    expect(CALL.test(codeOnly("vi.restoreAllMocks(); // why")), "trailing comment").toBe(true);

    // THE ONE THAT CAUGHT THE FIRST IMPLEMENTATION. A `//` inside a string is
    // not a comment. Stripping comments before strings cut the line here, left
    // an unterminated quote, and the scanner then ate the rest of the file —
    // so the census passed over an empty corpus.
    const urlThenCall =
      'const db = "postgresql://ci:ci@localhost:5432/ci";\nafterEach(() => { vi.restoreAllMocks(); });';
    expect(
      CALL.test(codeOnly(urlThenCall)),
      "a // inside a string must not blind the scanner to code after it",
    ).toBe(true);
    // And the survivor must still contain real code rather than being emptied.
    expect(codeOnly(urlThenCall)).toContain("afterEach");
  });

  it("the scanner reads real files and real code (vacuity tripwire)", () => {
    // A scanner that had stopped matching would report a clean tree forever,
    // and that failure looks exactly like success.
    expect(files.length, "walked no test files — the scanner is broken, not the tree").toBeGreaterThan(200);
    const clearUsers = files.filter((f) => /vi\s*\.\s*clearAllMocks\s*\(/.test(codeOnly(f.raw)));
    expect(
      clearUsers.length,
      "found no clearAllMocks calls either, so the matcher cannot see code at all",
    ).toBeGreaterThan(50);
  });

  it("no test file calls it outside the recorded allow-list", () => {
    const offenders = files
      .filter((f) => CALL.test(codeOnly(f.raw)))
      .map((f) => f.rel)
      .filter((rel) => !ALLOWED[rel]);
    expect(
      offenders,
      "vi.restoreAllMocks() also wipes setup.ts's prisma-double defaults for the rest of " +
        "the file, so a later test there sees `undefined` and throws where it should assert " +
        "(§13.3 Item 318). Restore the specific spies by name instead:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("no allow-list entry has gone stale", () => {
    // Dead permission silently widens a census.
    const stale = Object.keys(ALLOWED).filter(
      (rel) => !files.some((f) => f.rel === rel && CALL.test(codeOnly(f.raw))),
    );
    expect(stale, `listed as allowed but no longer calls it:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("the four fixed suites restore their own spies by name", () => {
    // Removing the call is only half of it: a suite that stubs process.exit and
    // then restores nothing leaves it stubbed. These are the targets each suite
    // actually installs, so the guard fails if a fix is reverted to a bare
    // clearAllMocks or dropped entirely.
    const expectations: Array<[string, string[]]> = [
      ["unit/ci/credentialGuards.test.ts", ["process.exit", "console.error"]],
      ["unit/lib/authEvents.test.ts", ["log.info"]],
      ["unit/services/documentIntake.test.ts", ["storage.getFileStream", "reader.extractCOIData"]],
    ];
    for (const [rel, targets] of expectations) {
      const f = files.find((x) => x.rel === rel);
      expect(f, `${rel} is gone — renamed?`).toBeDefined();
      const code = codeOnly(f!.raw);
      for (const t of targets) {
        expect(
          code.includes(t) && /mockRestore\?\.\(\)/.test(code),
          `${rel} no longer restores ${t} by name — its spy will persist across tests`,
        ).toBe(true);
      }
    }
    // fmcsaService installs no vi.spyOn at all; it swaps globalThis.fetch and
    // puts it back by hand, so it must NOT have acquired a restore to fake one.
    const fm = files.find((x) => x.rel === "unit/services/fmcsaService.test.ts");
    expect(fm, "fmcsaService suite is gone — renamed?").toBeDefined();
    expect(codeOnly(fm!.raw)).toContain("globalThis.fetch = originalFetch");
  });

  it("counts PROSE mentions separately from calls — the bug this census itself had", () => {
    // Two files explain in a comment why they do not use it. A bare grep counts
    // those as users, and that is exactly how the backlog came to say "five
    // remaining" when it was four. If this ever reads 0, the comments that carry
    // the reasoning have been deleted and the next author will re-add the call.
    const proseOnly = files.filter((f) => !CALL.test(codeOnly(f.raw)) && /restoreAllMocks/.test(f.raw));
    expect(
      proseOnly.length,
      "no suite explains why it avoids restoreAllMocks any more — the reasoning is gone",
    ).toBeGreaterThan(0);
  });
});
