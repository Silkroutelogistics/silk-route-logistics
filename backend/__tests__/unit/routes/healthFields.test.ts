/**
 * The /api/health response actually carries the fields it is supposed to.
 *
 * WHY THIS EXISTS. v3.8.ayh added `status_machine` to the health payload and the
 * field DID NOT SHIP. The import landed, the assignment did not, and `tsc`
 * passed -- an unused import is not an error -- so every gate was green over a
 * change that was not there. It was caught by reading production, which is luck
 * rather than a mechanism.
 *
 * Each field here exists because something was once invisible:
 *   schema          a migration applied while the app still reported the old SHA (Item 212)
 *   storage/parser  "configured" reported a credential, not a capability (Item 249)
 *   status_machine  the enforcement gate for the Load.status machine (Item 194)
 *
 * A field that silently stops being emitted returns the platform to the exact
 * blindness it was added to remove, and nothing would fail.
 *
 * NO REGEX ANYWHERE BELOW, deliberately. The first version of this guard built
 * its matcher with `new RegExp`, the escaping was mangled on the way into the
 * file, the pattern matched nothing, and it reported four failures against a
 * file that was correct. A guard whose own matcher can be silently wrong is
 * worse than no guard, so this is line-based string work only.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

/** Comments stripped, so prose naming a field is not read as an assignment. */
function strip(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const REQUIRED = ["schema", "storage", "parser", "status_machine"] as const;

function healthBody(): string {
  const s = strip(fs.readFileSync(path.join(SRC, "routes/index.ts"), "utf8"));
  const at = s.indexOf('router.get("/health"');
  if (at < 0) throw new Error("the /health route moved -- repoint this guard");
  const region = s.slice(at, at + 2000);
  const j = region.indexOf("res.json({");
  if (j < 0) throw new Error("/health no longer responds with res.json -- re-read this guard");
  const end = region.indexOf("});", j);
  if (end < 0) throw new Error("could not find the end of the /health response object");
  return region.slice(j, end);
}

/** Is `field` assigned as a key on its own line inside the response object? */
function assigns(body: string, field: string): boolean {
  return body
    .split("\n")
    .map((l) => l.trim())
    .some((l) => l.startsWith(field + ":"));
}

describe("/api/health emits its diagnostic fields", () => {
  it.each(REQUIRED)("assigns %s", (field) => {
    expect(
      assigns(healthBody(), field),
      "/api/health does not assign `" + field + "`. Importing its helper is not " +
        "enough: an unused import compiles cleanly, which is how status_machine " +
        "shipped as nothing at all in v3.8.ayh.",
    ).toBe(true);
  });

  it("the extracted region really is the response object (vacuity tripwire)", () => {
    // If the slice missed, every assertion above would be running against a
    // fragment that merely happens to contain the words -- or against an empty
    // string, which `some()` answers false for and would look like a real fail.
    const b = healthBody();
    expect(assigns(b, "status")).toBe(true);
    expect(assigns(b, "uptime")).toBe(true);
    expect(b.length).toBeGreaterThan(50);
    expect(b.length).toBeLessThan(1500);
  });

  it("the matcher can tell an assignment from a mention (self-test)", () => {
    // Without this, a matcher that had stopped working would report a clean
    // file forever, which is precisely the failure this guard exists to catch.
    expect(assigns("  status_machine: statusMachineCounters(),", "status_machine")).toBe(true);
    expect(assigns("  // status_machine is the gate", "status_machine")).toBe(false);
    expect(assigns("  somethingElse: 1,", "status_machine")).toBe(false);
  });
});
