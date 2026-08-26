/**
 * Guards that read repo source must survive a Windows checkout.
 *
 * `core.autocrlf` is `true` in this repo and there is no `.gitattributes`, so
 * every source file lands on a Windows disk with CRLF endings. A guard that
 * does `readFileSync(...).split("\n")` therefore gets a trailing `\r` on every
 * line, and JS regex `.` never matches `\r` — so `/\/\/.*$/` cannot strip a
 * comment, `/…$/` cannot anchor, and the parse silently produces the wrong
 * answer rather than failing.
 *
 * That is not theoretical. Two guards were red on every Windows checkout for
 * weeks: noLoadRateReads reported phantom findings by counting its own prose,
 * and publicSurfaceProbes parsed ZERO probes — it would have passed vacuously
 * had its own tripwire not caught the emptiness. Both were dismissed run after
 * run as "the known CRLF failures" while they sat in the pre-commit gate
 * saying nothing.
 *
 * A guard nobody trusts is a guard nobody reads, which is worse than not
 * having one: it occupies the slot where a working check would go.
 *
 * Two assertions here, deliberately different in kind. The STRUCTURAL one
 * catches a regression anywhere in the set at edit time. The BEHAVIOURAL one
 * proves the safe idiom actually does what the structural one assumes — because
 * a rule about spelling is worth nothing if the spelling it mandates is wrong
 * (§19 Sub-pattern 16).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");

/**
 * Guards and scripts that read REPO SOURCE from disk and match against it.
 *
 * sessionMintParity.test.ts is deliberately absent: it belongs to a concurrent
 * session's work and is not this arc's to edit. It has the same exposure and is
 * recorded in the arc ledger rather than fixed here.
 */
const PARSERS = [
  "__tests__/unit/lib/noLoadRateReads.test.ts",
  "__tests__/unit/lib/noFrontendLoadRateReads.test.ts",
  "__tests__/unit/lib/carrierStatusPairing.test.ts",
  "__tests__/unit/routes/publicSurfaceProbes.test.ts",
  "__tests__/unit/routes/benchBoard.test.ts",
  "__tests__/unit/routes/accountingSummary.test.ts",
  "__tests__/unit/middleware/requireTotpEnrolled.test.ts",
  "__tests__/unit/middleware/requireStepUp.test.ts",
  "__tests__/unit/services/compassCheckCount.test.ts",
  "__tests__/unit/cron/softDeleteFiltering.test.ts",
  "__tests__/unit/cron/noDuplicateSchedules.test.ts",
  "__tests__/unit/cron/fmcsaScanSchedule.test.ts",
  "scripts/verify-reachability.ts",
  "scripts/audit-schema-drift.ts",
];

/** `.split("\n")` — the unsafe idiom, built by char code so no quoting layer eats it. */
const BS = String.fromCharCode(92);
const DQ = String.fromCharCode(34);
const UNSAFE_SPLIT = ".split(" + DQ + BS + "n" + DQ + ")";

/**
 * The same bug wearing a regex.
 *
 * The first version of this guard looked only for the string literal above,
 * and it MISSED a live break sitting inside its own PARSERS list:
 * publicSurfaceProbes splits on `/\n  \{\n/` to carve up the probe file. On a
 * CRLF checkout `{\r\n` never matches `\{\n`, and the measured result was 17
 * entries becoming 0 — the guard parsing nothing at all.
 *
 * So this guard had precisely the blind spot it exists to prevent, and the two
 * files went green together while one of them could not parse. That is §19
 * Sub-pattern 16 aimed at the checker rather than the checked: a green result
 * proved the check RAN, not that it observed the thing its name implies.
 *
 * Matches a `\n` inside a regex literal handed to .split(), unless an `\r?`
 * already guards it.
 */
function hasUnsafeSplitRegex(src: string): boolean {
  // Two steps rather than one clever pattern. The first cut tried to express
  // "a \n not preceded by \r?" inline with a lookahead and cried wolf on the
  // SAFE form — caught by the fixture below, which is why the fixture is there.
  // A guard that cries wolf is one people learn to ignore.
  const bodies = src.match(/\.split\(\s*\/(?:\\.|[^/\\])+\//g) || [];
  return bodies.some((b) => {
    const stripped = b.split(String.fromCharCode(92) + "r?" + String.fromCharCode(92) + "n").join("");
    return stripped.includes(String.fromCharCode(92) + "n");
  });
}

describe("repo-source parsers survive a CRLF checkout", () => {
  it("no parser splits on a bare newline", () => {
    const offenders: string[] = [];
    for (const rel of PARSERS) {
      const abs = path.join(BACKEND, rel);
      if (!fs.existsSync(abs)) {
        offenders.push(`${rel}: listed here but missing on disk — fix the list or restore the file`);
        continue;
      }
      const src = fs.readFileSync(abs, "utf8");
      const n = src.split(UNSAFE_SPLIT).length - 1;
      if (n > 0) {
        offenders.push(
          `${rel}: ${n} bare-newline split(s). Use split(/${BS}r?${BS}n/) — on a Windows ` +
            `checkout the bare form leaves ${BS}r on every line and anchored matching stops working.`,
        );
      }
      if (hasUnsafeSplitRegex(src)) {
        offenders.push(
          `${rel}: a split regex contains an unguarded ${BS}n. Guard it as ${BS}r?${BS}n — ` +
            `on a CRLF checkout the pattern matches nothing and the parse silently yields zero entries.`,
        );
      }
    }
    expect(offenders, offenders.join("\n  ")).toEqual([]);
  });

  it("the safe idiom actually strips the carriage return", () => {
    // The structural rule above mandates a spelling. This proves the spelling
    // works — otherwise the rule could enforce something equally broken and
    // both assertions would agree with each other and be wrong together.
    const crlf = ["const a = 1;", "// const b = load.rate;", "const c = 3;"].join("\r\n");

    const unsafe = crlf.split("\n");
    const safe = crlf.split(/\r?\n/);

    // The failure mode, demonstrated rather than described.
    expect(unsafe[0].endsWith("\r"), "bare split leaves the CR — this is the bug").toBe(true);
    expect(safe[0].endsWith("\r"), "the safe split consumes it").toBe(false);

    // And the consequence: comment stripping cannot match past a CR.
    const stripUnsafe = unsafe[1].replace(/\/\/.*$/, "").trim();
    const stripSafe = safe[1].replace(/\/\/.*$/, "").trim();
    expect(stripUnsafe, "the commented line survives stripping and gets counted").not.toBe("");
    expect(stripSafe, "stripped correctly once the CR is gone").toBe("");
  });

  it("parses identically under both line endings", () => {
    // Same content, two encodings, one answer. A guard whose result depends on
    // the checkout is a guard whose result depends on who ran it.
    const lines = ["alpha", "// beta", "gamma"];
    const asLf = lines.join("\n");
    const asCrlf = lines.join("\r\n");
    expect(asCrlf.split(/\r?\n/)).toEqual(asLf.split(/\r?\n/));
  });

  it("cannot pass vacuously", () => {
    // If PARSERS were emptied or the paths rotted, the first assertion would
    // pass while checking nothing.
    expect(PARSERS.length, "the list should cover the real parser set").toBeGreaterThan(10);
    const present = PARSERS.filter((r) => fs.existsSync(path.join(BACKEND, r)));
    expect(present.length, "every listed parser should exist").toBe(PARSERS.length);
    // And the needles must be the real ones, not empty patterns matching nothing.
    expect(UNSAFE_SPLIT).toBe('.split("\\n")');

    // Both needles proven against fixtures, because the regex needle was added
    // AFTER the first version missed a live break — it has to be shown to
    // catch that exact shape, and to leave the guarded form alone.
    expect(hasUnsafeSplitRegex("src.split(/\\n  \\{\\n/)"), "must catch the unguarded form").toBe(true);
    expect(hasUnsafeSplitRegex("src.split(/\\r?\\n/)"), "must not cry wolf on the safe form").toBe(false);
    expect(hasUnsafeSplitRegex("src.split(/\\r?\\n  \\{\\r?\\n/)"), "nor on the fixed form").toBe(false);
  });
});
