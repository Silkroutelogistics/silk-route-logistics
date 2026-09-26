/**
 * The retired-figures list never matches a live figure (2026-09-26).
 *
 * verify-accessorial-standard does not compare a document against the live
 * schedule; it matches RETIRED_FIGURES, a hand-kept list. When the schedule
 * moved from $50/hr capped at $250 to $40/hr capped at $200, that list still
 * named "$200 cap" as retired (left from the earlier move the other way) and
 * did not know $50 or $250 at all. The guard would have passed a document
 * stating the old figures and failed one stating the new cap.
 *
 * So the list is held to the constants: every way a live figure is written,
 * in every surface's register, must match no retired pattern. Moving a
 * constant without moving the list turns this red.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  RETIRED_FIGURES, POLICY_TEXT,
  DETENTION_RATE_PER_HOUR as RATE, DETENTION_CAP_PER_STOP as CAP,
  LAYOVER_RATE_PER_DAY as LAYOVER, TONU_AMOUNT as TONU,
} from "../../../src/lib/accessorialPolicy";

/** The live figures, written the ways the surfaces write them. */
const LIVE_STATEMENTS = [
  `$${RATE}/hr`, `$${RATE} per hour`, `$${RATE}.00 per hour`, `$${RATE}/hr after 2 hrs free, $${CAP}/stop cap`,
  `capped at $${CAP} per stop`, `capped at $${CAP}.00 per stop`, `$${CAP}/stop cap`, `$${CAP} per stop`,
  `layover at $${LAYOVER} per day`, `$${LAYOVER}/day`, `$${LAYOVER}.00 per day`,
  `TONU $${TONU} flat`, `$${TONU} (truck-order-not-used)`,
];

describe("RETIRED_FIGURES is held to the live schedule", () => {
  it("no retired pattern matches a live figure", () => {
    for (const s of LIVE_STATEMENTS) {
      for (const r of RETIRED_FIGURES) {
        expect(r.pattern.test(s), `retired pattern for "${r.was}" matches the LIVE statement "${s}"`).toBe(false);
      }
    }
  });

  it("no retired pattern matches the canonical prose documents embed", () => {
    for (const line of POLICY_TEXT.fullSchedule().split("\n")) {
      for (const r of RETIRED_FIGURES) {
        expect(r.pattern.test(line), `retired pattern for "${r.was}" matches the canonical line "${line}"`).toBe(false);
      }
    }
  });

  it("the figures retired on 2026-09-26 are caught, in both registers", () => {
    // What a document stating the old schedule looks like, including the
    // agreement's "$50.00 per hour" form.
    for (const old of ["$50/hr", "$50.00 per hour", "capped at $250 per stop", "$250.00 per stop", "$250/day", "$250.00 per day"]) {
      expect(RETIRED_FIGURES.some((r) => r.pattern.test(old)), `"${old}" is not recognised as retired`).toBe(true);
    }
  });

  it("the drift guard does not let a negation elsewhere on a line excuse a figure", () => {
    // A line saying "SRL issues no money codes" once exonerated "$50/hr" on the
    // same line. The negation exemption now covers money-code wording only.
    const src = fs.readFileSync(path.resolve(__dirname, "../../../scripts/verify-accessorial-standard.ts"), "utf8");
    expect(src).toContain('const why = exempt(line, prev, "figure");');
    expect(src).toContain('if (exempt(line, prev, "figure")) continue;');
    expect(src).toMatch(/NOT_FOR_FIGURES = new Set\(\["negated — says SRL does NOT do this"\]\)/);
  });
});
