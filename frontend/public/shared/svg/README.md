# SRL Brand Illustration System

Hand-authored SVG illustrations used across the marketing site. Each file is purpose-built for one page's job — not stock decoration. Replaces the AI-generated/stock-icon look that prior iterations of the site relied on.

## Design principles

- **Geometric, not painterly** — lines, circles, simple paths. B2B credibility, not visual spectacle (per `srl-brand-design/SKILL.md` line 9 verbatim).
- **Two-tone primary palette** — navy `#0A2540` + gold-dark `#BA7517` + gold `#C5A572`. Cream `#FDFBF7` and cream-2 `#F5EEE0` for backgrounds. Status colors (success `#2F7A4F`, danger `#9B2C2C`) only where they communicate state.
- **SVG vector, no PNGs** — scalable, crisp at every viewport, small payload.
- **Subtle animation** — CSS-driven or `<animate>` inline. No WebGL, no Three.js. Motion serves comprehension, not entertainment.
- **Meaningful symbolism** — every element ties to a specific brand claim (Compass Score 7 factors, MC#/DOT# on the trust seal, Caravan tier published fees, etc.). No generic warehouse-with-truck filler.

## Files

| File | Page | Communicates |
|---|---|---|
| `route-trace.svg` | `/track` | Live shipment route — origin, gold-marker current position, dotted future trail, destination |
| `compass-seven.svg` | `/carriers` | Compass Score 7-factor formula (per CLAUDE.md §9): 20/20/15/15/10/10/10 weight petals |
| `caravan-tiers.svg` | `/carriers` + `/shippers` | Three Caravan tiers (Silver/Gold/Platinum) with published Quick Pay fees + free-pay terms per §8 |
| `trust-stamp.svg` | `/shippers` | BOL document with gold authentication seal — "Where Trust Travels" stamp |
| `silk-road.svg` | `/about` | Stylized Silk Road trade curve across abstract continents — brand origin |
| `signal-converge.svg` | `/contact` | Three channels (phone/email/chat) converging on a central operations compass |
| `verify-shield.svg` | `/verify` | Shield + compass + checkmark — anti-fraud authentication of a Rate Confirmation |

## Usage

```html
<img src="/shared/svg/route-trace.svg" alt="Live shipment route" class="srl-illustration">
```

Or inline (allows CSS animation hooks on internal classes):

```html
<object data="/shared/svg/route-trace.svg" type="image/svg+xml" aria-label="..."></object>
```

For full CSS control over child elements (e.g. animating `.route-marker`), inline the SVG directly in the HTML body.

## Tokens used (verify before edit)

Every illustration uses the canonical brand tokens. If skill tokens change, update each SVG's literal hex values accordingly:

- `--navy` `#0A2540`
- `--gold-dark` `#BA7517`
- `--gold` `#C5A572`
- `--gold-light` `#DAC39C`
- `--cream` `#FDFBF7`
- `--cream-2` `#F5EEE0`
- `--fg-2` `#3A4A5F`
- `--fg-3` `#6B7685`
- `--success` `#2F7A4F`
- `--danger` `#9B2C2C`

## Adding new illustrations

1. Identify the page's specific job — what claim does the illustration prove?
2. Sketch symbolism that ties to a real SRL fact (MC#, Compass Score weight, Quick Pay fee, etc.) — not generic.
3. Author by hand in this directory; viewBox sized so the longest axis is 480–800 units.
4. Use only canonical tokens (hex values above).
5. Add to the table in this README.
6. Add a brief comment block at top of the SVG explaining what it communicates and why.

## Anti-patterns

- Stock trucks / warehouses / pallets — overdone, doesn't differentiate
- Gradient mesh / 3D shaders — reads as visual filler, not credibility
- AI-generated illustrations — current generation has tell-tale artifacts; brand-defining work still wins when hand-authored
- Bright primary colors outside the navy/gold palette
- Multi-color complexity — restraint is the brand
