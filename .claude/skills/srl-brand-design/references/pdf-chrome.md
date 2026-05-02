# SRL PDF Chrome Reference

The chrome system used by all formal SRL PDFs (BOL v2.9, Rate Confirmation, Invoice, Carrier Onboarding Packet, BCA cover, QP cover). Pixel-validated against `BOL-L6894191249` (Apr 30 2026).

**The bundled scripts implement everything below. Use `scripts/srl_chrome.py` (Python/ReportLab) or `scripts/srl_chrome.ts` (TypeScript/PDFKit) — don't hand-code chrome.** This reference exists for cases where you need to understand the design intent, debug a deviation, or render an artifact in a different toolchain.

> Print surface mode: white canvas, cream-2 accent panels, navy primary text. See SKILL.md for the rationale.

---

## Page geometry

- US Letter (8.5 × 11 in)
- Margins: 0.5 in (36 pt) on all sides
- Content area: 7.5 × 10 in (540 × 720 pt)

---

## Header — first page

Layout left → right:

1. **Compass mark** at top-left, 60×60 pt
2. **Company info block** to the right of the mark:
   - Line 1: `SILK ROUTE LOGISTICS INC.` — Helvetica-Bold 13pt, `--navy`
   - Line 2: `2317 S 35th St, Galesburg, MI 49053` — Helvetica 8.5pt, `--fg-2`
   - Line 3: `+1 (269) 220-6760  |  operations@silkroutelogistics.ai  |  silkroutelogistics.ai` — same style
   - Line 4: `MC# 01794414  ·  DOT# 4526880` — Helvetica-Bold 8.5pt, `--fg-1`
   - Line 5 (italic tagline): `Where Trust Travels.` — Times-Italic 9pt, `--gold-dark`
3. **Right area** at top-right:
   - **For BOL only**: 75×75 pt QR code with `--gold` 0.75pt frame, **TRACK label** in small-caps `--gold-dark` below, human-readable load ID in Courier-Bold 8.5pt below the label. QR error correction M (15%) — balances density and warehouse-print damage tolerance. URL: `https://silkroutelogistics.ai/track/{token}` (deep-link).
   - **For all other documents (Rate Con, Invoice, BCA, QP, etc.)**: clean monospace document identifier with `REFERENCE` small-caps label above. No QR, no TRACK label, no scanning affordance.

   Why this matters: QR codes are operational — they're for warehouse/driver scanning at pickup/transit/delivery, which is a workflow that exists for the BOL only. Rate Cons live in carrier email, Invoices live in shipper AP queues, master agreements live in filing cabinets. None of those documents get scanned in the field, so QRs on them are visual noise that signals a workflow that doesn't exist. Production references (Mainfreight invoices, ISG invoices, all standard freight Rate Cons) confirm: real industry documents in these categories don't carry QR codes.
4. **Top gold rule** across full width below the entire header block, 1pt `--gold`

---

## Document title and subtitle

- **Title**: Times-Bold 22pt, `--navy`, drawn at left margin, ~12pt below the gold rule (e.g. `Bill of Lading`, `Rate Confirmation`, `Invoice`)
- **Subtitle**: Times-Italic 8.5pt uppercase, `--gold-dark`, ~14pt below the title (e.g. `STRAIGHT · NON-NEGOTIABLE`, `CARRIER-ISSUED · BINDING`)

---

## Meta strip — 6 fields

Below the title, runs full content width:

- Two gold rules bracketing the strip, both 0.5pt `--gold`
- Six equal columns
- Each column: small-caps label (Helvetica-Bold 6.5pt, `--gold-dark`, letter-spacing 0.08em) above value (Helvetica 10pt, `--fg-1`)
- **Empty fields render as em-dash `—`, never blank.** This is a consistency rule: blanks read as missing data; em-dash reads as "intentionally not applicable."

Standard six fields for BOL: `DATE ISSUED · LOAD REF · EQUIPMENT · PRO# · SHIPPER REF · FREIGHT CHARGES`. Other documents adapt the field set (Rate Con typically uses `DATE ISSUED · LOAD REF · EQUIPMENT · RATE · QUICK PAY · TERMS`).

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
  - Party name (Helvetica-Bold 11pt, `--navy`) below role
  - Address lines (Helvetica 8.5pt, `--fg-2`)
  - Contact line (`Contact: <name> · <phone>`, Helvetica 8.5pt, `--fg-1`)
  - Window line (`Window: <date> · <time-range>`, same style)

**Do not add Carrier and Broker blocks.** Carrier identity is captured at signature time in the three-block signature layout below.

---

## Shipment table

For BOL and Rate Con. Layout:

- **Header band**: full width, height 16pt, fill `--bg-navy`. Column labels in small-caps Helvetica-Bold 7pt, `--fg-on-navy`, letter-spacing 0.08em.
- **Body rows**: 18pt height each, all rendered on the white canvas (no row fill). Cell text Helvetica 9pt, `--fg-1`. Empty cells render as `—`.
- **Totals row** (optional): full `--cream-2` band, Helvetica-Bold 9pt, `--fg-1`. The totals row is the **sole accent band** in the table — that's how it earns visual weight at a glance.
- Columns use `tabular-nums` for numeric values. Standard BOL column set: `PCS · TYPE · DESCRIPTION · DIMS (L×W×H) · WEIGHT · CLASS · NMFC# · HM`.

**Why no alternating row fills**: freight documents typically have 1-5 line items per shipment. Alternating fills are a spreadsheet convention that needs many rows to read as alternation; with 2-3 rows, the pattern looks unbalanced — especially adjacent to the cream-2 totals row, which then visually merges with the last data row. Keeping all data rows white preserves the totals row as the single accent and reads cleaner at the row counts SRL actually uses.

---

## Special instructions / Released value / other panels

Use cream-2 panel utility (`draw_panel` / `drawPanel`):

- Special instructions: full-width cream-2 panel, label `SPECIAL INSTRUCTIONS` in small-caps gold-dark, body text Helvetica 9pt fg-1
- Released value: cream-2 panel with `--gold-dark` 1pt frame; checkbox options for "Declared $___/lb" and "NVD"; shipper-initial line on the right; regulatory citation `Per 49 U.S.C. § 14706(c)` immediately below the panel in 7pt italic `--fg-3`

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
- Certification: Helvetica-Oblique 7.5pt, `--fg-2`, wrapping —
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

Field labels: small-caps Helvetica-Bold 6.5pt, `--fg-3`. Underlines: 0.5pt `--border-strong`.

---

## Footer — every page (mandatory)

Per-page footer is required for legal continuity. If pages get separated in carrier handling, every page must remain identifiable.

- 0.75pt gold rule (`--gold`) across full width above the footer line
- Three-column row, all 7.5pt:
  - Left: `MC# 01794414  ·  DOT# 4526880  ·  silkroutelogistics.ai` (Helvetica, `--fg-3`)
  - Center: `Where Trust Travels.` (Times-Italic 8pt, `--gold-dark`)
  - Right: `Page X of Y` (Helvetica, `--fg-3`)

---

## Continuation page header (page 2+)

Lighter than page 1 — no QR, no full company info, no big tagline:

- Compass mark at top-left, 30×30pt
- Right of mark: `SILK ROUTE LOGISTICS INC.` (Helvetica-Bold 11pt, `--navy`), then `<DocID> · <DocTitle> (continued)` (Helvetica 8pt, `--fg-3`) below
- Right side: `<DocID>` repeated (Helvetica-Bold 9pt, `--fg-1`)
- Thin gold rule (0.5pt `--gold`) below

---

## Document tagline placement

The italic operational tagline `First Call. Last Update. Every Mile In Between.` appears **once per document maximum**. Typical placement is the cover-page footer or beneath the company info block on page 1, set in Playfair Display Italic 9pt, `--gold-dark`. It does NOT appear in the header.

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
    draw_header_first_page, draw_meta_strip, draw_parties_block,
    draw_signature_block, draw_footer, draw_shipment_table, draw_panel,
    Party, BOL_SIGNATURE_ROLES,
)

c = Canvas("bol.pdf", pagesize=LETTER)

y = draw_header_first_page(
    c,
    doc_title="Bill of Lading",
    subtitle="Straight · Non-Negotiable",
    qr_url=f"https://silkroutelogistics.ai/track/{load_id}",
    load_id=f"BOL-SRL-{load_id}",
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
  drawHeaderFirstPage, drawMetaStrip, drawPartiesBlock,
  drawSignatureBlock, drawFooter, drawShipmentTable,
  PAGE_W, PAGE_H, MARGIN,
} from './srl_chrome';

export async function generateBOL(load: Load): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
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
    draw_header_first_page, draw_footer,
    draw_bill_to_block, draw_invoice_meta_block, draw_lane_reference_row,
    draw_shipment_table, draw_charges_block, draw_settlement_summary,
    draw_remit_to_block, draw_payment_reference,
    BillTo, InvoiceCharge, RemitTo,
    MARGIN, FG_3,
)

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
c.setFont("Helvetica-Oblique", 7.5)
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

### Required Rate Con blocks

| Block | Function | Data needed |
|---|---|---|
| **Header** | `draw_header_first_page` | `include_qr=False` (no QR on Rate Con) |
| **Meta strip** | `draw_meta_strip` | Date, Load Ref, Pickup, Delivery, Quick Pay tier, Terms — keep values short to fit 6 columns |
| **Parties block** | `draw_parties_block` | Shipper + Consignee with operational pickup/delivery contacts and windows |
| **Lane economics** | `draw_lane_economics` | Miles, transit days, total carrier pay → renders MILES / TRANSIT / $/MILE pills |
| **Equipment spec** | `draw_equipment_spec` | `EquipmentSpec` — type, trailer reqs, reefer specs, loading/unloading method, stackability |
| **Shipment table** | `draw_shipment_table` | Commodity detail (PCS, TYPE, DESC, DIMS, WEIGHT, CLASS, NMFC, HM) |
| **Rate breakdown** | `draw_rate_breakdown` | `RateBreakdown` — linehaul + FSC + accessorials + total |
| **Operational terms** | `draw_rate_con_terms` | `RateConTerms` — detention, TONU, layover, lumper, cancellation, Quick Pay |
| (page break) | `c.showPage()` + `draw_continuation_header` | |
| **Carrier requirements** | `draw_carrier_requirements` | `CarrierRequirements` — insurance minimums, endorsements, ELD, etc. |
| **Special instructions** | `draw_panel` | Per-load operational notes |
| **Signature block** | `draw_signature_block` | `RATE_CON_SIGNATURE_ROLES` (Carrier Acceptance only) |

### Why FSC must be broken out

Carriers price loads by linehaul $/mile, with FSC as a separate cost-recovery line that fluctuates with diesel prices. A Rate Con showing only "RATE: $2,800" forces the carrier to assume FSC is included (and bid higher to compensate) or call to clarify. Showing "Linehaul $2,400 + Fuel Surcharge $400 = $2,800" is the industry standard.

### Why lane economics matter

Carriers and dispatchers run quick math on every offer: $/mile after FSC. A Rate Con that surfaces miles + transit + $/mile saves them 30 seconds per load and increases acceptance rate. Convoy, Uber Freight, ECHO, and Coyote all show this prominently.

### Why operational terms are restated even though they're in the BCA

The BCA lives in the carrier's filing system; the Rate Con is what the dispatcher sees on their screen at decision time. Restating detention/TONU/layover/lumper makes the load self-contained — no BCA lookup needed. This is standard across all major brokers.

### Quickstart with `srl_chrome.py` (Rate Confirmation)

```python
from srl_chrome import (
    draw_header_first_page, draw_meta_strip, draw_parties_block,
    draw_signature_block, draw_footer, draw_shipment_table, draw_panel,
    draw_rate_breakdown, draw_equipment_spec, draw_carrier_requirements,
    draw_rate_con_terms, draw_lane_economics, draw_continuation_header,
    Party, RATE_CON_SIGNATURE_ROLES,
    RateBreakdown, EquipmentSpec, CarrierRequirements, RateConTerms,
    MARGIN, CONTENT_W,
)

c = Canvas("rate_con.pdf", pagesize=LETTER)

# Page 1
y = draw_header_first_page(c, doc_title="Rate Confirmation",
                            subtitle="Carrier-Issued · Binding",
                            qr_url=None, load_id=f"RC-SRL-{load_id}")

y = draw_meta_strip(c, {"DATE ISSUED": ..., "LOAD REF": ..., "PICKUP": ...,
                         "DELIVERY": ..., "QUICK PAY": ..., "TERMS": ...},
                    y_top=y - 4)

y = draw_parties_block(c, shipper=..., consignee=..., y_top=y - 4)

y = draw_lane_economics(c, miles=miles, transit_days=transit,
                         total_pay=total_carrier_pay, y_top=y - 4)

equipment = EquipmentSpec(type="Dry Van 53'", length_ft=53, air_ride=True,
                          loading_method="Live load · Dock high",
                          stackable=False)
y = draw_equipment_spec(c, equipment, y_top=y - 4)

y = draw_shipment_table(c, headers=[...], rows=[...], y_top=y - 4)

rate = RateBreakdown(linehaul=2400.00, fuel_surcharge=400.00)
y = draw_rate_breakdown(c, rate, y_top=y - 8, width=280)

terms = RateConTerms(detention_free_hours=2, detention_rate_per_hour=50,
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
