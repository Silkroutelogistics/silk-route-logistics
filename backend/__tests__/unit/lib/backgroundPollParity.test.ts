/**
 * Always-mounted layout polls must declare themselves as background polls.
 *
 * WHY. Since Arc 34 any authenticated request resets the 30-minute idle clock.
 * A layout is mounted on EVERY page of its portal, so its two-minute
 * notification refetch fires whether or not a human is present — and without the
 * header it held an abandoned desk signed in indefinitely, which is the exact
 * opposite of what an idle timeout is for.
 *
 * The backend gate has always been there (`!isBackgroundPoll` on the only
 * remaining touch in middleware/auth). Nothing on the client was sending the
 * header, so the gate could never fire.
 *
 * SCOPE, STATED SO NOBODY READS THIS AS BROADER THAN IT IS. This guards the
 * ALWAYS-MOUNTED layout polls only — the class that can hold a session open
 * indefinitely. Roughly forty other `refetchInterval` sites exist on individual
 * pages and are deliberately NOT covered: each needs a per-site judgement about
 * whether it runs unattended, and a guard that demanded all forty declare
 * themselves would either fail on day one or be neutered with an allowlist
 * nobody maintains. Banked with that reasoning rather than pretended away.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const REPO = path.resolve(__dirname, "../../../..");
const BE_MIDDLEWARE = path.join(REPO, "backend/src/middleware/auth.ts");
const FE_HELPER = path.join(REPO, "frontend/src/lib/backgroundPoll.ts");

const ALWAYS_MOUNTED_LAYOUTS = [
  "frontend/src/app/carrier/dashboard/layout.tsx",
  "frontend/src/app/shipper/dashboard/layout.tsx",
];

/** CRLF-safe: this repo checks out with autocrlf, and \r breaks anchored matches. */
function read(p: string): string {
  return fs.readFileSync(p, "utf8").split("\r\n").join("\n");
}

describe("background-poll marking", () => {
  it("the client header string equals the one the server reads", () => {
    const be = read(BE_MIDDLEWARE);
    const fe = read(FE_HELPER);

    const beMatch = be.match(/BACKGROUND_POLL_HEADER\s*=\s*"([^"]+)"/);
    const feMatch = fe.match(/BACKGROUND_POLL_HEADER\s*=\s*"([^"]+)"/);

    // Tripwire: an unparseable side would otherwise compare undefined to
    // undefined and pass while guarding nothing.
    expect(beMatch, "could not read BACKGROUND_POLL_HEADER from middleware/auth.ts").not.toBeNull();
    expect(feMatch, "could not read BACKGROUND_POLL_HEADER from the frontend helper").not.toBeNull();

    expect(
      feMatch![1],
      `header drifted: server reads "${beMatch![1]}", client sends "${feMatch![1]}". ` +
        `A mismatch is silent — the poll authenticates normally and simply keeps resetting the idle clock.`,
    ).toBe(beMatch![1]);
  });

  for (const rel of ALWAYS_MOUNTED_LAYOUTS) {
    it(`${rel} declares its poll as a background poll`, () => {
      const src = read(path.join(REPO, rel));

      // Tripwire before the assertion: if the poll is gone entirely, the check
      // below would pass vacuously.
      expect(
        /refetchInterval/.test(src),
        `${rel} no longer polls — update this guard rather than deleting it`,
      ).toBe(true);

      expect(
        /backgroundPoll/.test(src),
        `${rel} polls on an interval and is mounted on every page of its portal, ` +
          `but does not pass \`backgroundPoll\`. Without the header its refetch resets ` +
          `the 30-minute idle clock, so a signed-in tab left open never times out.`,
      ).toBe(true);
    });
  }
});
