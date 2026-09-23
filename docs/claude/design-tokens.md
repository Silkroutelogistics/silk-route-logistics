# §2.1 — design tokens

Moved out of `CLAUDE.md` on 2026-09-23. **The `srl-brand-design` skill is canonical
for tokens, not this file** — §18.3 requires reading `references/tokens.md` from disk
at the moment of any brand claim, every time, because tokens change independently of
code. This section is the project-side record: which values are canonical, which are
LEGACY and live in the codebase, and which were synthesis errors that must not return.

That last part is why it is kept rather than deleted. `#0A2540` was once flagged here
as wrong and is canonical; `#F5EFE1` looks plausible and is a synthesis error. A
reader who only has the skill cannot tell a legacy value from a mistake.

Section numbers unchanged; see `README.md`.

---

### §2.1 Design tokens (primary source: designer handoff at project/colors_and_type.css, confirmed 2026-04-22)

**CANONICAL — Color (use for all new work)**

Navy scale:
- `--navy: #0A2540` — primary structural; confirmed canonical 2026-04-22 via designer handoff + pixel verification against `project/screenshots/v29-full.png`. Supersedes prior §2.1 synthesis-error flag.
- `--navy-900: #061629`
- `--navy-800: #0A2540` (alias of `--navy`)
- `--navy-700: #15365A`
- `--navy-600: #234A73`
- `--navy-500: #355E8A`
- `--navy-400: #5B7EA3`
- `--navy-300: #8AA5C0`
- `--navy-200: #BECEDE`
- `--navy-100: #E2EAF2`

Gold scale:
- `--gold: #C5A572` — primary accent (dividers, section labels, icons, wing). Role documented 2026-04-22 per designer handoff. Existing codebase usage of `#BA7517` as primary gold predates handoff; migration to role-correct usage tracked in future phases, not in v3.7.n.
- `--gold-dark: #BA7517` — CTA fills, hover emphasis, outbound links
- `--gold-light: #DAC39C`
- `--gold-tint: #FAEEDA` — active/selected row, subtle highlight

Cream / surface:
- `--cream: #FBF7F0` — page background
- `--cream-2: #F5EEE0` — alt row tint, sunken panels
- `--cream-3: #EFE6D3`
- `--white: #FFFFFF` — sparingly, card elevation only
- `--black: #000000` — never as text

Semantic foreground:
- `--fg-1: #0A2540` (primary text on cream)
- `--fg-2: #3A4A5F` (secondary, captions)
- `--fg-3: #6B7685` (tertiary, muted)
- `--fg-disabled: #A7AEB8`
- `--fg-on-navy: #FBF7F0`
- `--fg-on-navy-2: #C9D2DE`

Semantic background:
- `--bg-page: #FBF7F0`
- `--bg-surface: #FFFFFF`
- `--bg-surface-2: #F5EEE0`
- `--bg-navy: #0A2540`
- `--bg-navy-2: #15365A`

Borders + focus:
- `--border-1: rgba(10,37,64,0.10)`
- `--border-2: rgba(10,37,64,0.16)`
- `--border-strong: rgba(10,37,64,0.32)`
- `--border-on-navy: rgba(251,247,240,0.14)`
- `--focus-ring: 0 0 0 3px rgba(197,165,114,0.40)`

Status:
- `--success: #2F7A4F` / `--success-bg: #E6F0E9`
- `--warning: #B07A1A` / `--warning-bg: #FBEFD4`
- `--danger: #9B2C2C` / `--danger-bg: #F6E3E3`
- `--info: #2A5B8B` / `--info-bg: #E2EAF2`

**CANONICAL — Layout / Spatial / Motion**

Spacing (8px grid): 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 px

Layout:
- container-max: 1280px
- container-console: 1440px
- section-pad: 100px
- section-pad-console: 56px

Radii: 2 / 4 / 8 / 12 / 16 / 9999 px

Shadows (navy-tinted): Four-stop scale from `0 1px 2px rgba(10,37,64,0.06)` to `0 24px 48px rgba(10,37,64,0.18)`.

Motion:
- Ease: `cubic-bezier(0.2, 0.6, 0.2, 1)`
- Durations: 120 / 180 / 280 / 480 ms

**LEGACY (live in codebase, retained as-is)**

- `#0D1B2A` — themes.css light-default navy. Currently rendering in production. Superseded conceptually by `#0A2540` for new work. Not migrated in v3.7.n — code migration tracked separately when themes.css reconciliation is scheduled.
- `#854F0B` — dark gold used by `IconTabs` and `ContactsPanel`. Not in designer canonical set. Retained for existing surfaces. Do not introduce to new work; use `--gold-dark` (`#BA7517`) for emphasis or `--gold` (`#C5A572`) for accents per designer spec.
- `#0F1117`, `#1a1a2e`, `#0A1220` — AE Console and dark-mode navy surfaces. Designer handoff does not enumerate a dark-mode variant; these values retained as-is.
- `#faf9f7` — portal canvas. Superseded conceptually by `#FBF7F0` (`--cream`). Not migrated in v3.7.n.

**SUPERSEDED (prior synthesis errors — do not introduce)**

- `#F5EFE1` — prior §2.1 flagged this as synthesis error; flag retained. Nearest designer value is `--cream-2 #F5EEE0`. If this hex appears in code review, correct to `#F5EEE0`.
- Prior `#0A2540` synthesis-error flag removed — hex is now CANONICAL per designer handoff (above). Any future suggestion that `#0A2540` is incorrect should be treated as regression — verify against `project/colors_and_type.css` before changing.

**DEFERRED (not reconciled in v3.7.n)**

- **Typography** — designer handoff declares Playfair Display (display), DM Sans (body), Georgia (tagline-only: "Where Trust Travels."), and SF Mono (mono). Current §2.1 documented Georgia as primary for legal PDFs (BOL v2.8, QP Agreement v2, rate confirmation). Role reassignment deferred — will be reconciled in a dedicated commit, likely folded into v3.7.o when BOL PDF font embedding work begins (v3.7.o requires `*.ttf` assets from `project/fonts/` to be checked into the repo and loaded by PDFKit).
- ~~**Type scale, line-height, letter-spacing tokens** — deferred alongside typography reconciliation.~~ **SUPERSEDED 2026-08-31.** The UI type scale is ratified and lives in the brand skill (`references/tokens.md` §8 "UI type scale") — 11px labels / 12px dense cells / 13px secondary / 14px body / 16px lead, with a hard floor of 11px on every surface. Screen only; the display scale and the 9.5pt PDF/legal density are unchanged, so line-height and letter-spacing remain open. The deferral had a measurable cost: with nothing to conform to, the carrier drawer alone ran 9/10/11/12/14/15px — see `docs/audits/drawer-conformance-audit.md` §7.

---

