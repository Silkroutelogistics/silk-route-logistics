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
    const entries = probeSource.split(/\n  \{\n/).slice(1);
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
      .split(/\n  \{\n/)
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
    const wf = readFileSync(
      path.join(__dirname, "../../../../.github/workflows/public-surface-monitor.yml"),
      "utf8",
    );
    // A monitor that only runs on demand is a script, not a monitor.
    expect(wf).toMatch(/schedule:/);
    expect(wf).toMatch(/cron: "\*\/15 \* \* \* \*"/);
    // atu was a routing change. The push trigger is what makes the next one
    // visible in minutes rather than at the next tick.
    expect(wf).toMatch(/backend\/src\/routes\/\*\*/);
    expect(wf).toMatch(/backend\/src\/middleware\/\*\*/);
  });
});
