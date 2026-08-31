/**
 * Drawer conformance guards — width tokens and the interaction contract.
 *
 * v3.8.awc — A4 of the drawer arc (docs/audits/drawer-conformance-audit.md).
 *
 * Both properties this file guards were already true once and drifted anyway.
 * The portal ran five hardcoded drawer widths, and the contract held on five of
 * seven drawers while the two busiest had none of it — so these are regressions
 * that have actually happened here, not hypotheticals.
 *
 * These are SOURCE guards, which is a real limit worth stating: they can prove a
 * literal is absent and that a hook is called, and they cannot prove a drawer
 * renders at the right width or that ESC actually closes it. That is what
 * e2e/render-proof.mjs is for — it drives a real browser at three viewports and
 * measures geometry. Per §19 Sub-pattern 16, presence is not function: read this
 * as "nobody reintroduced the shape of the old bug", never as "the drawers work".
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");

/** Every surface that renders a right-side detail drawer. */
const DETAIL_DRAWERS = [
  "app/dashboard/carriers/page.tsx",
  "app/dashboard/crm/CustomerDrawer.tsx",
  "app/dashboard/lead-hunter/ProspectDrawer.tsx",
  "app/dashboard/loads/page.tsx",
  "app/dashboard/track-trace/LoadDetailDrawer.tsx",
  "app/dashboard/waterfall/WaterfallDrawer.tsx",
  "components/drawer/CarrierEngagementDrawer.tsx",
];

/** The shared base every form drawer goes through. */
const SLIDE_DRAWER = "components/ui/SlideDrawer.tsx";

/**
 * The two that are inline in a page rather than components, so they cannot go
 * through SlideDrawer and must call the hook themselves. These are exactly the
 * two that had no contract before this arc.
 */
const INLINE_DRAWERS = [
  "app/dashboard/carriers/page.tsx",
  "app/dashboard/loads/page.tsx",
];

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/**
 * Matches a hardcoded drawer-scale width: max-w-[NNNpx] at 400px or more, or a
 * Tailwind max-w-{md,lg,xl,2xl,...} passed as a drawer width prop.
 *
 * The floor is deliberate. Drawers are the only thing in this range, so small
 * arbitrary widths (icon rails, badges, inputs) do not trip it and the guard
 * does not cry wolf — a guard with false positives is one people learn to skip.
 */
const HARDCODED_DRAWER_WIDTH = /max-w-\[(\d{3,})px\]|width="max-w-(?:md|lg|xl|2xl|3xl|4xl)"/g;

describe("drawer width tokens", () => {
  it("no detail drawer carries a hardcoded width", () => {
    const offenders: string[] = [];
    for (const rel of [...DETAIL_DRAWERS, SLIDE_DRAWER]) {
      const src = read(rel);
      for (const m of src.matchAll(HARDCODED_DRAWER_WIDTH)) {
        // max-w-[NNNpx] only counts at drawer scale; below that it is a rail or a chip.
        if (m[1] && Number(m[1]) < 400) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line} → ${m[0]}`);
      }
    }
    expect(offenders, `hardcoded drawer widths must use var(--drawer-*):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("every detail drawer reads the shared width token", () => {
    const missing = [...DETAIL_DRAWERS, SLIDE_DRAWER].filter(
      (rel) => !read(rel).includes("var(--drawer-detail)")
    );
    expect(missing, `must size from --drawer-detail: ${missing.join(", ")}`).toEqual([]);
  });

  it("the tokens are defined exactly once, in the token layer", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    for (const token of ["--drawer-detail", "--drawer-sm", "--drawer-md", "--drawer-lg"]) {
      const defs = [...css.matchAll(new RegExp(`^\\s*${token}\\s*:`, "gm"))];
      expect(defs.length, `${token} should be defined once, found ${defs.length}`).toBe(1);
    }
  });

  it("--drawer-detail is a ratio with bounds, not a constant", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const decl = css.match(/--drawer-detail:\s*([^;]+);/)?.[1] ?? "";
    // The original defect was a fixed pixel standing in for a proportion, so a
    // bare px value here is the exact regression this arc exists to prevent.
    expect(decl, "--drawer-detail must be viewport-relative").toMatch(/clamp\(|vw/);
  });
});

describe("drawer interaction contract", () => {
  it("SlideDrawer runs the shared behaviour hook", () => {
    expect(read(SLIDE_DRAWER)).toContain("useDrawerBehavior");
  });

  it("the two inline drawers run it too", () => {
    const missing = INLINE_DRAWERS.filter((rel) => !read(rel).includes("useDrawerBehavior("));
    expect(
      missing,
      `inline drawers cannot inherit SlideDrawer's behaviour and must call the hook: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("every drawer surface spreads the dialog and backdrop props", () => {
    const offenders: string[] = [];
    for (const rel of [...INLINE_DRAWERS, SLIDE_DRAWER]) {
      const src = read(rel);
      if (!src.includes("{...dialogProps}")) offenders.push(`${rel} → no {...dialogProps}`);
      if (!src.includes("{...backdropProps}")) offenders.push(`${rel} → no {...backdropProps}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the hook implements all three behaviours it owns", () => {
    const hook = fs.readFileSync(path.join(SRC, "hooks/useDrawerBehavior.ts"), "utf8");
    // Named individually so a failure says WHICH behaviour was dropped rather
    // than that something, somewhere, changed.
    expect(hook, "ESC").toContain("Escape");
    expect(hook, "browser back").toContain("popstate");
    expect(hook, "scroll lock").toContain("body.style.overflow");
    expect(hook, "role=dialog").toContain('role: "dialog"');
    expect(hook, "aria-modal").toContain("aria-modal");
  });

  it("no drawer surface re-implements a behaviour the hook owns", () => {
    // Two implementations of ESC is how they drift apart, which is the whole
    // reason the hook exists. The carrier pool had its own before this arc.
    const offenders = INLINE_DRAWERS.filter((rel) => {
      const src = read(rel);
      return /addEventListener\(\s*["']keydown["']/.test(src) || /document\.body\.style\.overflow/.test(src);
    });
    expect(
      offenders,
      `these re-implement hook behaviour locally: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});

describe("guard reach", () => {
  it("reads every file it claims to", () => {
    // A guard whose file list has gone stale passes by reading nothing, which is
    // indistinguishable from passing by finding nothing wrong.
    for (const rel of [...DETAIL_DRAWERS, SLIDE_DRAWER, "hooks/useDrawerBehavior.ts", "app/globals.css"]) {
      expect(fs.existsSync(path.join(SRC, rel)), `${rel} is listed but missing — update this guard`).toBe(true);
    }
    expect(DETAIL_DRAWERS.length).toBe(7);
  });

  it("the width pattern actually matches the shape it is looking for", () => {
    // Tripwire: if this regex ever stops matching, every width assertion above
    // starts passing vacuously.
    const sample = 'className="w-full max-w-[720px] bg-white"';
    expect([...sample.matchAll(HARDCODED_DRAWER_WIDTH)].length).toBe(1);
    expect([...'width="max-w-md"'.matchAll(HARDCODED_DRAWER_WIDTH)].length).toBe(1);
    // and does NOT match sub-drawer-scale widths
    expect([...'className="max-w-[66px]"'.matchAll(HARDCODED_DRAWER_WIDTH)].filter(m => Number(m[1]) >= 400).length).toBe(0);
  });
});
