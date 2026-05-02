# SRL Design Tokens — Full Reference

**Source of truth**: `scripts/srl_tokens.json` and `scripts/srl_tokens.css`. Both ship with this skill. Never copy hex values into component code — link the CSS file or import the JSON.

---

## Why tokens

Each token has a stable name and a single hex value. Components reference `--gold-dark` rather than `#BA7517`. When the gold-dark hex is updated organization-wide, no component needs to change. This is also how brand consistency holds up over many people and many artifacts: the question "what's the right gold for this CTA?" has only one answer.

---

## 1. Navy scale (10-stop)

```
--navy-100  #E2EAF2    lightest tint, navy-on-cream backgrounds
--navy-200  #BECEDE
--navy-300  #8AA5C0
--navy-400  #5B7EA3
--navy-500  #355E8A
--navy-600  #234A73
--navy-700  #15365A    secondary surface, hover state on navy
--navy-800  #0A2540    primary structural — alias of --navy
--navy-900  #061629    deepest, used sparingly
```

Use `--navy` (= `--navy-800`) for primary text, document titles, headers, table header bands. The other steps are for variation and disabled states.

## 2. Gold scale (4-stop)

```
--gold        #C5A572   STRUCTURAL — rules, dividers, frames, QR border
--gold-dark   #BA7517   EMPHASIS — CTAs, hover, labels, tagline, vertical rules
--gold-light  #DAC39C
--gold-tint   #FAEEDA   active/selected row, subtle highlight
```

The split between structural and emphasis is mandatory and explained in `SKILL.md` (Critical rules → Gold has two roles).

## 3. Cream / surface

```
--cream     #FBF7F0    WEB page canvas only
--cream-2   #F5EEE0    accent panels (parties cards, alt rows, sunken regions)
--cream-3   #EFE6D3
--white     #FFFFFF    print canvas + web card elevation
```

`--cream-2` is the workhorse for both web and print. It's the same accent color regardless of surface mode, and it's the only legitimate way to introduce warmth into a print artifact (where the canvas is white).

## 4. Semantic foreground

```
--fg-1         #0A2540    primary text on cream and white
--fg-2         #3A4A5F    secondary, captions
--fg-3         #6B7685    tertiary, muted, footer text
--fg-disabled  #A7AEB8
--fg-on-navy   #FBF7F0    primary text on navy backgrounds
--fg-on-navy-2 #C9D2DE    secondary text on navy backgrounds
```

Never use pure black for text. `--fg-1` is dark enough to read and warmer than `#000`.

## 5. Semantic background

```
--bg-page-web    #FBF7F0    WEB only
--bg-page-print  #FFFFFF    PRINT/PDF only
--bg-surface     #FFFFFF    card elevation
--bg-surface-2   #F5EEE0    sunken panels — primary print accent
--bg-navy        #0A2540
--bg-navy-2      #15365A
```

The two `--bg-page-*` tokens make the web/print distinction explicit and keep components from accidentally inheriting the wrong canvas.

## 6. Borders + focus

```
--border-1        rgba(10, 37, 64, 0.10)    default
--border-2        rgba(10, 37, 64, 0.16)    prominent
--border-strong   rgba(10, 37, 64, 0.32)    dividers, table rules, signature underlines
--border-on-navy  rgba(251, 247, 240, 0.14)
--focus-ring      0 0 0 3px rgba(197, 165, 114, 0.40)
```

`--focus-ring` on every interactive element. This isn't optional — it's accessibility-mandatory.

## 7. Status

```
--success  #2F7A4F   --success-bg #E6F0E9
--warning  #B07A1A   --warning-bg #FBEFD4
--danger   #9B2C2C   --danger-bg  #F6E3E3
--info     #2A5B8B   --info-bg    #E2EAF2
```

Use status pairs together — text on its background. Don't invent new shades.

---

## 8. Typography

### Font families

```
--font-display: 'Playfair Display', Georgia, 'Times New Roman', serif
--font-body:    'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif
--font-tagline: Georgia, 'Times New Roman', serif
--font-mono:    'SF Mono', Menlo, Consolas, monospace
```

All four are licensed for commercial use:
- Playfair Display + DM Sans — Google Fonts OFL
- Georgia, SF Mono — system fonts

### Allowed weights

- **Playfair Display**: Regular 400, Bold 700 only — no medium, no semibold. Italic permitted for taglines.
- **DM Sans**: Regular 400, Medium 500, Bold 700.
- **Georgia**: Regular and Italic only. Used exclusively for "Where Trust Travels." tagline callouts in legal PDFs (BOL v2.9, BCA, Rate Con) and ceremonial moments.
- **SF Mono**: Regular only. Load IDs (`L6894191249`), PRO#, MC#/DOT# data, code blocks.

### Patterns

- **Hero / page title**: Playfair 700, `--fg-1`, sentence case (not all-caps)
- **Section heads**: Playfair 700, `--fg-1`, with thin gold rule (`border-bottom: 1px solid var(--gold)`)
- **Body**: DM Sans 400, `--fg-1`, line-height 1.55
- **Tagline ("Where Trust Travels.")**: Georgia italic, `--gold-dark`, tracked +0.02em
- **Document tagline ("First Call...")**: Playfair 400 italic, `--gold-dark`
- **Small-caps labels**: DM Sans 500, `--gold-dark`, `letter-spacing: 0.08em`, `text-transform: uppercase`, 11–12px
- **PDF/legal body**: 9.5pt DM Sans Regular for legal density
- **Tabular numerals**: `font-variant-numeric: tabular-nums` on every rate sheet, invoice line, dashboard number, tracking timestamp, BOL freight column

---

## 9. Spacing — 8px grid

```
--space-0:   0
--space-1:   4px    (tight inline gaps only)
--space-2:   8px    (base unit)
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
```

Multiples of 8px throughout. 4px allowed only for tight inline gaps (icon-to-text spacing in a button, etc.).

## 10. Radii

```
--radius-xs:  4px    small inputs, badges
--radius-sm:  6px    buttons, dense cards
--radius-md:  8px    cards, modals
--radius-lg: 12px    major surfaces, hero panels
```

Never round buttons fully. Pill shapes are reserved for status badges only.

## 11. Shadows (navy-tinted)

```
--shadow-1: 0 1px 2px rgba(10, 37, 64, 0.06)    hairline
--shadow-2: 0 2px 8px rgba(10, 37, 64, 0.08)    card resting
--shadow-3: 0 6px 16px rgba(10, 37, 64, 0.10)   card hover, dropdown
--shadow-4: 0 12px 32px rgba(10, 37, 64, 0.14)  modal, popover
```

Navy-tinted, not pure black. Pure black shadows feel cheap on cream.

## 12. Motion

```
--duration-fast:  150ms
--duration-base:  250ms
--duration-slow:  400ms
--ease-out:       cubic-bezier(0.2, 0.8, 0.2, 1)
--ease-in-out:    cubic-bezier(0.4, 0, 0.2, 1)
```

One signature motion moment per page maximum on web — see SKILL.md.

---

## 13. Iconography

- **Lucide** (`lucide-react@0.383.0`) — only icon library. No Heroicons, Phosphor, Font Awesome, Material.
- Stroke width: 1.75 default, 2 for buttons, 1.5 for marketing.
- Color: `currentColor` so icons inherit text color.
- Icons sit on the baseline grid with the text they label — no decorative-only icons.
