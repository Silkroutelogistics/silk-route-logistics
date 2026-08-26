/**
 * ARC 28 — a public route without a probe is an unmonitored front door.
 *
 * The synthetic monitor is only worth its schedule if its list stays complete.
 * A list nobody is forced to update goes stale silently, and the failure mode
 * is the worst kind: the monitor runs, reports green, and the thing that broke
 * was never in it. That is the same shape as the SCHEDULED_JOB_NAMES guard, and
 * this mirrors it deliberately.
 *
 * The authority for "what is public" is the allowlist that MAKES it public —
 * `PUBLIC_CARRIER_AUTH_ROUTES` — not a second hand-kept list that could disagree
 * with it. Anything added there is by definition reachable with no session, so
 * anything added there must gain a probe in the same change.
 *
 * Scope, stated honestly: this covers the carrier-auth allowlist, which is where
 * the outage happened and the one place a route becomes public by being named in
 * a list. Routes on genuinely-public mounts (/tracking, /leads, /auth) are
 * public by virtue of their mount having no guard, and there is no list to
 * cross-check them against — those probes are maintained by hand, and the
 * PROBES entries carry a `why` for each so a reader can tell what is missing.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PUBLIC_CARRIER_AUTH_ROUTES } from "../../../src/middleware/allowPublicCarrierAuth";

// The probe file is ESM with no types; read it as text rather than importing,
// so this test cannot be broken by the probe harness's own runtime.
const WORKFLOW = path.join(__dirname, "../../../../.github/workflows/public-surface-monitor.yml");

const probeSource = readFileSync(
  path.join(__dirname, "../../../scripts/probe-public-surfaces.mjs"),
  "utf8",
);

describe("Arc 28 — every public carrier-auth route has a monitor probe", () => {
  for (const route of PUBLIC_CARRIER_AUTH_ROUTES) {
    // The allowlist stores anchored regexes; recover a concrete path to look
    // for. /^\/login$/ → "/login"; /^\/agreement\/[^/]+$/ → "/agreement/".
    const literal = route.path.source
      .replace(/^\^/, "")
      .replace(/\$$/, "")
      .replace(/\\\//g, "/")
      .replace(/\[\^\/\]\+/, "");

    it(`${route.method} ${literal} is probed by the public surface monitor`, () => {
      expect(
        probeSource.includes(`/carrier-auth${literal}`),
        `${route.method} /carrier-auth${literal} is reachable with no session but has no probe in ` +
          `backend/scripts/probe-public-surfaces.mjs. Add one, with the SHAPE its healthy ` +
          `response must have — a status alone cannot tell a working login from a locked one.`,
      ).toBe(true);
    });
  }

  it("every probe asserts a shape, not just a status", () => {
    // The Arc 27 lesson, enforced. A probe with no body assertion would have
    // passed throughout the outage: the broken login and the fixed login both
    // return 401, and only the body separates them.
    const entries = probeSource.split(/\r?\n  \{\r?\n/).slice(1);
    expect(entries.length, "no probe entries parsed — the guard would be vacuous").toBeGreaterThan(10);

    const shapeless = entries
      .filter((e) => !e.includes("mustContain") && !e.includes("mustNotContain"))
      .map((e) => (e.match(/name: "([^"]+)"/) || [])[1] ?? "(unnamed)");

    expect(
      shapeless,
      `these probes check only a status code: ${shapeless.join(", ")}. A status-only probe ` +
        `reads broken-as-fixed — the outage this monitor exists for returned 401, and so does ` +
        `the healthy route.`,
    ).toEqual([]);
  });

  it("the outage signature is asserted against on every carrier-auth probe", () => {
    // "No token provided" appearing on a public route IS the outage. Every
    // carrier-auth probe must be watching for it specifically.
    const carrierAuthProbes = probeSource
      .split(/\r?\n  \{\r?\n/)
      .slice(1)
      .filter((e) => e.includes("/carrier-auth/"));

    expect(carrierAuthProbes.length).toBeGreaterThanOrEqual(PUBLIC_CARRIER_AUTH_ROUTES.length);
    for (const e of carrierAuthProbes) {
      const name = (e.match(/name: "([^"]+)"/) || [])[1] ?? "(unnamed)";
      expect(
        e.includes('mustNotContain') && e.includes("No token provided"),
        `probe "${name}" does not assert against "No token provided" — the exact signature of ` +
          `the 27-hour outage.`,
      ).toBe(true);
    }
  });

  it("the workflow runs on a schedule and on pushes that touch routing", () => {
    const wf = readFileSync(WORKFLOW, "utf8"); // raw: schedule/paths live in real YAML
    // A monitor that only runs on demand is a script, not a monitor.
    expect(wf).toMatch(/schedule:/);
    expect(wf).toMatch(/cron: "\*\/15 \* \* \* \*"/);
    // atu was a routing change. The push trigger is what makes the next one
    // visible in minutes rather than at the next tick.
    expect(wf).toMatch(/backend\/src\/routes\/\*\*/);
    expect(wf).toMatch(/backend\/src\/middleware\/\*\*/);
  });
});

/**
 * ARC 29 — the alert channel is only worth having if every message in it is
 * real, and that property is a function of the workflow's TRIGGERS.
 *
 * Widen them and the channel degrades silently: a push trigger on all branches
 * turns every probe experiment into a red email, and one drill too many teaches
 * the inbox to skim — which is the state the 27-hour outage happened in.
 *
 * So the trigger set is pinned. Exactly {schedule, push:main, workflow_dispatch}.
 */
describe("Arc 29 — the monitor's triggers are pinned so the channel stays trustworthy", () => {
  const wfRaw = readFileSync(WORKFLOW, "utf8");

  /**
   * Comments stripped before any assertion.
   *
   * The first cut of these guards read raw text and promptly failed on the
   * comments explaining the guards — the words `fire-drill` and `--fire-drill`
   * appear in prose describing why they are absent. Same class as the Arc 27
   * version-letter guard flagging a historical version named in CLAUDE.md: a
   * text scan cannot tell a MENTION from a DECLARATION.
   *
   * The fix is to assert about what the YAML says, not what the file contains.
   * A guard that punishes explaining yourself gets its explanations deleted.
   */
  const stripComments = (s: string) =>
    s
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");

  const wf = stripComments(wfRaw);
  // The `on:` block only, so a `push:` mentioned in another key cannot satisfy
  // or break these.
  const onBlock = wf.slice(wf.indexOf("\non:"), wf.indexOf("\nconcurrency:"));

  it("has exactly three triggers: schedule, push, workflow_dispatch", () => {
    const triggers = [...onBlock.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).sort();
    expect(
      triggers,
      `triggers are ${triggers.join(", ")}. Adding one widens what can send mail to Wasi — ` +
        `if that is intended, change this test deliberately and say why in CLAUDE.md.`,
    ).toEqual(["push", "schedule", "workflow_dispatch"]);
  });

  it("the push trigger is scoped to main ONLY", () => {
    const push = onBlock.slice(onBlock.indexOf("  push:"));
    expect(
      push,
      "a push trigger on any branch means a probe change on a feature branch runs the " +
        "monitor against PRODUCTION and can email. Arc 28 did exactly that, deliberately, once.",
    ).toMatch(/branches: \[main\]/);
    // No wildcard branch patterns anywhere in the push block.
    expect(push.slice(0, push.indexOf("workflow_dispatch"))).not.toMatch(/branches:\s*\[\s*['"]?\*/);
  });

  it("a non-main ref cannot reach the probe step", () => {
    // The structural half of the same guarantee: even a workflow_dispatch aimed
    // at a branch must not probe, because the probe hits production regardless
    // of ref and would email off a branch's probe list.
    expect(wf).toMatch(/if: github\.ref != 'refs\/heads\/main'/);
    expect(wf).toMatch(/SKIPPED=1/);
    expect(
      wf,
      "the Probe step must be gated on the skip flag, or the ref guard is decorative",
      // \s+ rather than \n\s+ on purpose: a CRLF checkout would otherwise make
      // this guard silently environment-dependent, which is the same class of
      // fragility as the text assertions it replaced.
    ).toMatch(/name: Probe\s+if: env\.SKIPPED != '1'/);
  });

  it("adversarial mode exists, is dispatch-only, and cannot fail the run", () => {
    // The whole point: verification of the harness happens INSIDE a green job.
    // Asserts adversarial is PRESENT rather than that the option list is
    // exactly two — pinning the list's contents is the fire-drill guard's job,
    // and duplicating it here would mean two tests failing for one cause.
    expect(onBlock).toMatch(/options: \[probe, adversarial/);
    expect(wf).toMatch(/--self-test/);
    // It must set the skip flag so the real probe does not then run and
    // turn a self-test into a production alert.
    const step = wf.slice(wf.indexOf("Adversarial self-test"));
    expect(step.slice(0, 400)).toMatch(/SKIPPED=1/);
  });

  it("fire-drill is NOT a dispatch input — it cannot be re-run casually", () => {
    // The channel was proved end to end once, by run 32582758484 on 2026-08-22,
    // and the input was removed in the same arc. The harness still accepts
    // --fire-drill, so it CAN be re-proved deliberately — by someone who has to
    // edit the workflow to do it. That friction is the point: a drill one
    // dropdown away from any maintainer is a drill that gets run, and every
    // drill spends a little of the credibility this channel exists to hold.
    expect(
      onBlock,
      "fire-drill must not be a workflow_dispatch option. If you are re-adding it for a " +
        "deliberate re-proof, remove it again in the same change — and say in CLAUDE.md why " +
        "the channel needed re-proving.",
    ).not.toMatch(/fire-drill/);
  });

  it("no step can deliberately fail the run", () => {
    // Structural, not just declarative: even with the input gone, a step that
    // invokes --fire-drill would email. There must be exactly one probe
    // invocation and it must be the honest one.
    const wf2 = stripComments(readFileSync(WORKFLOW, "utf8"));
    expect(
      wf2.split("--fire-drill").length - 1,
      "a workflow step invokes --fire-drill; that step will email Wasi a failure that is " +
        "not a production fault.",
    ).toBe(0);
  });

  it("the workflow name carries the severity marker", () => {
    // GitHub puts the workflow name in the email subject and nothing else about
    // that subject is controllable. This is the only lever for making a real
    // production alert visually distinct in an inbox.
    expect(wf).toMatch(/^name: 🔴 PRODUCTION Public Surface Monitor$/m);
  });
});
