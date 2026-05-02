---
name: srl-brand-design
description: Apply Silk Route Logistics Inc. (SRL) brand identity to any deliverable — websites, PDFs (BOL v2.9, Rate Confirmation, Invoice, BCA v3.1, QP v2.1), decks, emails, social graphics, internal docs, or product UI. Use whenever a request involves SRL visual output, SRL document creation, "match the SRL brand," "use SRL colors," "Silk Route Logistics design," or any artifact bearing the SRL name. Also use proactively when generating ANY SRL-facing material — even casually mentioned (a quick proposal, a one-pager, a slide) — to ensure tokens, typography, voice, and surface-mode rules (web cream canvas vs print white canvas) are respected without the user having to specify every time. This skill is the canonical source of truth, reflects the designer handoff confirmed 2026-04-22 plus pixel-verified findings from BOL v2.9 production output (BOL-L6894191249, Apr 30 2026); do not improvise SRL colors, fonts, voice, or surface-mode rules from memory.
---

# Silk Route Logistics — Brand Design

This skill provides the canonical visual and editorial system for SRL artifacts, plus reusable code that handles the heavy lifting so you don't reinvent chrome on every BOL or Rate Confirmation.

> Tagline: **"Where Trust Travels."**
> Document tagline (PDFs/email): *"First Call. Last Update. Every Mile In Between."*
> Brand philosophy: **B2B freight credibility over visual spectacle.** Trust signals close deals, animation does not.

---

## How to use this skill

The skill is layered. Read what's relevant to the task, not all of it.

### 1. Identify the artifact type

| If the artifact is... | Read this first | Then use |
|---|---|---|
| A web/UI surface (page, component, dashboard, portal) | `references/tokens.md` | `scripts/srl_tokens.css` |
| A new SRL PDF (Rate Con, Invoice, packet) | `references/pdf-chrome.md` | `scripts/srl_chrome.py` |
| Production code in `pdfService.ts` | `references/pdf-chrome.md` | `scripts/srl_chrome.ts` |
| Email, deck, social, copywriting | `references/voice.md` | (text guidance only) |
| Migrating legacy hex values in existing code | `references/legacy-tokens.md` | (migration plan) |
| Anything else SRL-branded | `references/tokens.md` | judgment + the rest |

### 2. Use the bundled scripts when generating PDFs

**Don't hand-build chrome.** The scripts already encode the v2.9 production-validated header, meta strip, parties block, signature block, footer, and shipment table. Each future BOL/Rate Con/Invoice/cover should import from these:

- **Python (ad-hoc generation, ReportLab)** → `scripts/srl_chrome.py`
- **TypeScript (production `pdfService.ts`, PDFKit)** → `scripts/srl_chrome.ts`

Both expose the same building-block API:
- `draw_header_first_page` / `drawHeaderFirstPage` — logo, company info, tagline, gold rule, doc title, QR, TRACK label
- `draw_meta_strip` / `drawMetaStrip` — 6-field strip with em-dashes for empty fields, gold rules above and below
- `draw_parties_block` / `drawPartiesBlock` — two cream-2 accent panels (Shipper + Consignee)
- `draw_signature_block` / `drawSignatureBlock` — three columns separated by gold-dark vertical rules
- `draw_shipment_table` / `drawShipmentTable` — navy header band + alternating cream-2 rows + totals
- `draw_panel` / `drawPanel` — cream-2 sunken region (special instructions, released value, etc.)
- `draw_footer` / `drawFooter` — per-page footer with MC#/DOT#, tagline, Page X of Y
- `draw_continuation_header` / `drawContinuationHeader` — lighter chrome for page 2+

A new artifact should be ~30 lines of code: header + meta + body + signature + footer.

### 3. Use the CSS for web/UI

Drop `scripts/srl_tokens.css` into the page. It defines `:root` variables for every token plus base utility classes (`.srl-page`, `.srl-card`, `.srl-panel`, `.srl-btn-primary`, `.srl-divider`, `.srl-tagline`, `.srl-mono`, `.srl-label`). No need to copy hex values into component code.

For tooling that needs JSON (Tailwind config, Storybook, etc.), use `scripts/srl_tokens.json` — same tokens, same versioning, machine-readable.

---

## Critical rules (the things that must not drift)

These are the rules that have been costly when they've been broken. Everything else has rationale you can find in the references; these are short because they're the ones to internalize.

### Surface mode is different for web vs print

| Mode | Page canvas | Accent panels | Card elevation |
|---|---|---|---|
| **Web / UI** | `--cream` `#FBF7F0` | `--cream-2` `#F5EEE0` | `--white` |
| **Print / PDF** | `--white` `#FFFFFF` | `--cream-2` `#F5EEE0` | n/a |

Why print uses white, not cream: at scale (thousands of BOLs printed by carrier ops on warehouse and office printers), cream backgrounds don't reproduce true on most printers, waste meaningful toner over volume, and reduce contrast against navy text. The cream-2 accent panel pattern (parties cards, totals row, special instructions, released-value frame) creates section legibility without sacrificing print fidelity. Pixel-confirmed in `BOL-L6894191249`.

### Gold has two roles, do not collapse them

- `--gold` `#C5A572` → **structural**: rules, dividers, frames, QR border, header/footer rules, parties section divider
- `--gold-dark` `#BA7517` → **emphasis**: CTAs, hover states, small-caps labels, meta-row keys, signature column titles, tagline italic, vertical rules between signature columns, "TRACK" QR label, "Straight · Non-Negotiable" subtitles

Treating them as one color flattens the visual hierarchy and makes the document feel cheaper. The split is part of why SRL chrome looks more polished than typical broker paperwork.

### MC#/DOT# appears on every page footer

Per-page footer is mandatory for legal continuity. If pages get separated in carrier handling, every page must remain identifiable as SRL's authority. Earlier "exactly twice" guidance was wrong.

### QR codes belong on the BOL only

QR codes are an **operational scanning** element — drivers, warehouse staff, and dock workers scanning at pickup/transit/delivery to retrieve live shipment data. They belong on documents that physically travel with the load. That's the BOL.

QR codes do NOT belong on:
- **Rate Confirmations** — carrier email/portal artifact, no scan event in the workflow
- **Invoices** — AP staff use OCR/field-parsing tools (Tipalti, Concur, Bill.com), not scanners; the shipment is delivered by invoice time so there's nothing to track
- **BCAs / QPs** — master agreements signed once and filed, not handled by anyone with a scanner
- Statement of Account, Carrier Onboarding Packet, or any non-operational artifact

In `draw_header_first_page` / `drawHeaderFirstPage`, pass `include_qr=True` (Python) or `includeQr: true` (TS) **only when generating a BOL**. The default is False. For non-BOL documents, the right area of the header automatically renders the document identifier in monospace as a clean filing reference — no QR, no scanning affordance, no visual noise.

### Carmack citation is `49 U.S.C. § 14706`, not `49 CFR § 1035`

`49 CFR § 1035` is the obsolete pre-1996 citation. Using it on legal documents creates an internal inconsistency and signals careless drafting. This applies anywhere SRL legal text references the Carmack Amendment.

### BOL parties block has TWO blocks, not four

Shipper + Consignee only. Carrier and Broker identity is captured at signature time in the three-block signature layout (Carrier · Driver column has Carrier Legal Name, MC#, DOT#, Driver Name, etc.). Adding redundant Carrier/Broker blocks at the top crowds the form and is amateur-coded.

### Signature pattern is document-specific

| Document | Signature roles |
|---|---|
| **BOL** | 3 blocks: Shipper Rep + Carrier Driver + Consignee Receiver (`BOL_SIGNATURE_ROLES`) |
| **Rate Confirmation** | 1 block: Carrier Acceptance only (`RATE_CON_SIGNATURE_ROLES`). Shipper isn't a party; Consignee has no role. |
| **Invoice** | No signature block — payable instrument, POD attached separately |
| **BCA / QP cover pages** | 2 blocks: Broker authorized signatory + Carrier authorized signatory (`MASTER_AGREEMENT_SIGNATURE_ROLES`) |

**Don't reuse the BOL three-block pattern on a Rate Con, Invoice, or master agreement.** They're legally different instruments. The three-block pattern on a Rate Con implies Shipper and Consignee are parties to the rate agreement (they aren't), and includes piece counts that belong on chain-of-custody documents only. See `references/pdf-chrome.md` for the full matrix.

### Rate Confirmations need operational specifics that match industry standard

Rate Cons go to carriers who compare them against TQL, ECHO, Convoy, Coyote, and others before accepting. Missing operational fields cause friction (carrier calls to ask) or rejection (carrier picks a competitor's load instead). The chrome library exposes specific dataclasses for these fields:

- `RateBreakdown(linehaul, fuel_surcharge, accessorials, discount)` — itemized rate with FSC broken out separately, NOT a single all-in number
- `EquipmentSpec(type, length_ft, air_ride, swing_doors_only, pallet_exchange, temp_setpoint_f, temp_continuous, pre_cool_required, loading_method, unloading_method, stackable, tarp_required, linear_feet)` — all the operational requirements carriers need to evaluate
- `CarrierRequirements(cargo_insurance_min, auto_liability_min, general_liability_min, twic_required, hazmat_endorsement_required, fast_card_required, eld_required, team_drivers, bond_required)` — qualification + insurance restated from BCA so carrier doesn't need to look up
- `RateConTerms(detention_free_hours, detention_rate_per_hour, detention_max_per_stop, tonu_amount, layover_per_day, lumper_reimbursement, cancellation_window_hours, quick_pay_tier)` — operational policies

Plus dedicated drawing helpers (`draw_rate_breakdown`, `draw_equipment_spec`, `draw_carrier_requirements`, `draw_rate_con_terms`, `draw_lane_economics`).

**Common mistake to avoid**: generating a Rate Con with just the simple `meta_strip` and `parties_block` from BOL chrome. That's enough for a BOL where the load chain of custody is the focus, but a Rate Con audience is the carrier evaluating economics. Include FSC breakout, lane miles + transit + $/mile, equipment requirements, and operational terms — these are the fields carriers compare across competing offers.

A complete Rate Con typically spans 2 pages: page 1 has identity + lane + economics + terms; page 2 has carrier requirements + special instructions + acceptance signature. The chrome library supports this via `c.showPage()` and `draw_continuation_header`.

### Invoices need AP-facing reference fields and dispute terms

Invoice meta block should include `PRO #`, `BOL #`, `SERVICE` level, plus the standard administrative fields. Footnote should cover BCA reference, EIN, late-payment terms, and dispute window — not just BCA + Carmack. AP staff at sophisticated shippers use the dispute window to triage exceptions; without it, late disputes can drag on for weeks.

### Voice: SRL writes like a freight veteran, not a marketer

No "best-in-class," "world-class," "synergy," "revolutionary," "disrupting." No exclamation points in B2B documents. No emojis in formal SRL content. Verbs and numbers, not adjectives. See `references/voice.md` for full voice rules and the canonical naming convention (Marco Polo, Carvan vs The Caravan, Compass Engine, Lead Hunter, AE Console, Shipper Portal, Caravan Partner Program).

---

## Brand metadata (for cards, manifests, social, signature blocks)

- **Legal name**: Silk Route Logistics Inc.
- **Short name**: Silk Route Logistics / SRL
- **Tagline**: Where Trust Travels.
- **Operational tagline**: First Call. Last Update. Every Mile In Between.
- **Domain**: silkroutelogistics.ai
- **Public tracking**: silkroutelogistics.ai/track/{token} (or /tracking?token={loadNumber})
- **HQ**: 2317 S 35th St, Galesburg, MI 49053
- **Phone**: +1 (269) 220-6760
- **Email (general ops)**: operations@silkroutelogistics.ai
- **Email (executive)**: whaider@silkroutelogistics.ai
- **Authority**: USDOT 4526880 / Broker MC 1794414
- **Bond**: BMC-84 $75K (PFA Protects, CA# 0M18074, filed 2026-02-19)
- **Insurance**: Hancock & Associates — Contingent Cargo $100K, GL $1M, effective 2026-03-16
- **Governing law**: Michigan; venue: Kalamazoo County, Michigan

---

## Before delivery — quick checklist

- [ ] Surface mode correct: cream canvas for web, white canvas for print
- [ ] Canonical tokens only — no `#0D1B2A`, `#C9A84C`, `#A88535`, `#F8F5ED` in new work
- [ ] Gold role split respected (`--gold` structural vs `--gold-dark` emphasis)
- [ ] If PDF: per-page footer with MC#/DOT#, two-block parties (not four), three-block signature
- [ ] Carmack references use `49 U.S.C. § 14706`, never `49 CFR § 1035`
- [ ] Voice has operational specifics, no marketing softeners, no exclamation points in B2B
- [ ] Lucide icons only (web/UI work)
- [ ] Used the bundled scripts for chrome — didn't hand-build header/footer/signature

---

## File index (this skill)

```
srl-brand-design/
├── SKILL.md                      ← you are here
├── references/
│   ├── tokens.md                 ← full color/type/spacing/motion reference
│   ├── pdf-chrome.md             ← PDF document chrome rules (BOL, Rate Con, Invoice)
│   ├── voice.md                  ← voice + naming conventions
│   └── legacy-tokens.md          ← LEGACY hex bucket — only for migration work
└── scripts/
    ├── srl_tokens.css            ← drop-in :root stylesheet for web
    ├── srl_tokens.json           ← machine-readable tokens for tooling
    ├── srl_chrome.py             ← Python PDF builder (ReportLab)
    ├── srl_chrome.ts             ← TypeScript PDF builder (PDFKit)
    ├── srl_compass.svg           ← SRL compass mark, vector (preferred for web/Python)
    └── srl_compass_{60,120,240,480}.png   ← raster fallbacks (used by TypeScript/PDFKit)
```

## About the SRL compass mark

The compass mark — navy ring with cardinal star points and integrated gold trade-route curve — is the SRL primary brand symbol and ships bundled with this skill at `scripts/srl_compass.svg`.

The current SVG is a faithful vector trace of the BOL v2.9 production reference (`BOL-L6894191249`, Apr 30 2026). It matches the printed BOL output reliably. When a higher-quality master SVG is available from the designer, replace `srl_compass.svg` in this directory and the chrome libraries will pick it up without code changes. The PNG fallbacks (`srl_compass_60/120/240/480.png`) are pre-rasterized for environments that can't render SVG natively (PDFKit doesn't support SVG; Python via ReportLab + svglib does). When you replace the SVG, also regenerate the PNGs.

To regenerate PNGs after updating the SVG (Python with cairosvg):
```python
import cairosvg
for sz in [60, 120, 240, 480]:
    cairosvg.svg2png(url='srl_compass.svg', write_to=f'srl_compass_{sz}.png',
                     output_width=sz, output_height=sz)
```
