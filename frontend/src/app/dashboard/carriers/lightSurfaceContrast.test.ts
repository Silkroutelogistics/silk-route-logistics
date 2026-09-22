/**
 * Carrier pool page — light surfaces carry mode-stable text (C5-pre, 2026-09-19).
 *
 * The page renders its cards on `bg-gray-100` and its drawer on `bg-white`, both of
 * which are literal Tailwind colours in BOTH modes. globals.css remaps `.text-white`,
 * `.text-slate-400`, `.border-white/5` and `.bg-white/10` to dark tokens ONLY under
 * [data-mode="light"] — so a `text-white` value on a `bg-gray-100` card read fine in
 * light mode (the remap rescued it) and was white-on-light-grey in dark mode
 * (§13.3 Item 10's class, pointing the other way). The fix moved every such site onto
 * the idiom StatCard on this page already used: `text-[#0A2540]` for values,
 * `text-gray-600` for labels, `border-gray-200` / `bg-gray-200` for structure.
 *
 * This pin holds that on the regions that are ALWAYS light: the three row helpers
 * (only ever mounted inside `bg-gray-100` blocks) and the two card blocks. It is a
 * source read, not a render — jsdom computes no Tailwind — so the property it proves
 * is "no light-on-light class in a light region", and the both-modes walkthrough is
 * what proves the pixels. Each region must still contain `bg-gray-100` (or be one of
 * the helpers, whose containers do), so a region that stops being light, or a slice
 * that stops matching, fails rather than passing on an empty string.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs
  .readFileSync(path.join(__dirname, "page.tsx"), "utf8")
  .replace(/\r\n/g, "\n");

/** A light-surface region must not carry a class that is only readable under the light-mode remap. */
const LIGHT_ON_LIGHT = ["text-white", "text-slate-400", "border-white/", "bg-white/"];

/** Slice a top-level `function Name(` body by brace depth. */
function fnBody(name: string): string {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const open = SRC.indexOf("{", SRC.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error(`function ${name} unbalanced`);
}

/** Slice between two literal markers that appear exactly once each. */
function between(from: string, to: string): string {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${from} … ${to}`);
  expect(SRC.indexOf(from, a + 1)).toBe(-1);
  return SRC.slice(a, b);
}

const REGIONS: Record<string, () => string> = {
  InfoRow: () => fnBody("InfoRow"),
  PerformanceBar: () => fnBody("PerformanceBar"),
  ComplianceRow: () => fnBody("ComplianceRow"),
  "tier cards": () => between("{/* Tier Cards */}", "{/* ── v3.8.asb"),
  "row cards": () => between("{filtered.map((carrier) => (", "{filtered.length === 0 && ("),
};

describe("carrier pool — light surfaces carry mode-stable text", () => {
  it("the card regions are still light surfaces (tripwire: the slices reach real JSX)", () => {
    expect(REGIONS["tier cards"]()).toContain("bg-gray-100");
    expect(REGIONS["row cards"]()).toContain("bg-gray-100");
    // the helpers render inside bg-gray-100 blocks; prove each is still mounted at least once
    for (const h of ["InfoRow", "PerformanceBar", "ComplianceRow"]) expect(SRC).toContain(`<${h} `);
  });

  for (const [name, get] of Object.entries(REGIONS)) {
    it(`${name} carries no class that is only readable under the light-mode remap`, () => {
      const body = get();
      expect(body.length).toBeGreaterThan(100);
      const hits = LIGHT_ON_LIGHT.filter((cls) => body.includes(cls));
      expect(hits, `${name} uses ${hits.join(", ")} on a light surface`).toEqual([]);
    });
  }

  it("the values on those surfaces use the page's own light-surface idiom", () => {
    expect(fnBody("InfoRow")).toContain("text-[#0A2540]");
    expect(fnBody("PerformanceBar")).toContain("text-[#0A2540]");
    expect(REGIONS["row cards"]()).toContain("text-[#0A2540]");
    expect(REGIONS["tier cards"]()).toContain("text-[#0A2540]");
    expect(fnBody("StatCard")).toContain("text-[#0A2540]"); // the precedent the fix copied
  });
});
