/**
 * The E2E suite holds exactly ONE admin session.
 *
 * WHAT THIS CAUGHT (§13.3 Item 301, three recorded occurrences). ADMIN and CEO
 * are capped at one concurrent session — MAX_SESSIONS_ADMIN = 1 in
 * middleware/auth.ts — and registerSession evicts FIFO. The suite minted an
 * admin token TWICE at start-up: once in loginAsAdmin for the browser cookie,
 * once for the Authorization header. The second registration evicted the
 * first, so every request the PAGE made came back 401 SESSION_REPLACED, the
 * board bounced to login, and B4 reported "element(s) not found" on the load
 * reference.
 *
 * WHY IT WAS INTERMITTENT RATHER THAN CONSTANT, which is the part worth
 * keeping: jwt.sign is deterministic and `iat` is floored to the second, so two
 * mints inside ONE clock second produce a byte-identical token — the hash is
 * already in the Set, and the `!sessions.has(hash)` guard skips the eviction.
 * The suite was depending on two HTTP calls not straddling a second boundary.
 * When they did, attempt 1 failed; the retry skipped the carrier approval that
 * attempt 1 had already done, reached the board sooner, and usually passed.
 * That is §19 Sub-pattern 21 — a fixture value that is not unique to its role —
 * reached through the session store rather than through a proof.
 *
 * Measured before the fix: two mints in the same second are identical; 1100ms
 * apart they differ and the eviction fires, giving a deterministic 401.
 *
 * The fix is the suite obeying the production policy, not the policy widening
 * for the suite. One admin session is what a real admin gets.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Strip comments, so prose describing the old shape is not read as the shape. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const HELPER = "e2e/helpers/auth.ts";
const SPEC = "e2e/full-lifecycle.spec.ts";

/** The admin the suite logs in as, from the helper — never a second copy here. */
function adminEmail(): string {
  const m = code(read(HELPER)).match(/ADMIN_EMAIL\s*=\s*["']([^"']+)["']/);
  expect(m, "e2e/helpers/auth.ts no longer declares ADMIN_EMAIL").not.toBeNull();
  return m![1];
}

/** Every `/auth/e2e-token` mint in a file, with the email it mints for. */
function mints(rel: string): string[] {
  const src = code(read(rel));
  // Identifier -> literal, so an email passed as ADMIN_EMAIL resolves.
  const consts = new Map<string, string>();
  const cre = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`]+)["'`]/g;
  let c: RegExpExecArray | null;
  while ((c = cre.exec(src))) consts.set(c[1], c[2]);
  const out: string[] = [];
  const re = /auth\/e2e-token/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // The email sits in the `data: { email: ... }` that follows the call.
    const window = src.slice(m.index, m.index + 400);
    // Literal OR identifier. Reading only literals reported the helper as
    // minting for nobody, which would have let a second admin mint through
    // unnoticed -- the exact failure this guard exists to catch.
    const e = window.match(/email:\s*(?:["'`]([^"'`]+)["'`]|([A-Za-z_$][\w$]*))/);
    if (!e) { out.push("<none>"); continue; }
    out.push(e[1] ?? consts.get(e[2]) ?? "<" + e[2] + ">");
  }
  return out;
}

describe("E2E admin session singleton", () => {
  it("the helper and the spec are both present (vacuity tripwire)", () => {
    // A scanner that has stopped finding either file would report a perfectly
    // clean suite forever.
    expect(code(read(HELPER)).length).toBeGreaterThan(200);
    expect(code(read(SPEC)).length).toBeGreaterThan(5000);
    expect(mints(HELPER).length, "the helper no longer mints at all").toBeGreaterThan(0);
  });

  it("exactly ONE mint exists for the admin across the whole suite", () => {
    const admin = adminEmail();
    const all = [...mints(HELPER), ...mints(SPEC)];
    const forAdmin = all.filter((e) => e === admin);
    expect(
      forAdmin.length,
      `${forAdmin.length} mints for ${admin}. ADMIN is capped at ONE concurrent ` +
        "session and registerSession evicts FIFO, so a second mint evicts the " +
        "browser's cookie and every page request 401s SESSION_REPLACED. " +
        "Reuse the token loginAsAdmin returns.",
    ).toBe(1);
  });

  it("the one admin mint lives in the helper, not the spec", () => {
    const admin = adminEmail();
    expect(mints(HELPER)).toContain(admin);
    expect(
      mints(SPEC),
      "the spec mints an admin token itself — that is the second session",
    ).not.toContain(admin);
  });

  it("the helper returns its token and the spec reuses it", () => {
    const helper = code(read(HELPER));
    expect(helper, "loginAsAdmin no longer returns the token").toMatch(
      /loginAsAdmin\([^)]*\)\s*:\s*Promise<string>/,
    );
    expect(helper, "loginAsAdmin does not return body.token").toMatch(/return\s+body\.token/);

    const spec = code(read(SPEC));
    expect(
      spec,
      "the spec does not capture loginAsAdmin's token, so it must be minting its own",
    ).toMatch(/=\s*await\s+loginAsAdmin\(/);
  });

  it("the production cap is still ONE, which is what makes this rule necessary", () => {
    // If the cap were ever raised, this guard's reason would change and the
    // rule should be re-argued rather than silently kept.
    const auth = code(read("backend/src/middleware/auth.ts"));
    const m = auth.match(/MAX_SESSIONS_ADMIN\s*=\s*(\d+)/);
    expect(m, "MAX_SESSIONS_ADMIN is gone — re-read this guard's reasoning").not.toBeNull();
    expect(Number(m![1])).toBe(1);
  });
});
