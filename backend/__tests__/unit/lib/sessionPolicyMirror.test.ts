/**
 * The client mirror of the session policy must equal the server.
 *
 * WHY. The warning modal counts down to the instant the server will refuse at.
 * If the two disagree, the user watches a timer that does not match what happens
 * to them — which is worse than showing no timer, because it is confidently
 * wrong.
 *
 * That is not hypothetical. Before 2026-08-26 THREE different client numbers
 * were live simultaneously while the server had already moved to 30 minutes:
 *   - useSessionTimeout defaulted to 60
 *   - the carrier and shipper layouts each passed 60 explicitly
 *   - public/js/session-timeout.js encoded `isAE ? 30 : 60`
 * A carrier could sit at "25 minutes remaining" on a session the server had
 * already ended.
 *
 * This reads BOTH files as text and compares the literals. It deliberately does
 * not import the frontend module — backend tests do not resolve the frontend
 * path alias, and a guard that cannot run is not a guard.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../../src/lib/sessionPolicy.ts");
const FRONTEND = path.resolve(__dirname, "../../../../frontend/src/lib/sessionPolicy.ts");

function readNumber(src: string, name: string): number | null {
  // Multi-line tolerant: the value may sit on the line after the name.
  const m = src.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!m) return null;
  const expr = m[1].trim();
  // Only arithmetic on literals — never eval anything richer than that.
  if (!/^[\d\s*+/()-]+$/.test(expr)) return null;
  // eslint-disable-next-line no-new-func
  return Number(new Function(`return (${expr})`)());
}

describe("client session-policy mirror matches the server", () => {
  const be = fs.readFileSync(BACKEND, "utf8");
  const fe = fs.readFileSync(FRONTEND, "utf8");

  for (const name of ["SESSION_IDLE_MINUTES", "SESSION_ABSOLUTE_HOURS", "SESSION_WARNING_LEAD_MS"]) {
    it(`${name} is identical on both sides`, () => {
      const backendValue = readNumber(be, name);
      const frontendValue = readNumber(fe, name);

      // Tripwire: if either stops parsing, this test would otherwise compare
      // null to null and pass while guarding nothing.
      expect(backendValue, `could not read ${name} from the BACKEND policy module`).not.toBeNull();
      expect(frontendValue, `could not read ${name} from the FRONTEND mirror`).not.toBeNull();

      expect(
        frontendValue,
        `${name} drifted: server says ${backendValue}, client mirror says ${frontendValue}. ` +
          `The client counts down to the instant the server refuses at — if they disagree the user ` +
          `watches a timer that lies. Update frontend/src/lib/sessionPolicy.ts to match the server.`,
      ).toBe(backendValue);
    });
  }

  it("no caller passes its own idle timeout, which is how the drift happened", () => {
    // The layouts used to hardcode 60 minutes each. Defaults now come from the
    // mirror; an explicit timeoutMs re-opens exactly the gap this file closes.
    const layouts = [
      "../../../../frontend/src/app/carrier/dashboard/layout.tsx",
      "../../../../frontend/src/app/shipper/dashboard/layout.tsx",
    ];
    for (const rel of layouts) {
      const src = fs.readFileSync(path.resolve(__dirname, rel), "utf8");

      // Tripwire first: if the call disappears, the two assertions below both
      // pass while guarding nothing.
      expect(
        /useSessionTimeout\s*\(/.test(src),
        `${rel} no longer calls useSessionTimeout — update this guard rather than deleting it`,
      ).toBe(true);

      // Whole-file, not a windowed match around the call. The first version
      // scanned 400 chars after `useSessionTimeout(` and reported a violation in
      // the carrier layout purely because an explanatory comment inside the call
      // pushed the closing brace past the window — a false positive in the guard,
      // not a defect in the code. A guard that cries wolf is one people learn to
      // skip, and `timeoutMs:` appears nowhere else in a layout anyway.
      expect(
        /timeoutMs\s*:/.test(src),
        `${rel} passes its own timeoutMs. That is exactly how three different client ` +
          `numbers ended up live against one server value. Take the default.`,
      ).toBe(false);
    }
  });
});
