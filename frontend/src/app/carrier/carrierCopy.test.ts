// carrier-portal-upgrade G35 — the carrier portal's UI copy carries no em dash
// and no contraction (owner default 3).
//
// A census over source files, with comments stripped first: comments are for
// engineers and keep their own style. A file joins CLEAN when a slice has swept
// it; a file on the list that regains a contraction or an em dash fails here.
// The pattern is self-tested against fixtures, so a broken regex cannot pass
// every file by matching nothing (§19 Sub-pattern 16).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..", "..");

export const CLEAN = [
  "app/carrier/dashboard/page.tsx",
  "app/carrier/dashboard/available-loads/page.tsx",
  "app/carrier/dashboard/tenders/page.tsx",
  "app/carrier/dashboard/tender-history/page.tsx",
  "app/carrier/dashboard/payments/page.tsx",
  "app/carrier/dashboard/revenue/page.tsx",
  "app/carrier/dashboard/loadboard/page.tsx",
  "app/carrier/dashboard/documents/page.tsx",
  "app/carrier/dashboard/scorecard/page.tsx",
  "app/carrier/dashboard/training/page.tsx",
  "app/carrier/dashboard/settings/page.tsx",
  "app/carrier/dashboard/activation/page.tsx",
  "app/carrier/dashboard/application-status/page.tsx",
  "components/carrier/LockedFeature.tsx",
  "components/carrier/LoadUtils.tsx",
  "components/carrier/CarrierWelcomeTour.tsx",
];

/** Source with block, line and JSX comments removed. */
export function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

const CONTRACTION = /\b[A-Za-z]+(?:n't|n&apos;t|&apos;(?:ll|re|ve|d)|'(?:ll|re|ve|d))\b/;
const EM_DASH = /—/;

describe("the census's own patterns", () => {
  it("catch what they are for and leave comments and plain words alone", () => {
    expect(CONTRACTION.test("We couldn&apos;t load it")).toBe(true);
    expect(CONTRACTION.test('"Couldn\'t open the PDF."')).toBe(true);
    expect(CONTRACTION.test("You&apos;re approved")).toBe(true);
    expect(CONTRACTION.test("Could not open the PDF.")).toBe(false);
    expect(EM_DASH.test(stripComments("const a = 1; // an aside — here"))).toBe(false);
    expect(EM_DASH.test(stripComments("{/* note — here */}<p>ok</p>"))).toBe(false);
    expect(EM_DASH.test(stripComments('<p>Pay — now</p>'))).toBe(true);
  });
});

describe("carrier UI copy", () => {
  it.each(CLEAN)("%s has no contraction and no em dash outside comments", (rel) => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    const lines = code.split("\n");
    const bad = lines
      .map((l, i) => ({ n: i + 1, l: l.trim() }))
      .filter(({ l }) => CONTRACTION.test(l) || EM_DASH.test(l));
    expect(bad.map((b) => b.l.slice(0, 100))).toEqual([]);
  });
});
