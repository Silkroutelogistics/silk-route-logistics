/**
 * Type-scale guard — the 11px floor, and off-scale sizes.
 *
 * v3.8.awe — B3 of the drawer arc. Scale ratified in the brand skill
 * (references/tokens.md §8, "UI type scale"): 11 label / 12 dense / 13 secondary
 * / 14 body / 16 lead, hard floor 11px.
 *
 * SCOPE IS DELIBERATE AND NARROWER THAN THE PORTAL. This guards the drawer
 * surfaces, which B2 actually reconciled. The rest of the portal still has 431
 * sub-floor instances, several inside containers that cannot take the size —
 * 8px text in a 14px circle, notification count dots, calendar day cells. A
 * portal-wide guard would therefore be red on arrival, and a guard that is red on
 * arrival gets skipped, then disabled, then deleted. Widen SURFACES as each area
 * is reconciled and rendered; that is the intended path, not a permanent excuse.
 *
 * Source guard. It proves a class name is absent, not that anything is legible.
 * Presence is not function (§19 Sub-pattern 16).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");

/** Reconciled in v3.8.awd and rendered at three viewports. */
const SURFACES = [
  "app/dashboard/carriers/page.tsx",
  "app/dashboard/crm/CustomerDrawer.tsx",
  "app/dashboard/lead-hunter/ProspectDrawer.tsx",
  "app/dashboard/track-trace/LoadDetailDrawer.tsx",
  "app/dashboard/waterfall/WaterfallDrawer.tsx",
  "components/drawer/CarrierEngagementDrawer.tsx",
  "components/ui/SlideDrawer.tsx",
  "components/ui/IconTabs.tsx",
  "components/carriers/SecuritySignalsCard.tsx",
  "components/carriers/CarrierPreferencesPanel.tsx",
  "components/carriers/InfoRequestThread.tsx",
  "components/carriers/TrainingTab.tsx",
];

/**
 * Arbitrary px sizes permitted on the guarded surfaces. Empty at launch, and it
 * should stay that way: an entry here is a surface admitting it needs a size the
 * scale does not have, which is a reason to revisit the scale rather than to add
 * a line. Format: "path → text-[Npx] → why".
 */
const ALLOWLIST: string[] = [];

/**
 * Scale steps that legitimately appear as arbitrary values.
 *
 * 11 (label) and 13 (secondary) have no Tailwind name, so an arbitrary value is
 * the only way to write them. 12 (dense) is `text-xs` and 14 (body) is `text-sm`,
 * so writing those arbitrarily is redundant — but they are still ON the scale and
 * flagging them as off-scale would send someone to "fix" conformant code, which
 * is worse than the redundancy. This set is sizes, not spellings.
 *
 * The first version of this guard listed only 11 and immediately reported three
 * conformant lines in TrainingTab as violations. The guard was wrong, not the
 * code — recorded because a guard that cries wolf is one people learn to skip.
 */
const ON_SCALE_PX = new Set([11, 12, 13, 14, 16]);

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const SIZE = /text-\[(\d+)px\]/g;

describe("type scale — the 11px floor", () => {
  it("no guarded surface renders text below 11px", () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      const src = read(rel);
      for (const m of src.matchAll(SIZE)) {
        const px = Number(m[1]);
        if (px >= 11) continue;
        const line = src.slice(0, m.index).split("\n").length;
        const entry = `${rel}:${line} → ${m[0]}`;
        if (ALLOWLIST.some((a) => a.startsWith(`${rel} → ${m[0]}`))) continue;
        offenders.push(entry);
      }
    }
    expect(
      offenders,
      `below the 11px floor — at that size a 3 and an 8 in an MC number are a guess:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("no guarded surface uses an off-scale arbitrary size", () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      const src = read(rel);
      for (const m of src.matchAll(SIZE)) {
        const px = Number(m[1]);
        if (px < 11) continue; // the floor test owns these
        if (ON_SCALE_PX.has(px)) continue;
        if (ALLOWLIST.some((a) => a.startsWith(`${rel} → ${m[0]}`))) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line} → ${m[0]} (use a scale step, or a Tailwind name)`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the allowlist is empty, and every entry names a file that exists", () => {
    // An allowlist entry pointing at a moved file is dead permission that reads
    // as a considered exception.
    for (const entry of ALLOWLIST) {
      const rel = entry.split(" → ")[0];
      expect(fs.existsSync(path.join(SRC, rel)), `stale allowlist entry: ${rel}`).toBe(true);
    }
    expect(ALLOWLIST, "an entry here means the scale is missing a size — revisit the scale first").toEqual([]);
  });
});

describe("type scale — the scale itself", () => {
  it("the skill declares the ratified steps", () => {
    const tokens = fs.readFileSync(
      path.join(process.cwd(), "..", ".claude/skills/srl-brand-design/scripts/srl_tokens.css"),
      "utf8"
    );
    for (const [name, px] of [
      ["--fs-label", "11px"], ["--fs-dense", "12px"], ["--fs-secondary", "13px"],
      ["--fs-body", "14px"], ["--fs-lead", "16px"],
    ]) {
      expect(tokens, `${name} must be ${px}`).toMatch(new RegExp(`${name}:\\s*${px}`));
    }
  });
});

describe("guard reach", () => {
  it("reads every surface it claims to", () => {
    for (const rel of SURFACES) {
      expect(fs.existsSync(path.join(SRC, rel)), `${rel} listed but missing — update this guard`).toBe(true);
    }
    expect(SURFACES.length).toBe(12);
  });

  it("the size pattern matches the shape it hunts", () => {
    // Tripwire: if this stops matching, every assertion above passes vacuously
    // by finding nothing rather than by there being nothing.
    expect([...'className="text-[9px]"'.matchAll(SIZE)].map((m) => m[1])).toEqual(["9"]);
    expect([...'className="text-[13px] text-[16px]"'.matchAll(SIZE)].map((m) => m[1])).toEqual(["13", "16"]);
    expect([...'className="text-xs"'.matchAll(SIZE)]).toEqual([]);
  });

  it("the guarded surfaces are genuinely non-empty of sized text", () => {
    // If none of these files contained an arbitrary size at all, the floor test
    // would pass for the wrong reason.
    const total = SURFACES.reduce((n, rel) => n + [...read(rel).matchAll(SIZE)].length, 0);
    expect(total, "guarded surfaces contain no arbitrary sizes — is the list right?").toBeGreaterThan(50);
  });
});
