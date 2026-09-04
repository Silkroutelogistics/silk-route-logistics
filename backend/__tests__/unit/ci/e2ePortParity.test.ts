/**
 * Four files state the E2E ports, and they must state the same ones.
 *
 * WHAT THIS CAUGHT, on the commit that added it. The ports were moved off the
 * dev-server range in playwright.config.ts, e2e/run-local.mjs and ci.yml - and
 * full-lifecycle.spec.ts still read
 *
 *     process.env.E2E_BACKEND_API || "http://localhost:3010/api"
 *
 * Neither of those env vars is set anywhere, in CI or locally, so that is not a
 * fallback: it IS the value. The suite would have driven :3010 while Playwright
 * served :3110 - and :3010 is the port `npm run dev` binds, so a developer with
 * a server up would have had the suite run against their own database instead
 * of the throwaway container, mutating real rows and reporting either a pass or
 * an inexplicable failure.
 *
 * The servers moved and the client did not: §19 Sub-pattern 5, both ends of the
 * same wire, one end changed.
 *
 * WHY THE PORTS ARE DERIVED RATHER THAN LISTED. Writing the expected numbers
 * here would make this a fifth place to update, and the fifth place is exactly
 * what the other four already prove nobody remembers. So playwright.config.ts
 * is the single source and every other file is checked against it.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Strip comments, so prose about a historical port is not read as config. */
const code = (src: string) =>
  src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*|#)/.test(l)).join("\n");

const PW = code(read("playwright.config.ts"));

function pwPort(name: string): number {
  const m = PW.match(new RegExp("const " + name + "\\s*=\\s*(\\d+)"));
  expect(m, "playwright.config.ts no longer declares " + name).not.toBeNull();
  return Number(m![1]);
}

const BACKEND = pwPort("BACKEND_PORT");
const FRONTEND = pwPort("FRONTEND_PORT");

describe("E2E port parity", () => {
  it("playwright.config.ts declares both ports (self-test)", () => {
    // If either regex silently stopped matching, every case below would compare
    // NaN to NaN or pass vacuously against a file that had changed shape.
    expect(Number.isInteger(BACKEND), "backend port did not parse").toBe(true);
    expect(Number.isInteger(FRONTEND), "frontend port did not parse").toBe(true);
    expect(BACKEND).not.toBe(FRONTEND);
  });

  it("the ports are OFF the dev-server range", () => {
    // The whole point of the move. :3010 is what `npm run dev` binds; a run that
    // collides with it either refuses to start or, worse, talks to a developer
    // database. :4000 is the old frontend port and is on server.ts's hardcoded
    // CORS allowlist, which is why it was chosen originally.
    expect(BACKEND, "the backend port is back on the dev-server port").not.toBe(3010);
    expect(FRONTEND, "the frontend port is back on the old shared port").not.toBe(4000);
  });

  it("the local runner uses the same ports", () => {
    const runner = code(read("e2e/run-local.mjs"));
    expect(runner).toContain("const BACKEND_PORT = " + BACKEND + ";");
    expect(runner).toContain("const FRONTEND_PORT = " + FRONTEND + ";");
  });

  it("the spec's operative defaults use the same ports", () => {
    // These read as fallbacks and are not: E2E_BACKEND_API and
    // E2E_FRONTEND_BASE are set nowhere, so the literal is what runs.
    const spec = code(read("e2e/full-lifecycle.spec.ts"));
    expect(
      spec,
      "the spec drives a different backend port than Playwright serves - it " +
        "may be talking to a dev server rather than the test container",
    ).toContain("http://localhost:" + BACKEND + "/api");
    expect(spec).toContain("http://localhost:" + FRONTEND);
    expect(spec, "a stale backend port literal survives in the spec").not.toContain("localhost:3010");
    expect(spec, "a stale frontend port literal survives in the spec").not.toContain("localhost:4000");
  });

  it("CI's e2e job uses the same ports", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("NEXT_PUBLIC_API_URL: http://localhost:" + BACKEND + "/api");
    expect(ci).toContain('PORT: "' + BACKEND + '"');
  });

  it("the frontend origin is allowed through CORS", () => {
    // server.ts hardcodes :3000, :5173 and :4000 for non-production and nothing
    // else. Sprint 37d recorded what happens otherwise: the frontend was :4200,
    // CORS blocked every request, the auth cookie never propagated, and B4 timed
    // out waiting for a row that could not render. Moving the port without this
    // reproduces that exactly, and it does not look like a CORS failure.
    const server = read("backend/src/server.ts");
    const hardcoded = server.includes('"http://localhost:' + FRONTEND + '"');
    const passedIn = PW.includes("CORS_ORIGIN");
    expect(
      hardcoded || passedIn,
      "the frontend origin is neither on server.ts's non-production allowlist " +
        "nor passed as CORS_ORIGIN by the backend webServer - every " +
        "cross-origin request in the suite will be blocked",
    ).toBe(true);
    if (passedIn) {
      expect(
        PW,
        "CORS_ORIGIN is present but not derived from FRONTEND_PORT, so it can " +
          "drift from the port it is meant to authorise",
      ).toContain("CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`");
    }
  });
});
