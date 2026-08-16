/**
 * srl_chrome.ts — Silk Route Logistics PDF chrome library (TypeScript / PDFKit)
 *
 * Mirror of srl_chrome.py for production pdfService.ts. Same building blocks,
 * same tokens, same v2.9 production-validated visual pattern.
 *
 * Source of truth: ./srl_tokens.json
 *
 * Usage in pdfService.ts:
 *   import PDFDocument from 'pdfkit';
 *   import {
 *     registerSkillFonts,
 *     drawHeaderFirstPage, drawMetaStrip, drawPartiesBlock,
 *     drawSignatureBlock, drawFooter, BOL_SIGNATURE_ROLES,
 *     PAGE_W, PAGE_H, MARGIN
 *   } from './srl_chrome';
 *
 *   const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
 *   registerSkillFonts(doc);   // REQUIRED — see TYPOGRAPHY section below.
 *                              // Every chrome function names a registered
 *                              // face; without this call PDFKit throws
 *                              // "Font not found" on the first text().
 *   let y = drawHeaderFirstPage(doc, {
 *     docTitle: 'Bill of Lading',
 *     subtitle: 'Straight · Non-Negotiable',
 *     qrUrl: `https://silkroutelogistics.ai/track/${load.id}`,
 *     loadId: `BOL-SRL-${load.id}`,
 *   });
 *   y = drawMetaStrip(doc, { ...fields }, y - 4);
 *   ...
 *   drawFooter(doc, { pageNum: 1, totalPages: 2 });
 *
 * Dependencies (production stack):
 *   npm install pdfkit qrcode
 *   npm install --save-dev @types/pdfkit @types/qrcode
 */

import type PDFKit from 'pdfkit';

// ============================================================================
// TOKENS — keep in sync with srl_tokens.json
// ============================================================================

export const TOKENS = {
  navy:        '#0A2540',
  navy700:     '#15365A',
  gold:        '#C5A572',  // structural
  goldDark:    '#BA7517',  // emphasis
  goldTint:    '#FAEEDA',
  cream:       '#FBF7F0',
  cream2:      '#F5EEE0',
  white:       '#FFFFFF',
  fg1:         '#0A2540',
  fg2:         '#3A4A5F',
  fg3:         '#6B7685',
  fgOnNavy:    '#FBF7F0',
  // v3.8.aru — CRITICAL RENDER FIX. These were 8-digit hex with an alpha byte.
  // PDFKit has no alpha-in-hex support: it parses the whole string as one
  // integer and shifts, so #0A25401A yielded r = 10.184, which a PDF renderer
  // clamps to 1.0 per ISO 32000-1 §8.6.8. Proven by content-stream dump:
  //     #0A25401A  ->  10.184313725490195 0.25098039215686274 0.10196078431372549 SCN
  // Every border and all seven CARRIER · ACCEPTANCE signature underlines were
  // rendering rgb(255, 64, 26) — bright red-orange — on every SRL PDF, not just
  // the Rate Confirmation.
  //
  // references/tokens.md declares these as rgba over navy #0A2540 at 10/16/32%.
  // PDFKit cannot express that in a colour string, so the values below are those
  // exact alphas PRE-COMPOSITED over the white print canvas. That keeps every
  // existing call site working unchanged, which matters because a missed call
  // site under the alternative (strokeOpacity) fails to fully-opaque navy — a
  // different wrong. Where a border sits on a cream-2 panel the composite is
  // marginally cool, imperceptible at 0.5pt hairline weight.
  border1:     '#E7E9EC',  // rgba(10,37,64,0.10) over white
  border2:     '#D8DCE0',  // rgba(10,37,64,0.16) over white
  borderStrong:'#B1B9C2',  // rgba(10,37,64,0.32) over white
} as const;

export const BRAND = {
  legalName:          'SILK ROUTE LOGISTICS INC.',
  tagline:            'Where Trust Travels.',
  operationalTagline: 'First Call. Last Update. Every Mile In Between.',
  domain:             'silkroutelogistics.ai',
  address:            '2317 S 35th St, Galesburg, MI 49053',
  phone:              '+1 (269) 220-6760',
  email:              'operations@silkroutelogistics.ai',
  mc:                 '1794414',
  dot:                '4526880',
} as const;

// US Letter, 0.5" margins (PDFKit uses points: 1pt = 1/72 inch)
export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 36;
export const CONTENT_W = PAGE_W - 2 * MARGIN;

// ============================================================================
// TYPOGRAPHY — Sprint 47 (Item 101), synced from backend/src/lib/srl-chrome.ts
//
// references/tokens.md mandates Playfair Display (display) + DM Sans (body).
// This library previously named PDFKit's built-ins (Helvetica / Times-Bold /
// Times-Italic), so every PDF generated from the bundled script rendered in
// Helvetica — off-brand, and silently so, because a built-in font never fails
// to resolve. The names below are REGISTERED faces: they only resolve after
// registerSkillFonts(doc) has run, which turns a brand miss into a loud error
// instead of a quiet one.
//
//   Playfair Display 700 / italic — display headings + tagline
//   DM Sans 400/500/700           — body text + small-caps labels
//   Courier / Courier-Bold        — mono (PDFKit built-ins; tokens.md names
//                                   SF Mono for web, and the skill spec ships
//                                   no custom mono TTF, so the built-ins stay
//                                   for reference fields like load IDs and the
//                                   TRACK label per references/pdf-chrome.md,
//                                   and for the ABA/routing line, where
//                                   fixed-width digits are the whole point)
//
// Exported (not module-private as before) so consumers rendering text outside
// the canned drawing functions — custom T&C blocks, special-instruction
// panels — name the same faces instead of hardcoding strings that drift.
// ============================================================================

import * as path from 'path';
import * as fs from 'fs';

export const FONT_BODY = 'DMSans-Regular';
export const FONT_BODY_BOLD = 'DMSans-Bold';
export const FONT_BODY_ITALIC = 'DMSans-Italic';
export const FONT_DISPLAY_BOLD = 'Playfair-Bold';
export const FONT_DISPLAY_ITALIC = 'Playfair-Italic';
export const FONT_MONO = 'Courier';
export const FONT_MONO_BOLD = 'Courier-Bold';

/** Registered face name -> TTF filename, as shipped in bol-v2.9. */
const FONT_FILES: ReadonlyArray<readonly [string, string]> = [
  ['Playfair-Regular',   'PlayfairDisplay-Regular.ttf'],
  ['Playfair-Italic',    'PlayfairDisplay-Italic.ttf'],
  ['Playfair-Bold',      'PlayfairDisplay-Bold.ttf'],
  ['Playfair-BoldItalic','PlayfairDisplay-BoldItalic.ttf'],
  ['DMSans-Regular',     'DMSans-Regular.ttf'],
  ['DMSans-Italic',      'DMSans-Italic.ttf'],
  ['DMSans-Medium',      'DMSans-Medium.ttf'],
  ['DMSans-SemiBold',    'DMSans-SemiBold.ttf'],
  ['DMSans-Bold',        'DMSans-Bold.ttf'],
];

/**
 * Locate the bol-v2.9 TTF directory.
 *
 * The live mirror at backend/src/lib/srl-chrome.ts hardcodes a single path
 * (`__dirname/../assets/fonts/bol-v2.9`) because it always sits one directory
 * below src/. This copy is the portable one — it gets vendored into projects
 * with different layouts — so it searches, in priority order:
 *
 *   1. the explicit `fontsDir` argument
 *   2. $SRL_FONTS_DIR
 *   3. `<this file>/fonts`                     — fonts vendored beside the script,
 *                                                the same pattern the compass PNGs use
 *   4. `<this file>/../assets/fonts/bol-v2.9`  — the live-mirror layout, for when
 *                                                this file is copied into src/lib/
 *   5. `<repo root>/backend/src/assets/fonts/bol-v2.9` — in-repo location, reached
 *                                                from .claude/skills/<skill>/scripts/
 *
 * Throws with the remedy spelled out rather than falling back to Helvetica:
 * a silent fallback is precisely the bug this section exists to kill.
 */
function resolveFontsDir(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.SRL_FONTS_DIR,
    path.resolve(__dirname, 'fonts'),
    path.resolve(__dirname, '../assets/fonts/bol-v2.9'),
    path.resolve(__dirname, '../../../../backend/src/assets/fonts/bol-v2.9'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'DMSans-Regular.ttf'))) return dir;
  }

  throw new Error(
    'srl_chrome: could not locate the bol-v2.9 font directory (Playfair Display ' +
    '+ DM Sans TTFs). Pass it explicitly as registerSkillFonts(doc, fontsDir), ' +
    'or set SRL_FONTS_DIR. Searched: ' + candidates.join(', ')
  );
}

/**
 * Register the skill's canonical faces on a PDFDocument, and suppress
 * ligature substitution for the lifetime of that document.
 *
 * MUST be called immediately after `new PDFDocument(...)` and before any
 * chrome function runs — the drawing functions name registered faces, and
 * fontkit throws "Font not found" if they aren't on the doc yet.
 */
export function registerSkillFonts(doc: PDFKit.PDFDocument, fontsDir?: string): void {
  const dir = resolveFontsDir(fontsDir);
  for (const [face, file] of FONT_FILES) {
    doc.registerFont(face, path.join(dir, file));
  }

  // Sprint 47.b (Item 103) — ligature suppression. Bundled INSIDE font
  // registration deliberately: registering Playfair + DM Sans without this
  // patch reintroduces a shipped bug. fontkit substitutes the `fi` ligature
  // and the Rate Confirmation title rendered "Rate Confrmation" — same class
  // as the "classified" -> "classifed" bug Sprint v3.8.b fixed for BOL v2.9.
  // Built-in PDFKit faces don't exhibit it and don't need the patch, so
  // applying it doc-wide is harmless.
  //
  // fontkit accepts `features` as either an array (ADDITIVE — enables the
  // listed features on top of the script defaults, and therefore cannot turn
  // `liga` off) or an object (explicit on/off per tag). Only the object form
  // can disable a default, so an array supplied by a caller is discarded.
  // Covers direct doc.text() calls and fluent-chained .text() calls alike.
  //
  // @types/pdfkit declares features as `string[]`, which models only the array
  // form; the `as unknown as string[]` cast is an explicit concession that
  // we're using the runtime-supported object shape the types don't describe.
  const _origText = doc.text.bind(doc);
  (doc as { text: typeof doc.text }).text =
    function (this: typeof doc, ...args: unknown[]): typeof doc {
      const last = args[args.length - 1];
      const isOptionsObj =
        last !== null &&
        typeof last === "object" &&
        !Array.isArray(last) &&
        !Buffer.isBuffer(last);

      // Base object: disable all ligature-family features, keep kern on.
      const base: Record<string, boolean> = {
        liga: false,
        clig: false,
        rlig: false,
        dlig: false,
        kern: true,
      };

      if (isOptionsObj) {
        const opts = last as Record<string, unknown>;
        const callerFeatures = opts.features;
        let merged: Record<string, boolean>;
        if (
          callerFeatures !== null &&
          typeof callerFeatures === "object" &&
          !Array.isArray(callerFeatures)
        ) {
          // Object form: preserve caller intent (e.g. a kern preference) but
          // force the four liga-family flags off.
          merged = {
            ...(callerFeatures as Record<string, boolean>),
            liga: false,
            clig: false,
            rlig: false,
            dlig: false,
            kern:
              (callerFeatures as Record<string, boolean>).kern ?? true,
          };
        } else {
          // Array form (additive, can't disable defaults) or missing.
          merged = base;
        }
        opts.features = merged as unknown as string[];
      } else {
        args.push({ features: base as unknown as string[] });
      }
      return (_origText as (...a: unknown[]) => typeof doc)(...args);
    } as typeof doc.text;
}

// ============================================================================
// PRIMITIVES
// ============================================================================

interface PDFDoc extends PDFKit.PDFDocument {}

function goldRule(
  doc: PDFDoc,
  y: number,
  options: { xStart?: number; xEnd?: number; color?: string; weight?: number } = {}
): void {
  const { xStart = MARGIN, xEnd = PAGE_W - MARGIN, color = TOKENS.gold, weight = 1.0 } = options;
  doc.save()
     .strokeColor(color)
     .lineWidth(weight)
     .moveTo(xStart, y).lineTo(xEnd, y).stroke()
     .restore();
}

function drawLabel(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  options: { color?: string; size?: number } = {}
): void {
  const { color = TOKENS.goldDark, size = 7.5 } = options;
  // Render uppercase with ~8% letter-spacing using PDFKit's characterSpacing
  doc.save()
     .fillColor(color)
     .font(FONT_BODY_BOLD, size);
  // PDFKit doesn't expose characterSpacing directly on text(); use options
  doc.text(text.toUpperCase(), x, y, {
    characterSpacing: size * 0.08,
    lineBreak: false,
  });
  doc.restore();
}

function drawBody(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  options: { font?: string; size?: number; color?: string } = {}
): void {
  const { font = FONT_BODY, size = 9.5, color = TOKENS.fg1 } = options;
  doc.save()
     .fillColor(color)
     .font(font, size)
     .text(text, x, y, { lineBreak: false })
     .restore();
}

function drawItalic(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  options: { size?: number; color?: string } = {}
): void {
  const { size = 9, color = TOKENS.goldDark } = options;
  doc.save()
     .fillColor(color)
     .font(FONT_DISPLAY_ITALIC, size)
     .text(text, x, y, { lineBreak: false })
     .restore();
}

// ============================================================================
// COMPASS MARK — production SRL logo.
//
// The production mark ships as a vector SVG (srl_compass.svg) traced from
// the BOL v2.9 reference (BOL-L6894191249, Apr 30 2026), with PNG raster
// fallbacks at 60/120/240/480px for environments without SVG support.
//
// Resolves to the bundled raster PNG by default — PDFKit doesn't natively
// render SVG. To use the SVG, pre-rasterize to PNG via a tool like sharp,
// or use the equivalent vector code path in srl_chrome.py.
//
// Override via opts.compassMarkPath if you have a different logo file.
// ============================================================================

// `path` and `fs` are imported once, up in the TYPOGRAPHY section.

const LOGO_DIR = __dirname;

/**
 * Resolve the smallest bundled PNG fallback >= the requested size.
 * If no fallback is available, returns null and the caller should draw
 * the placeholder ring as a last resort.
 */
function resolveCompassPng(targetSize: number): string | null {
  for (const px of [60, 120, 240, 480]) {
    if (px >= targetSize) {
      const p = path.join(LOGO_DIR, `srl_compass_${px}.png`);
      if (fs.existsSync(p)) return p;
    }
  }
  // Final fallback to largest if target is bigger than what we ship
  const fallback = path.join(LOGO_DIR, 'srl_compass_480.png');
  return fs.existsSync(fallback) ? fallback : null;
}

// v3.8.anc — exported. Ceremonial layouts that don't use drawHeaderFirstPage
// need the mark on its own (the live mirror exports it for the SRL Driver
// Academy completion certificate, which centres the mark rather than running
// the document-style header). Additive; behaviour unchanged.
export function drawCompassMark(doc: PDFDoc, x: number, y: number, size: number = 50): void {
  const pngPath = resolveCompassPng(size);

  if (pngPath) {
    doc.image(pngPath, x, y, { width: size, height: size });
    return;
  }

  // Last resort: draw a simple navy ring so the absence of the logo is obvious.
  // This branch should only execute if the bundled assets weren't deployed.
  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.save()
     .strokeColor(TOKENS.navy)
     .lineWidth(2)
     .fillColor(TOKENS.white)
     .circle(cx, cy, size * 0.45)
     .fillAndStroke()
     .restore();
}

// ============================================================================
// PUBLIC: HEADER (FIRST PAGE)
// ============================================================================

export interface HeaderOptions {
  docTitle: string;
  subtitle?: string;
  qrUrl?: string;
  loadId?: string;
  /** Async-rendered QR PNG buffer; required if includeQr is true. */
  qrBuffer?: Buffer;
  /**
   * QR codes are operational — they're for warehouse/driver scanning at
   * pickup/transit/delivery. They belong on documents that travel
   * physically with the load, which means the BOL only. Rate Confirmations
   * (carrier email/portal artifact, no scan event), Invoices (AP workflow
   * uses field parsing not scanning), BCAs/QPs (master agreements signed
   * once and filed), and other paperwork should NOT carry a tracking QR.
   *
   * Pass includeQr=true ONLY for BOL generation. Default is false.
   * For non-BOL documents, the right area shows the document identifier
   * (loadId) in monospace as a clean filing reference, no QR.
   */
  includeQr?: boolean;
  yTop?: number;
}

/**
 * Draw the standard SRL first-page header.
 * Returns y-coordinate of the bottom of the header for body content.
 *
 * NOTE: PDFKit y-axis runs top-down (origin at top-left). All y values
 * here are PDFKit coords, NOT reportlab's bottom-up coords.
 */
export function drawHeaderFirstPage(doc: PDFDoc, options: HeaderOptions): number {
  const { docTitle, subtitle, loadId, qrBuffer, includeQr = false, yTop = MARGIN } = options;

  // Compass mark
  drawCompassMark(doc, MARGIN, yTop, 55);

  // Company info block
  const infoX = MARGIN + 70;
  const infoY = yTop + 4;

  doc.fillColor(TOKENS.navy).font(FONT_BODY_BOLD, 13)
     .text(BRAND.legalName, infoX, infoY, { lineBreak: false });

  doc.fillColor(TOKENS.fg2).font(FONT_BODY, 8.5)
     .text(BRAND.address, infoX, infoY + 16, { lineBreak: false })
     .text(`${BRAND.phone}  |  ${BRAND.email}  |  ${BRAND.domain}`,
           infoX, infoY + 28, { lineBreak: false });
  doc.fillColor(TOKENS.fg1).font(FONT_BODY_BOLD, 8.5)
     .text(`MC# ${BRAND.mc}  ·  DOT# ${BRAND.dot}`, infoX, infoY + 40, { lineBreak: false });

  // Tagline (italic gold-dark)
  drawItalic(doc, BRAND.tagline, infoX, infoY + 52, { size: 9 });

  // Right area — QR (BOL only) or clean doc-id reference (everything else)
  if (includeQr && qrBuffer) {
    const qrBox = 75;
    const qrX = PAGE_W - MARGIN - qrBox;
    const qrY = yTop;

    doc.image(qrBuffer, qrX, qrY, { width: qrBox, height: qrBox });

    // Gold frame
    doc.save()
       .strokeColor(TOKENS.gold)
       .lineWidth(0.75)
       .rect(qrX - 3, qrY - 3, qrBox + 6, qrBox + 6)
       .stroke()
       .restore();

    // TRACK label below QR
    drawLabel(doc, 'TRACK', qrX + 5, qrY + qrBox + 6, { color: TOKENS.goldDark, size: 7 });

    if (loadId) {
      doc.font(FONT_MONO_BOLD, 8.5)
         .fillColor(TOKENS.fg1)
         .text(loadId, qrX, qrY + qrBox + 18, { lineBreak: false });
    }
  } else if (loadId) {
    // Non-BOL: show doc identifier in upper-right as filing reference.
    // No QR (would be visual noise — see HeaderOptions docstring),
    // no TRACK label (the doc isn't a tracking artifact).
    drawLabel(doc, 'REFERENCE', PAGE_W - MARGIN - 100, yTop + 4,
              { color: TOKENS.goldDark, size: 6.5 });
    doc.font(FONT_MONO_BOLD, 11).fillColor(TOKENS.fg1);
    const idW = doc.widthOfString(loadId);
    doc.text(loadId, PAGE_W - MARGIN - idW, yTop + 18, { lineBreak: false });
  }

  // Top gold rule
  const ruleY = yTop + 80;
  goldRule(doc, ruleY);

  // Document title and subtitle
  const titleY = ruleY + 12;
  doc.font(FONT_DISPLAY_BOLD, 22)
     .fillColor(TOKENS.navy)
     .text(docTitle, MARGIN, titleY, { lineBreak: false });

  if (subtitle) {
    doc.fillColor(TOKENS.goldDark)
       .font(FONT_DISPLAY_ITALIC, 8.5)
       .text(subtitle.toUpperCase(), MARGIN, titleY + 28, { lineBreak: false });
  }

  return titleY + 44;
}

// ============================================================================
// PUBLIC: META STRIP
// ============================================================================

/**
 * Draw the 6-field meta strip with gold rules above and below.
 * Empty/null/undefined values render as em-dash '—' per spec.
 */
export function drawMetaStrip(
  doc: PDFDoc,
  fields: Record<string, string | null | undefined>,
  yTop: number
): number {
  const items = Object.entries(fields);
  const n = items.length;
  if (n === 0) return yTop;

  const colW = CONTENT_W / n;

  // Top gold rule
  goldRule(doc, yTop, { weight: 0.5 });

  const labelY = yTop + 4;
  const valueY = yTop + 16;

  items.forEach(([key, val], i) => {
    const x = MARGIN + i * colW;
    drawLabel(doc, key, x, labelY, { color: TOKENS.goldDark, size: 6.5 });
    const display = val && String(val).trim() ? String(val) : '—';
    drawBody(doc, display, x, valueY, { font: FONT_BODY, size: 10, color: TOKENS.fg1 });
  });

  // Bottom gold rule
  const bottomY = yTop + 32;
  goldRule(doc, bottomY, { weight: 0.5 });
  return bottomY + 8;
}

// ============================================================================
// PUBLIC: PARTIES BLOCK
// ============================================================================

export interface Party {
  name: string;
  addressLines: string[];
  contact?: string;
  window?: string;
}

export function drawPartiesBlock(
  doc: PDFDoc,
  shipper: Party,
  consignee: Party,
  yTop: number,
  height: number = 90
): number {
  const panelW = (CONTENT_W - 12) / 2;

  drawLabel(doc, 'PARTIES', MARGIN, yTop - 14, { color: TOKENS.goldDark, size: 7 });

  const parties: [Party, string][] = [
    [shipper,   'SHIPPER · PICKUP FROM'],
    [consignee, 'CONSIGNEE · DELIVER TO'],
  ];

  parties.forEach(([party, role], i) => {
    const x = MARGIN + i * (panelW + 12);

    // cream-2 panel
    doc.save()
       .fillColor(TOKENS.cream2)
       .strokeColor(TOKENS.border1)
       .lineWidth(0.5)
       .roundedRect(x, yTop, panelW, height, 8)
       .fillAndStroke()
       .restore();

    drawLabel(doc, role, x + 10, yTop + 8, { color: TOKENS.goldDark, size: 6.5 });

    doc.font(FONT_BODY_BOLD, 11)
       .fillColor(TOKENS.navy)
       .text(party.name, x + 10, yTop + 22, { lineBreak: false });

    let cur = yTop + 38;
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2);
    party.addressLines.forEach(line => {
      doc.text(line, x + 10, cur, { lineBreak: false });
      cur += 11;
    });

    cur += 2;
    if (party.contact) {
      doc.fillColor(TOKENS.fg1).text(`Contact: ${party.contact}`, x + 10, cur, { lineBreak: false });
      cur += 11;
    }
    if (party.window) {
      doc.text(`Window: ${party.window}`, x + 10, cur, { lineBreak: false });
    }
  });

  return yTop + height + 12;
}

// ============================================================================
// PUBLIC: SIGNATURE BLOCK
// ============================================================================

export interface SignatureRole {
  title: string;
  certification: string;
  fields: string[];
}

export const BOL_SIGNATURE_ROLES: SignatureRole[] = [
  {
    title: 'SHIPPER · REPRESENTATIVE',
    certification:
      'Certifies contents are properly classified, packaged, marked, and labeled per DOT regulations (49 CFR 172).',
    fields: ['SIGNATURE', 'PRINT NAME', 'PIECES TENDERED', 'DATE'],
  },
  {
    title: 'CARRIER · DRIVER',
    certification: 'Acknowledges receipt of shipment in apparent good order, except as noted.',
    fields: ['CARRIER LEGAL NAME', 'MC #', 'DOT #', 'DRIVER NAME',
             'SIGNATURE', 'TRUCK #', 'TRAILER #', 'SEAL #', 'DATE'],
  },
  {
    title: 'CONSIGNEE · RECEIVER',
    certification: 'Acknowledges delivery — any exceptions noted above.',
    fields: ['SIGNATURE', 'PRINT NAME', 'PIECES RECEIVED', 'DATE'],
  },
];

/**
 * Rate Confirmation signature — single block, Carrier acceptance only.
 * A Rate Con is a binding agreement between Broker and Carrier on rate +
 * terms. Shipper isn't a party; Consignee has no role. The Broker's act
 * of issuing the document is the Broker signature; only the Carrier
 * countersigns to accept the rate and bind the load.
 */
export const RATE_CON_SIGNATURE_ROLES: SignatureRole[] = [
  {
    title: 'CARRIER · ACCEPTANCE',
    // Sprint 50 (Item 122) — prose paragraph removed. Both sentences were
    // verbatim duplicates of GOVERNING TERMS clauses (1) and (9), so the
    // document said the same thing twice, once in a place a carrier reads as
    // the binding text and once as signature-block filler. The header label
    // remains as the structural section anchor; drawSignatureBlock guards the
    // certification render path when this is empty.
    certification: '',
    fields: ['CARRIER LEGAL NAME', 'MC #', 'DOT #',
             'AUTHORIZED SIGNATORY (PRINT)', 'TITLE',
             'SIGNATURE', 'DATE'],
  },
];

/**
 * Master-agreement signatures (BCA, QP) — Broker side + Carrier side,
 * each signed by an authorized officer. Used on cover pages.
 */
export const MASTER_AGREEMENT_SIGNATURE_ROLES: SignatureRole[] = [
  {
    title: 'BROKER · SILK ROUTE LOGISTICS INC.',
    certification: 'Authorized signatory binds Broker to the terms herein.',
    fields: ['PRINT NAME', 'TITLE', 'SIGNATURE', 'DATE'],
  },
  {
    title: 'CARRIER',
    certification: 'Authorized signatory binds Carrier to the terms herein.',
    fields: ['CARRIER LEGAL NAME', 'MC #', 'DOT #', 'EIN',
             'PRINT NAME', 'TITLE', 'SIGNATURE', 'DATE'],
  },
];

export function drawSignatureBlock(
  doc: PDFDoc,
  yTop: number,
  options: { roles?: SignatureRole[]; height?: number; prefilledValues?: Record<string, string> } = {}
): number {
  // Sprint 48.c — prefilledValues. Pre-fill the carrier identity SRL already
  // knows (CARRIER LEGAL NAME / MC # / DOT #) so the carrier only writes
  // AUTHORIZED SIGNATORY / TITLE / SIGNATURE / DATE at signing. Industry-
  // standard Rate Con pattern; matches CHR / Coyote / RXO templates. A field
  // present in the map renders its value above the underline in fg1; a field
  // absent leaves the underline bare for handwriting.
  const { roles = BOL_SIGNATURE_ROLES, height = 220, prefilledValues = {} } = options;
  const n = roles.length;
  const colW = CONTENT_W / n;

  // Vertical gold-dark rules
  doc.save().strokeColor(TOKENS.goldDark).lineWidth(0.5);
  for (let i = 1; i < n; i++) {
    const x = MARGIN + i * colW;
    doc.moveTo(x, yTop + 4).lineTo(x, yTop + height - 4).stroke();
  }
  doc.restore();

  roles.forEach((role, i) => {
    const x = MARGIN + i * colW + 6;
    const colInnerW = colW - 12;

    drawLabel(doc, role.title, x, yTop, { color: TOKENS.goldDark, size: 7 });

    // Sprint 50 (Item 122) — certification render guard. When the string is
    // empty, skip the italic render and set the field start explicitly:
    // doc.text('') still advances doc.y by a line height (~9pt), which would
    // leave phantom whitespace under the header label.
    let fieldY: number;
    if (role.certification && role.certification.length > 0) {
      // Certification (italic, wraps)
      doc.font(FONT_BODY_ITALIC, 7.5).fillColor(TOKENS.fg2)
         .text(role.certification, x, yTop + 16, { width: colInnerW, lineGap: 1 });
      fieldY = doc.y + 12;
    } else {
      fieldY = yTop + 20;
    }

    role.fields.forEach(f => {
      // Sprint 49.b (Item 139) — row pitch 22 -> 26pt, underline +14 -> +20,
      // value at +10. Sprint 48.c had placed the pre-filled value at fieldY+4
      // while the label sits at fieldY; a 6.5pt label extends ~6.5pt down and
      // an 8.5pt value starting at +4 produced a MEASURED ~2.5pt overlap on
      // every pre-filled row. At 26pt pitch the row reads label fieldY..~+7,
      // gap +7..+10, value +10..~+19, underline +20. Callers passing a fixed
      // block height must allow ~28pt x N fields of headroom.
      doc.font(FONT_BODY_BOLD, 6.5);
      drawLabel(doc, f, x, fieldY, { color: TOKENS.fg3, size: 6.5 });

      const preVal = prefilledValues[f];
      if (preVal) {
        doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg1);
        doc.text(preVal, x, fieldY + 10, { width: colInnerW, lineBreak: false });
      }

      // Underline
      doc.save()
         .strokeColor(TOKENS.borderStrong)
         .lineWidth(0.5)
         .moveTo(x, fieldY + 20)
         .lineTo(x + colInnerW, fieldY + 20)
         .stroke()
         .restore();
      fieldY += 26;
    });
  });

  return yTop + height;
}

// ============================================================================
// PUBLIC: FOOTER
// ============================================================================

/**
 * Three-column footer: authority chain (left) · tagline (center) · page N of M (right).
 *
 * A-8 — `docId` IS ACCEPTED AND DELIBERATELY UNUSED. Do not "fix" the footer by
 * stamping it. pdf-chrome.md specifies exactly three footer columns and no
 * document ID, so the omission is the SPEC and the parameter is the vestige.
 * The document ID belongs to the continuation header (see drawContinuationHeader,
 * which renders it twice — inline and right-aligned), not to the footer.
 *
 * Retained ONLY for call-site compatibility. In the backend mirror, five callers
 * pass it as an object-literal property; dropping it there turns TypeScript's
 * excess-property check into 5 × TS2353 and reds the build in files that module
 * does not own. Verified empirically, not assumed. If those call sites are ever
 * cleaned up, delete this property from all three copies in the same commit.
 */
export function drawFooter(
  doc: PDFDoc,
  options: { pageNum: number; totalPages: number; /** accepted for call-site compatibility, never rendered — see above */ docId?: string } = { pageNum: 1, totalPages: 1 }
): void {
  // docId intentionally NOT destructured — nothing below may render it.
  const { pageNum, totalPages } = options;
  const footerY = PAGE_H - MARGIN - 12;

  goldRule(doc, footerY - 4, { weight: 0.75 });

  const leftText = `MC# ${BRAND.mc}  ·  DOT# ${BRAND.dot}  ·  ${BRAND.domain}`;
  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg3)
     .text(leftText, MARGIN, footerY + 4, { lineBreak: false });

  // Center tagline
  const tagline = BRAND.tagline;
  doc.font(FONT_DISPLAY_ITALIC, 8).fillColor(TOKENS.goldDark);
  const taglineW = doc.widthOfString(tagline);
  doc.text(tagline, (PAGE_W - taglineW) / 2, footerY + 4, { lineBreak: false });

  // Right page number
  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg3);
  const pageText = `Page ${pageNum} of ${totalPages}`;
  const pageW = doc.widthOfString(pageText);
  doc.text(pageText, PAGE_W - MARGIN - pageW, footerY + 4, { lineBreak: false });
}

// ============================================================================
// PUBLIC: CONTINUATION HEADER
// ============================================================================

export function drawContinuationHeader(
  doc: PDFDoc,
  docTitle: string,
  docId: string,
  yTop: number = MARGIN
): number {
  drawCompassMark(doc, MARGIN, yTop, 30);

  const infoX = MARGIN + 40;
  doc.font(FONT_BODY_BOLD, 11).fillColor(TOKENS.navy)
     .text(BRAND.legalName, infoX, yTop + 4, { lineBreak: false });

  doc.font(FONT_BODY, 8).fillColor(TOKENS.fg3)
     .text(`${docId}  ·  ${docTitle} (continued)`,
           infoX, yTop + 16, { lineBreak: false });

  // Right side
  doc.font(FONT_BODY_BOLD, 9).fillColor(TOKENS.fg1);
  const docIdW = doc.widthOfString(docId);
  doc.text(docId, PAGE_W - MARGIN - docIdW, yTop + 4, { lineBreak: false });

  const ruleY = yTop + 38;
  goldRule(doc, ruleY, { weight: 0.5 });
  return ruleY + 14;
}

// ============================================================================
// PUBLIC: SHIPMENT TABLE
// ============================================================================

export function drawShipmentTable(
  doc: PDFDoc,
  options: {
    headers: string[];
    rows: string[][];
    totalsRow?: string[];
    yTop: number;
    colWidths?: number[];
  }
): number {
  const { headers, rows, totalsRow, yTop } = options;
  const n = headers.length;
  const colWidths = options.colWidths || Array(n).fill(CONTENT_W / n);

  const rowH = 18;
  const headerH = 16;

  // Header band — navy
  doc.save()
     .fillColor(TOKENS.navy)
     .rect(MARGIN, yTop, CONTENT_W, headerH)
     .fill()
     .restore();

  let curX = MARGIN + 8;
  headers.forEach((h, i) => {
    drawLabel(doc, h, curX, yTop + 5, { color: TOKENS.fgOnNavy, size: 7 });
    curX += colWidths[i];
  });

  // Body rows — all white (no fill). Single accent band is the totals row below.
  let curY = yTop + headerH;
  rows.forEach((row, ri) => {
    let cellX = MARGIN + 8;
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
    row.forEach((cell, i) => {
      doc.text(cell || '—', cellX, curY + 5, { lineBreak: false });
      cellX += colWidths[i];
    });
    curY += rowH;
  });

  // Totals row
  if (totalsRow) {
    doc.save()
       .fillColor(TOKENS.cream2)
       .rect(MARGIN, curY, CONTENT_W, rowH)
       .fill()
       .restore();
    let cellX = MARGIN + 8;
    doc.font(FONT_BODY_BOLD, 9).fillColor(TOKENS.fg1);
    totalsRow.forEach((cell, i) => {
      doc.text(cell || '', cellX, curY + 5, { lineBreak: false });
      cellX += colWidths[i];
    });
    curY += rowH;
  }

  return curY + 8;
}

// ============================================================================
// PUBLIC: cream-2 panel utility
// ============================================================================

// Panel geometry. Extracted as named constants so the measured (wrap) path and
// the fixed-height path cannot drift apart; the literals are the ones the
// single-line path has always used.
const PANEL_INSET_X = 10;   // left AND right body inset
const PANEL_BODY_TOP = 22;  // panel top -> body text start (clears the 6.5pt label at +8)
const PANEL_PAD_BOTTOM = 10; // measured-height mode only; matches the horizontal inset

/**
 * cream-2 panel utility.
 *
 * `wrap` DEFAULTS TO FALSE and the false path is byte-identical to the original:
 * fixed `h`, body rendered with `lineBreak: false`. Every existing caller is
 * unaffected — the only difference is that the function now also returns the y
 * below the panel, which callers are free to keep ignoring.
 *
 * `wrap: true` is the path that lets this utility absorb hand-built
 * roundedRect + fillAndStroke + manual wrapped text blocks (SKILL.md "Don't
 * hand-build chrome"; CLAUDE.md §13.3 Item 94). In that mode the panel is SIZED
 * FROM THE MEASURED TEXT rather than from `h`, so `h` is ignored and the return
 * value is the only way to learn where the panel ended.
 *
 * Correctness note (Sprint 47.b / Item 104, generalized): the height measurement
 * and the text render must share BOTH the same font AND the same text options —
 * `width` and `lineGap` both change wrapped height. They are measured and drawn
 * from one `textOpts` object here precisely so they cannot diverge.
 *
 * @returns y coordinate immediately below the panel (its bottom edge).
 */
export function drawPanel(
  doc: PDFDoc,
  options: {
    x: number; y: number; w: number; h: number;
    label?: string; bodyText?: string;
    /** Wrap multi-line bodyText and size the panel to it. `h` is ignored when true. Default false. */
    wrap?: boolean;
  }
): number {
  const { x, y, w, h, label, bodyText, wrap = false } = options;

  // Measured mode sizes the rect from the text; fixed mode keeps the caller's h.
  let panelH = h;
  const innerW = w - PANEL_INSET_X * 2;
  const textOpts = { width: innerW, lineGap: 1 };

  if (wrap && bodyText) {
    // Font must be current BEFORE heightOfString — it measures with the active font.
    doc.font(FONT_BODY, 9);
    panelH = PANEL_BODY_TOP + doc.heightOfString(bodyText, textOpts) + PANEL_PAD_BOTTOM;
  }

  doc.save()
     .fillColor(TOKENS.cream2)
     .strokeColor(TOKENS.border1)
     .lineWidth(0.5)
     .roundedRect(x, y, w, panelH, 8)
     .fillAndStroke()
     .restore();

  if (label) {
    drawLabel(doc, label, x + PANEL_INSET_X, y + 8, { color: TOKENS.goldDark, size: 6.5 });
  }
  if (bodyText) {
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
    if (wrap) {
      // Same font + same textOpts the height was measured with.
      doc.text(bodyText, x + PANEL_INSET_X, y + PANEL_BODY_TOP, textOpts);
    } else {
      doc.text(bodyText, x + PANEL_INSET_X, y + PANEL_BODY_TOP, { lineBreak: false });
    }
  }

  return y + panelH;
}

// ============================================================================
// INVOICE-SPECIFIC BUILDING BLOCKS
//
// Invoices have a different anatomy from BOL/Rate Con. AP-facing audience.
// See srl_chrome.py header comment for the full rationale.
// ============================================================================

export interface BillTo {
  name: string;
  addressLines: string[];
  customerAccount?: string;
  attention?: string;
}

export interface InvoiceCharge {
  label: string;
  amount: number;
}

export interface RemitTo {
  legalName: string;
  mailAddress: string[];
  bankName?: string;
  routingAba?: string;
  accountNumber?: string;
  swift?: string;
}

export function drawBillToBlock(
  doc: PDFDoc, billTo: BillTo, yTop: number
): number {
  drawLabel(doc, 'BILL TO', MARGIN, yTop, { color: TOKENS.goldDark, size: 7 });
  let curY = yTop + 14;

  doc.font(FONT_BODY_BOLD, 12).fillColor(TOKENS.navy)
     .text(billTo.name, MARGIN, curY, { lineBreak: false });
  curY += 14;

  if (billTo.attention) {
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2)
       .text(`Attn: ${billTo.attention}`, MARGIN, curY, { lineBreak: false });
    curY += 11;
  }

  doc.font(FONT_BODY, 9.5).fillColor(TOKENS.fg1);
  for (const line of billTo.addressLines) {
    doc.text(line, MARGIN, curY, { lineBreak: false });
    curY += 11;
  }

  if (billTo.customerAccount) {
    curY += 4;
    drawLabel(doc, 'CUSTOMER ACCOUNT', MARGIN, curY, { color: TOKENS.goldDark, size: 6.5 });
    curY += 12;
    doc.font(FONT_MONO_BOLD, 10).fillColor(TOKENS.fg1)
       .text(billTo.customerAccount, MARGIN, curY, { lineBreak: false });
    curY += 6;
  }

  return curY + 4;
}

export function drawInvoiceMetaBlock(
  doc: PDFDoc,
  meta: Record<string, string | null | undefined>,
  yTop: number,
  options: { xStart?: number; width?: number } = {}
): number {
  const width = options.width ?? 240;
  const xStart = options.xStart ?? PAGE_W - MARGIN - width;
  let curY = yTop;
  const lineH = 13;

  for (const [key, val] of Object.entries(meta)) {
    const display = (val && String(val).trim()) ? String(val) : '—';
    drawLabel(doc, key, xStart, curY, { color: TOKENS.goldDark, size: 6.5 });
    doc.font(FONT_BODY, 10).fillColor(TOKENS.fg1);
    const valW = doc.widthOfString(display);
    doc.text(display, xStart + width - valW, curY, { lineBreak: false });
    curY += lineH;
  }
  return curY;
}

export function drawLaneReferenceRow(
  doc: PDFDoc,
  shipperName: string, shipperCity: string,
  receiverName: string, receiverCity: string,
  yTop: number
): number {
  goldRule(doc, yTop, { weight: 0.5 });

  const colW = CONTENT_W / 2;

  drawLabel(doc, 'SHIPPER', MARGIN, yTop + 6, { color: TOKENS.goldDark, size: 6.5 });
  doc.font(FONT_BODY_BOLD, 10).fillColor(TOKENS.navy)
     .text(shipperName, MARGIN, yTop + 18, { lineBreak: false });
  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2)
     .text(shipperCity, MARGIN, yTop + 30, { lineBreak: false });

  const rcvX = MARGIN + colW;
  drawLabel(doc, 'RECEIVER', rcvX, yTop + 6, { color: TOKENS.goldDark, size: 6.5 });
  doc.font(FONT_BODY_BOLD, 10).fillColor(TOKENS.navy)
     .text(receiverName, rcvX, yTop + 18, { lineBreak: false });
  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2)
     .text(receiverCity, rcvX, yTop + 30, { lineBreak: false });

  const bottomY = yTop + 42;
  goldRule(doc, bottomY, { weight: 0.5 });
  return bottomY + 8;
}

export function drawChargesBlock(
  doc: PDFDoc, charges: InvoiceCharge[],
  yTop: number, width: number = 280
): number {
  const xStart = PAGE_W - MARGIN - width;

  drawLabel(doc, 'CHARGES', xStart, yTop, { color: TOKENS.goldDark, size: 7 });
  let curY = yTop + 16;

  const lineH = 16;
  for (const ch of charges) {
    doc.font(FONT_BODY, 10).fillColor(TOKENS.fg2)
       .text(ch.label, xStart, curY, { lineBreak: false });
    const amt = `$${ch.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.font(FONT_BODY, 10).fillColor(TOKENS.fg1);
    const amtW = doc.widthOfString(amt);
    doc.text(amt, xStart + width - amtW, curY, { lineBreak: false });
    curY += lineH;
  }

  curY += 2;
  doc.save()
     .strokeColor(TOKENS.border2)
     .lineWidth(0.5)
     .dash(2, { space: 2 })
     .moveTo(xStart, curY).lineTo(xStart + width, curY).stroke()
     .undash()
     .restore();
  curY += 8;

  const total = charges.reduce((s, ch) => s + ch.amount, 0);
  const totalStr = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.font(FONT_BODY_BOLD, 11).fillColor(TOKENS.fg1)
     .text('Total USD', xStart, curY, { lineBreak: false });
  doc.font(FONT_BODY_BOLD, 12);
  const totalW = doc.widthOfString(totalStr);
  doc.text(totalStr, xStart + width - totalW, curY, { lineBreak: false });
  curY += lineH;

  return curY;
}

export function drawSettlementSummary(
  doc: PDFDoc,
  invoiceAmount: number, amountPaid: number,
  yTop: number, width: number = 280
): number {
  const xStart = PAGE_W - MARGIN - width;
  const height = 70;

  doc.save()
     .fillColor(TOKENS.cream2)
     .strokeColor(TOKENS.border1)
     .lineWidth(0.5)
     .roundedRect(xStart, yTop, width, height, 6)
     .fillAndStroke()
     .restore();

  const pad = 12;
  let curY = yTop + 18;
  const lineH = 16;

  const drawRow = (label: string, amount: number, bold: boolean = false, color: string = TOKENS.fg1) => {
    doc.font(bold ? FONT_BODY_BOLD : FONT_BODY, 10).fillColor(bold ? color : TOKENS.fg2)
       .text(label, xStart + pad, curY, { lineBreak: false });
    const amtStr = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.font(bold ? FONT_BODY_BOLD : FONT_BODY, 10).fillColor(color);
    const amtW = doc.widthOfString(amtStr);
    doc.text(amtStr, xStart + width - pad - amtW, curY, { lineBreak: false });
    curY += lineH;
  };

  const balance = invoiceAmount - amountPaid;
  drawRow('Invoice Amount', invoiceAmount);
  drawRow('Amount Paid', amountPaid);

  // Divider above Balance Due
  doc.save()
     .strokeColor(TOKENS.goldDark)
     .lineWidth(0.6)
     .moveTo(xStart + pad, curY - 5)
     .lineTo(xStart + width - pad, curY - 5)
     .stroke()
     .restore();

  drawRow('Balance Due', balance, true, TOKENS.goldDark);
  return yTop + height + 8;
}

export function drawRemitToBlock(
  doc: PDFDoc, remit: RemitTo, yTop: number
): number {
  drawLabel(doc, 'REMIT TO', MARGIN, yTop, { color: TOKENS.goldDark, size: 7 });
  let curY = yTop + 14;

  doc.font(FONT_BODY_BOLD, 10).fillColor(TOKENS.navy)
     .text(remit.legalName, MARGIN, curY, { lineBreak: false });
  curY += 13;

  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2);
  for (const line of remit.mailAddress) {
    doc.text(line, MARGIN, curY, { lineBreak: false });
    curY += 10;
  }

  if (remit.bankName || remit.routingAba || remit.accountNumber) {
    curY += 6;
    drawLabel(doc, 'ACH / WIRE', MARGIN, curY, { color: TOKENS.goldDark, size: 6.5 });
    curY += 12;
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
    if (remit.bankName) {
      doc.text(`Bank: ${remit.bankName}`, MARGIN, curY, { lineBreak: false });
      curY += 11;
    }
    if (remit.routingAba) {
      doc.font(FONT_MONO, 9);
      doc.text(`ABA / Routing #: ${remit.routingAba}`, MARGIN, curY, { lineBreak: false });
      curY += 11;
    }
    if (remit.accountNumber) {
      doc.text(`Account #: ${remit.accountNumber}`, MARGIN, curY, { lineBreak: false });
      curY += 11;
    }
    if (remit.swift) {
      doc.text(`SWIFT: ${remit.swift}`, MARGIN, curY, { lineBreak: false });
      curY += 11;
    }
  }
  return curY + 4;
}

export function drawPaymentReference(
  doc: PDFDoc,
  account: string, loadId: string, invoiceNum: string,
  yTop: number
): number {
  const refStr = `${account}  ${loadId}  ${invoiceNum}`;
  doc.font(FONT_MONO_BOLD, 9.5);
  const textW = doc.widthOfString(refStr);
  const boxW = textW + 24;
  const boxH = 22;

  drawLabel(doc, 'PAYMENT REFERENCE (WIRE MEMO)', MARGIN, yTop, {
    color: TOKENS.goldDark, size: 6.5,
  });

  doc.save()
     .fillColor(TOKENS.cream2)
     .strokeColor(TOKENS.goldDark)
     .lineWidth(0.5)
     .roundedRect(MARGIN, yTop + 12, boxW, boxH, 4)
     .fillAndStroke()
     .restore();

  doc.font(FONT_MONO_BOLD, 9.5).fillColor(TOKENS.fg1)
     .text(refStr, MARGIN + 12, yTop + 19, { lineBreak: false });

  return yTop + boxH + 20;
}

// ============================================================================
// RATE CONFIRMATION — OPERATIONAL FIELDS
//
// See srl_chrome.py header comment for the full rationale.
// ============================================================================

export interface RateBreakdown {
  linehaul: number;
  fuelSurcharge?: number;
  accessorials?: InvoiceCharge[];
  discount?: number;
}

function rateTotal(rate: RateBreakdown): number {
  const acc = (rate.accessorials ?? []).reduce((s, a) => s + a.amount, 0);
  return rate.linehaul + (rate.fuelSurcharge ?? 0) + acc - (rate.discount ?? 0);
}

export interface EquipmentSpec {
  type: string;
  lengthFt?: number;
  airRide?: boolean;
  swingDoorsOnly?: boolean;
  palletExchange?: boolean;
  tempSetpointF?: number;
  tempContinuous?: boolean;
  preCoolRequired?: boolean;
  // v3.8.aru — synced from the live library. tempControlled makes the
  // TEMPERATURE row print whenever the load is refrigerated, even with no
  // setpoint captured, so a data gap surfaces as a loud instruction instead of
  // an absent row indistinguishable from a dry van.
  tempControlled?: boolean;
  tempMinF?: number;
  tempMaxF?: number;
  preCoolToF?: number;
  loadingMethod?: string;
  unloadingMethod?: string;
  stackable?: boolean;
  tarpRequired?: boolean;
  linearFeet?: number;
}

export interface CarrierRequirements {
  cargoInsuranceMin?: number;
  autoLiabilityMin?: number;
  generalLiabilityMin?: number;
  twicRequired?: boolean;
  hazmatEndorsementRequired?: boolean;
  fastCardRequired?: boolean;
  eldRequired?: boolean;
  teamDrivers?: boolean;
  bondRequired?: boolean;
  // Sprint 51 (Item 130) — tracking acceptance gate as a preconditions-tier
  // bullet (NOT a T&C clause per Phase A sub-pattern 4 reclassification).
  // Industry pattern (TQL): tracking is a precondition for dispatch, not a
  // behavior rule like indemnification or governing law. Renders as a 4th
  // bullet alongside insurance minimums when set.
  trackingAcceptance?: boolean;
}

export interface RateConTerms {
  detentionFreeHours?: number;
  detentionRatePerHour?: number;
  detentionMaxPerStop?: number;
  // Sprint 50 (Item 127) — Path β belt-and-suspenders: appends " · notify"
  // to the DETENTION value in the OPERATIONAL TERMS grid. Pairs with T&C
  // clause (7), which mandates 30-min-before + departure notifications. The
  // cell suffix surfaces the obligation at the operational glance level; the
  // clause locks the enforcement language.
  detentionNotify?: boolean;
  tonuAmount?: number;
  layoverPerDay?: number;
  lumperReimbursement?: boolean;
  cancellationWindowHours?: number;
  quickPayTier?: string;
}

export function drawRateBreakdown(
  doc: PDFDoc, rate: RateBreakdown, yTop: number, width: number = 280
): number {
  const xStart = PAGE_W - MARGIN - width;
  drawLabel(doc, 'CARRIER RATE', xStart, yTop, { color: TOKENS.goldDark, size: 7 });
  let curY = yTop + 16;
  const lineH = 16;

  const drawLine = (label: string, amount: number, bold: boolean = false) => {
    doc.font(bold ? FONT_BODY_BOLD : FONT_BODY, 10).fillColor(TOKENS.fg2)
       .text(label, xStart, curY, { lineBreak: false });
    const amt = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.font(bold ? FONT_BODY_BOLD : FONT_BODY, 10).fillColor(TOKENS.fg1);
    const amtW = doc.widthOfString(amt);
    doc.text(amt, xStart + width - amtW, curY, { lineBreak: false });
    curY += lineH;
  };

  drawLine('Linehaul', rate.linehaul);
  if ((rate.fuelSurcharge ?? 0) > 0) drawLine('Fuel Surcharge', rate.fuelSurcharge!);
  for (const acc of rate.accessorials ?? []) drawLine(acc.label, acc.amount);
  if ((rate.discount ?? 0) > 0) drawLine('Discount', -(rate.discount!));

  curY += 2;
  doc.save()
     .strokeColor(TOKENS.border2)
     .lineWidth(0.5)
     .dash(2, { space: 2 })
     .moveTo(xStart, curY).lineTo(xStart + width, curY).stroke()
     .undash().restore();
  curY += 8;

  const total = rateTotal(rate);
  const totalStr = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.font(FONT_BODY_BOLD, 11).fillColor(TOKENS.fg1)
     .text('Total Carrier Pay', xStart, curY, { lineBreak: false });
  doc.font(FONT_BODY_BOLD, 12);
  const totalW = doc.widthOfString(totalStr);
  doc.text(totalStr, xStart + width - totalW, curY, { lineBreak: false });
  curY += lineH;

  return curY;
}

export function drawEquipmentSpec(
  doc: PDFDoc, equip: EquipmentSpec, yTop: number
): number {
  goldRule(doc, yTop, { weight: 0.5 });

  const fields: [string, string][] = [];
  let eqStr = equip.type;
  if (equip.lengthFt && !equip.type.includes(String(equip.lengthFt))) {
    eqStr = `${equip.type} (${equip.lengthFt}')`;
  }
  fields.push(['EQUIPMENT', eqStr]);

  const trailerReqs: string[] = [];
  if (equip.airRide) trailerReqs.push('Air ride');
  if (equip.swingDoorsOnly) trailerReqs.push('Swing doors only');
  if (equip.tarpRequired) trailerReqs.push('Tarps required');
  if (trailerReqs.length) fields.push(['TRAILER REQ', trailerReqs.join(' · ')]);

  // v3.8.art / v3.8.arv — the row prints whenever the load is temperature-
  // controlled, even with no setpoint captured, so a data gap surfaces as a
  // loud instruction instead of an absent row. Before this, the row was gated
  // purely on tempSetpointF: a reefer load whose setpoint was never captured
  // rendered byte-identical to a dry van, and silence became indistinguishable
  // from not-applicable — nobody catches that at the desk, because the document
  // looks complete. Frozen freight makes 0°F legitimate, so every check here is
  // against undefined rather than truthiness.
  const hasSetpoint = equip.tempSetpointF !== undefined;
  if (hasSetpoint || equip.tempControlled === true) {
    let tempStr: string;
    if (hasSetpoint) {
      tempStr = `${equip.tempSetpointF}°F`;
      if (equip.tempMinF !== undefined && equip.tempMaxF !== undefined) {
        tempStr += ` (${equip.tempMinF}–${equip.tempMaxF}°F)`;
      }
      if (equip.tempContinuous === true) tempStr += ' · continuous';
      else if (equip.tempContinuous === false) tempStr += ' · cycle';
      if (equip.preCoolToF !== undefined) tempStr += ` · pre-cool ${equip.preCoolToF}°F`;
      else if (equip.preCoolRequired) tempStr += ' · pre-cool required';
    } else {
      // Colon, not an em-dash: references/voice.md bans em-dashes as sentence
      // connectors and this is a sentence, not a list separator.
      // v3.8.arv — MEASURED at 165.7pt against a 202pt cell. The v3.8.art
      // string ("TEMP-CONTROLLED: setpoint not specified. Call before
      // loading.") was 279.9pt, and this cell draws with lineBreak:false, so
      // PDFKit did not wrap it — the media box clipped the tail and the words
      // "Call before loading." never printed. The instruction written to make
      // a data gap LOUD was the part being silently cut. The label already
      // reads TEMPERATURE, so the value need not repeat "TEMP-CONTROLLED".
      tempStr = 'Not specified. Call SRL before loading.';
    }
    fields.push(['TEMPERATURE', tempStr]);
  }

  if (equip.loadingMethod) fields.push(['LOADING', equip.loadingMethod]);
  if (equip.unloadingMethod) fields.push(['UNLOADING', equip.unloadingMethod]);

  if (equip.stackable === true) fields.push(['STACKABILITY', 'Stackable OK']);
  else if (equip.stackable === false) fields.push(['STACKABILITY', 'Single stack only — DO NOT STACK']);
  if (equip.palletExchange) fields.push(['PALLET EXCHANGE', 'Required']);
  if (equip.linearFeet !== undefined) fields.push(['LINEAR FEET', `${equip.linearFeet.toFixed(1)} ft`]);

  const colW = CONTENT_W / 2;
  let curY = yTop + 14;
  const lineH = 13;
  fields.forEach(([key, val], i) => {
    const col = i % 2;
    const x = MARGIN + col * colW;
    drawLabel(doc, key, x, curY, { color: TOKENS.goldDark, size: 6.5 });
    doc.font(FONT_BODY, 9.5).fillColor(TOKENS.fg1)
       // v3.8.arv — gutter 90 -> 68, matching drawRateConTerms. This cell draws
       // with lineBreak:false in a CONTENT_W/2 = 270pt column, so a 90pt gutter
       // left 180pt, and the canonical reefer value measures 191.0pt:
       // "36°F (34–38°F) · continuous · pre-cool 34°F". It overran into the
       // adjacent column. 68pt buys 202pt and clears it by 11pt.
       //
       // The v3.8.arn fix made exactly this change in drawRateConTerms and did
       // not reach here, because drawEquipmentSpec did not yet carry a value
       // long enough to expose it — v3.8.art gave it one.
       .text(val, x + 68, curY, { lineBreak: false });
    if (col === 1) curY += lineH;
  });
  if (fields.length % 2 === 1) curY += lineH;
  curY += 4;

  goldRule(doc, curY, { weight: 0.5 });
  return curY + 8;
}

export function drawCarrierRequirements(
  doc: PDFDoc, reqs: CarrierRequirements, yTop: number
): number {
  const labelH = 14;
  const itemH = 12;
  const items: string[] = [];

  if (reqs.cargoInsuranceMin !== undefined)
    items.push(`Cargo: $${reqs.cargoInsuranceMin.toLocaleString('en-US')} min`);
  if (reqs.autoLiabilityMin !== undefined)
    items.push(`Auto Liability: $${reqs.autoLiabilityMin.toLocaleString('en-US')} min`);
  if (reqs.generalLiabilityMin !== undefined)
    items.push(`General Liability: $${reqs.generalLiabilityMin.toLocaleString('en-US')} min`);
  if (reqs.trackingAcceptance)
    // v3.8.arw — this previously read "Tracking via Marco Polo (SMS) or Quo
    // phone tracking accepted before dispatch." Both named tools were false on
    // a document a carrier signs. references/voice.md assigns Marco Polo to the
    // AI chatbot, and marcoPoloService.ts contains ZERO references to SMS.
    // "Quo" appeared exactly once in the entire backend — in this string — and
    // nowhere in the skill's naming table or in any of the 16 reference rate
    // confirmations. It named a third-party tracking integration that does not
    // exist. voice.md:29 bans fabricated metrics because "carriers and shippers
    // can smell it"; the same test applies to capabilities, and a carrier who
    // asks for the Quo integration finds out we do not have one.
    // The carrier portal is the actual mechanism: /carrier/dashboard/my-loads
    // carries status advancement and POD upload.
    items.push('Status updates through the SRL carrier portal, or by call or text to (269) 220-6760.');

  const endorsements: string[] = [];
  if (reqs.twicRequired) endorsements.push('TWIC');
  if (reqs.hazmatEndorsementRequired) endorsements.push('Hazmat endorsement');
  if (reqs.fastCardRequired) endorsements.push('FAST card');
  if (reqs.eldRequired) endorsements.push('ELD compliant');
  if (reqs.teamDrivers) endorsements.push('Team drivers');
  if (reqs.bondRequired) endorsements.push('Surety bond');
  if (endorsements.length) items.push('Required: ' + endorsements.join(' · '));

  const panelH = labelH + items.length * itemH + 14;

  doc.save()
     .fillColor(TOKENS.cream2)
     .strokeColor(TOKENS.border1)
     .lineWidth(0.5)
     .roundedRect(MARGIN, yTop, CONTENT_W, panelH, 6)
     .fillAndStroke()
     .restore();

  drawLabel(doc, 'CARRIER REQUIREMENTS', MARGIN + 10, yTop + 12,
            { color: TOKENS.goldDark, size: 7 });

  let curY = yTop + 26;
  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
  for (const item of items) {
    doc.text('•  ' + item, MARGIN + 10, curY, { lineBreak: false });
    curY += itemH;
  }
  return yTop + panelH + 8;
}

export function drawRateConTerms(
  doc: PDFDoc, terms: RateConTerms, yTop: number
): number {
  const items: [string, string][] = [];
  const detentionFree = terms.detentionFreeHours ?? 2;
  // v3.8.arn — a literal 0 is not "unset". Nullish coalescing let a caller pass
  // detentionRate: 0 straight through and publish "$0/hr" to a carrier. Treat any
  // non-positive or non-finite value as unset.
  const rawDetentionRate = terms.detentionRatePerHour;
  const detentionRate =
    typeof rawDetentionRate === "number" && Number.isFinite(rawDetentionRate) && rawDetentionRate > 0
      ? rawDetentionRate
      : 50;
  let detStr = `$${detentionRate}/hr after ${detentionFree} hrs free`;
  // v3.8.arn — terse by measurement, not preference: this cell draws with
  // lineBreak:false, and the longer wording
  // "$50/hr after 2 hrs free, capped at $250/stop · notify" measures 216.0pt
  // against 202pt of width, so it overprints the adjacent TONU label. The
  // shipped terse form measures 189.0pt and clears by 13.0pt.
  // (Earlier revisions of this comment cited 216.6pt while quoting only the
  // fragment "capped at $250/stop · notify", which is 119.4pt on its own — the
  // number always belonged to the whole cell value, not the fragment. Quoted in
  // full here so the next mirror-check measures the same string.)
  // v3.8.arv — was missing the $ and printed "250/stop cap" on a money term.
  if (terms.detentionMaxPerStop) detStr += `, $${terms.detentionMaxPerStop}/stop cap`;
  if (terms.detentionNotify) detStr += ' · notify';
  items.push(['DETENTION', detStr]);

  items.push(['TONU', `$${terms.tonuAmount ?? 200} (truck-order-not-used)`]);
  items.push(['LAYOVER', `$${terms.layoverPerDay ?? 250}/day`]);

  if (terms.lumperReimbursement !== false)
    items.push(['LUMPER', 'Reimbursed with original receipt']);
  items.push(['CANCELLATION',
    `${Math.floor(terms.cancellationWindowHours ?? 4)}-hour notice without penalty`]);

  if (terms.quickPayTier) items.push(['QUICK PAY', terms.quickPayTier]);

  const colW = CONTENT_W / 2;
  drawLabel(doc, 'OPERATIONAL TERMS', MARGIN, yTop, { color: TOKENS.goldDark, size: 7 });
  let curY = yTop + 16;
  const lineH = 13;
  items.forEach(([key, val], i) => {
    const col = i % 2;
    const x = MARGIN + col * colW;
    drawLabel(doc, key, x, curY, { color: TOKENS.goldDark, size: 6.5 });
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1)
       // v3.8.arv — L-9 mirroring fix. The v3.8.arn gutter change belongs to
       // THIS function: its widest label (CANCELLATION, 55.3pt) is what the
       // measurement was taken against, and with the ratified $250 cap the
       // DETENTION value measures 189.0pt against the 180pt a 90pt gutter
       // allows, overprinting the TONU label. The skill copy had applied it to
       // drawEquipmentSpec instead and left this one broken.
       .text(val, x + 68, curY, { lineBreak: false });
    if (col === 1) curY += lineH;
  });
  if (items.length % 2 === 1) curY += lineH;
  return curY + 4;
}

/**
 * Sprint 47 (Item 100) — transitUnit, default "hours".
 *
 * Carriers convert to drive hours mentally regardless, because HOS log entries,
 * ETA windows, and dispatch conversations all run in hours; every major broker's
 * lane-economics widget reads in hours. "2.7 days" for a 1,352-mile lane is
 * correct arithmetic and poor UX. Pass "days" explicitly when the caller has
 * genuinely computed calendar days (multi-day plan, HOS-strict pacing).
 *
 * transitValue semantics follow transitUnit:
 *   transitUnit="hours" -> drive hours (typically miles / 55, the industry
 *                          highway average)
 *   transitUnit="days"  -> calendar days
 */
export function drawLaneEconomics(
  doc: PDFDoc, miles: number, transitValue: number, totalPay: number, yTop: number,
  transitUnit: "hours" | "days" = "hours"
): number {
  const boxW = (CONTENT_W - 16) / 3;
  const boxH = 42;

  const transitDisplay = transitUnit === "hours"
    ? `${transitValue.toFixed(1)} hrs`
    : `${transitValue.toFixed(1)} days`;

  const fields: [string, string, string][] = [
    ['MILES', miles.toLocaleString('en-US'), 'Lane mileage'],
    ['TRANSIT', transitDisplay, 'Standard pace'],
    ['$/MILE', `$${(totalPay / miles).toFixed(2)}`, 'Carrier rate'],
  ];

  fields.forEach(([label, value, sub], i) => {
    const x = MARGIN + i * (boxW + 8);
    doc.save()
       .fillColor(TOKENS.goldTint)
       .strokeColor(TOKENS.gold)
       .lineWidth(0.5)
       .roundedRect(x, yTop, boxW, boxH, 6)
       .fillAndStroke()
       .restore();

    drawLabel(doc, label, x + 10, yTop + 11, { color: TOKENS.goldDark, size: 6.5 });
    doc.font(FONT_BODY_BOLD, 16).fillColor(TOKENS.navy)
       .text(value, x + 10, yTop + boxH - 22, { lineBreak: false });
    doc.font(FONT_BODY, 8).fillColor(TOKENS.fg3);
    const subW = doc.widthOfString(sub);
    doc.text(sub, x + boxW - 10 - subW, yTop + boxH - 18, { lineBreak: false });
  });

  return yTop + boxH + 8;
}
