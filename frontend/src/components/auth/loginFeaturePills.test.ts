/**
 * Login feature pills — one card, the same in every portal and both modes (2026-09-26).
 *
 * The four brand panels (AE login, carrier login, shipper login, and the shared
 * LoginBrandPanel used by forgot/reset) each render a 2x2 grid of feature pills.
 * They carried `bg-white/10` plus either `text-white` (AE) or `text-[#FBF7F0]`
 * (the other three). globals.css remaps `.bg-white/10` to the white surface and
 * `.text-white` to dark text under [data-mode="light"], so in light mode the AE
 * pills read as white cards with dark text while the carrier and shipper pills
 * became white cards with cream text: the same component, two different pictures,
 * one of them nearly unreadable. The remap rescued one copy and not the others.
 *
 * Ratified: a solid white card with #0A2540 navy text and icon, identical in both
 * modes, on all four copies. This pin holds the property that makes that true —
 * no pill class is one a data-mode rule rewrites — and derives the rewritten set
 * from globals.css itself, so a new remap added later is caught without editing
 * this file. It is a source read, not a render: jsdom computes no Tailwind.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

const PANELS = [
  "app/auth/login/page.tsx",
  "app/carrier/login/page.tsx",
  "app/shipper/login/page.tsx",
  "components/auth/LoginBrandPanel.tsx",
];

/**
 * The subject of every [data-mode="..."] rule in globals.css, as the set of
 * classes an element must carry ALL of to be rewritten. A compound selector
 * such as `.bg-[#161921].border` rewrites only an element with both, so the
 * compound is kept whole; ancestor context (`aside`) is ignored, which errs
 * toward flagging.
 */
function modeRemappedCompounds(): string[][] {
  const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
  const out: string[][] = [];
  for (const rule of css.matchAll(/([^{}]*\[data-mode="(?:light|dark)"\][^{}]*)\{/g)) {
    for (const selector of rule[1].split(",")) {
      if (!selector.includes("[data-mode=")) continue;
      const subject = selector.trim().split(/\s+|[>+~]/).filter(Boolean).pop() ?? "";
      const classes = [...subject.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
      if (classes.length) out.push(classes);
    }
  }
  return out;
}

/** The pill className in one panel: the element holding the pill label and icon. */
function pillClasses(file: string): string[] {
  const src = fs.readFileSync(path.join(SRC, file), "utf8");
  const hits = [...src.matchAll(/className="([^"]*rounded-lg px-3 py-2\.5 text-xs font-medium cursor-default[^"]*)"/g)];
  expect(hits.length, `${file} should render exactly one feature-pill element`).toBe(1);
  return hits[0][1].split(/\s+/).filter(Boolean);
}

describe("login feature pills", () => {
  const compounds = modeRemappedCompounds();
  const has = (cls: string[]) => compounds.some((c) => c.length === cls.length && c.every((x) => cls.includes(x)));

  it("reads globals.css well enough to know what it rewrites", () => {
    // Vacuity tripwire: a parser that matched nothing would clear every pill.
    expect(has(["bg-white/10"])).toBe(true);
    expect(has(["text-white"])).toBe(true);
    // A compound stays a compound: this rule needs BOTH classes.
    expect(has(["bg-[#161921]", "border"])).toBe(true);
    expect(has(["border"])).toBe(false);
  });

  it.each(PANELS)("%s uses no class that a data-mode rule rewrites", (file) => {
    const pill = pillClasses(file);
    const hit = compounds.filter((c) => c.every((x) => pill.includes(x))).map((c) => c.join("."));
    expect(hit, `${file}: these data-mode rules rewrite the pill`).toEqual([]);
  });

  it("is a white card with navy text", () => {
    const classes = pillClasses(PANELS[0]);
    expect(classes).toContain("bg-[#FFFFFF]");
    expect(classes).toContain("text-[#0A2540]");
  });

  it("is the same card on all four panels", () => {
    const [first, ...rest] = PANELS.map((f) => pillClasses(f).join(" "));
    for (const [i, c] of rest.entries()) {
      expect(c, `${PANELS[i + 1]} differs from ${PANELS[0]}`).toBe(first);
    }
  });
});
