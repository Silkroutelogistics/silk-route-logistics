"use client";

import type { LucideIcon } from "lucide-react";

/**
 * Shared vertical icon-tab strip used by all right-side detail drawers
 * (Track & Trace, Waterfall, CRM). Applies the SRL gold icon system:
 *  - Active:   #FAEEDA bg, #BA7517 stroke, 2px left border, #854F0B label
 *  - Inactive: gray bg, gray stroke
 *  - Container 28px with 8px radius, icon 14px, stroke 1.5px rounded caps
 *  - 150ms transitions on hover and active-state changes
 *
 * Generic over the tab-id type so callers get exhaustive TypeScript checks
 * on their onChange handler.
 */
export interface IconTabDef<T extends string> {
  id: T;
  label: string;
  Icon: LucideIcon;
  /** Show a small red dot in the corner (e.g. open exception count) */
  alert?: boolean;
  /** Optional numeric badge top-right (not implemented as styled badge yet) */
  badge?: number;
}

interface IconTabsProps<T extends string> {
  tabs: IconTabDef<T>[];
  active: T;
  onChange: (tab: T) => void;
}

export function IconTabs<T extends string>({ tabs, active, onChange }: IconTabsProps<T>) {
  return (
    /* v3.8.awa — rail 64→68px, icon container 28→36px, icon 14→18px.
     *
     * The carrier pool ran its own rail at 66px with 18px icons while this
     * shared one was 64/14, so the two were four pixels of icon apart — close
     * enough to look like a mistake, far enough to read as inconsistent when
     * moving between drawers. Migrating the carrier pool onto this component
     * resolves that, and it is resolved UPWARD deliberately: this arc exists
     * because the drawers read as cramped, so unifying at the smaller of the
     * two sizes would have made four drawers worse to fix one inconsistency.
     *
     * Overflow: the rail SCROLLS — `overflow-y-auto` is on the very next line.
     * An earlier version of this comment read "the rail is a scroll-free column,
     * so its ceiling is the tab count times ~54px … verified against the drawer
     * floor height, see the arc's render proof." All three clauses were false:
     * the class contradicting it is one line below, a tab measured 62.5px not 54,
     * and render-proof.mjs runs every viewport at a height of 1000 and never
     * measures this rail at all. A comment citing a verification its own artifact
     * does not perform is worse than no comment.
     *
     * v3.8.awy geometry, with the arithmetic that chose it. At 1366×768 the
     * usable height is ≈640px. Twelve tabs at the old 62.5px needed 870px, so
     * four sat below the fold on first paint — a third of the navigation behind a
     * scroll gesture, and Quick Pay is last in the array AND role-filtered, so
     * the roles who can act on it were likeliest never to find it.
     *
     *   per tab = padY(0) + chip(32) + gap(2) + label(11, leading-none) = 45px
     *   total   = 8 + 12×45 + 11×4 + 8 = 600px  ≤ 640  ✓
     *
     * The glyph GREW while the rail shrank, which is not a trade-off: it was 18px
     * inside a 36px chip — 50% fill, 9px clear on every side — so growing it cost
     * no height and no width. Stroke is a flat 2, the skill's value for a button;
     * the old 1.5/2.5 split used the *marketing* weight when inactive and a value
     * on no scale when active, and the active state is already carried by the
     * indicator bar, the chip fill and the text colour.
     *
     * The hit target is unchanged and is not the chip: the button is `w-full`,
     * so it is the full 68px rail width × 45px.
     *
     * Still open, deliberately: the labels are sentence-case and untracked, which
     * is the 11px floor SIZE without the label SHAPE that earns it
     * (tokens.md §8). And there is no scroll affordance or scrollbar-gutter, so
     * on Windows a scrollbar would take ~15px of the 68 and "Compliance" would
     * wrap — latent, and only on a viewport this no longer overflows.
     */
    <div className="w-[68px] shrink-0 border-r border-gray-200 bg-gray-50 py-2 flex flex-col items-center gap-1 overflow-y-auto">
      {tabs.map(({ id, label, Icon, alert }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="group flex flex-col items-center gap-0.5 w-full transition-all duration-150 relative"
            aria-label={label}
            title={label}
          >
            <span
              className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r transition-all duration-150 ${
                isActive ? "bg-[#BA7517]" : "bg-transparent"
              }`}
            />
            <span
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 ${
                isActive ? "bg-[#FAEEDA]" : "bg-white group-hover:bg-gray-100"
              }`}
            >
              <Icon
                className={`w-6 h-6 ${
                  isActive ? "text-[#BA7517]" : alert ? "text-red-500" : "text-gray-400"
                }`}
                strokeWidth={2}
              />
            </span>
            <span className={`text-[11px] leading-none font-medium ${isActive ? "text-[#854F0B]" : "text-gray-500"}`}>
              {label}
            </span>
            {alert && <span className="absolute top-0 right-3 w-1.5 h-1.5 rounded-full bg-red-500" />}
          </button>
        );
      })}
    </div>
  );
}
