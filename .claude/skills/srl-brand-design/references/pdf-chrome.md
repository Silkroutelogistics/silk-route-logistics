# SRL PDF Chrome Reference

The chrome system used by all formal SRL PDFs (BOL v2.9, Rate Confirmation, Invoice, Carrier Onboarding Packet, BCA cover, QP cover). Pixel-validated against `BOL-L6894191249` (Apr 30 2026).

**The bundled scripts implement everything below. Use `scripts/srl_chrome.py` (Python/ReportLab) or `scripts/srl_chrome.ts` (TypeScript/PDFKit) — don't hand-code chrome.** This reference exists for cases where you need to understand the design intent, debug a deviation, or render an artifact in a different toolchain.

> Print surface mode: white canvas, cream-2 accent panels, navy primary text. See SKILL.md for the rationale.

---

## Typography — read this before any face name below

Every face in this document is named by its **`FONT_*` constant**, never by a literal string. The constants are exported from both chrome copies (`scripts/srl_chrome.ts` :123-128, `scripts/srl_chrome.py` :156-161, mirrored at `backend/src/lib/srl-chrome.ts` :130-135):

| Constant | Registered face | Role |
|---|---|---|
| `FONT_BODY` | `DMSans-Regular` | body text, meta values, table cells |
| `FONT_BODY_BOLD` | `DMSans-Bold` | small-caps labels, party names, totals |
| `FONT_BODY_ITALIC` | `DMSans-Italic` | signature-column certifications |
| `FONT_DISPLAY_BOLD` | `Playfair-Bold` | document title |
| `FONT_DISPLAY_ITALIC` | `Playfair-Italic` | taglines, subtitles |
| `FONT_MONO_BOLD` | `Courier-Bold` | load IDs, document reference, TRACK label |

**These are REGISTERED faces, not built-ins.** They resolve only after `registerSkillFonts(doc)` (TS) or `register_skill_fonts()` (Python) has run; before that, the first `text()` throws "Font not found". That failure is deliberate — the pre-Sprint-47 library named PDFKit/ReportLab built-ins (`Helvetica`, `Times-Bold`, `Times-Italic`), which always resolve, so every PDF rendered off-brand *silently*. Naming registered faces converts a brand miss into a loud error.

Earlier revisions of this file specified `Helvetica` / `Times-Bold` / `Times-Italic` / `Helvetica-Oblique` at every site below. **The code has never rendered those since Sprint 47 (Item 101).** The point sizes in those revisions were correct and are unchanged; only the face names were wrong. If you find a literal built-in name anywhere in SRL chrome docs or code, it is a defect — no exceptions. The mono faces `Courier` and `Courier-Bold` *are* built-ins by design (the skill ships no custom mono TTF), but that is an exception about which **face** is legitimate, not a licence to name it literally: reach them through `FONT_MONO` and `FONT_MONO_BOLD` like every other face.

---

## Page geometry

- US Letter (8.5 × 11 in)
- Margins: 0.5 in (36 pt) on all sides
- Content area: 7.5 × 10 in (540 × 720 pt)

---

## Header — first page

Layout left → right:

1. **Compass mark** at top-left, 55×55 pt — this is the pixel-validated artefact. Both chrome copies call `drawCompassMark(doc, MARGIN, yTop, 55)` from the first-page header (`srl_chrome.ts` and `backend/src/lib/srl-chrome.ts`). The function's own default parameter is `50`, which no caller uses; the continuation header passes `30`. Earlier revisions of this file said 60×60 and never matched shipped output.
2. **Company info block** to the right of the mark:
   - Line 1: `SILK ROUTE LOGISTICS INC.` — `FONT_BODY_BOLD` 13pt, `--navy`
   - Line 2: `2317 S 35th St, Galesburg, MI 49053` — `FONT_BODY` 8.5pt, `--fg-2`
   - Line 3: `+1 (269) 220-6760  |  operations@silkroutelogistics.ai  |  silkroutelogistics.ai` — same style
   - Line 4: `MC# 1794414  ·  DOT# 4526880` — `FONT_BODY_BOLD` 8.5pt, `--fg-1`
   - Line 5 (italic tagline): `Where Trust Travels.` — `FONT_DISPLAY_ITALIC` 9pt, `--gold-dark`
3. **Right area** at top-right:
   - **For BOL only**: 75×75 pt QR code with `--gold` 0.75pt frame, **TRACK label** in small-caps `--gold-dark` below, human-readable load ID in `FONT_MONO_BOLD` 8.5pt below the label. QR error correction M (15%) — balances density and warehouse-print damage tolerance. URL: `https://silkroutelogistics.ai/track/{token}` (deep-link).
   - **For all other documents (Rate Con, Invoice, BCA, QP, etc.)**: clean monospace document identifier with `REFERENCE` small-caps label above. No QR, no TRACK label, no scanning affordance.

   Why this matters: QR codes are operational — they're for warehouse/driver scanning at pickup/transit/delivery, which is a workflow that exists for the BOL only. Rate Cons live in carrier email, Invoices live in shipper AP queues, master agreements live in filing cabinets. None of those documents get scanned in the field, so QRs on them are visual noise that signals a workflow that doesn't exist. Production references (Mainfreight invoices, ISG invoices, all standard freight Rate Cons) confirm: real industry documents in these categories don't carry QR codes.
4. **Top gold rule** across full width below the entire header block, 1pt `--gold`

---

## Document title and subtitle

- **Title**: `FONT_DISPLAY_BOLD` 22pt, `--navy`, drawn at left margin, ~12pt below the gold rule (e.g. `Bill of Lading`, `Rate Confirmation`, `Invoice`)
- **Subtitle**: `FONT_DISPLAY_ITALIC` 8.5pt uppercase, `--gold-dark`, ~14pt below the title (e.g. `STRAIGHT · NON-NEGOTIABLE`, `CARRIER-ISSUED · BINDING`)

---

## Meta strip — 6 to 8 fields

Below the title, runs full content width:

- Two gold rules bracketing the strip, both 0.5pt `--gold`
- **Minimum 6 columns, maximum 8**, always equal width. `drawMetaStrip` divides `CONTENT_W` by the number of entries passed, so the column count is set by the caller, not by the chrome.
- Each column: small-caps label (`FONT_BODY_BOLD` 6.5pt, `--gold-dark`, letter-spacing 0.08em) above value (`FONT_BODY` 10pt, `--fg-1`)
- **Empty fields render as em-dash `—`, never blank.** This is a consistency rule: blanks read as missing data; em-dash reads as "intentionally not applicable."

### The fit rule

Values are drawn with `lineBreak: false` and no cell inset, so a value wider than its column overprints the next column's value. **Every value must measure under `(CONTENT_W / n) − 4 pt` at body size** before a field is added.

Measured, at `CONTENT_W = 540`:

| n | colW | value budget (colW − 4) |
|---|---|---|
| 6 | 90.00 pt | 86.00 pt |
| 8 | 67.50 pt | 63.50 pt |

At the 8-cell Rate Confirmation setting, the widest value in the recorded fixture is the `DATE ISSUED` cell at roughly **58.6 pt** (DMSans-Regular 10pt), leaving about 8.9 pt of slack. That cell holds the render date, so the literal string in the capture is whatever day it was regenerated — illustrative, not a fixed value. A `MMM D, YYYY` date measures ~58–59 pt whether the day is one digit or two, so the slack figure holds. The widest label, `"DATE ISSUED"` at 45.81 pt, is never the binding constraint — values are.

The rule is empirical, not theoretical. The `QUICK PAY` cell once carried `"Standard Net-30"`, which measures **79.55 pt** — 12.05 pt wider than the 67.50 pt column — and overprinted the adjacent `TERMS` cell. It was shortened to `"Standard"` (42.39 pt); the neighbouring `TERMS` cell supplies the `Net-30` context.

### Field sets

- **BOL (6):** `DATE ISSUED · LOAD REF · EQUIPMENT · PRO# · SHIPPER REF · FREIGHT CHARGES`
- **Rate Confirmation (8):** `DATE ISSUED · LOAD REF · PICKUP · DELIVERY · PICKUP # · PO # · QUICK PAY · TERMS`

The two extra Rate Con cells are operationally load-bearing rather than decorative: a pickup number is what a driver hands the guard shack, and the PO is what the receiver matches against. Both fit inside the budget above.

---

## Parties block — two cream-2 panels

Below the meta strip, with a small-caps `PARTIES` label above:

- **Two equal panels** side by side, gap 12pt
- Each panel:
  - Background: `--cream-2` `#F5EEE0`
  - Border: 0.5pt `--border-1`
  - Border radius: 8pt
  - Padding: 10pt internal
- Left panel: Shipper · Pickup From
- Right panel: Consignee · Deliver To
- Inside each panel:
  - Role label (small-caps `--gold-dark` 6.5pt) at top
  - Party name (`FONT_BODY_BOLD` 11pt, `--navy`) below role
  - Address lines (`FONT_BODY` 8.5pt, `--fg-2`)
  - Contact line (`Contact: <name> · <phone>`, `FONT_BODY` 8.5pt, `--fg-1`)
  - Window line (`Window: <date> · <time-range>`, same style)

**Do not add Carrier and Broker blocks.** Carrier identity is captured at signature time in the three-block signature layout below.

---

## Shipment table

For BOL and Rate Con. Layout:

- **Header band**: full width, height 16pt, fill `--bg-navy`. Column labels in small-caps `FONT_BODY_BOLD` 7pt, `--fg-on-navy`, letter-spacing 0.08em.
- **Body rows**: 18pt height each, all rendered on the white canvas (no row fill). Cell text `FONT_BODY` 9pt, `--fg-1`. Empty cells render as `—`.
- **Totals row** (optional): full `--cream-2` band, `FONT_BODY_BOLD` 9pt, `--fg-1`. The totals row is the **sole accent band** in the table — that's how it earns visual weight at a glance.
- Columns use `tabular-nums` for numeric values.

### Column sets differ by document — this is deliberate

| Document | Columns (in render order) |
|---|---|
| **Bill of Lading** (8) | `PCS · TYPE · DESCRIPTION · DIMS (L×W×H) · WEIGHT · CLASS · NMFC# · HM` |
| **Rate Confirmation** (5) | `PCS · DESCRIPTION · WEIGHT · DIMS · HM` |

**`TYPE`, `CLASS` and `NMFC#` are LTL classification fields and do not belong on an SRL Rate Confirmation.** SRL brokers FTL. A grep for `NMFC` or `Freight Class` across all 16 rate confirmations in `docs/rc-references/` returns **zero matches** — no broker in the corpus prints them on a rate confirmation. The BOL keeps them because it is the chain-of-custody instrument and must stay LTL-capable.

**Order: the BOL runs `DIMS → WEIGHT`; the Rate Confirmation runs `WEIGHT → DIMS`.** The transposition is real, shipped, and recorded here so nobody "corrects" one to match the other and silently breaks a validated layout. On a Rate Con the carrier is checking weight against their equipment and `DIMS` is usually em-dash on FTL, so weight leads. Verify against the code before changing either: the BOL set is built in `pdfService.ts` `colDefs`, the Rate Con set in the `drawShipmentTable` call inside `generateEnhancedRateConfirmation`.

**Why no alternating row fills**: freight documents typically have 1-5 line items per shipment. Alternating fills are a spreadsheet convention that needs many rows to read as alternation; with 2-3 rows, the pattern looks unbalanced — especially adjacent to the cream-2 totals row, which then visually merges with the last data row. Keeping all data rows white preserves the totals row as the single accent and reads cleaner at the row counts SRL actually uses.

---

## Special instructions / Released value / other panels

Use cream-2 panel utility (`draw_panel` / `drawPanel`):

- Special instructions: full-width cream-2 panel, label `SPECIAL INSTRUCTIONS` in small-caps gold-dark, body text `FONT_BODY` 9pt fg-1
- Released value: cream-2 panel with `--gold-dark` 1pt frame; checkbox options for "Declared $___/lb" and "NVD"; shipper-initial line on the right; regulatory citation `Per 49 U.S.C. § 14706(c)` immediately below the panel in 7pt italic `--fg-3`

### `drawPanel` has two modes — pick by body shape

`drawPanel` takes an optional `wrap?: boolean`, **defaulting to false**:

- **`wrap` omitted or false** (single-line body) — renders `bodyText` with `lineBreak: false` into a panel of the caller-supplied height `h`. This is the original behaviour and is unchanged for every existing call site.
- **`wrap: true`** (multi-line free text) — measures the body with `heightOfString` at the panel's inner width and sizes the rect to the result. **`h` is ignored in this mode.**

The measure and the draw must use the same font, size, width and `lineGap`, since all four change wrapped height. The utility handles that internally; a hand-rolled panel must do it deliberately, and getting it wrong is how a panel ends up shorter than the text inside it.

Historical note worth keeping: before `wrap` existed, panels with free-text bodies were hand-framed in `pdfService.ts` with `roundedRect` + `fillAndStroke` + a manual measured text call, which is the deviation from "don't hand-build chrome" banked at CLAUDE.md §13.3 Item 94. **Special Instructions on the Rate Confirmation is still hand-framed and has not yet been migrated onto `wrap: true`.** New panels should use the utility; that one remains outstanding.

**Carmack citation MUST be `49 U.S.C. § 14706` (or `§ 14706(c)` for released-value).** The obsolete `49 CFR § 1035` is a flag for amateur drafting.

---

## Signature block — pattern depends on document type

**The signature block is document-specific. Don't reuse the BOL three-block pattern on a Rate Confirmation, Invoice, or master agreement — they're legally different instruments.** The chrome library exposes three pre-defined patterns:

| Document | Pattern | Signature roles | Why |
|---|---|---|---|
| **Bill of Lading** | `BOL_SIGNATURE_ROLES` (3 blocks) | Shipper Rep / Carrier Driver / Consignee Receiver | BOL is the legal document of title. Shipper attests to contents per 49 CFR 172, Carrier acknowledges receipt (Carmack chain begins), Consignee acknowledges delivery condition (Carmack claim window). All three required for chain of custody. |
| **Rate Confirmation** | `RATE_CON_SIGNATURE_ROLES` (1 block) | Carrier Acceptance only | Rate Con is a binding agreement between **Broker and Carrier** on rate + terms. Shipper isn't a party; Consignee has no role. Per BCA §4.1, Rate Con + BCA together = complete agreement for that shipment. The Broker's act of issuing the document is the Broker signature; the Carrier countersigns to accept. |
| **Invoice** | No signature block | n/a | Payable instrument issued by Carrier to Broker. POD is attached separately. No signature line on the invoice itself. |
| **BCA cover page** | `MASTER_AGREEMENT_SIGNATURE_ROLES` (2 blocks) | Broker authorized signatory + Carrier authorized signatory | Master agreement, signed once at relationship start. |
| **QP cover page** | `MASTER_AGREEMENT_SIGNATURE_ROLES` (2 blocks) | Broker + Carrier authorized signatories | Supplemental agreement, signed at QP enrollment. |

**Common mistake to avoid**: defaulting to `BOL_SIGNATURE_ROLES` for everything. The BOL three-block pattern is wrong on a Rate Con — it implies the Shipper and Consignee are parties to the rate agreement, which they aren't, and it includes piece counts (PIECES TENDERED / RECEIVED) which belong on chain-of-custody documents only.

---

## Signature block — three columns (BOL only)

When using `BOL_SIGNATURE_ROLES`, three equal columns separated by `--gold-dark` vertical rules (0.5pt). Standard BOL columns:

### Column 1 — Shipper · Representative
- Title: small-caps `--gold-dark` 7pt
- Certification: `FONT_BODY_ITALIC` 7.5pt, `--fg-2`, wrapping —
  > *"Certifies contents are properly classified, packaged, marked, and labeled per DOT regulations (49 CFR 172)."*
- Fields with underlines: SIGNATURE / PRINT NAME / PIECES TENDERED / DATE

### Column 2 — Carrier · Driver
- Title: small-caps `--gold-dark` 7pt
- Certification:
  > *"Acknowledges receipt of shipment in apparent good order, except as noted."*
- Fields: CARRIER LEGAL NAME / MC # / DOT # / DRIVER NAME / SIGNATURE / TRUCK # / TRAILER # / SEAL # / DATE

This is where Carrier identity is captured operationally — at the point of pickup signature.

### Column 3 — Consignee · Receiver
- Title: small-caps `--gold-dark` 7pt
- Certification:
  > *"Acknowledges delivery — any exceptions noted above."*
- Fields: SIGNATURE / PRINT NAME / PIECES RECEIVED / DATE

Field labels: small-caps `FONT_BODY_BOLD` 6.5pt, `--fg-3`. Underlines: 0.5pt `--border-strong`.

---

## Footer — every page (mandatory)

Per-page footer is required for legal continuity. If pages get separated in carrier handling, every page must remain identifiable.

- 0.75pt gold rule (`--gold`) across full width above the footer line
- Three-column row, all 7.5pt:
  - Left: `MC# 1794414  ·  DOT# 4526880  ·  silkroutelogistics.ai` (`FONT_BODY`, `--fg-3`)
  - Center: `Where Trust Travels.` (`FONT_DISPLAY_ITALIC` 8pt, `--gold-dark`)
  - Right: `Page X of Y` (`FONT_BODY`, `--fg-3`)

---

## Continuation page header (page 2+)

Lighter than page 1 — no QR, no full company info, no big tagline:

- Compass mark at top-left, 30×30pt
- Right of mark: `SILK ROUTE LOGISTICS INC.` (`FONT_BODY_BOLD` 11pt, `--navy`), then `<DocID> · <DocTitle> (continued)` (`FONT_BODY` 8pt, `--fg-3`) below
- Right side: `<DocID>` repeated (`FONT_BODY_BOLD` 9pt, `--fg-1`)
- Thin gold rule (0.5pt `--gold`) below

---

## Document tagline placement

The italic operational tagline `First Call. Last Update. Every Mile In Between.` appears **once per document maximum**. Typical placement is the cover-page footer or beneath the company info block on page 1, set in `FONT_DISPLAY_ITALIC` (Playfair Display Italic) 9pt, `--gold-dark`. It does NOT appear in the header.

The shorter tagline `Where Trust Travels.` lives in:
- Page 1 header, in the company info block (line 5)
- Per-page footer center column

---

## Tracking page (target of QR)

The QR resolves to the public tracking page:
- Primary: `silkroutelogistics.ai/track/<token>`
- Alternate canonical: `silkroutelogistics.ai/tracking?token=<loadNumber>`

Token-based, no auth required. PII-scoped (carrier shows as `—`, no rate visible). Renders: load card, 4-stage progress, last known location, ETA with confidence, 9-stage milestone timeline, contact footer.

---

## Quickstart with `srl_chrome.py`

```python
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pagesizes import LETTER
from srl_chrome import (
    register_skill_fonts,
    draw_header_first_page, draw_meta_strip, draw_parties_block,
    draw_signature_block, draw_footer, draw_shipment_table, draw_panel,
    draw_continuation_header,
    Party, BOL_SIGNATURE_ROLES,
)

# REQUIRED before any draw_* call. Every chrome function names a registered
# face (FONT_BODY etc.), so an unregistered face raises KeyError on the first
# setFont. reportlab's font registry is process-global, so this takes no
# canvas and is idempotent — call it once at startup.
register_skill_fonts()

c = Canvas("bol.pdf", pagesize=LETTER)

y = draw_header_first_page(
    c,
    doc_title="Bill of Lading",
    subtitle="Straight · Non-Negotiable",
    qr_url=f"https://silkroutelogistics.ai/track/{load_id}",
    load_id=f"BOL-SRL-{load_id}",
    # REQUIRED for the QR to render. include_qr defaults to False, and the
    # draw gate is `include_qr and qr_url and _HAS_QR` — passing qr_url alone
    # silently produces a BOL with no QR and no TRACK label. BOL only; every
    # other document leaves it False and shows load_id as a filing reference.
    # _HAS_QR is a module-level probe, so the `qrcode` package must be installed.
    include_qr=True,
)

y = draw_meta_strip(c, {
    "DATE ISSUED":     date_str,
    "LOAD REF":        load_id,
    "EQUIPMENT":       equipment,
    "PRO #":           pro_num,
    "SHIPPER REF":     shipper_ref,
    "FREIGHT CHARGES": freight_terms,
}, y_top=y - 4)

y = draw_parties_block(c, shipper_party, consignee_party, y_top=y - 4)

# ... your shipment table, panels, etc. ...

y = draw_signature_block(c, y_top=y - 4)

draw_footer(c, page_num=1, total_pages=2)
c.showPage()

# Page 2 — terms and conditions
y = draw_continuation_header(c, doc_title="Bill of Lading",
                             doc_id=f"BOL-SRL-{load_id}")
# ... terms body ...
draw_footer(c, page_num=2, total_pages=2)

c.save()
```

## Quickstart with `srl_chrome.ts` (production `pdfService.ts`)

```typescript
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import {
  registerSkillFonts,
  drawHeaderFirstPage, drawMetaStrip, drawPartiesBlock,
  drawSignatureBlock, drawFooter, drawShipmentTable,
  PAGE_W, PAGE_H, MARGIN,
} from './srl_chrome';

export async function generateBOL(load: Load): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0 });

  // REQUIRED, immediately after construction and before any chrome call.
  // Every chrome function names a registered face (FONT_BODY etc.); without
  // this, PDFKit throws "Font not found" on the first text() inside
  // drawHeaderFirstPage. Also installs the ligature suppression that keeps
  // "Rate Confirmation" from rendering as "Rate Confrmation".
  registerSkillFonts(doc);

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));

  const qrBuffer = await QRCode.toBuffer(
    `https://silkroutelogistics.ai/track/${load.id}`,
    { errorCorrectionLevel: 'M', type: 'png', margin: 1, width: 150 }
  );

  let y = drawHeaderFirstPage(doc, {
    docTitle: 'Bill of Lading',
    subtitle: 'Straight · Non-Negotiable',
    qrUrl: `https://silkroutelogistics.ai/track/${load.id}`,
    loadId: `BOL-SRL-${load.id}`,
    qrBuffer,
    // REQUIRED for the QR to render. includeQr defaults to false and the draw
    // gate is `includeQr && qrBuffer` — without this the awaited QRCode.toBuffer
    // work above is discarded and the BOL ships with no QR and no TRACK label.
    // BOL only; every other document omits it and shows loadId instead.
    includeQr: true,
  });

  // ... rest of the document ...

  drawFooter(doc, { pageNum: 1, totalPages: 2 });
  doc.end();

  return new Promise(resolve =>
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  );
}
```

---

## Invoice anatomy — different building blocks

Invoices target accounts-payable staff at the shipper, not the operational chain. The BOL/Rate Con building blocks (parties block, big meta strip, signature block) don't fit. Invoices use different blocks, validated against production references (Mainfreight invoice 3507026 / BEENATDFW; ISG invoice 2168245 / BEENATUSA — both received by BKN AP, May 2026).

### Required invoice blocks

| Block | Function | Position | Notes |
|---|---|---|---|
| **Bill To** | `draw_bill_to_block` | Top-left | Name, address (window-envelope ready), Customer Account code in monospace |
| **Invoice meta** | `draw_invoice_meta_block` | Top-right | Right-aligned key/value pairs: Invoice #, Date, Due Date, Terms, Load Ref, Pick-Up, Delivery, PO Numbers |
| **Lane reference** | `draw_lane_reference_row` | Below Bill-To/Meta | Slim "SHIPPER / RECEIVER" row bracketed by gold rules. Informational, NOT a parties block. |
| **Shipment table** | `draw_shipment_table` | Middle | Single-row for FTL, multi-row for LTL. Same chrome as BOL/Rate Con. |
| **Charges** | `draw_charges_block` | Right side, below table | Line items (Freight, Fuel Surcharge, Accessorials) → dashed rule → bold Total USD |
| **Settlement summary** | `draw_settlement_summary` | Below Charges | Cream-2 panel: Invoice Amount / Amount Paid / Balance Due |
| **Remit To** | `draw_remit_to_block` | Lower-left | SRL legal name, mail address, ACH/wire details |
| **Payment reference** | `draw_payment_reference` | Below Remit-To | Cream-2 box with monospace `<ACCOUNT> <LOAD_ID> <INVOICE_NUM>` for wire memo |
| **Governing terms footnote** | manual | Above footer | "Subject to BCA v3.1 dated Feb 26, 2026 and Rate Confirmation. Carmack: 49 U.S.C. § 14706. Michigan law, Kalamazoo County." |

### Customer account code convention

Carriers assign each shipper a customer account code for AP matching:
- Mainfreight uses `BEENATDFW` (BKN + destination market DFW)
- ISG uses `BEENATUSA` + numeric customer #131202

SRL convention: `<3-char shipper>SRL` — e.g. `BKNSRL`, or for variants by market `BKNSRLDFW`. Use the same code consistently across all invoices to that customer so AP can train their matching rules once.

### Invoice numbering convention

`INV-SRL-<YYYY>-<NNNN>` — year-prefixed, four-digit sequence per year. Examples:
- `INV-SRL-2026-0001` (first invoice of 2026)
- `INV-SRL-2026-0042` (forty-second invoice of 2026)

Year boundary resets the counter, makes year-end accounting cleaner, and the prefix `INV-SRL` makes the document type unambiguous in customer AP systems.

### Payment reference string

Format: `<CUSTOMER_ACCOUNT> <LOAD_ID> <INVOICE_NUM>` separated by double-spaces.

Example: `BKNSRL  L1234  INV-SRL-2026-0001`

This is what AP staff put in the wire memo field. SRL's reconciliation tooling (QuickBooks Online + manual matching) parses this string to auto-clear the invoice on payment receipt. **The order matters** — customer account first so the wire is identifiable even if the load ID is mistyped.

### What invoices DON'T have

- **No signature block.** Invoice is a payable instrument, not a binding agreement. Binding terms come from the BCA + Rate Confirmation (referenced in the governing-terms footnote).
- **No QR-to-tracking.** The shipment is already complete by the time an invoice is issued. Optional QR could link to the customer portal invoice page for online payment, but that's a future feature.
- **No Special Instructions panel.** Invoices don't have operational instructions — they're a billing document.
- **No Released Value declaration.** That's BOL-only.

### Quickstart with `srl_chrome.py` (Invoice)

```python
from srl_chrome import (
    register_skill_fonts,
    draw_header_first_page, draw_footer,
    draw_bill_to_block, draw_invoice_meta_block, draw_lane_reference_row,
    draw_shipment_table, draw_charges_block, draw_settlement_summary,
    draw_remit_to_block, draw_payment_reference,
    BillTo, InvoiceCharge, RemitTo, FONT_BODY_ITALIC,
    MARGIN, FG_3,
)

register_skill_fonts()   # REQUIRED before any draw_* call — see BOL quickstart

c = Canvas("invoice.pdf", pagesize=LETTER)

y = draw_header_first_page(c, doc_title="Invoice",
                            subtitle="Per Broker-Carrier Agreement v3.1",
                            qr_url=None, load_id=invoice_num)

# Bill-To (left) + meta (right) — parallel blocks
bill_to = BillTo(name=customer_name, address_lines=customer_address,
                 customer_account=customer_account_code,
                 attention="Accounts Payable")
y_left  = draw_bill_to_block(c, bill_to, y_top=y)
y_right = draw_invoice_meta_block(c, {
    "INVOICE NUMBER": invoice_num,
    "INVOICE DATE":   issue_date,
    "DUE DATE":       due_date,
    "TERMS":          "Net-30",
    "LOAD REF":       load_id,
    "PICK UP":        pickup_date,
    "DELIVERY":       delivery_date,
    "PO NUMBERS":     " · ".join(po_list),  # multiple POs separated by middle-dot
}, y_top=y)

y = min(y_left, y_right) - 12

y = draw_lane_reference_row(c,
    shipper_name=shipper_name, shipper_city=shipper_city,
    receiver_name=receiver_name, receiver_city=receiver_city,
    y_top=y)

y = draw_shipment_table(c, headers=[...], rows=[...], y_top=y)

# Lower section — Remit-To (left), Charges + Settlement (right)
y_remit = draw_remit_to_block(c, remit_to_info, y_top=y - 12)
y_charges = draw_charges_block(c, [
    InvoiceCharge("Freight Charges", 4500.00),
    InvoiceCharge("Fuel Surcharge",  450.00),
], y_top=y - 12)
draw_settlement_summary(c, invoice_amount=4950.00, amount_paid=0.00,
                        y_top=y_charges - 8)
draw_payment_reference(c, account=customer_account_code,
                       load_id=load_id, invoice_num=invoice_num,
                       y_top=y_remit - 12)

# Governing-terms footnote, just above footer
foot_y = MARGIN + 60
c.setFont(FONT_BODY_ITALIC, 7.5)
c.setFillColor(FG_3)
c.drawString(MARGIN, foot_y,
             "Subject to the SRL Broker-Carrier Agreement Version 3.1 dated "
             "February 26, 2026 and the Rate Confirmation issued for this load.")
c.drawString(MARGIN, foot_y - 10,
             "Carmack Amendment: 49 U.S.C. § 14706.  Disputes governed by Michigan law, "
             "venue Kalamazoo County. See silkroutelogistics.ai/legal for full terms.")

draw_footer(c, page_num=1, total_pages=1, doc_id=invoice_num)
c.save()
```

---

## Rate Confirmation anatomy — operational fields

Rate Cons go to carriers, who compare them against TQL, ECHO, Convoy, Coyote, and other broker offers before accepting. Missing operational fields cause friction (carrier calls to ask) or rejection (carrier picks a competitor's load). Cross-validated against the TIA Watson Model Rate Confirmation template and current production Rate Cons from major brokers, May 2026.

### Rate Con blocks — full render order

The shipped Rate Confirmation emits **21 body blocks**, counted excluding the page chrome documented elsewhere in this file (the continuation header, drawn once per page break, and the per-page footer). An earlier revision of this table listed 11 blocks plus a page-break row and described a document that has not existed for several sprints: **ten blocks were rendering and appeared nowhere here.**

Read `generateEnhancedRateConfirmation` in `backend/src/services/pdfService.ts` for the authoritative order, and `docs/rc-references/_CURRENT_SRL_RC_RENDERED.txt` for extracted output with Y coordinates.

**Regenerate that fixture with `backend/scripts/verify-rc-matrix.ts` before trusting it, and believe the code over the capture whenever they disagree.** A stale two-page capture is exactly how the page map below was wrong for several sprints: it was read off a fixture that predated the pagination work, so it recorded one page break where the document ships three pages and two breaks.

### Page map — current behaviour, not a guarantee

Numbering is render order and runs 1–21 unbroken. The footer is stamped on every page at the end. Against a representative load the document breaks as:

| Page | Blocks |
|---|---|
| **1** | #1 through #13, ending after **#13 OPERATIONAL TERMS** |
| **2** | **#14 DOCK & DISPATCH**, #15, #16, #17 GOVERNING TERMS (+ #18 when temp-controlled) |
| **3** | **#19 INVOICING**, #21 CARRIER · ACCEPTANCE |

**None of these positions are fixed.** Only the page-1 → page-2 break is unconditional (a bare `doc.addPage()` after the dock block). Every later break is produced by the `rcEnsureRoom(needed)` guard, which starts a new page — with a continuation header, since PDFKit's own auto-pagination would emit a bare page without one — whenever `y + needed` would pass `RC_CONTENT_FLOOR`. The guards in force are `rcEnsureRoom(60)` before TEMPERATURE CONTROL, `rcEnsureRoom(160)` before INVOICING (sized to keep the payment instructions, the anti-fraud line and the tender banner together), and `rcEnsureRoom(232)` before the signature block. Content length therefore moves the breaks: a load with long special instructions or per-load custom terms pushes blocks down, and a short one pulls them up.

**#14 DOCK & DISPATCH is placed by measurement, not by position.** It is measured against the remaining page-1 space and drawn on page 1 when it fits, otherwise deferred to lead page 2. The map above shows the deferred case, which is what a real load with lane economics produces. Its heading is drawn inside the block so the label travels with the body rather than stranding on page 1.

So: read the map as a description of what currently renders, re-derive it from the code when it matters, and do not encode any of these page positions as an invariant.

**Always rendered:**

| # | Block | Function | Data needed |
|---|---|---|---|
| 1 | **Header** | `draw_header_first_page` | `include_qr=False` (no QR on Rate Con) |
| 4 | **Meta strip** | `draw_meta_strip` | 8 cells — see the field set above. Values must fit the budget. |
| 5 | **Parties block** | `draw_parties_block` | Shipper + Consignee with **dock** contacts (not the billing contact) and appointment windows with times |
| 7 | **Equipment spec** | `draw_equipment_spec` | `EquipmentSpec` — type, plus setpoint / run mode / pre-cool when temp-controlled |
| 8 | **CARRIER · ASSIGNED** | hand-built cream-2 panel | Carrier legal name, MC#, DOT#, dispatch contact |
| 10 | **Shipment table** | `draw_shipment_table` | FTL set: `PCS · DESCRIPTION · WEIGHT · DIMS · HM` |
| 11 | **Rate breakdown** | `draw_rate_breakdown` | `RateBreakdown` — linehaul + FSC + accessorials + total |
| 12 | **QUICK PAY** | hand-built cream-2 panel | Always drawn; swaps content — a 4-cell tier grid when a Caravan tier is set, a fee-schedule nudge panel when it is not |
| 13 | **Operational terms** | `draw_rate_con_terms` | `RateConTerms` — detention (rate, free hours, **per-stop cap**), TONU, layover, lumper, cancellation, **Quick Pay** (a `QUICK PAY` cell is appended to the grid whenever `quickPayTier` is set; `pdfService.ts` passes the resolved Caravan tier, so it prints on any load that has one) |
| 14 | **DOCK & DISPATCH** | hand-built text block | Driver/truck/trailer fill-in line, dock check-in identity, seals, check-call clock, OS&D, detention evidence |
| 15 | **Carrier requirements** | `draw_carrier_requirements` | `CarrierRequirements` — insurance minimums, tracking acceptance |
| 17 | **GOVERNING TERMS** | hand-built text block | Broker-status statement, BCA incorporation + precedence, acceptance clause, accessorial approval, TONU qualification, paperwork deadline |
| 19 | **INVOICING** | hand-built text block | Remit-to address, subject-line format, required attachments, when the payment clock starts — **plus the anti-fraud domain anchor** |
| 21 | **Signature block** | `draw_signature_block` | `RATE_CON_SIGNATURE_ROLES` (Carrier Acceptance only), plus the return-channel instruction below it |

**Conditional — renders only when its data is present:**

| # | Block | Condition |
|---|---|---|
| 2 | **AE header sub-line** | the load carries a poster relation; renders `AE: <name> · <phone>` |
| 3 | **Verify-this-RC URL** | the load has an id; prints the per-load verification URL |
| 6 | **Lane economics** | `load.distance` is set and > 0 → MILES / TRANSIT / $/MILE pills |
| 9 | **DRIVER & EQUIPMENT** | any of driver name, driver phone, truck #, trailer # is set — driver assignment can post-date RC issue |
| 16 | **Special instructions** | per-load notes, pickup/delivery instructions, or appointment flag present |
| 18 | **TEMPERATURE CONTROL** | the load is temperature-controlled. Not optional when it applies — see below |
| 20 | **TENDER EXPIRES banner** | an OFFERED/ACCEPTED tender exists with `expiresAt` in the future; escalates amber → red under 2 hours |

The recorded cases in `_CURRENT_SRL_RC_RENDERED.txt` do not exercise every conditional — **#9 (DRIVER & EQUIPMENT) and #20 (TENDER EXPIRES banner) are absent from it**, because the matrix fixtures carry no driver assignment and no live tender. The other conditionals do render there: #2 (AE header sub-line), #3, #6, #16 (SPECIAL INSTRUCTIONS) in every case, and #18 in the reefer case. So **do not treat that fixture as the full block inventory** under any circumstances, freshly regenerated or not. It captures the cases the matrix runs, not the union of every conditional.

> This sentence previously listed #2 and #16 as absent as well. They were, in an older two-page capture; they have rendered since the fixtures gained a poster relation and special instructions, and the claim was not re-checked when the capture was regenerated. Re-verify each conditional against the *current* file before quoting this list — the paragraph is warning about exactly the failure it once contained.

### Why the ten additions are staying

Frequencies below name their denominator, because the corpus was re-derived and the denominators changed. `docs/rc-references/README.md` is explicit that a frequency quoted without its denominator is the exact error that file exists to prevent.

- **TEMPERATURE CONTROL** — setpoint + run mode appear in **4 of 4** rate confirmations of the first retrieval pass (README, "Gaps this corpus exposed"). Conditional on a temperature-controlled load. The block carries the conflict procedure; the numbers themselves print on page 1 under EQUIPMENT, so the two cannot drift.
- **DOCK & DISPATCH** — driver capture **4 of 4**, truck/trailer **3 of 4**, seal handling **4 of 4**, check-call clock time **2 of 4**, all over that same 4-document denominator. The dock check-in identity line is **0 of 18** and ships anyway: it is an anti-fraud instruction to an honest driver, not a restatement of the BCA's re-brokering covenant, which binds the carrier instead.
- **INVOICING** — recorded as **5 of 5** in a `pdfService.ts` comment over the five documents Wasi supplied before the retrieval passes. **This frequency is not in README.md and has not been re-derived over the current 16-document corpus** — treat it as unverified at that denominator until it is. The block exists because the Rate Con previously stated when paperwork was due but never where to send it, what to attach, or when the payment clock starts, leaving an undefined clock under a published Net-30/21/14 commitment.
- **CARRIER · ASSIGNED** — no corpus frequency has been derived. Justified on the grounds that the signature block alone gives no at-a-glance carrier identity, and that major brokers surface carrier identity in a body section above the commodity line. Treat that as a design argument, not a measured frequency.
- **GOVERNING TERMS** — required by the document architecture confirmed by counsel: substantive covenants live in the BCA, and the Rate Confirmation stays a clean operational form that incorporates it by reference. That incorporation, the precedence rule, and the acceptance clause have to be *on* the document for the reference to bind. The broker-status sentence is a `49 CFR 371.7` compliance line that none of the reference documents carried.

The remaining five are SRL-specific or render conditionally, and are not corpus-driven — do not go looking for a frequency behind them:

- **AE header sub-line** and **DRIVER & EQUIPMENT** — pure data-availability gates. The AE line needs a poster relation on the load; the driver row exists because driver assignment routinely post-dates RC issue, so printing an empty row would be worse than printing none.
- **Verify-this-RC URL** — ahead of the corpus rather than drawn from it; none of the reference documents carry a verification URL. It has a known structural limit: a forger prints their own lookalike URL, which is why it is paired with the domain anchor in **INVOICING** rather than relied on alone.
- **QUICK PAY** — SRL's Caravan Partner Program, so no external analogue exists. The panel is always drawn; only its contents switch, which keeps the layout below it stable whether or not a tier is set.
- **TENDER EXPIRES banner** — an SRL workflow artefact, not a freight-industry convention.

**Do not delete a block from this document without re-reading `docs/rc-references/README.md` first.** Several of these exist because a real carrier-facing failure was traced to their absence.

### Why FSC must be broken out

Carriers price loads by linehaul $/mile, with FSC as a separate cost-recovery line that fluctuates with diesel prices. A Rate Con showing only "RATE: $2,800" forces the carrier to assume FSC is included (and bid higher to compensate) or call to clarify. Showing "Linehaul $2,400 + Fuel Surcharge $400 = $2,800" is the industry standard.

### Why lane economics matter

Carriers and dispatchers run quick math on every offer: $/mile after FSC. A Rate Con that surfaces miles + transit + $/mile saves them 30 seconds per load and increases acceptance rate. Convoy, Uber Freight, ECHO, and Coyote all show this prominently.

### Why operational terms are restated even though they're in the BCA

The BCA lives in the carrier's filing system; the Rate Con is what the dispatcher sees on their screen at decision time. Restating detention/TONU/layover/lumper makes the load self-contained — no BCA lookup needed. This is standard across all major brokers.

### Quickstart with `srl_chrome.py` (Rate Confirmation)

```python
from srl_chrome import (
    register_skill_fonts,
    draw_header_first_page, draw_meta_strip, draw_parties_block,
    draw_signature_block, draw_footer, draw_shipment_table, draw_panel,
    draw_rate_breakdown, draw_equipment_spec, draw_carrier_requirements,
    draw_rate_con_terms, draw_lane_economics, draw_continuation_header,
    Party, RATE_CON_SIGNATURE_ROLES,
    RateBreakdown, EquipmentSpec, CarrierRequirements, RateConTerms,
    MARGIN, CONTENT_W,
)

register_skill_fonts()   # REQUIRED before any draw_* call — see BOL quickstart

c = Canvas("rate_con.pdf", pagesize=LETTER)

# Page 1
y = draw_header_first_page(c, doc_title="Rate Confirmation",
                            subtitle="Carrier-Issued · Binding",
                            qr_url=None, load_id=f"RC-SRL-{load_id}")

# 8 cells — every value must measure under (CONTENT_W / 8) - 4 = 63.5pt
y = draw_meta_strip(c, {"DATE ISSUED": ..., "LOAD REF": ..., "PICKUP": ...,
                         "DELIVERY": ..., "PICKUP #": ..., "PO #": ...,
                         "QUICK PAY": ..., "TERMS": ...},
                    y_top=y - 4)

y = draw_parties_block(c, shipper=..., consignee=..., y_top=y - 4)

y = draw_lane_economics(c, miles=miles, transit_value=transit,
                         total_pay=total_carrier_pay, y_top=y - 4)
# transit_value, NOT transit_days. Renamed when Item 100 moved transit display
# to hours (transit_unit defaults to "hours"; pass "days" for calendar-day pacing).

equipment = EquipmentSpec(type="Dry Van 53'", length_ft=53, air_ride=True,
                          loading_method="Live load · Dock high",
                          stackable=False)
y = draw_equipment_spec(c, equipment, y_top=y - 4)

y = draw_shipment_table(c, headers=[...], rows=[...], y_top=y - 4)

rate = RateBreakdown(linehaul=2400.00, fuel_surcharge=400.00)
y = draw_rate_breakdown(c, rate, y_top=y - 8, width=280)

terms = RateConTerms(detention_free_hours=2, detention_rate_per_hour=50,
                      detention_max_per_stop=250,   # v3.8.ars - canonical. $200 was
                                                    # RETIRED: it stopped detention at
                                                    # billable hour 4 while auto-layover
                                                    # only fired at 24, leaving a gap
                                                    # where a held carrier earned nothing.
                                                    # The cap EQUALS layover_per_day so
                                                    # detention converts rather than ends.
                                                    # Omitting it silently prints a
                                                    # capless RC.
                      tonu_amount=200, layover_per_day=250,
                      cancellation_window_hours=4)
y = draw_rate_con_terms(c, terms, y_top=y - 12)

draw_footer(c, page_num=1, total_pages=2, doc_id=...)
c.showPage()

# Page 2
y = draw_continuation_header(c, doc_title="Rate Confirmation",
                              doc_id=f"RC-SRL-{load_id}")

reqs = CarrierRequirements(cargo_insurance_min=100_000,
                            auto_liability_min=1_000_000,
                            general_liability_min=1_000_000)
y = draw_carrier_requirements(c, reqs, y_top=y - 4)

draw_panel(c, x=MARGIN, y=y-50, w=CONTENT_W, h=50,
           label="SPECIAL INSTRUCTIONS", body_text=...)

y = draw_signature_block(c, y_top=y-60, height=180,
                          roles=RATE_CON_SIGNATURE_ROLES)

draw_footer(c, page_num=2, total_pages=2, doc_id=...)
c.save()
```
