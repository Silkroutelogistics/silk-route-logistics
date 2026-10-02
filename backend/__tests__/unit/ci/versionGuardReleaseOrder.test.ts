/**
 * FINISH-2 G5 — the version-letter guard honours .release-order.
 *
 * Owner ruling: letters on unmerged branches are provisional and are finalised
 * at release in the order in .release-order. A duplicate against an unmerged
 * local branch LATER in that order warns and the commit proceeds; a duplicate
 * against origin, or against a branch EARLIER in the order, is refused.
 *
 * The real guard runs as a subprocess against a throwaway repository: a bare
 * origin, a clone, and worktrees, so what is asserted is its exit code and its
 * words, not a re-implementation of its logic.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const GUARD = path.resolve(__dirname, "../../../scripts/check-version-letter.js");
const FOOTER = "frontend/src/components/ui/VersionFooter.tsx";

let root: string;
let work: string; // on branch alpha
let wtGamma: string; // worktree on branch gamma

const git = (cwd: string, cmd: string) => execSync(`git ${cmd}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function commit(cwd: string, letter: string, label: string) {
  fs.mkdirSync(path.join(cwd, path.dirname(FOOTER)), { recursive: true });
  fs.writeFileSync(path.join(cwd, FOOTER), `export const SRL_VERSION = "3.8.${letter}";\n`);
  git(cwd, `add -A`);
  git(cwd, `commit -q -m "feat: v3.8.${letter} — ${label}"`);
}

function guard(cwd: string, letter: string) {
  const r = spawnSync(process.execPath, [GUARD, letter], { cwd, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "relorder-"));
  const origin = path.join(root, "origin.git");
  work = path.join(root, "work");
  wtGamma = path.join(root, "wt-gamma");
  git(root, `init -q --bare -b main "${origin}"`);
  git(root, `clone -q "${origin}" "${work}"`);
  git(work, `config user.email t@srl.invalid`);
  git(work, `config user.name test`);
  fs.writeFileSync(path.join(work, ".release-order"), "# test\nalpha\nbeta\ngamma\n");
  commit(work, "bot", "base");
  git(work, `push -q origin HEAD:main`);
  git(work, `fetch -q origin`);
  // gamma (LATER than alpha) claims bou in its own worktree.
  git(work, `branch gamma origin/main`);
  git(work, `worktree add -q "${wtGamma}" gamma`);
  commit(wtGamma, "bou", "gamma's work");
  // alpha (this checkout) also takes bou.
  git(work, `checkout -q -b alpha origin/main`);
  commit(work, "bou", "alpha's work");
}, 60_000);

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort on Windows */ }
});

describe("check-version-letter with .release-order", () => {
  it("a duplicate against a branch LATER in the order warns, and the guard passes", () => {
    const r = guard(work, "bov");
    expect(r.out).toMatch(/WARN .*LATER in \.release-order/);
    expect(r.out).toMatch(/bou\s+worktree gamma/);
    expect(r.code).toBe(0);
  });

  it("a duplicate against a branch EARLIER in the order is refused", () => {
    const r = guard(wtGamma, "bov");
    expect(r.out).toMatch(/COLLISION/);
    expect(r.out).toMatch(/duplicates\s+worktree alpha/);
    expect(r.code).toBe(1);
  });

  it("a duplicate against origin is refused, whatever the order says", () => {
    // A pushed branch claiming alpha's letter: origin, not a local worktree.
    git(wtGamma, `push -q origin gamma:other`);
    const r = guard(work, "bov");
    expect(r.out).toMatch(/COLLISION/);
    expect(r.out).toMatch(/duplicates\s+origin\/other/);
    expect(r.code).toBe(1);
    git(work, `push -q origin --delete other`);
  });
}, 120_000);
