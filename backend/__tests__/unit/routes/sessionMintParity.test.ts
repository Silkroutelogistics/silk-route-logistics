/**
 * Every path that mints a User session token must also register the session.
 *
 * WHY THIS EXISTS. Since Arc 34 a token is not a session: idle cannot be
 * derived from a JWT, so authenticating requires a persisted staff_sessions
 * row and a row-less token fails CLOSED on its very next request. A mint site
 * that skips registerSession therefore hands out a credential that works
 * exactly once and is refused forever after.
 *
 * That failure is nasty precisely because it is not a 500 and not a crash. The
 * login succeeds, the token is real, the cookie is set — and the next request
 * is a 401 that looks like an expiry. `/auth/e2e-token` shipped in exactly that
 * state and took down the E2E suite with `B0: GET /carrier/all must succeed`,
 * an error that names a carrier endpoint and says nothing about sessions.
 *
 * The class fired three times in one arc — the auth.test.ts fixture, the driver
 * login path, and e2e-token. Three is enough to stop relying on someone
 * noticing.
 *
 * WHAT THIS DOES NOT COVER, stated so nobody reads it as broader than it is:
 * the DRIVER portal mints its own tokens through lib/driverToken and
 * authenticates through middleware/driverAuth, which reads neither the policy
 * nor staff_sessions. Driver is deliberately outside the uniform policy today
 * (§13.3 Item 244.6), so its mint sites are excluded here rather than silently
 * passing.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

/** Files that mint a User-authenticated session token. */
const MINT_FILES = [
  "controllers/authController.ts",
  "routes/auth.ts",
  "routes/carrierAuth.ts",
];

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

/** Strip comments so prose about jwt.sign is not mistaken for a call. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

describe("every User session mint also registers the session", () => {
  let totalMints = 0;

  for (const rel of MINT_FILES) {
    it(`${rel} — no mint site is left without a registerSession`, () => {
      const clean = stripComments(readSrc(rel));

      // Multi-line aware: the formatter wraps long jwt.sign calls, and a
      // same-line-only pattern would silently miss exactly those.
      const mints = [...clean.matchAll(/jwt\s*\.\s*sign\s*\(\s*\{([\s\S]{0,200}?)\}/g)]
        // A session token carries a userId and NO purpose claim. Purpose-bearing
        // tokens (driver invite/session, tender-action, quote-approve) are a
        // different class that middleware/auth rejects outright.
        .filter((m) => /userId/.test(m[1]) && !/purpose/.test(m[1]))
        // Exclude a bare mint HELPER — a named function whose entire body is
        // `return jwt.sign(...)`. It cannot register a session: it is handed a
        // userId, does not know the role, and is not a handler. Flagging it is
        // a false positive, and a guard that cries wolf is one people learn to
        // skip. Its CALLERS must register, which the count assertion below
        // checks.
        //
        // Detected STRUCTURALLY (a `return` directly inside a `function`)
        // rather than by name. The first version of this filter guessed the
        // name "generateToken"; the helper is actually called `signToken`, so
        // it excluded nothing and the guard reported a false positive on its
        // very first run. A filter whose pattern does not match the codebase is
        // the instrument failure this repo has banked twice already.
        .filter((m) => {
          const preceding = clean.slice(Math.max(0, (m.index ?? 0) - 220), m.index ?? 0);
          const isBareReturn = /\breturn\s*$/.test(preceding);
          const insideNamedFn = /\bfunction\s+\w+\s*\([^)]*\)[^{]*\{[^{}]*$/.test(preceding);
          return !(isBareReturn && insideNamedFn);
        });

      // NO per-file tripwire here, deliberately. authController mints only
      // through the signToken helper, so after excluding helpers it correctly
      // has ZERO direct mints — and a per-file `toBeGreaterThan(0)` fired on
      // that, reporting a defect in code that was fine. The vacuity check is
      // global instead (below), which is where it actually belongs: the risk is
      // the pattern matching NOTHING ANYWHERE, not a single file having none.
      totalMints += mints.length;

      for (const m of mints) {
        const at = m.index ?? 0;
        const line = clean.slice(0, at).split("\n").length;
        const window = clean.slice(at, at + 2500);
        expect(
          /registerSession\s*\(/.test(window),
          `${rel}:${line} mints a User session token with no registerSession within its handler. ` +
            `Since Arc 34 that token authenticates once and is refused on every request after — ` +
            `see the header of this file.`,
        ).toBe(true);
      }
    });
  }

  it("the scan matched real mint sites — it is not passing vacuously", () => {
    expect(totalMints).toBeGreaterThan(0);
  });

  it("signToken — the AE mint helper — is called no more often than registerSession", () => {
    // signToken is a bare helper; its callers are what must register. Asserted
    // separately so a future extraction of another helper cannot quietly slip
    // past the per-file scan above.
    const src = stripComments(readSrc("controllers/authController.ts"));
    const mints = (src.match(/\bsignToken\s*\(/g) || []).length - 1; // -1 for the definition
    const registers = (src.match(/registerSession\s*\(/g) || []).length;
    expect(
      registers,
      `authController calls signToken ${mints} time(s) but registerSession ${registers} time(s) — ` +
        `at least one login path mints a token it never registers.`,
    ).toBeGreaterThanOrEqual(mints);
  });
});
