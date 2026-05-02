# Legacy Token Bucket — Migration Reference Only

This document exists for one purpose: when working in existing SRL production code, identify which hex values are LEGACY (in production but superseded) vs. canonical (current spec). It's not for new artifact generation — for that, use `references/tokens.md`.

> **If you're starting a new artifact, do not use anything in this file.** Close this and read `references/tokens.md` instead.

---

## Why legacy values exist

The canonical token set in this skill (v3.7.n CANONICAL bucket from `project/colors_and_type.css`, confirmed 2026-04-22) is the result of a designer reconciliation. Before that reconciliation, several different palettes were in production code at the same time:

- The original live website used one navy/gold combination
- Claude Design used another (now canonical)
- AE Console dark-mode surfaces had standalone colors
- The carrier portal used a third cream value

The reconciliation chose Claude Design's set as the canonical going-forward palette. **The other values weren't removed from production** — they were left in place to avoid breaking changes during a non-emergency migration. They're tracked here so future migration work can identify and replace them systematically.

---

## Legacy hex bucket

| Hex | Where it lives | Should become | Severity |
|---|---|---|---|
| `#0D1B2A` | `themes.css` light navy, live silkroutelogistics.ai | `#0A2540` (`--navy`) | **High** — primary navy on the marketing site |
| `#C9A84C` | live website gold | `#C5A572` (`--gold`) | **High** — primary structural gold on the marketing site |
| `#A88535` | live website gold-dark | `#BA7517` (`--gold-dark`) | **High** — CTA color on the marketing site |
| `#F8F5ED` | live website cream | `#FBF7F0` (`--cream`) | Medium — page canvas |
| `#854F0B` | `IconTabs`, `ContactsPanel` dark gold | retained as-is (not in canonical set) | Low — niche component |
| `#0F1117` | AE Console dark-mode surfaces | retained — designer didn't enumerate dark mode | Low — internal tool |
| `#1a1a2e` | AE Console dark-mode surfaces | retained — same reason | Low — internal tool |
| `#0A1220` | AE Console dark-mode surfaces | retained — same reason | Low — internal tool |
| `#faf9f7` | Portal canvas | conceptually `#FBF7F0` (`--cream`) | Medium |

---

## Migration approach

When asked to migrate legacy tokens to canonical:

1. **Don't do a blind find-and-replace.** Some legacy values are intentional (the AE Console dark-mode set is retained because dark mode wasn't enumerated in the designer handoff, so substituting would invent values rather than apply spec).
2. **Group by component family** rather than by hex value. A migration plan per file/directory is more reviewable than 200 cross-cutting token swaps.
3. **Visual diff before merging.** Generate before/after screenshots of any page or component touched by the migration. The whole point of a token system is that no visible change should occur — if there's a visible change, the token wasn't truly equivalent and the migration introduced design drift.
4. **Update tests and screenshots in the same commit.** If the codebase has visual regression tests, expected snapshots will need refreshing.
5. **Document the legacy-set retirement in MIGRATION.md** (or wherever the project tracks design-system changes). Future readers should be able to see what was changed and why.

---

## What new code should never do

- Introduce any of the legacy hex values in new components
- Reference legacy values by their old name (`--brand-navy`, `--accent-gold-old`, etc.) — these names should not exist in new code
- Use the legacy-cream `#F8F5ED` even in code that interfaces with the live marketing site — that site's migration is its own problem; new code uses canonical tokens regardless
- Pull from the live silkroutelogistics.ai CSS as a reference — that source is LEGACY and being migrated; the canonical source is `scripts/srl_tokens.css` in this skill

---

## When the legacy bucket can be retired

This document goes away when:

1. All `themes.css` instances of `#0D1B2A`, `#C9A84C`, `#A88535`, `#F8F5ED` have been migrated
2. Portal canvas value `#faf9f7` has been migrated
3. Any other surfaced legacy values have either been migrated or deliberately documented as retained-by-design (with the reason)

Until then, this file exists for migration referencing only.
