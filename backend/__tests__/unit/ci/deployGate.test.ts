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

  it("FAILS when the deploy hook secret is absent", () => {
    // THIS ASSERTION HAS NOW SAID BOTH THINGS, and each was right when written.
    //
    // It first required a hard failure, then required a warning, and now
    // requires a failure again — because the surrounding fact changed twice,
    // not because the standard drifted.
    //
    // The warning was correct while Render's own auto-deploy shipped every
    // commit: the secret sat unset for a week and seven pushes emailed a
    // failure for runs that were otherwise entirely green, which teaches a
    // reader to ignore CI mail.
    //
    // Auto-deploy went OFF on 2026-09-04, so this job is the only path to
    // production. An absent secret now means NOTHING SHIPS — and under the
    // warning branch the tick would have been green about it. That is the exact
    // silent outage the warning's own comment named as its residual risk.
    const block = jobBlock("deploy");
    expect(block).toMatch(/RENDER_DEPLOY_HOOK_URL/);
    expect(block).toContain("::error::RENDER_DEPLOY_HOOK_URL is not set");
    expect(
      block,
      "the absent-secret branch warns again. With auto-deploy off that is a " +
        "green tick over a commit that never reached production.",
    ).not.toContain("::warning::RENDER_DEPLOY_HOOK_URL");
  });

  it("the deploy tick has ONE meaning", () => {
    // The reason the branch was deleted rather than left inert. While it
    // existed, "Deploy to Render = success" meant either "a deploy happened" or
    // "the job declined to deploy", and only a log line told them apart — so
    // reading the conclusion proved nothing about whether anything shipped.
    //
    // One step, no conditional, no step output. Success now means the hook was
    // POSTed and answered 2xx, and nothing else can produce it.
    const block = jobBlock("deploy");
    expect(
      block,
      "a step-level conditional is back on the deploy path — success can mean " +
        "'skipped' again",
    ).not.toContain("steps.hook.outputs");
    expect(block).not.toContain("present=false");
    expect((block.match(/^ {6}- name:/gm) ?? []).length,
      "the deploy job should be a single step").toBe(1);
  });

  it("still fails hard when a configured hook returns a non-2xx", () => {
    // Unchanged, and it must stay: a hook that exists and rejects the deploy is
    // a real failure and was always loud.
    const block = jobBlock("deploy");
    const idx = block.indexOf("Render deploy hook returned HTTP");
    expect(idx).toBeGreaterThan(-1);
    expect(block.slice(idx, idx + 200)).toContain("exit 1");
  });

  it("names what an absent secret now costs", () => {
    // The old message told a reader NOT to turn auto-deploy off. It is off, so
    // that sentence is now false and the message has to say what is true
    // instead: this job is the only path to production.
    const block = jobBlock("deploy");
    expect(
      block,
      "the message still tells the reader not to turn auto-deploy off, which " +
        "already happened",
    ).not.toContain("Do NOT turn auto-deploy off");
    expect(block).toContain("only path to production");
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
