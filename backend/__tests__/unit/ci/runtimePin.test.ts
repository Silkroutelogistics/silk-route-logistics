// The CI runtime pin has to agree with the engines field (Arc 13).
//
// WHY THIS IS A TEST AND NOT A NOTE. §19 Sub-pattern 16's fourth fire was every
// CI run since v3.8.alg passing on Node 20 while backend/package.json declared
// engines.node ^24. The check ran. It was green. It was not checking the thing
// its name implied, and nothing noticed until a dependency with a high enough
// engine floor — jsdom's bundled undici — failed on a function Node 20 lacks.
//
// The going-forward rule banked with it is "any dependency or engines change
// re-checks the CI runtime pin in the same commit". A rule of that shape depends
// on a future session remembering it, and §2.2's hold-branch rule exists because
// exactly that kind of positional safeguard failed once already and dropped four
// production columns. So it is written down AND it is enforced here.
//
// The runner was also announcing the mismatch on every run — "actions target
// Node.js 20 but are being forced to run on Node.js 24" — as an annotation
// rather than a failure, which is why it read as noise for weeks. This turns the
// same fact into something that fails.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const workflow = fs.readFileSync(
  path.join(__dirname, "../../../../.github/workflows/ci.yml"),
  "utf8",
);
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8"),
);

/** Every `node-version:` pin in the workflow, as declared. */
function pins(): string[] {
  return [...workflow.matchAll(/node-version:\s*(\S+)/g)].map((m) => m[1].replace(/["']/g, ""));
}

/** The major from an engines range like "^24.0.0" or ">=24". */
function declaredMajor(): number {
  const raw: string = pkg.engines?.node ?? "";
  const m = raw.match(/(\d+)/);
  expect(m, `engines.node is missing or unparseable: ${JSON.stringify(raw)}`).toBeTruthy();
  return Number(m![1]);
}

describe("the runtime CI tests on is the runtime the repo declares", () => {
  it("declares an engines.node at all", () => {
    // Without it there is nothing to check against, and the whole class of bug
    // becomes invisible again.
    expect(pkg.engines?.node).toBeTruthy();
  });

  it("pins at least one job", () => {
    // Guards against the assertion below passing vacuously if the workflow is
    // restructured and the pins move or disappear.
    expect(pins().length).toBeGreaterThan(0);
  });

  it("pins every job to the declared major", () => {
    const want = declaredMajor();
    for (const p of pins()) {
      expect(
        Number(p),
        `CI pins node ${p} but backend/package.json declares engines.node ${pkg.engines.node}. ` +
          "They must move together — see §19 Sub-pattern 16, fourth fire.",
      ).toBe(want);
    }
  });

  it("keeps every job on the same version as every other", () => {
    // A split — backend on one major, frontend on another — reproduces the same
    // failure one job at a time, and the job that is wrong stays green longest.
    expect(new Set(pins()).size).toBe(1);
  });
});
