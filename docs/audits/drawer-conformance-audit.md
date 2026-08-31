# Drawer conformance audit — AE portal

**Date:** 2026-08-31 · **Scope:** every drawer/panel surface in the AE portal, plus the shipper portal for contrast · **Method:** static analysis of the working tree at `main`, plus git history for the original reference.

Written because the drawers read as cramped, the type reads as small, and document previews need zooming — and because it was unclear whether drawer style is uniform at all. It is not. The three complaints have three different causes.

---

## 1. The Owlery reference

The reference came in on a previous laptop and lives in git history, not in any session transcript:

| Commit | Date | Subject |
|---|---|---|
| `3b788999` | 2026-03-31 | Redesign Load Board: **Owlery-inspired** UX with status tabs, lane cards, **slide-out panel** |
| `7ecc3b8c` | 2026-04-03 | **Owlery-style carrier profile** + Compass audit trail + AI COI reader |

**The Owlery layout was never a drawer.** It was a **split pane**: the list column shrank, the panel took the remainder, both sized in percentages, in normal document flow. Nothing floated over anything.

### Carrier profile — `7ecc3b8c`

| Element | Value |
|---|---|
| List column (panel open) | `w-[40%] min-w-[340px]` |
| List column (idle) | `w-full` |
| Panel | `w-[60%]` |
| Panel height | `h-[calc(100vh-12rem)]`, `sticky top-0` |
| Gutter | `ml-3` |
| Icon tab rail | `w-[44px]` |
| Tab button | `44 × 40` |
| Active indicator | `w-[3px]` |
| Icon | `18 × 18` |
| Chrome | `border-l #1a2d47` · `bg #0c1829` · `rounded-r-xl` · `animate-slide-in-right` |

### Load Board — `3b788999`

| Element | Value |
|---|---|
| List column (panel open) | `w-[45%] shrink-0` |
| Panel | `w-[55%] shrink-0` |
| Panel height | `max-h-[calc(100vh-200px)]` |
| Gutter | `ml-4` |
| Status tab pill | `min-w-[180px]` |
| Search field | `min-w-[200px]` |
| Chrome | `bg-white/[0.03]` · `border-white/10` · `rounded-xl` · `transition-all duration-300` |

The accent in both was `#C9A84C`. That gold is non-canonical now — §2.1 puts structural gold at `#C5A572` and emphasis at `#BA7517`. If any of this is revived, the accent must not come with it.

---

## 2. Why the drawers feel small — a percentage was frozen into a pixel

Every detail drawer today is `w-full max-w-[720px]`. The AE sidebar is `220px`.

| Screen | Content area | Owlery 60% | Today | Shortfall | Drawer as % of content |
|---|---|---|---|---|---|
| 1366px | 1146px | 688px | 720px | — | 63% |
| **1440px** | **1220px** | **732px** | **720px** | **12px** | **59%** |
| 1600px | 1380px | 828px | 720px | 108px | 52% |
| 1680px | 1460px | 876px | 720px | 156px | 49% |
| 1920px | 1700px | 1020px | 720px | 300px | 42% |
| 2560px | 2340px | 1404px | 720px | 684px | 31% |

**720px is Owlery's 60% at a 1440px laptop.** The migration measured the reference on one screen and hardcoded the result. It is correct at exactly that width and progressively too narrow on everything larger — at 1920px the drawer occupies 42% of the content area where the reference occupied 60%, and at 2560px it is 31%.

This is the primary cause of "the drawers are small". It is not a type problem and not a preview problem; it is a fixed pixel standing in for a ratio.

---

## 3. Uniformity — five widths, two families

**No, drawer style is not uniform.** There are two independent families that share an animation and little else.

| Surface | Width | Family |
|---|---|---|
| `crm/CustomerDrawer` | `max-w-[720px]` | detail (hand-rolled) |
| `lead-hunter/ProspectDrawer` | `max-w-[720px]` | detail (hand-rolled) |
| `track-trace/LoadDetailDrawer` | `max-w-[720px]` | detail (hand-rolled) |
| `waterfall/WaterfallDrawer` | `max-w-[720px]` | detail (hand-rolled) |
| `drawer/CarrierEngagementDrawer` | `max-w-[720px]` | detail (hand-rolled) |
| `dashboard/carriers/page` | `max-w-[720px]` | detail, **inline** |
| `dashboard/loads/page` | `max-w-[720px]` | detail, **inline** |
| `ui/SlideDrawer` **default** | `max-w-2xl` = **672px** | form (shared base) |
| — as used: claims, training-courses, loads Tender | `max-w-md` = **448px** | form |
| — as used: dock-scheduling, fuel-tables | `max-w-lg` = **512px** | form |
| — as used | `max-w-xl` = **576px** | form |
| `shipper/ShipmentDetailDrawer` | `w-[420px]` | shipper portal |

**Five distinct widths in the AE portal: 448 / 512 / 576 / 672 / 720.** None derived from a token; each chosen at its call site.

### This has already produced a user-visible bug

`dashboard/loads/page.tsx` stacks drawers — the primary shifts left by the width of the secondary opening over it. Its own comment records the failure:

> *"The two secondaries are not the same size: Tender is `width="max-w-md"` (448px) and Advanced DAT takes SlideDrawer's default `max-w-2xl` (672px). A single 672px shift overshot Tender by 224px — exactly the gap Wasi flagged."*

The widths are now hand-synchronised across two files with a comment asking future readers to keep them in step. That is the cost of having no width token, and it has been paid once already.

---

## 4. Where conformance does hold

Worth stating so none of it gets "fixed" unnecessarily:

- **`IconTabs` is correctly shared.** `crm/IconTabs.tsx`, `track-trace/IconTabs.tsx` and `waterfall/IconTabs.tsx` look like copies but are thin wrappers that each supply a tab list and delegate rendering to `@/components/ui/IconTabs`. One implementation, three configurations — correct.
- **Five of seven detail drawers carry the full interaction contract**: `role="dialog"`, `aria-modal`, ESC, backdrop click-out, browser-back via `popstate`, and body scroll lock.
- **`SlideDrawer` is a genuinely good base** — it already implements all six behaviours in one place.

---

## 5. Where it breaks — the two inline drawers

The two busiest AE surfaces are the two never extracted into components, and they are missing the contract every other drawer honours:

| Behaviour | 5 extracted drawers | `carriers/page` | `loads/page` |
|---|---|---|---|
| `role="dialog"` | yes | **no** | **no** |
| `aria-modal` | yes | **no** | **no** |
| ESC to close | yes | yes | **no** |
| Backdrop click-out | yes | yes | **no** |
| Browser back closes | yes | **no** | **no** |
| Body scroll lock | yes | **no** | **no** |

`loads/page` has only a `lg:hidden` back button — on desktop there is no keyboard route out of it at all. Both scroll the page behind the open drawer.

This is §13.3 Item 63 (P0-1 / P1-1), partially closed in v3.8.aav for the extracted drawers. These two were never migrated.

---

## 6. The carriers rail is the one real tab-rail outlier

| | Shared `IconTabs` | `carriers/page` inline |
|---|---|---|
| Rail width | `w-16` (64px) | `w-[66px]` |
| Icon | `14 × 14` | `18 × 18` |
| Active indicator | `w-[2px]` | — |
| Label | `text-[10px]` | `text-[10px]` |
| Vertical rhythm | `py-4` · `gap-2` · `gap-0.5` | `pt-5` · `gap-3` · `gap-1.5` |

Two pixels of width and four pixels of icon apart — close enough to look like a mistake rather than a decision, far enough to read as inconsistent when moving between surfaces. It also carries **12 tabs** (Profile, Insurance, Compliance, Compass, Inspect, Perform, Activity, Documents, Info Req, Prefs, Training, Quick Pay) against 7–9 elsewhere, so it is the rail under the most pressure and the one not using the shared component.

---

## 7. Typography — there is no scale to conform to

Font sizes inside drawer surfaces, by occurrence:

| Surface | Distribution |
|---|---|
| `carriers/page` | `text-xs` ×156 · `text-[10px]` ×54 · `text-sm` ×32 · `text-[11px]` ×13 · `text-lg` ×7 · `text-2xl` ×7 · `text-xl` ×4 · **`text-[9px]` ×2** |
| `CarrierEngagementDrawer` | `text-xs` ×14 · `text-sm` ×9 · `text-[11px]` ×9 · `text-[10px]` ×4 · `text-lg` ×1 |
| `LoadDetailDrawer` | `text-[11px]` ×6 · `text-xs` ×3 · `text-sm` ×1 · `text-lg` ×1 |
| `CustomerDrawer` | `text-[11px]` ×2 · `text-[15px]` ×1 · `text-xs` ×1 · `text-sm` ×1 · `text-lg` ×1 · `text-[10px]` ×1 |

The dominant body size in the carriers drawer is **12px**, with 54 instances at 10px and two at 9px — below the 11px floor the brand's own utility CSS uses for its smallest label.

**Root cause: no canonical type scale exists.** `srl_tokens.css` declares exactly two font sizes (15px and 11px), both bound to specific utility classes rather than to a scale, and CLAUDE.md §2.1 lists *"Type scale, line-height, letter-spacing tokens — deferred alongside typography reconciliation."* Every surface therefore picked its own sizes, and four surfaces picked four different ad-hoc values (`9/10/11/15px`) alongside the Tailwind steps.

Resizing the drawers will not fix this. It is a separate defect with a separate fix.

---

## 8. The document preview

```
drawer                720px
  minus icon rail      66px
  minus px-6 padding   48px
  = content width     606px

A US-Letter page at 606px wide renders 784px tall.
The iframe is hardcoded to 500px  →  64% of one page visible.
```

A full letter-size page shows roughly two-thirds at a time in a 606px-wide column, which is why it needs zooming. Two independent contributors: the container is narrow (§2), and the viewport height is a fixed `500px` rather than a share of the drawer's own height.

---

## 9. Recommendation

Four changes, in dependency order. Deliberately not made as part of this audit.

1. **Replace the fixed width with a bounded ratio.** Something of the shape `min(60vw, 1100px)` with a floor near 640px restores the reference proportion, keeps line length readable on ultrawide, and matches Owlery's 60% at every screen instead of one. **This is the fix for the primary complaint.**
2. **Put that value in one token** and have all seven detail drawers and `SlideDrawer` read it. The loads stacked-drawer offset should be derived from it rather than hand-synchronised — that comment is a standing invitation to the same bug.
3. **Extract `carriers/page` and `loads/page` onto `SlideDrawer`,** or give them the six behaviours directly. `loads/page` having no desktop keyboard escape is the sharpest item in this audit and is independent of any resizing.
4. **Set a type scale** in the skill tokens and reconcile drawers to it, retiring the `9/10/11/15px` one-offs. This is the fix for "the font is small" and it does not depend on 1–3.

The preview box follows from (1): once the drawer is ratio-sized, the iframe should take a share of drawer height rather than a fixed 500px.

---

## What this audit did not do

- **Nothing was rendered.** Every number here is read from source. Widths, counts and arithmetic are exact; how they *look* has not been verified in a browser, and per §19 Sub-pattern 8 a layout change of this size needs a visual pass before it ships.
- **Font-size figures are occurrence counts, not weighted by rendered text volume.** A `text-xs` used once on a long paragraph and once on a chip count the same. They establish which sizes are in play and that no scale governs them; they do not measure how much of the surface reads at 12px.
- **No fix was applied.** This is the foundation for the resize decision, not the resize.
