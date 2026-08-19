// The deploy job must depend on backend + frontend, and must NOT depend on E2E.
//
// This looks like a nit and is not. On 2026-08-19 the E2E job hung for 6h02m on
// a Playwright browser download and was killed by GitHub's job timeout. If the
// deploy gate had waited on E2E, every deploy would have been blocked for that
// window by an infrastructure hang that had nothing to do with the code.
//
// The temptation to "make the gate stricter" by adding e2e to the needs list is
// exactly the change that reintroduces that failure mode, and it would look like
// an improvement in review. This test is the thing that argues back.
//
// Parsed with a regex rather than a YAML library because the repo has no YAML
// parser in backend deps, and adding one to assert a two-line invariant is a
// worse trade than a narrow parser that only reads what it needs.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const WORKFLOW = path.join(__dirname, "../../../../.github/workflows/ci.yml");
const yaml = fs.readFileSync(WORKFLOW, "utf8");

/**
 * The body of a named job, from its header to the next top-level job or EOF.
 *
 * Index math rather than a regex lookahead: `\Z` is Ruby/Python, not
 * JavaScript, so a lookahead written that way silently never matches the LAST
 * job in the file — which is exactly where the deploy job lives.
 */
function jobBlock(job: string): string {
  const header = new RegExp(`^  ${job}:\\s*$`, "m").exec(yaml);
  if (!header) throw new Error(`job "${job}" not found in ci.yml`);
  const start = header.index + header[0].length;
  const nextJob = /^  [a-z0-9_-]+:\s*$/m;
  const rest = yaml.slice(start);
  const next = nextJob.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** The `needs:` list for a named job, as written in the workflow. */
function needsFor(job: string): string[] {
  const needs = /^\s*needs:\s*\[([^\]]*)\]/m.exec(jobBlock(job));
  if (!needs) return [];
  return needs[1].split(",").map((s) => s.trim()).filter(Boolean);
}

describe("CI deploy gate", () => {
  it("has a deploy job at all", () => {
    expect(/^  deploy:/m.test(yaml)).toBe(true);
  });

  it("waits for backend and frontend", () => {
    const needs = needsFor("deploy");
    expect(needs).toContain("backend");
    expect(needs).toContain("frontend");
  });

  it("does NOT wait for e2e", () => {
    // If this fails, read the comment at the top of this file before changing it.
    // A 6-hour Playwright hang is the reason, and it is a real event, not a
    // hypothetical.
    expect(needsFor("deploy")).not.toContain("e2e");
  });

  it("deploys only on a push to main, never on a pull request", () => {
    const block = jobBlock("deploy");
    expect(block).toMatch(/github\.event_name == 'push'/);
    expect(block).toMatch(/github\.ref == 'refs\/heads\/main'/);
  });

  it("fails when the deploy hook secret is missing rather than skipping", () => {
    // A job that silently no-ops on a missing secret is worse than no gate: it
    // reports success while deploying nothing.
    const block = jobBlock("deploy");
    expect(block).toMatch(/RENDER_DEPLOY_HOOK_URL/);
    expect(block).toMatch(/exit 1/);
  });

  it("treats a non-2xx from the hook as a failure", () => {
    const block = jobBlock("deploy");
    expect(block).toMatch(/code.*-lt 200|code.*-ge 300/);
  });

  it("still has e2e gated behind backend and frontend, unchanged", () => {
    // Guards against someone loosening e2e while editing this area.
    const needs = needsFor("e2e");
    expect(needs).toContain("backend");
    expect(needs).toContain("frontend");
  });
});
