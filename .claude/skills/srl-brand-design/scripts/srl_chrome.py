"""
srl_chrome.py — Silk Route Logistics PDF chrome library

Reusable building blocks for SRL document chrome (BOL, Rate Confirmation,
Invoice, BCA cover, QP cover). Implements the v2.9 production-validated
visual pattern, pixel-verified against BOL-L6894191249 (Apr 30 2026).

Design surface mode for PRINT/PDF:
  page canvas   = white (#FFFFFF)
  accent panels = cream-2 (#F5EEE0)
  primary text  = fg-1 navy (#0A2540)
  structural    = gold (#C5A572)  — rules, dividers, frames
  emphasis      = gold-dark (#BA7517)  — CTAs, labels, tagline, vertical rules

Public API (the building blocks you'll actually call):
  - draw_header_first_page(canvas, doc_title, subtitle, qr_url, load_id)
  - draw_meta_strip(canvas, fields)
  - draw_parties_block(canvas, shipper, consignee)
  - draw_signature_block(canvas, roles)
  - draw_footer(canvas, page_num, total_pages, doc_id)
  - draw_continuation_header(canvas, doc_title, doc_id)

Dependencies: reportlab>=4.0, qrcode>=7.0, Pillow

Quickstart for a Rate Confirmation:
    from srl_chrome import *
    from reportlab.pdfgen.canvas import Canvas

    c = Canvas("rate_con.pdf", pagesize=LETTER)
    draw_header_first_page(c, "Rate Confirmation",
                           "Carrier-Issued · Binding",
                           "https://silkroutelogistics.ai/track/L1234",
                           "RC-SRL-L1234")
    draw_meta_strip(c, {
        "DATE ISSUED": "Thu, May 1, 2026",
        "LOAD REF":    "L1234",
        "EQUIPMENT":   "Dry Van 53'",
        "RATE":        "$2,800",
        "QUICK PAY":   "7-day @ 2%",
        "TERMS":       "Net-7 / Quick Pay"
    })
    # ... your body ...
    draw_footer(c, page_num=1, total_pages=1, doc_id="RC-SRL-L1234")
    c.save()
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable
import io

from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.colors import HexColor, Color
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.units import inch

try:
    import qrcode
    from reportlab.lib.utils import ImageReader
    _HAS_QR = True
except ImportError:
    _HAS_QR = False


# ============================================================================
# TOKENS — keep in sync with srl_tokens.json
# ============================================================================

NAVY        = HexColor("#0A2540")
NAVY_700    = HexColor("#15365A")
GOLD        = HexColor("#C5A572")   # structural
GOLD_DARK   = HexColor("#BA7517")   # emphasis
GOLD_TINT   = HexColor("#FAEEDA")
CREAM       = HexColor("#FBF7F0")
CREAM_2     = HexColor("#F5EEE0")
WHITE       = HexColor("#FFFFFF")

FG_1        = NAVY
FG_2        = HexColor("#3A4A5F")
FG_3        = HexColor("#6B7685")
FG_ON_NAVY  = HexColor("#FBF7F0")

BORDER_1    = Color(0.039, 0.145, 0.251, alpha=0.10)
BORDER_2    = Color(0.039, 0.145, 0.251, alpha=0.16)
BORDER_STRONG = Color(0.039, 0.145, 0.251, alpha=0.32)


# ============================================================================
# BRAND METADATA — keep in sync with srl_tokens.json brand block
# ============================================================================

BRAND = {
    "legal_name":          "SILK ROUTE LOGISTICS INC.",
    "tagline":             "Where Trust Travels.",
    "operational_tagline": "First Call. Last Update. Every Mile In Between.",
    "domain":              "silkroutelogistics.ai",
    "address":             "2317 S 35th St, Galesburg, MI 49053",
    "phone":               "+1 (269) 220-6760",
    "email":               "operations@silkroutelogistics.ai",
    "mc":                  "01794414",
    "dot":                 "4526880",
}

# Page geometry (US Letter, 0.5" margins)
PAGE_W, PAGE_H = LETTER
MARGIN = 0.5 * inch
CONTENT_W = PAGE_W - 2 * MARGIN


# ============================================================================
# PRIMITIVES
# ============================================================================

def _gold_rule(c: Canvas, y: float, x_start: float = MARGIN,
               x_end: float | None = None, color: Color = GOLD,
               weight: float = 1.0) -> None:
    """Draw a horizontal gold rule at y."""
    if x_end is None:
        x_end = PAGE_W - MARGIN
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(weight)
    c.line(x_start, y, x_end, y)
    c.restoreState()


def _label(c: Canvas, text: str, x: float, y: float,
           color: Color = GOLD_DARK, size: float = 7.5) -> None:
    """Small-caps label — DM Sans 500, gold-dark, letter-spacing 0.08em.

    reportlab doesn't support letter-spacing natively on canvas drawString,
    so we render uppercase with manual character advance.
    """
    c.saveState()
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", size)
    upper = text.upper()
    # ~8% extra tracking
    tracked_advance = c.stringWidth(upper, "Helvetica-Bold", size) * 0.08
    cursor = x
    for ch in upper:
        c.drawString(cursor, y, ch)
        cursor += c.stringWidth(ch, "Helvetica-Bold", size) + tracked_advance / max(len(upper), 1)
    c.restoreState()


def _body(c: Canvas, text: str, x: float, y: float,
          font: str = "Helvetica", size: float = 9.5,
          color: Color = FG_1) -> None:
    c.saveState()
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, text)
    c.restoreState()


def _italic(c: Canvas, text: str, x: float, y: float,
            font: str = "Times-Italic", size: float = 9,
            color: Color = GOLD_DARK) -> None:
    c.saveState()
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, text)
    c.restoreState()


def _generate_qr_image(url: str, error_correction_level: str = "M"):
    """Return a PIL image of the QR code for the given URL.

    Error correction M (15%) per BOL v2.9 spec — balances density and
    damage tolerance for warehouse-printed BOLs.
    """
    if not _HAS_QR:
        return None
    levels = {
        "L": qrcode.constants.ERROR_CORRECT_L,
        "M": qrcode.constants.ERROR_CORRECT_M,
        "Q": qrcode.constants.ERROR_CORRECT_Q,
        "H": qrcode.constants.ERROR_CORRECT_H,
    }
    qr = qrcode.QRCode(
        version=None,
        error_correction=levels.get(error_correction_level, levels["M"]),
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="#0A2540", back_color="white").convert("RGB")


# ============================================================================
# COMPASS MARK — production SRL logo.
#
# The production mark is shipped as a vector SVG (srl_compass.svg) traced
# from the BOL v2.9 reference (BOL-L6894191249, Apr 30 2026), with PNG
# raster fallbacks at 60/120/240/480px for environments without SVG support.
#
# When a higher-quality master SVG becomes available from the designer,
# replace srl_compass.svg in this directory; this function will pick it up
# without code changes.
# ============================================================================

import os as _os
_LOGO_DIR = _os.path.dirname(_os.path.abspath(__file__))
_LOGO_SVG_PATH = _os.path.join(_LOGO_DIR, 'srl_compass.svg')


def _draw_compass_mark(c: Canvas, x: float, y: float, size: float = 50.0) -> None:
    """Draw the SRL compass mark at (x, y) with the given size.

    Strategy:
      1. Use the closest bundled PNG raster fallback >= target size — these
         carry proper alpha transparency from the Canva master export.
      2. Fall back to SVG via svglib if PNGs aren't available (note: svglib
         has known issues with SVGs that wrap embedded raster images, so
         this path is the fallback, not the primary).
      3. Last resort: draw a simple navy ring (signal that the logo
         failed to load).
    """
    # Primary: PNG raster fallbacks (alpha-correct via ReportLab mask='auto')
    for pixel_size in (60, 120, 240, 480):
        png_path = _os.path.join(_LOGO_DIR, f'srl_compass_{pixel_size}.png')
        if _os.path.exists(png_path) and pixel_size >= size:
            c.drawImage(png_path, x, y, width=size, height=size, mask='auto')
            return

    # If target size is bigger than 480, use the largest available PNG
    largest_png = _os.path.join(_LOGO_DIR, 'srl_compass_480.png')
    if _os.path.exists(largest_png):
        c.drawImage(largest_png, x, y, width=size, height=size, mask='auto')
        return

    # Fallback: SVG via svglib
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPDF
        drawing = svg2rlg(_LOGO_SVG_PATH)
        scale_x = size / drawing.width
        scale_y = size / drawing.height
        scale = min(scale_x, scale_y)
        drawing.scale(scale, scale)
        drawing.width *= scale
        drawing.height *= scale
        renderPDF.draw(drawing, c, x, y)
        return
    except Exception:
        pass

    # Last resort: draw a simple navy ring so the absence of the logo is obvious
    c.saveState()
    c.setStrokeColor(NAVY)
    c.setLineWidth(2)
    c.setFillColor(WHITE)
    c.circle(x + size/2, y + size/2, size * 0.45, stroke=1, fill=1)
    c.restoreState()


# ============================================================================
# PUBLIC: HEADER (FIRST PAGE)
# ============================================================================

def draw_header_first_page(c: Canvas, doc_title: str, subtitle: str,
                           qr_url: str | None = None,
                           load_id: str | None = None,
                           include_qr: bool = False,
                           y_top: float | None = None) -> float:
    """Draw the standard SRL first-page header.

    Layout (left → right):
      Compass mark | Company info block | (right area: QR for BOL, doc-id otherwise)

    QR codes are operational — they're for warehouse/driver scanning at
    pickup, transit, and delivery. They belong on documents that travel
    physically with the load, which means the BOL only. Rate Confirmations
    (carrier email/portal artifact, no scan event), Invoices (AP workflow
    uses field parsing not scanning), BCAs/QPs (master agreements signed
    once and filed), and other paperwork should NOT carry a tracking QR.

    Pass include_qr=True ONLY for BOL generation. Default is False.
    For non-BOL documents, the right area shows the document identifier
    (load_id) in monospace as a clean filing reference, no QR.

    Returns the y-coordinate of the bottom of the header.
    """
    if y_top is None:
        y_top = PAGE_H - MARGIN

    # Compass mark
    _draw_compass_mark(c, MARGIN, y_top - 60, size=55)

    # Company info block (right of compass)
    info_x = MARGIN + 70
    info_y = y_top - 8

    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(NAVY)
    c.drawString(info_x, info_y, BRAND["legal_name"])

    c.setFont("Helvetica", 8.5)
    c.setFillColor(FG_2)
    c.drawString(info_x, info_y - 12, BRAND["address"])
    c.drawString(info_x, info_y - 24, f'{BRAND["phone"]}  |  {BRAND["email"]}  |  {BRAND["domain"]}')
    c.setFillColor(FG_1)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(info_x, info_y - 36, f'MC# {BRAND["mc"]}  ·  DOT# {BRAND["dot"]}')

    # Tagline (Where Trust Travels.) in italic gold-dark
    _italic(c, BRAND["tagline"], info_x, info_y - 48, size=9)

    # Right area — QR (BOL only) or clean doc-id reference (everything else)
    if include_qr and qr_url and _HAS_QR:
        # QR code + TRACK label (BOL operational scanning)
        qr_box = 75
        qr_x = PAGE_W - MARGIN - qr_box
        qr_y = y_top - qr_box

        img = _generate_qr_image(qr_url, "M")
        if img is not None:
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            c.drawImage(ImageReader(buf), qr_x, qr_y,
                        width=qr_box, height=qr_box, mask=None)

        # Gold frame
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.75)
        c.rect(qr_x - 3, qr_y - 3, qr_box + 6, qr_box + 6, stroke=1, fill=0)

        # TRACK label below QR
        _label(c, "TRACK", qr_x + 5, qr_y - 14, color=GOLD_DARK, size=7)
        if load_id:
            c.setFont("Courier-Bold", 8.5)
            c.setFillColor(FG_1)
            c.drawString(qr_x, qr_y - 26, load_id)
    elif load_id:
        # Non-BOL: show doc identifier in upper-right as a filing reference
        # No QR (would be visual noise — see docstring), no TRACK label
        # (the doc isn't a tracking artifact), just the identifier itself.
        c.setFont("Helvetica", 8)
        c.setFillColor(FG_3)
        ref_label = "REFERENCE"
        label_w = c.stringWidth(ref_label, "Helvetica-Bold", 6.5)
        _label(c, ref_label, PAGE_W - MARGIN - 100, y_top - 12,
               color=GOLD_DARK, size=6.5)
        c.setFont("Courier-Bold", 11)
        c.setFillColor(FG_1)
        id_w = c.stringWidth(load_id, "Courier-Bold", 11)
        c.drawString(PAGE_W - MARGIN - id_w, y_top - 28, load_id)

    # Top gold rule across full width
    rule_y = y_top - 80
    _gold_rule(c, rule_y, color=GOLD, weight=1)

    # Document title (left) and subtitle below it
    title_y = rule_y - 24
    c.setFont("Times-Bold", 22)
    c.setFillColor(NAVY)
    c.drawString(MARGIN, title_y, doc_title)

    if subtitle:
        c.setFillColor(GOLD_DARK)
        c.setFont("Times-Italic", 8.5)
        c.drawString(MARGIN, title_y - 14, subtitle.upper())

    return title_y - 30  # caller uses this as next y


# ============================================================================
# PUBLIC: META STRIP (6 fields, gold rules above and below)
# ============================================================================

def draw_meta_strip(c: Canvas, fields: dict[str, str | None],
                    y_top: float | None = None) -> float:
    """Draw the 6-field meta strip with gold rules above and below.

    Empty fields render as em-dash '—' per spec — never blank.
    Returns the y-coordinate of the bottom rule.
    """
    if y_top is None:
        y_top = PAGE_H - MARGIN - 130

    items = list(fields.items())
    n = len(items)
    if n == 0:
        return y_top
    col_w = CONTENT_W / n

    # Top gold rule
    _gold_rule(c, y_top, color=GOLD, weight=0.5)

    # Field labels and values
    label_y = y_top - 11
    value_y = y_top - 24

    for i, (key, val) in enumerate(items):
        x = MARGIN + i * col_w
        _label(c, key, x, label_y, color=GOLD_DARK, size=6.5)
        display = val if val and str(val).strip() else "—"
        _body(c, display, x, value_y, font="Helvetica", size=10, color=FG_1)

    # Bottom gold rule
    bottom_y = y_top - 32
    _gold_rule(c, bottom_y, color=GOLD, weight=0.5)
    return bottom_y - 8


# ============================================================================
# PUBLIC: PARTIES BLOCK (two cream-2 panels — Shipper + Consignee)
# ============================================================================

@dataclass
class Party:
    name: str
    address_lines: list[str]
    contact: str | None = None
    window: str | None = None


def draw_parties_block(c: Canvas, shipper: Party, consignee: Party,
                       y_top: float | None = None,
                       height: float = 90,
                       roles: tuple[str, str] = ("SHIPPER · PICKUP FROM",
                                                 "CONSIGNEE · DELIVER TO"),
                       section_label: str = "PARTIES") -> float:
    """Draw the standard two-block parties layout.

    Default labels are BOL-appropriate (Shipper / Consignee). For invoices,
    pass roles=("BILL TO", "REMIT TO") and section_label="BILLING" — the
    layout is identical, just the labels change.

    Returns y-coordinate at bottom of the panels.
    """
    if y_top is None:
        y_top = PAGE_H - MARGIN - 200

    panel_w = (CONTENT_W - 12) / 2
    panel_y = y_top - height

    # Section label
    _label(c, section_label, MARGIN, y_top + 6, color=GOLD_DARK, size=7)

    for i, (party, role) in enumerate([(shipper, roles[0]),
                                       (consignee, roles[1])]):
        x = MARGIN + i * (panel_w + 12)

        # Cream-2 panel background
        c.saveState()
        c.setFillColor(CREAM_2)
        c.setStrokeColor(BORDER_1)
        c.setLineWidth(0.5)
        c.roundRect(x, panel_y, panel_w, height, 8, stroke=1, fill=1)
        c.restoreState()

        # Role label
        _label(c, role, x + 10, panel_y + height - 12, color=GOLD_DARK, size=6.5)

        # Name (bold)
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(NAVY)
        c.drawString(x + 10, panel_y + height - 27, party.name)

        # Address
        cur = panel_y + height - 40
        c.setFont("Helvetica", 8.5)
        c.setFillColor(FG_2)
        for line in party.address_lines:
            c.drawString(x + 10, cur, line)
            cur -= 11

        # Contact + window
        cur -= 2
        if party.contact:
            c.setFillColor(FG_1)
            c.drawString(x + 10, cur, f"Contact: {party.contact}")
            cur -= 11
        if party.window:
            c.drawString(x + 10, cur, f"Window: {party.window}")

    return panel_y - 12


# ============================================================================
# PUBLIC: SIGNATURE BLOCK (three columns separated by gold-dark vertical rules)
# ============================================================================

@dataclass
class SignatureRole:
    """One column of the three-block signature layout."""
    title: str
    certification: str
    fields: list[str]   # ordered list of field labels (e.g., "SIGNATURE", "PRINT NAME")


# Standard BOL signature roles
BOL_SIGNATURE_ROLES = [
    SignatureRole(
        title="SHIPPER · REPRESENTATIVE",
        certification=("Certifies contents are properly classified, packaged, "
                       "marked, and labeled per DOT regulations (49 CFR 172)."),
        fields=["SIGNATURE", "PRINT NAME", "PIECES TENDERED", "DATE"],
    ),
    SignatureRole(
        title="CARRIER · DRIVER",
        certification="Acknowledges receipt of shipment in apparent good order, except as noted.",
        fields=["CARRIER LEGAL NAME", "MC #", "DOT #", "DRIVER NAME",
                "SIGNATURE", "TRUCK #", "TRAILER #", "SEAL #", "DATE"],
    ),
    SignatureRole(
        title="CONSIGNEE · RECEIVER",
        certification="Acknowledges delivery — any exceptions noted above.",
        fields=["SIGNATURE", "PRINT NAME", "PIECES RECEIVED", "DATE"],
    ),
]


# Rate Confirmation signature — single block, Carrier acceptance only.
# A Rate Con is a binding agreement between Broker and Carrier on rate +
# terms. Shipper isn't a party; Consignee has no role. The Broker's act
# of issuing the document is the Broker signature; only the Carrier
# countersigns to accept the rate and bind the load.
RATE_CON_SIGNATURE_ROLES = [
    SignatureRole(
        title="CARRIER · ACCEPTANCE",
        certification=("Carrier accepts the rate, lane, equipment, and terms set forth above. "
                       "This Rate Confirmation, together with the Broker-Carrier Agreement "
                       "v3.1 dated February 26, 2026, constitutes the complete agreement for this load."),
        fields=["CARRIER LEGAL NAME", "MC #", "DOT #",
                "AUTHORIZED SIGNATORY (PRINT)", "TITLE",
                "SIGNATURE", "DATE"],
    ),
]


# Master-agreement signatures (BCA, QP) — Broker side + Carrier side,
# each signed by an authorized officer. Used on cover pages.
MASTER_AGREEMENT_SIGNATURE_ROLES = [
    SignatureRole(
        title="BROKER · SILK ROUTE LOGISTICS INC.",
        certification="Authorized signatory binds Broker to the terms herein.",
        fields=["PRINT NAME", "TITLE", "SIGNATURE", "DATE"],
    ),
    SignatureRole(
        title="CARRIER",
        certification="Authorized signatory binds Carrier to the terms herein.",
        fields=["CARRIER LEGAL NAME", "MC #", "DOT #", "EIN",
                "PRINT NAME", "TITLE", "SIGNATURE", "DATE"],
    ),
]


def draw_signature_block(c: Canvas, roles: list[SignatureRole] | None = None,
                         y_top: float | None = None,
                         height: float = 220) -> float:
    """Draw the three-column signature block.

    Columns separated by gold-dark 1pt vertical rules. Each column has a
    title (small-caps gold-dark), italic certification line, and ordered
    field labels with underline rules.
    """
    if roles is None:
        roles = BOL_SIGNATURE_ROLES
    if y_top is None:
        y_top = PAGE_H - MARGIN - 480

    n = len(roles)
    col_w = CONTENT_W / n
    bottom_y = y_top - height

    # Vertical gold-dark rules between columns
    c.saveState()
    c.setStrokeColor(GOLD_DARK)
    c.setLineWidth(0.5)
    for i in range(1, n):
        x = MARGIN + i * col_w
        c.line(x, y_top - 4, x, bottom_y + 4)
    c.restoreState()

    for i, role in enumerate(roles):
        x = MARGIN + i * col_w + 6
        col_inner_w = col_w - 12

        # Title
        _label(c, role.title, x, y_top - 12, color=GOLD_DARK, size=7)

        # Certification (italic, 7.5pt, fg-2)
        cert_y = y_top - 28
        c.setFont("Helvetica-Oblique", 7.5)
        c.setFillColor(FG_2)
        # Simple wrap at ~38 chars
        words = role.certification.split()
        line = ""
        cur_y = cert_y
        for w in words:
            test = (line + " " + w).strip()
            if c.stringWidth(test, "Helvetica-Oblique", 7.5) > col_inner_w:
                c.drawString(x, cur_y, line)
                cur_y -= 9
                line = w
            else:
                line = test
        if line:
            c.drawString(x, cur_y, line)

        # Fields — labels with underline
        field_y = cur_y - 18
        for f in role.fields:
            _label(c, f, x, field_y, color=FG_3, size=6.5)
            # Underline
            c.setStrokeColor(BORDER_STRONG)
            c.setLineWidth(0.5)
            c.line(x, field_y - 4, x + col_inner_w, field_y - 4)
            field_y -= 22

    return bottom_y


# ============================================================================
# PUBLIC: FOOTER (per-page, mandatory for legal continuity)
# ============================================================================

def draw_footer(c: Canvas, page_num: int, total_pages: int,
                doc_id: str | None = None) -> None:
    """Draw the per-page footer.

    Layout: 1pt gold rule, then three-column row:
      Left:   MC# · DOT# · domain
      Center: italic Where Trust Travels.
      Right:  Page X of Y
    """
    footer_y = MARGIN + 30
    _gold_rule(c, footer_y + 12, color=GOLD, weight=0.75)

    # Left
    c.setFont("Helvetica", 7.5)
    c.setFillColor(FG_3)
    left_text = f'MC# {BRAND["mc"]}  ·  DOT# {BRAND["dot"]}  ·  {BRAND["domain"]}'
    c.drawString(MARGIN, footer_y, left_text)

    # Center — Where Trust Travels (italic, gold-dark)
    c.setFont("Times-Italic", 8)
    c.setFillColor(GOLD_DARK)
    tagline = BRAND["tagline"]
    tagline_w = c.stringWidth(tagline, "Times-Italic", 8)
    c.drawString((PAGE_W - tagline_w) / 2, footer_y, tagline)

    # Right — page X of Y
    c.setFont("Helvetica", 7.5)
    c.setFillColor(FG_3)
    page_text = f"Page {page_num} of {total_pages}"
    page_w = c.stringWidth(page_text, "Helvetica", 7.5)
    c.drawString(PAGE_W - MARGIN - page_w, footer_y, page_text)


# ============================================================================
# PUBLIC: CONTINUATION HEADER (page 2+)
# ============================================================================

def draw_continuation_header(c: Canvas, doc_title: str, doc_id: str,
                             y_top: float | None = None) -> float:
    """Draw the lighter header for continuation pages (page 2+).

    No QR, no full company info, no big tagline — just compass mark,
    company name, doc identifier, and a thin gold rule.
    """
    if y_top is None:
        y_top = PAGE_H - MARGIN

    _draw_compass_mark(c, MARGIN, y_top - 35, size=30)

    info_x = MARGIN + 40
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(NAVY)
    c.drawString(info_x, y_top - 12, BRAND["legal_name"])

    c.setFont("Helvetica", 8)
    c.setFillColor(FG_3)
    c.drawString(info_x, y_top - 24, f"{doc_id}  ·  {doc_title} (continued)")

    # Right side — doc id
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(FG_1)
    txt_w = c.stringWidth(doc_id, "Helvetica-Bold", 9)
    c.drawString(PAGE_W - MARGIN - txt_w, y_top - 12, doc_id)

    # Thin gold rule
    rule_y = y_top - 40
    _gold_rule(c, rule_y, color=GOLD, weight=0.5)
    return rule_y - 14


# ============================================================================
# PUBLIC: SHIPMENT TABLE (BOL pattern — navy header band, alternating rows)
# ============================================================================

def draw_shipment_table(c: Canvas, headers: list[str], rows: list[list[str]],
                        totals_row: list[str] | None = None,
                        y_top: float | None = None,
                        col_widths: list[float] | None = None) -> float:
    """Draw a shipment-details table.

    Header band: navy fill + cream text, small-caps DM Sans Medium.
    Body rows: white (no fill) — keeps the data rows visually clean.
    Totals row: full cream-2 band, bold — the sole accent band, earns visual weight.
    """
    if y_top is None:
        y_top = PAGE_H - MARGIN - 320
    if col_widths is None:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n

    row_h = 18
    header_h = 16

    # Header band
    c.saveState()
    c.setFillColor(NAVY)
    c.rect(MARGIN, y_top - header_h, CONTENT_W, header_h, stroke=0, fill=1)
    c.restoreState()

    cur_x = MARGIN + 8
    for i, h in enumerate(headers):
        _label(c, h, cur_x, y_top - 11, color=FG_ON_NAVY, size=7)
        cur_x += col_widths[i]

    # Body rows — all white (no fill). Single accent band is the totals row below.
    cur_y = y_top - header_h
    for ri, row in enumerate(rows):
        cur_y -= row_h
        cur_x = MARGIN + 8
        c.setFont("Helvetica", 9)
        c.setFillColor(FG_1)
        for i, cell in enumerate(row):
            c.drawString(cur_x, cur_y + 5, str(cell) if cell else "—")
            cur_x += col_widths[i]

    # Totals row
    if totals_row:
        cur_y -= row_h
        c.saveState()
        c.setFillColor(CREAM_2)
        c.rect(MARGIN, cur_y, CONTENT_W, row_h, stroke=0, fill=1)
        c.restoreState()
        cur_x = MARGIN + 8
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(FG_1)
        for i, cell in enumerate(totals_row):
            c.drawString(cur_x, cur_y + 5, str(cell) if cell else "")
            cur_x += col_widths[i]

    return cur_y - 8


# ============================================================================
# PUBLIC: cream-2 panel (general utility)
# ============================================================================

def draw_panel(c: Canvas, x: float, y: float, w: float, h: float,
               label: str | None = None,
               body_text: str | None = None) -> None:
    """Draw a cream-2 accent panel — used for special instructions, released-value
    frame, and other sunken regions on print/PDF surfaces.
    """
    c.saveState()
    c.setFillColor(CREAM_2)
    c.setStrokeColor(BORDER_1)
    c.setLineWidth(0.5)
    c.roundRect(x, y, w, h, 8, stroke=1, fill=1)
    c.restoreState()

    if label:
        _label(c, label, x + 10, y + h - 12, color=GOLD_DARK, size=6.5)
    if body_text:
        c.setFont("Helvetica", 9)
        c.setFillColor(FG_1)
        c.drawString(x + 10, y + h - 28, body_text)


# ============================================================================
# INVOICE-SPECIFIC BUILDING BLOCKS
# ============================================================================
#
# Invoices have a different anatomy from BOL/Rate Con. The audience is
# accounts-payable staff at the shipper, not driver/dispatcher in the
# operational chain. AP staff need:
#   - Bill-To block prominent (this invoice is FOR THEM)
#   - Customer reference code + PO numbers for system matching
#   - Charges broken out by category (freight + fuel + accessorials)
#   - Settlement summary (amount / paid / balance) for partial-pay tracking
#   - Remit-To block with wire instructions and check mail address
#   - Payment reference string for wire memo field
#
# Cross-validated against Mainfreight invoice (BEENATDFW LAX00753845 3507026)
# and ISG invoice (BEENATUSA 131202) — both production AP-facing invoices
# from carriers BKN actually paid, May 2026.
# ============================================================================


@dataclass
class BillTo:
    """The customer being billed. Replaces 'Party' for invoice context."""
    name: str
    address_lines: list[str]              # ["440 North Barranca Avenue", "#9223", "Covina, CA 91723"]
    customer_account: str | None = None   # e.g., "BEENATSRL"
    attention: str | None = None          # e.g., "Accounts Payable"


@dataclass
class InvoiceCharge:
    """One line item in the charges breakdown."""
    label: str          # "Freight Charges", "Fuel Surcharge", "Detention", etc.
    amount: float       # in USD


@dataclass
class RemitTo:
    """SRL's payment-receiving information."""
    legal_name: str     # "Silk Route Logistics Inc."
    mail_address: list[str]  # mail-to address lines for paper checks
    bank_name: str | None = None
    routing_aba: str | None = None    # ABA / routing number
    account_number: str | None = None
    swift: str | None = None          # for international wires


def draw_bill_to_block(c: Canvas, bill_to: BillTo, y_top: float,
                       width: float = 280) -> float:
    """Draw a Bill-To block in the upper-left area of the invoice.

    Replaces the parties-block pattern for invoice context. AP-facing —
    the address here goes in the window envelope.

    Returns y-coordinate at bottom of block.
    """
    _label(c, "BILL TO", MARGIN, y_top, color=GOLD_DARK, size=7)

    cur_y = y_top - 14
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(NAVY)
    c.drawString(MARGIN, cur_y, bill_to.name)
    cur_y -= 14

    if bill_to.attention:
        c.setFont("Helvetica", 9)
        c.setFillColor(FG_2)
        c.drawString(MARGIN, cur_y, f"Attn: {bill_to.attention}")
        cur_y -= 11

    c.setFont("Helvetica", 9.5)
    c.setFillColor(FG_1)
    for line in bill_to.address_lines:
        c.drawString(MARGIN, cur_y, line)
        cur_y -= 11

    if bill_to.customer_account:
        cur_y -= 4
        _label(c, "CUSTOMER ACCOUNT", MARGIN, cur_y, color=GOLD_DARK, size=6.5)
        cur_y -= 11
        c.setFont("Courier-Bold", 10)
        c.setFillColor(FG_1)
        c.drawString(MARGIN, cur_y, bill_to.customer_account)
        cur_y -= 6

    return cur_y - 4


def draw_invoice_meta_block(c: Canvas, meta: dict[str, str | None],
                             y_top: float,
                             x_start: float | None = None,
                             width: float = 240) -> float:
    """Draw the right-side invoice meta block (key/value pairs).

    Mirrors Mainfreight/ISG layout: Invoice Number, Invoice Date, Due Date,
    Terms, Pick-Up Date, Delivery Date — each on its own line with the
    label left-aligned and value right-aligned within the block.

    Use instead of draw_meta_strip on invoices — fields here can be longer
    (full invoice numbers, dates) without overflow.

    Returns y-coordinate at bottom of block.
    """
    if x_start is None:
        x_start = PAGE_W - MARGIN - width

    cur_y = y_top
    line_h = 13

    for key, val in meta.items():
        if val is None or not str(val).strip():
            val = "—"
        # Label (left)
        _label(c, key, x_start, cur_y, color=GOLD_DARK, size=6.5)
        # Value (right-aligned within block)
        c.setFont("Helvetica", 10)
        c.setFillColor(FG_1)
        val_str = str(val)
        val_w = c.stringWidth(val_str, "Helvetica", 10)
        c.drawString(x_start + width - val_w, cur_y, val_str)
        cur_y -= line_h

    return cur_y


def draw_lane_reference_row(c: Canvas, shipper_name: str, shipper_city: str,
                             receiver_name: str, receiver_city: str,
                             y_top: float) -> float:
    """Draw a slim two-column reference row showing the lane that was shipped.

    For invoice context: this is informational ("here's the load you're being
    invoiced for"), not a parties block. Smaller and less prominent than the
    BOL/Rate Con parties panels — closer to Mainfreight's inline Shipper:/
    Receiver: rows.

    Returns y-coordinate at bottom of row.
    """
    # Top + bottom thin gold rules to bracket the row
    _gold_rule(c, y_top, color=GOLD, weight=0.5)

    col_w = CONTENT_W / 2

    # SHIPPER column
    _label(c, "SHIPPER", MARGIN, y_top - 10, color=GOLD_DARK, size=6.5)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(NAVY)
    c.drawString(MARGIN, y_top - 22, shipper_name)
    c.setFont("Helvetica", 9)
    c.setFillColor(FG_2)
    c.drawString(MARGIN, y_top - 33, shipper_city)

    # RECEIVER column
    rcv_x = MARGIN + col_w
    _label(c, "RECEIVER", rcv_x, y_top - 10, color=GOLD_DARK, size=6.5)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(NAVY)
    c.drawString(rcv_x, y_top - 22, receiver_name)
    c.setFont("Helvetica", 9)
    c.setFillColor(FG_2)
    c.drawString(rcv_x, y_top - 33, receiver_city)

    bottom_y = y_top - 42
    _gold_rule(c, bottom_y, color=GOLD, weight=0.5)
    return bottom_y - 8


def draw_charges_block(c: Canvas,
                       charges: list[InvoiceCharge],
                       y_top: float,
                       width: float = 280) -> float:
    """Draw the charges breakdown — right-aligned amounts column.

    Standard structure (like Mainfreight):
      Freight Charges          $4,500.00
      Fuel Surcharge             $450.00
      [accessorials...]
      ─────────────────────────────────
      Total USD                $4,950.00   (bold)

    Returns y-coordinate at bottom of block.
    """
    x_start = PAGE_W - MARGIN - width

    # Section label
    _label(c, "CHARGES", x_start, y_top, color=GOLD_DARK, size=7)
    cur_y = y_top - 16

    line_h = 16
    for charge in charges:
        c.setFont("Helvetica", 10)
        c.setFillColor(FG_2)
        c.drawString(x_start, cur_y, charge.label)
        amt = f"${charge.amount:,.2f}"
        c.setFont("Helvetica", 10)
        c.setFillColor(FG_1)
        amt_w = c.stringWidth(amt, "Helvetica", 10)
        c.drawString(x_start + width - amt_w, cur_y, amt)
        cur_y -= line_h

    # Subtle dashed rule above total
    cur_y -= 2
    c.saveState()
    c.setStrokeColor(BORDER_2)
    c.setLineWidth(0.5)
    c.setDash(2, 2)
    c.line(x_start, cur_y, x_start + width, cur_y)
    c.restoreState()
    cur_y -= 8

    # Total line — bold, larger
    total = sum(ch.amount for ch in charges)
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(FG_1)
    c.drawString(x_start, cur_y, "Total USD")
    total_str = f"${total:,.2f}"
    total_w = c.stringWidth(total_str, "Helvetica-Bold", 12)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x_start + width - total_w, cur_y, total_str)
    cur_y -= line_h

    return cur_y


def draw_settlement_summary(c: Canvas,
                             invoice_amount: float,
                             amount_paid: float,
                             y_top: float,
                             width: float = 280) -> float:
    """Draw the three-line settlement summary block (cream-2 accent panel).

    Structure (matches Mainfreight):
      Invoice Amount   $4,950.00
      Amount Paid           0.00
      ────────────────────────
      Balance Due      $4,950.00   (bold, gold-dark)
    """
    x_start = PAGE_W - MARGIN - width
    height = 70
    panel_y = y_top - height

    # Background panel
    c.saveState()
    c.setFillColor(CREAM_2)
    c.setStrokeColor(BORDER_1)
    c.setLineWidth(0.5)
    c.roundRect(x_start, panel_y, width, height, 6, stroke=1, fill=1)
    c.restoreState()

    pad = 12
    cur_y = y_top - 18
    line_h = 16

    def row(label: str, amount: float, bold: bool = False, color=FG_1):
        nonlocal cur_y
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.setFillColor(FG_2 if not bold else color)
        c.drawString(x_start + pad, cur_y, label)
        amt_str = f"${amount:,.2f}"
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.setFillColor(color)
        amt_w = c.stringWidth(amt_str, "Helvetica-Bold" if bold else "Helvetica", 10)
        c.drawString(x_start + width - pad - amt_w, cur_y, amt_str)
        cur_y -= line_h

    balance = invoice_amount - amount_paid
    row("Invoice Amount", invoice_amount)
    row("Amount Paid", amount_paid)

    # Divider rule between Amount Paid and Balance Due.
    # At this point cur_y is positioned at the Balance-Due baseline (one
    # line_h below Amount Paid baseline). The rule sits halfway between
    # the two baselines, with a small descent allowance.
    c.saveState()
    c.setStrokeColor(GOLD_DARK)
    c.setLineWidth(0.6)
    rule_y = cur_y + 11
    c.line(x_start + pad, rule_y, x_start + width - pad, rule_y)
    c.restoreState()

    row("Balance Due", balance, bold=True, color=GOLD_DARK)

    return panel_y - 8


def draw_remit_to_block(c: Canvas, remit: RemitTo, y_top: float,
                         width: float = 280) -> float:
    """Draw the Remit-To block with mail address + ACH/wire instructions.

    Lower-left of the invoice page (mirroring Mainfreight's pattern).
    """
    _label(c, "REMIT TO", MARGIN, y_top, color=GOLD_DARK, size=7)
    cur_y = y_top - 14

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(NAVY)
    c.drawString(MARGIN, cur_y, remit.legal_name)
    cur_y -= 13

    # Mail-to address
    c.setFont("Helvetica", 9)
    c.setFillColor(FG_2)
    for line in remit.mail_address:
        c.drawString(MARGIN, cur_y, line)
        cur_y -= 10

    # ACH / wire details (if provided)
    if remit.bank_name or remit.routing_aba or remit.account_number:
        cur_y -= 6
        _label(c, "ACH / WIRE", MARGIN, cur_y, color=GOLD_DARK, size=6.5)
        cur_y -= 12
        c.setFont("Helvetica", 9)
        c.setFillColor(FG_1)
        if remit.bank_name:
            c.drawString(MARGIN, cur_y, f"Bank: {remit.bank_name}")
            cur_y -= 11
        if remit.routing_aba:
            c.setFont("Courier", 9)
            c.drawString(MARGIN, cur_y, f"ABA / Routing #: {remit.routing_aba}")
            cur_y -= 11
        if remit.account_number:
            c.drawString(MARGIN, cur_y, f"Account #: {remit.account_number}")
            cur_y -= 11
        if remit.swift:
            c.drawString(MARGIN, cur_y, f"SWIFT: {remit.swift}")
            cur_y -= 11

    return cur_y - 4


def draw_payment_reference(c: Canvas, account: str, load_id: str,
                            invoice_num: str, y_top: float) -> float:
    """Draw the payment reference string AP staff put in the wire memo field.

    Format: "<CUSTOMER_ACCOUNT> <LOAD_ID> <INVOICE_NUM>"
    Example: "BEENATSRL L1234 INV-SRL-2026-0001"
    """
    c.saveState()
    # Cream-2 highlight box
    ref_str = f"{account}  {load_id}  {invoice_num}"
    c.setFont("Courier-Bold", 9.5)
    text_w = c.stringWidth(ref_str, "Courier-Bold", 9.5)
    box_x = MARGIN
    box_w = text_w + 24
    box_h = 22

    c.setFillColor(CREAM_2)
    c.setStrokeColor(GOLD_DARK)
    c.setLineWidth(0.5)
    c.roundRect(box_x, y_top - box_h, box_w, box_h, 4, stroke=1, fill=1)
    c.restoreState()

    _label(c, "PAYMENT REFERENCE (WIRE MEMO)", MARGIN, y_top + 4,
           color=GOLD_DARK, size=6.5)

    c.setFont("Courier-Bold", 9.5)
    c.setFillColor(FG_1)
    c.drawString(box_x + 12, y_top - box_h + 7, ref_str)

    return y_top - box_h - 8


# ============================================================================
# RATE CONFIRMATION — OPERATIONAL FIELDS
# ============================================================================
#
# Carrier-facing Rate Cons need operational specifics that BOL/Invoice don't.
# These are the fields carriers expect to see before accepting a load: FSC
# breakout, accessorial rates, equipment requirements, driver requirements,
# and the load economics (mileage, $/mile estimate).
#
# Cross-validated against Convoy/Uber Freight/ECHO/Coyote/TQL standard Rate
# Confirmations and the TIA Watson Model template.
# ============================================================================


@dataclass
class RateBreakdown:
    """Itemized rate structure for a Rate Con (carrier-facing).

    All amounts in USD. Use None for fields that don't apply to this load.
    """
    linehaul: float                              # Base linehaul rate
    fuel_surcharge: float = 0.0                  # FSC — break out separately
    accessorials: list[InvoiceCharge] | None = None   # Detention, layover, lumper, etc.
    discount: float = 0.0                        # Negative for any discount

    @property
    def total(self) -> float:
        """All-in total the carrier will receive."""
        acc_total = sum(a.amount for a in (self.accessorials or []))
        return self.linehaul + self.fuel_surcharge + acc_total - self.discount


@dataclass
class EquipmentSpec:
    """Equipment + load handling requirements (carrier-facing)."""
    type: str                                    # "Dry Van 53'", "Reefer 53'", "Flatbed 48'", etc.
    length_ft: int | None = None                 # 48, 53, etc. — auto-derived from type if not set
    air_ride: bool = False                       # Required for shock-sensitive freight
    swing_doors_only: bool = False               # No roll-doors at this lane
    pallet_exchange: bool = False                # Carrier exchanges empty pallets at delivery
    # Reefer-specific (None for dry van)
    temp_setpoint_f: int | None = None           # e.g., 36 for fresh, -10 for frozen
    temp_continuous: bool | None = None          # True = continuous, False = cycle
    pre_cool_required: bool = False              # Pre-cool trailer before load
    # Loading method
    loading_method: str | None = None            # "Live load", "Drop trailer", "Dock high", "Reefer plug-in"
    unloading_method: str | None = None
    # Other operational
    stackable: bool | None = None                # None = not specified, True/False explicit
    tarp_required: bool = False                  # Flatbed only
    linear_feet: float | None = None             # LTL — required for LTL pricing


@dataclass
class CarrierRequirements:
    """Carrier qualification + insurance requirements (carrier-facing)."""
    cargo_insurance_min: float = 100_000.0       # Minimum cargo coverage
    auto_liability_min: float = 1_000_000.0      # Minimum auto liability
    general_liability_min: float = 1_000_000.0   # Minimum GL
    twic_required: bool = False                  # Port/secure facility access
    hazmat_endorsement_required: bool = False    # For hazmat loads
    fast_card_required: bool = False             # Cross-border (US/Canada/Mexico)
    eld_required: bool = True                    # Electronic logging device (default: yes per FMCSA)
    team_drivers: bool = False                   # Team service required
    bond_required: bool = False                  # Surety bond requirement


@dataclass
class RateConTerms:
    """Operational terms and policies (carrier-facing).

    These are typically restated on every Rate Con even though they're in the
    BCA, so the carrier doesn't need to look them up before accepting.
    """
    detention_free_hours: float = 2.0            # Free detention time at each stop
    detention_rate_per_hour: float = 50.0        # After free hours
    detention_max_per_stop: float | None = None  # Cap per stop (None = no cap)
    tonu_amount: float = 200.0                   # Truck-Order-Not-Used compensation
    layover_per_day: float = 250.0               # If carrier held overnight
    lumper_reimbursement: bool = True            # Reimburse with original receipt
    cancellation_window_hours: float = 4.0       # Notice required to cancel without penalty
    quick_pay_tier: str | None = None            # e.g., "7-day @ 2%" — Caravan Partner Program tier

def draw_rate_breakdown(c: Canvas, rate: RateBreakdown,
                        y_top: float, width: float = 280) -> float:
    """Draw the itemized rate breakdown for a Rate Con.

    Replaces the simpler "RATE: $2,800" meta-strip field with a proper
    breakdown carriers can evaluate: linehaul + FSC + accessorials + total.

    Layout matches `draw_charges_block` for visual consistency with invoices.
    Returns y at bottom of block.
    """
    x_start = PAGE_W - MARGIN - width

    _label(c, "CARRIER RATE", x_start, y_top, color=GOLD_DARK, size=7)
    cur_y = y_top - 16
    line_h = 16

    def line(label: str, amount: float, font: str = "Helvetica",
             label_color=FG_2, amt_color=FG_1):
        nonlocal cur_y
        c.setFont(font, 10)
        c.setFillColor(label_color)
        c.drawString(x_start, cur_y, label)
        amt = f"${amount:,.2f}"
        c.setFillColor(amt_color)
        c.setFont(font, 10)
        amt_w = c.stringWidth(amt, font, 10)
        c.drawString(x_start + width - amt_w, cur_y, amt)
        cur_y -= line_h

    line("Linehaul", rate.linehaul)
    if rate.fuel_surcharge > 0:
        line("Fuel Surcharge", rate.fuel_surcharge)
    if rate.accessorials:
        for acc in rate.accessorials:
            line(acc.label, acc.amount)
    if rate.discount > 0:
        line("Discount", -rate.discount, label_color=FG_2, amt_color=FG_2)

    # Dashed rule above total
    cur_y -= 2
    c.saveState()
    c.setStrokeColor(BORDER_2)
    c.setLineWidth(0.5)
    c.setDash(2, 2)
    c.line(x_start, cur_y, x_start + width, cur_y)
    c.restoreState()
    cur_y -= 8

    # Total — bold, larger
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(FG_1)
    c.drawString(x_start, cur_y, "Total Carrier Pay")
    total_str = f"${rate.total:,.2f}"
    c.setFont("Helvetica-Bold", 12)
    total_w = c.stringWidth(total_str, "Helvetica-Bold", 12)
    c.drawString(x_start + width - total_w, cur_y, total_str)
    cur_y -= line_h

    return cur_y


def draw_equipment_spec(c: Canvas, equip: EquipmentSpec,
                        y_top: float) -> float:
    """Draw the equipment + handling requirements block.

    Renders as a slim two-column key/value list bracketed by gold rules,
    similar to the lane reference row but with operational specs.
    """
    _gold_rule(c, y_top, color=GOLD, weight=0.5)

    # Build the list of fields, omitting any that aren't relevant
    fields: list[tuple[str, str]] = []

    # Equipment header
    eq_str = equip.type
    if equip.length_ft and str(equip.length_ft) not in equip.type:
        eq_str = f"{equip.type} ({equip.length_ft}')"
    fields.append(("EQUIPMENT", eq_str))

    # Trailer requirements
    trailer_reqs = []
    if equip.air_ride:
        trailer_reqs.append("Air ride")
    if equip.swing_doors_only:
        trailer_reqs.append("Swing doors only")
    if equip.tarp_required:
        trailer_reqs.append("Tarps required")
    if trailer_reqs:
        fields.append(("TRAILER REQ", " · ".join(trailer_reqs)))

    # Reefer specifics
    if equip.temp_setpoint_f is not None:
        temp_str = f"{equip.temp_setpoint_f}°F"
        if equip.temp_continuous is True:
            temp_str += " continuous"
        elif equip.temp_continuous is False:
            temp_str += " cycle"
        if equip.pre_cool_required:
            temp_str += " · pre-cool required"
        fields.append(("TEMPERATURE", temp_str))

    # Loading
    if equip.loading_method:
        fields.append(("LOADING", equip.loading_method))
    if equip.unloading_method:
        fields.append(("UNLOADING", equip.unloading_method))

    # Other
    if equip.stackable is True:
        fields.append(("STACKABILITY", "Stackable OK"))
    elif equip.stackable is False:
        fields.append(("STACKABILITY", "Single stack only — DO NOT STACK"))
    if equip.pallet_exchange:
        fields.append(("PALLET EXCHANGE", "Required"))
    if equip.linear_feet is not None:
        fields.append(("LINEAR FEET", f"{equip.linear_feet:.1f} ft"))

    # Render as 2-column key/value grid
    col_w = CONTENT_W / 2
    cur_y = y_top - 14
    line_h = 13
    for i, (key, val) in enumerate(fields):
        col = i % 2
        x = MARGIN + col * col_w
        _label(c, key, x, cur_y, color=GOLD_DARK, size=6.5)
        c.setFont("Helvetica", 9.5)
        c.setFillColor(FG_1)
        c.drawString(x + 90, cur_y, val)
        if col == 1:
            cur_y -= line_h

    if len(fields) % 2 == 1:
        cur_y -= line_h
    cur_y -= 4

    _gold_rule(c, cur_y, color=GOLD, weight=0.5)
    return cur_y - 8


def draw_carrier_requirements(c: Canvas, reqs: CarrierRequirements,
                              y_top: float) -> float:
    """Draw the carrier qualification requirements block.

    Restates the insurance + endorsement requirements from the BCA so the
    carrier sees them at point of acceptance. Rendered as a cream-2 panel
    with a "REQ" gold-dark label.
    """
    label_h = 14
    item_h = 12
    items: list[str] = []

    # Insurance minimums
    items.append(f"Cargo: ${reqs.cargo_insurance_min:,.0f} min")
    items.append(f"Auto Liability: ${reqs.auto_liability_min:,.0f} min")
    items.append(f"General Liability: ${reqs.general_liability_min:,.0f} min")

    # Endorsements / certifications
    endorsements = []
    if reqs.twic_required:
        endorsements.append("TWIC")
    if reqs.hazmat_endorsement_required:
        endorsements.append("Hazmat endorsement")
    if reqs.fast_card_required:
        endorsements.append("FAST card")
    if reqs.eld_required:
        endorsements.append("ELD compliant")
    if reqs.team_drivers:
        endorsements.append("Team drivers")
    if reqs.bond_required:
        endorsements.append("Surety bond")
    if endorsements:
        items.append("Required: " + " · ".join(endorsements))

    panel_h = label_h + (len(items) * item_h) + 14
    panel_y = y_top - panel_h

    c.saveState()
    c.setFillColor(CREAM_2)
    c.setStrokeColor(BORDER_1)
    c.setLineWidth(0.5)
    c.roundRect(MARGIN, panel_y, CONTENT_W, panel_h, 6, stroke=1, fill=1)
    c.restoreState()

    _label(c, "CARRIER REQUIREMENTS", MARGIN + 10, y_top - 12,
           color=GOLD_DARK, size=7)

    cur_y = y_top - 26
    c.setFont("Helvetica", 9)
    c.setFillColor(FG_1)
    for item in items:
        c.drawString(MARGIN + 10, cur_y, "•  " + item)
        cur_y -= item_h

    return panel_y - 8


def draw_rate_con_terms(c: Canvas, terms: RateConTerms,
                         y_top: float) -> float:
    """Draw the operational terms block (detention, TONU, layover, lumper).

    These are restated on every Rate Con even though they're in the BCA
    so carriers don't need to look them up before accepting.
    """
    items: list[tuple[str, str]] = []

    # Detention
    det_str = f"${terms.detention_rate_per_hour:.0f}/hr after {terms.detention_free_hours:.0f} hrs free"
    if terms.detention_max_per_stop:
        det_str += f", capped at ${terms.detention_max_per_stop:.0f}/stop"
    items.append(("DETENTION", det_str))

    items.append(("TONU", f"${terms.tonu_amount:.0f} (truck-order-not-used)"))
    items.append(("LAYOVER", f"${terms.layover_per_day:.0f}/day"))

    if terms.lumper_reimbursement:
        items.append(("LUMPER", "Reimbursed with original receipt"))
    items.append(("CANCELLATION", f"{int(terms.cancellation_window_hours)}-hour notice without penalty"))

    if terms.quick_pay_tier:
        items.append(("QUICK PAY", terms.quick_pay_tier))

    # Render as 2-col grid like equipment spec
    col_w = CONTENT_W / 2
    label_y = y_top
    _label(c, "OPERATIONAL TERMS", MARGIN, label_y, color=GOLD_DARK, size=7)
    cur_y = label_y - 16
    line_h = 13

    for i, (key, val) in enumerate(items):
        col = i % 2
        x = MARGIN + col * col_w
        _label(c, key, x, cur_y, color=GOLD_DARK, size=6.5)
        c.setFont("Helvetica", 9)
        c.setFillColor(FG_1)
        c.drawString(x + 90, cur_y, val)
        if col == 1:
            cur_y -= line_h
    if len(items) % 2 == 1:
        cur_y -= line_h
    return cur_y - 4


def draw_lane_economics(c: Canvas, miles: float, transit_days: float,
                         total_pay: float, y_top: float) -> float:
    """Draw the lane economics callout — miles, transit, $/mile.

    Carriers use this to evaluate whether to accept the load. Three boxes
    side-by-side: MILES | TRANSIT | $/MILE. Rendered as gold-tint pills.
    """
    box_w = (CONTENT_W - 16) / 3
    box_h = 42
    panel_y = y_top - box_h

    fields = [
        ("MILES",   f"{miles:,.0f}",        "Lane mileage"),
        ("TRANSIT", f"{transit_days:.1f} days", "Standard pace"),
        ("$/MILE",  f"${total_pay/miles:.2f}", "Carrier rate"),
    ]

    for i, (label, value, sub) in enumerate(fields):
        x = MARGIN + i * (box_w + 8)
        # Gold-tint pill
        c.saveState()
        c.setFillColor(GOLD_TINT)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.5)
        c.roundRect(x, panel_y, box_w, box_h, 6, stroke=1, fill=1)
        c.restoreState()

        _label(c, label, x + 10, y_top - 11, color=GOLD_DARK, size=6.5)
        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(NAVY)
        c.drawString(x + 10, panel_y + 10, value)
        c.setFont("Helvetica", 8)
        c.setFillColor(FG_3)
        # Right-aligned sub-label
        sub_w = c.stringWidth(sub, "Helvetica", 8)
        c.drawString(x + box_w - 10 - sub_w, panel_y + 10, sub)

    return panel_y - 8




__all__ = [
    "BRAND", "NAVY", "GOLD", "GOLD_DARK", "CREAM", "CREAM_2", "WHITE",
    "FG_1", "FG_2", "FG_3", "FG_ON_NAVY",
    "Party", "SignatureRole",
    "BillTo", "InvoiceCharge", "RemitTo",
    "RateBreakdown", "EquipmentSpec", "CarrierRequirements", "RateConTerms",
    "BOL_SIGNATURE_ROLES", "RATE_CON_SIGNATURE_ROLES", "MASTER_AGREEMENT_SIGNATURE_ROLES",
    "draw_header_first_page", "draw_meta_strip",
    "draw_parties_block", "draw_signature_block",
    "draw_footer", "draw_continuation_header",
    "draw_shipment_table", "draw_panel",
    # Invoice-specific helpers
    "draw_bill_to_block", "draw_invoice_meta_block", "draw_lane_reference_row",
    "draw_charges_block", "draw_settlement_summary",
    "draw_remit_to_block", "draw_payment_reference",
    # Rate Confirmation operational helpers
    "draw_rate_breakdown", "draw_equipment_spec", "draw_carrier_requirements",
    "draw_rate_con_terms", "draw_lane_economics",
    "PAGE_W", "PAGE_H", "MARGIN", "CONTENT_W",
]
