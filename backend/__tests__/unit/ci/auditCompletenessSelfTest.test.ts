/**
 * Carrier-archive B6b (2026-09-19) — the completeness scanner's Pass 1 matcher
 * holds the two properties it lost before.
 *
 * scripts/audit-completeness.ts is a script whose main() runs on import, so its
 * matcher cannot be imported here without running the whole audit. It carries a
 * `--self-test` mode instead (the find-prisma-calls shape), and this test is the
 * CI driver for it: spawn it, read its verdict, fail on anything but the passing
 * line. Sub-pattern 16 — a green here means the self-test RAN and PASSED, which
 * is why the passing sentence is matched and not merely the exit code.
 *
 * What the self-test pins:
 *  - a route with no literal segment (a bare `/:id`) never grades EXACT — it used
 *    to, against ANY same-verb caller with a one-segment tail, which is how
 *    DELETE /carriers/:id and PUT /carriers/:id read "live" with zero callers;
 *  - such a route needs its mount IMMEDIATELY before the tail, so a chameleon
 *    review call containing "carriers" somewhere no longer vouches for it;
 *  - a route with a literal still grades EXACT when the literal is met;
 *  - POST is scanned on both sides (router.post + api.post).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const BACKEND = path.resolve(__dirname, "../../..");

describe("audit-completeness --self-test", () => {
  it("passes, and says so", { timeout: 120_000 }, () => {
    const r = spawnSync("npx", ["tsx", "scripts/audit-completeness.ts", "--self-test"], {
      cwd: BACKEND,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out, out).toContain("self-test passed");
    expect(out).not.toContain("self-test FAILED");
    expect(r.status, out).toBe(0);
  });
});
