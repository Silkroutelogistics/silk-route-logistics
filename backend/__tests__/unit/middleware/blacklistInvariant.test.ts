/**
 * The invariant the session grace window rests on.
 *
 * v3.8.ayk lets a request through when the session row has not landed yet and
 * the token is seconds old. That is only defensible because a REVOKED token is
 * refused one step EARLIER, by the blacklist, before the row is ever read. If it
 * were not, the grace would be a window in which a just-revoked token still
 * worked -- which is exactly what the Phase A audit concluded does NOT happen.
 *
 * That conclusion was true when it was written and NOTHING ENFORCED IT. A future
 * revocation path that only deleted the session row, or a reordering that read
 * the row first, would silently open the gap the audit says is closed, and the
 * grace would quietly become unsafe. This is that enforcement.
 *
 * Two halves, because there are two ways to break it:
 *   1. read the row before consulting the blacklist
 *   2. revoke a session without blacklisting its token
 *
 * NO FRAGILE REGEX for the ordering. Structure is found by walking braces, so
 * reformatting, a wrapped call chain or an added argument cannot silently turn
 * this guard into one that matches nothing -- the failure mode that has bitten
 * three separate guards in this codebase (§19 Sub-patterns 16 and 18).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

/** Comments stripped, so prose naming a call is never read as the call. */
function strip(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * The innermost `{ ... }` containing `idx`, by brace depth.
 * Returns null if the walk falls off either end of the file.
 */
function enclosingBlock(src: string, idx: number): { start: number; end: number } | null {
  let depth = 0;
  let i = idx;
  for (; i >= 0; i--) {
    const c = src[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) break;
      depth--;
    }
  }
  if (i < 0) return null;
  let d = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") {
      d--;
      if (d === 0) break;
    }
  }
  return j >= src.length ? null : { start: i, end: j };
}

/** Does the text immediately before this block open a function? */
function opensAFunction(src: string, blockStart: number): boolean {
  const pre = src.slice(Math.max(0, blockStart - 200), blockStart);
  return /=>\s*$/.test(pre) || /\bfunction\b[^;{]*$/.test(pre);
}

/** The body of the named function, comments already stripped. */
function functionBody(src: string, name: string): string {
  const at = src.indexOf("function " + name);
  if (at < 0) throw new Error("could not find function " + name + " -- repoint this guard");
  const open = src.indexOf("{", at);
  const blk = enclosingBlock(src, open + 1);
  if (!blk) throw new Error("could not bracket the body of " + name);
  return src.slice(blk.start, blk.end + 1);
}

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(dir, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(dir, e.name)]
        : [],
  );
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

/**
 * Is this revokeSession call paired with a blacklist in the same handler?
 * Widens outward from the call until either the blacklist appears in scope, or
 * the enclosing function is reached without it.
 */
function isPaired(src: string, callIdx: number): boolean {
  let idx = callIdx;
  for (let level = 0; level < 8; level++) {
    const blk = enclosingBlock(src, idx);
    if (!blk) return false;
    if (src.slice(blk.start, blk.end + 1).includes("blacklistToken")) return true;
    if (opensAFunction(src, blk.start)) return false;
    idx = blk.start - 1;
  }
  return false;
}

describe("the blacklist is consulted before the session row is read", () => {
  const body = () =>
    functionBody(
      strip(fs.readFileSync(path.join(SRC, "middleware/auth.ts"), "utf8")),
      "tryAuthenticateToken",
    );

  it("isTokenBlacklisted comes first in tryAuthenticateToken", () => {
    const b = body();
    const black = b.indexOf("isTokenBlacklisted");
    const row = b.indexOf("staffSession");
    expect(black, "tryAuthenticateToken no longer consults the blacklist").toBeGreaterThan(-1);
    expect(row, "tryAuthenticateToken no longer reads the session row").toBeGreaterThan(-1);
    expect(
      black,
      "tryAuthenticateToken reads the session row BEFORE consulting the blacklist. " +
        "That reverses the ordering the v3.8.ayk grace window depends on: during " +
        "the grace a revoked token would be granted on freshness alone, before " +
        "anything had checked whether it had been revoked.",
    ).toBeLessThan(row);
  });

  it("the extracted body really is the function (vacuity tripwire)", () => {
    // Without this, a walker that had stopped working would return a fragment
    // and the ordering assertion above would be measuring nothing -- passing or
    // failing for reasons unrelated to the ordering it is named for.
    const b = body();
    expect(b.length).toBeGreaterThan(400);
    expect(b).toContain("resolveSessionPolicy");
    expect(b.startsWith("{")).toBe(true);
    expect(b.endsWith("}")).toBe(true);
  });

  it("the brace walker can be trusted (self-test)", () => {
    const sample = "function f(a) {\n  if (a) { g(); }\n  h();\n}\n";
    const b = functionBody(sample, "f");
    expect(b).toContain("g()");
    expect(b).toContain("h()");
    expect(b.startsWith("{")).toBe(true);
    expect(b.endsWith("}")).toBe(true);
  });
});

describe("every revocation also blacklists the token", () => {
  /** Files calling revokeSession, excluding the module that defines it. */
  const callers = () => {
    const out: { file: string; src: string }[] = [];
    for (const f of walk(SRC)) {
      if (rel(f) === "lib/sessionStore.ts") continue;
      const s = strip(fs.readFileSync(f, "utf8"));
      if (s.includes("revokeSession(")) out.push({ file: rel(f), src: s });
    }
    return out;
  };

  it("no file revokes a session without blacklisting in the same handler", () => {
    const offenders: string[] = [];
    for (const { file, src } of callers()) {
      let from = 0;
      for (;;) {
        const at = src.indexOf("revokeSession(", from);
        if (at < 0) break;
        from = at + 1;
        if (!isPaired(src, at)) offenders.push(file);
      }
    }
    expect(
      [...new Set(offenders)].sort(),
      "a session is revoked without its token being blacklisted. The v3.8.ayk " +
        "grace window is only safe because revocation is caught by the blacklist " +
        "BEFORE the session row is read -- a revoke-only path is invisible to it, " +
        "so during the grace that token would keep working.",
    ).toEqual([]);
  });

  it("there is something to check (vacuity tripwire)", () => {
    // If revokeSession is renamed or its callers disappear, the assertion above
    // passes over an empty set and this invariant stops being enforced silently.
    const files = callers().map((c) => c.file);
    expect(files.length, "no revokeSession callers found -- has it been renamed?").toBeGreaterThan(0);
    expect(files).toContain("controllers/authController.ts");
    expect(files).toContain("routes/carrierAuth.ts");
  });

  it("the pairing check can tell paired from unpaired (self-test)", () => {
    // A matcher that had silently stopped working would report a clean tree,
    // which is the failure this whole guard exists to make impossible.
    const paired = "async function h(){ if (t) { await revokeSession(x); await blacklistToken(t); } }";
    const unpaired = "async function h(){ if (t) { await revokeSession(x); } }";
    const widened = "async function h(){ if (t) { await revokeSession(x); } await blacklistToken(t); }";
    expect(isPaired(paired, paired.indexOf("revokeSession("))).toBe(true);
    expect(isPaired(unpaired, unpaired.indexOf("revokeSession("))).toBe(false);
    // Paired one level out is still paired: the rule is same handler, not same brace.
    expect(isPaired(widened, widened.indexOf("revokeSession("))).toBe(true);
  });
});
