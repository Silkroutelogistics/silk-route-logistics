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
 *     drawSignatureBlock, drawFooter,
 *     PAGE_W, PAGE_H, MARGIN
 *   } from './srl_chrome';
 *
 *   const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
 *   registerSkillFonts(doc);   // REQUIRED — see FONT REGISTRATION below.
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
  // v3.8.aru — CRITICAL RENDER FIX. These were 8-digit hex carrying an alpha
  // byte. PDFKit has no alpha-in-hex support: it parses the whole string as one
  // integer and shifts, so #0A25401A yielded r = 10.184, which a PDF renderer
  // clamps to 1.0 per ISO 32000-1 §8.6.8. Proven by content-stream dump:
  //     #0A25401A  ->  10.184313725490195 0.25098039215686274 0.10196078431372549 SCN
  // Every panel border and all seven CARRIER · ACCEPTANCE signature underlines
  // were rendering rgb(255, 64, 26), bright red-orange, on every SRL PDF — not
  // just the Rate Confirmation. The BOL, Invoice and Settlement share this
  // library.
  //
  // references/tokens.md declares these as rgba over navy #0A2540 at 10/16/32%.
  // PDFKit cannot express that in a colour string, so the values below are those
  // exact alphas PRE-COMPOSITED over the white print canvas. Every existing call
  // site keeps working unchanged, which matters: under the alternative fix
  // (doc.strokeOpacity) a missed call site fails to fully-opaque navy, which is
  // a different and less obvious wrong. Where a border sits on a cream-2 panel
  // the composite runs marginally cool, imperceptible at 0.5pt hairline weight.
  // Body ink on the document shell. Deliberately NOT navy: the Design System
  // sets running text in --ink #1D2939 and reserves navy for headings and
  // structure, which is what stops a page of justified 9.5pt reading as a
  // wall of brand colour.
  ink:         '#1D2939',
  // The shell's hairline: rgba(10,37,64,.12) over white. One notch darker
  // than border1 (.10), and it is the value the shell actually specifies.
  rule:        '#E2E5E8',
  border1:     '#E7E9EC',  // rgba(10,37,64,0.10) over white
  border2:     '#D8DCE0',  // rgba(10,37,64,0.16) over white
  borderStrong:'#B1B9C2',  // rgba(10,37,64,0.32) over white

  // v3.8.azh C3 — semantic status pair, verbatim from CLAUDE.md §2.1. The
  // tender-expiry banner in pdfService carried these four as inline hex under a
  // comment saying there was "no TOKENS export for these yet". There is now.
  //
  // Values were checked against §2.1 BEFORE moving, not after: --warning
  // #B07A1A / --warning-bg #FBEFD4 and --danger #9B2C2C / --danger-bg #F6E3E3,
  // identical to what the banner already drew. That equality is why the
  // rate-confirmation pin does not move on this commit — a token swap that
  // changes a value is a render change wearing a refactor's clothes, and
  // v3.8.aru is what that costs when nobody checks.
  //
  // --success and --info are NOT added. §2.1 defines them and no PDF draws
  // them; a palette entry nothing consumes is the next thing to drift.
  warning:     '#B07A1A',
  warningBg:   '#FBEFD4',
  danger:      '#9B2C2C',
  dangerBg:    '#F6E3E3',
} as const;

// v3.8.akg §13.3 Item 8.9 — BRAND values sourced from canonical
// authority module instead of hardcoded literals. Pre-akg the `mc`
// field carried the leading-zero typo "01794414" that propagated
// through every PDF surface consuming BRAND (BOL via pdfService,
// RC via generateEnhancedRateConfirmation, Compass PDF, SOP PDF).
// Now sourced from MC_NUMBER which is the no-leading-zero canonical.
// `mc` keyed without "MC#" prefix preserves call-site string-concat
// patterns at L393 + L718 (`MC# ${BRAND.mc}`) so consumers don't need
// updating beyond the source.
import {
  ENTITY_NAME,
  TAGLINE,
  DOMAIN,
  PRINCIPAL_ADDRESS_ONE_LINE,
  PHONE,
  OPERATIONS_EMAIL,
  MC_NUMBER,
  DOT_NUMBER,
} from "../config/authority";
// v3.8.asc — the operational-terms grid prints money, so it reads money from the
// one module that owns it rather than carrying its own fallbacks.
import {
  TONU_AMOUNT,
  LAYOVER_RATE_PER_DAY,
  CARRIER_RELEASE_WINDOW_HOURS,
  DETENTION_FREE_HOURS,
  DETENTION_RATE_PER_HOUR,
  DETENTION_CAP_PER_STOP,
} from "./accessorialPolicy";

export const BRAND = {
  legalName:          ENTITY_NAME.toUpperCase(),
  tagline:            TAGLINE,
  operationalTagline: 'First Call. Last Update. Every Mile In Between.',
  domain:             DOMAIN,
  address:            PRINCIPAL_ADDRESS_ONE_LINE,
  phone:              `+1 ${PHONE}`,
  email:              OPERATIONS_EMAIL,
  mc:                 MC_NUMBER,
  dot:                DOT_NUMBER,
} as const;

// US Letter, 0.5" margins (PDFKit uses points: 1pt = 1/72 inch)
export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 36;
/**
 * The document-shell margin: 0.75in, per the Design System page box.
 * Wider than MARGIN (0.5in) because the shell is a signed legal instrument
 * rather than an operational form, and it is opt-in for exactly that reason
 * -- applying it to the Rate Confirmation or the BOL would reflow both.
 */
export const SHELL_MARGIN = 54;
export const SHELL_CONTENT_W = PAGE_W - 2 * SHELL_MARGIN;
export const CONTENT_W = PAGE_W - 2 * MARGIN;

// Sprint 47 (v3.8.abf, Item 101) — Skill canonical fonts per tokens.md:
//   Playfair Display 700 — display headings + tagline italic
//   DM Sans 400/500/700 — body text + small-caps labels
//   Courier / Courier-Bold — mono (PDFKit built-ins; skill spec doesn't
//                  include a custom mono — kept for reference fields like
//                  load IDs and TRACK label per pdf-chrome.md, and for the
//                  ABA/routing line, where fixed-width digits are the point)
// TTFs ship at backend/src/assets/fonts/bol-v2.9/ and propagate to Render
// prod via the cp -r src/assets/. step in buildCommand (CLAUDE.md §2.2).
// Mirrors generateBOLFromLoad font registration at pdfService.ts:317-326.
//
// Callers MUST invoke registerSkillFonts(doc) right after new PDFDocument()
// or fontkit will throw "Font not found" when chrome functions reference
// these registered names. See pdfService.ts generateEnhancedRateConfirmation
// for the canonical pattern.
// Sprint 47.b (Item 104) — exported for direct use by skill-chrome consumers
// that render text outside the canned drawing functions (e.g., custom T&C
// blocks, special instruction panels). Callers prefer FONT_BODY over the
// hardcoded "DMSans-Regular" string for consistency + drift insurance.
export const FONT_BODY = 'DMSans-Regular';
export const FONT_BODY_BOLD = 'DMSans-Bold';
export const FONT_BODY_ITALIC = 'DMSans-Italic';
// Registered since BOL v2.9, never exported. The shell sets its small caps,
// identity lines and table values at weight 500, which is Medium -- not Regular
// and not Bold.
export const FONT_BODY_MEDIUM = 'DMSans-Medium';
// Playfair REGULAR. Registered since the BOL v2.9 work and never exported,
// so nothing could ask for it. The Design System cover sets its title at
// font-weight:400, and a bold face there is a different typeface, not a
// heavier one -- the shell would have been unportable without this.
export const FONT_DISPLAY = 'Playfair-Regular';
export const FONT_DISPLAY_BOLD = 'Playfair-Bold';
export const FONT_DISPLAY_ITALIC = 'Playfair-Italic';
export const FONT_MONO = 'Courier';
export const FONT_MONO_BOLD = 'Courier-Bold';

// ============================================================================
// FONT REGISTRATION (Sprint 47, Item 101)
//
// Skill chrome functions reference registered font names (Playfair-Bold,
// DMSans-Regular, etc.). PDFKit requires these to be registered on the doc
// instance BEFORE any text() call references them, or fontkit throws
// "Font not found". Callers must invoke registerSkillFonts(doc) immediately
// after `new PDFDocument(...)`.
//
// Mirrors generateBOLFromLoad font registration at pdfService.ts:317-326.
// TTFs ship at backend/src/assets/fonts/bol-v2.9/ and propagate to Render
// prod via `cp -r src/assets/. dist/backend/src/assets/` step in
// buildCommand (CLAUDE.md §2.2 canonical).
//
// Runtime path resolution: __dirname here is backend/src/lib/ at compile
// time and dist/backend/src/lib/ at runtime after Sprint 46 fail-fast +
// Sprint 47 trailing-dot cp fix. From either, `../assets/fonts/bol-v2.9/`
// resolves correctly.
// ============================================================================

import * as pathLib from 'path';
const FONTS_DIR = pathLib.resolve(__dirname, '../assets/fonts/bol-v2.9');

export function registerSkillFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont('Playfair-Regular', pathLib.join(FONTS_DIR, 'PlayfairDisplay-Regular.ttf'));
  doc.registerFont('Playfair-Italic', pathLib.join(FONTS_DIR, 'PlayfairDisplay-Italic.ttf'));
  doc.registerFont('Playfair-Bold', pathLib.join(FONTS_DIR, 'PlayfairDisplay-Bold.ttf'));
  doc.registerFont('Playfair-BoldItalic', pathLib.join(FONTS_DIR, 'PlayfairDisplay-BoldItalic.ttf'));
  doc.registerFont('DMSans-Regular', pathLib.join(FONTS_DIR, 'DMSans-Regular.ttf'));
  doc.registerFont('DMSans-Italic', pathLib.join(FONTS_DIR, 'DMSans-Italic.ttf'));
  doc.registerFont('DMSans-Medium', pathLib.join(FONTS_DIR, 'DMSans-Medium.ttf'));
  doc.registerFont('DMSans-SemiBold', pathLib.join(FONTS_DIR, 'DMSans-SemiBold.ttf'));
  doc.registerFont('DMSans-Bold', pathLib.join(FONTS_DIR, 'DMSans-Bold.ttf'));

  // Sprint 47.b (Item 103) — Ligature suppression monkey-patch ported from
  // Sprint v3.8.b Option β (pdfService.ts:248-297 generateBOLFromLoad
  // inline). Monkey-patch doc.text to inject an OpenType feature-disable
  // object into every text invocation's options. fontkit accepts `features`
  // as either an array (additive — enables listed features on top of script
  // defaults) or an object (explicit on/off per feature tag). The array form
  // keeps default `liga` enabled and can't disable it; the object form with
  // `liga: false` is the authoritative way to suppress ligature
  // substitution. Disable all four ligature-family features (liga/clig/
  // rlig/dlig) so Playfair Bold/Italic + DM Sans Regular/Italic don't
  // substitute `fi` with a glyph that truncates the `i` (the "Confirmation"
  // → "Confrmation" bug visible post-Sprint-47 on Rate Confirmation PDFs;
  // same fontkit class as the "classified" → "classifed" bug Sprint v3.8.b
  // fixed for BOL v2.9). Keep `kern: true` so typography still looks good.
  // Covers direct doc.text() calls AND fluent-chained .text() calls
  // (e.g. doc.font(x).fontSize(y).text(str)).
  //
  // Tied to font registration: callers invoking registerSkillFonts(doc)
  // implicitly opt into ligature suppression for the entire doc lifetime.
  // This is the right bundling because skill canonical fonts (Playfair +
  // DM Sans) are precisely the fonts that exhibit the ligature
  // substitution bug; built-in PDFKit fonts (Helvetica/Times-Bold/etc.)
  // don't have the bug but also don't need the suppression — harmless if
  // also patched.
  //
  // @types/pdfkit declares features as `string[]`, which only covers the
  // array form. Casting via `as unknown as string[]` is an explicit
  // concession that we're using the runtime-supported object shape that
  // the type declaration doesn't model.
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
          // Object form: preserve caller's intent (e.g. kern preference),
          // but force the four liga-family flags off.
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
          // Discard and use our full disable-object.
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

import * as path from 'path';
import * as fs from 'fs';

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

// v3.8.anc — exported for the SRL Driver Academy completion certificate
// (certificatePdfService.ts), which hand-builds a centered ceremonial layout
// rather than using drawHeaderFirstPage's document-style header. Additive
// export only; behavior unchanged. Mirror upstream to the skill on next sync.
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
  /**
   * Omit to draw the LETTERHEAD ONLY — compass, company block, tagline, QR,
   * gold rule — and nothing below it. The return is then the y just under
   * the rule, so the caller continues from there.
   *
   * The Bill of Lading needs this. Its title is Playfair 24pt at x34; the
   * chrome draws 22pt at MARGIN (36). Both are body geometry on a document
   * whose body is pixel-verified v2.9 canon and is not what this migration
   * is moving, so the BOL takes the letterhead and keeps its own title row.
   */
  docTitle?: string;
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
  //
  // v3.8.azi C4 — 55 -> 72. Two consequences worth knowing, both measured:
  //
  // (1) The PNG SOURCE CHANGES. resolveCompassPng picks the smallest bundled
  //     asset >= the target, so 55 took srl_compass_60.png and 72 takes
  //     srl_compass_120.png scaled down. A different embedded image is a
  //     different content stream, so every document drawing this header moves
  //     its render pin. That is the expected diff, not a surprise.
  //
  // (2) The mark occupies [x, x+size] exactly (doc.image with width/height =
  //     size), so at 72 it spans MARGIN..MARGIN+72 = 36..108. infoX was
  //     MARGIN + 70 = 106, a 2pt overlap of image and company name; C5.5 moved
  //     it clear — see below.
  drawCompassMark(doc, MARGIN, yTop, 72);

  // Company info block
  // v3.8.azk C5.5 — the letterhead gutter, derived from the locked design
  // rather than picked. docs/design/rc.html sets the letterhead as
  //
  //     .lh { grid-template-columns: auto minmax(max-content,1fr) max-content;
  //           column-gap: 14px }
  //
  // three columns — mark, identity, reference block — with a 14px gutter, and
  // .compass { width:72px }. C4 already mapped that 72 to 72 POINTS, so the same
  // 1:1 mapping gives a 14pt gutter and infoX = MARGIN + 72 + 14 = MARGIN + 86.
  // (Under a strict CSS 96dpi reading the design would instead be a 54pt mark
  // and a 10.5pt gutter; the 1:1 mapping is the one already ratified in C4, and
  // mixing the two would put a 72pt mark against a 10.5pt gutter.)
  //
  // Measured against real data at 86, widest line is the phone/email/domain
  // contact line at 294.8pt, ending at 416.8pt. The QR frame starts at 498pt,
  // so clearance is 81.2pt. Without a QR nothing occupies the right at all.
  const infoX = MARGIN + 86;
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
  // Letterhead-only: the caller draws its own title row below the rule.
  if (!docTitle) return ruleY + 10;

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

// BOL_SIGNATURE_ROLES was deleted here (v3.8.bal). DO NOT REINSTATE IT.
//
// It was written for a Bill of Lading migration that has now closed at the
// letterhead and footer, and it was never consumed: all three
// drawSignatureBlock callers pass their own roles, so it survived only as an
// unreachable default.
//
// It was also a THINNER document than the BOL actually renders, and the gap
// is compliance content rather than styling. Adopting it would have dropped:
//
//   "Required placards received; emergency response info available
//    (49 CFR 172)" from the carrier certification
//   the TRAILER LOADED / FREIGHT COUNTED by-shipper/by-driver checkboxes
//   "The carrier shall not make delivery of this shipment without payment
//    of freight and all other lawful charges."
//
// Those are on the document a driver signs at a dock. A constant that looks
// like the BOL's signature strip and quietly omits them is worse than no
// constant at all, because the next session to find it would reasonably
// assume it was the canonical one.
//
// The BOL's signature strip lives in pdfService.generateBOLFromLoad and stays
// there. See §13.3 for the ruling.
/**
 * Rate Confirmation signature — single block, Carrier acceptance only.
 * A Rate Con is a binding agreement between Broker and Carrier on rate +
 * terms. Shipper isn't a party; Consignee has no role. The Broker's act
 * of issuing the document is the Broker signature; only the Carrier
 * countersigns to accept the rate and bind the load.
 */
/**
 * The Rate Confirmation acceptance strip, per `.sig-grid.open` in
 * docs/design/rc.html: TWO columns, four signing fields each.
 *
 * IT USED TO BE ONE COLUMN OF SEVEN, and the extra three were CARRIER LEGAL
 * NAME / MC # / DOT # — a second printing of what the CARRIER band on page one
 * already states. Seven ruled rows do not fit beside the terms, which is why
 * the acceptance kept spilling onto a third page carrying almost nothing else.
 *
 * The identity did not vanish; it moved to where the design puts it, in the
 * party sub-line (`certification`) rather than as rows a carrier would be
 * asked to sign under. pdfService fills the carrier's from the load at render
 * time, so a page returned on its own still says who signed.
 *
 * The BROKER column is new and is the point of B9a: SRL is a party to this
 * document, and a rate confirmation with one signature column reads as
 * something the carrier issues. Role-scoped prefills are what make it possible
 * to fill this column without also filling the carrier's.
 */
export const RATE_CON_SIGNATURE_ROLES: SignatureRole[] = [
  {
    title: 'CARRIER · ACCEPTANCE',
    // Filled per-render with the assigned carrier's identity. Empty here
    // because this constant cannot know the load.
    certification: '',
    fields: ['AUTHORIZED SIGNATORY (PRINT)', 'TITLE', 'SIGNATURE', 'DATE'],
  },
  {
    title: 'BROKER · SILK ROUTE LOGISTICS INC.',
    certification: '',
    fields: ['PRINT NAME', 'TITLE', 'SIGNATURE', 'DATE'],
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

/**
 * Key for a role-scoped prefill: roleFieldKey(role.title, 'PRINT NAME').
 *
 * Exported so no caller hand-concatenates. A separator typo yields a key that
 * matches nothing, and a prefill that silently fails to appear is the hardest
 * kind of blank to notice on a signature page — it looks exactly like a field
 * that was meant to be signed by hand.
 */
export function roleFieldKey(roleTitle: string, field: string): string {
  return roleTitle + '::' + field;
}

export function drawSignatureBlock(
  doc: PDFDoc,
  yTop: number,
  options: { roles: SignatureRole[]; height?: number; prefilledValues?: Record<string, string> }
): number {
  // Sprint 48.c (v3.8.abj) — added prefilledValues option. Pre-fill SRL-known
  // carrier identity fields (CARRIER LEGAL NAME / MC # / DOT #) so the carrier
  // only writes AUTHORIZED SIGNATORY / TITLE / SIGNATURE / DATE at signing
  // time. Industry-standard RC pattern; matches CHR/Coyote/RXO templates.
  // When a field is in prefilledValues, the value renders above the underline
  // in fg1 (primary text), otherwise underline stays bare for handwriting.
  // Local mirror — propagate to skill canonical srl_chrome.ts at next sync.
  const { roles, height = 220, prefilledValues = {} } = options;
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

    // Sprint 50 (Item 122) — certification render guard. When empty, skip
    // the italic prose render and tighten field-start Y. Without this gate,
    // PDFKit doc.text('') with empty string still advances doc.y by one
    // line height (~9pt) leaving phantom whitespace under the header label.
    // Explicit Y reposition per Item 99 file-landed-at-expected-path gate.
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
      // Sprint 49.b (Item 139) — row spacing 22 → 26pt + value Y 4 → 10pt.
      // Sprint 48.c placed pre-filled value at fieldY+4 while label sits at
      // fieldY; 6.5pt label extends ~6.5pt down and 8.5pt value starting
      // at +4 produced ~2.5pt visible overlap on every pre-filled row.
      // 26pt row + value at fieldY+10 gives clean separation: label fieldY
      // to ~+7, gap +7-10, value +10 to ~+19, underline at +20. Callers
      // passing fixed block height must allow ~28pt × N fields headroom.
      doc.font(FONT_BODY_BOLD, 6.5);
      drawLabel(doc, f, x, fieldY, { color: TOKENS.fg3, size: 6.5 });

      // Pre-filled value (if present) renders just above the underline in
      // primary text color. Caller passes a field-name → value map; bare
      // fields fall through to underline-only for handwritten entry.
      // ROLE-SCOPED FIRST, bare field name second.
      //
      // Both roles of a master agreement carry fields called PRINT NAME,
      // TITLE, SIGNATURE and DATE. A bare key therefore fills BOTH columns:
      // a bare prefilledValues["PRINT NAME"] would print the BROKER signatory
      // in the CARRIER column too, on a document the carrier signs. That is why
      // the broker block could not be prefilled before this.
      //
      // The bare lookup is kept as the fallback, so this is a PURE WIDENING:
      // with no role-scoped key present the resolution is byte-identical to
      // before, which is what the unmoved pins on this commit prove.
      const preVal = prefilledValues[roleFieldKey(role.title, f)] ?? prefilledValues[f];
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
 * The parameter is retained ONLY for call-site compatibility: five callers pass
 * it as an object-literal property (agreementPdfService.ts:147 and
 * pdfService.ts:2426/2526/2687/2846). Dropping it from this type turns TypeScript's
 * excess-property check on those literals into 5 × TS2353 and reds the build in
 * files this module does not own. Verified empirically, not assumed. If those five
 * call sites are ever cleaned up, delete this property in the same commit.
 */
/**
 * THE footer content line. One implementation, two geometries.
 *
 * v3.8.azj C5 — drawFooter and drawShellFooter each carried their own copy of
 * the same three-part line (identity left, tagline centred, page right). Two
 * copies of one line is how they drifted: the operational footer separated with
 * a double space and centred the tagline by measuring it, the shell used a
 * single space and align:"center", and the two set different fonts and sizes for
 * text saying the same thing on documents a carrier receives together.
 *
 * GEOMETRY IS A PARAMETER; STYLE IS NOT. The fork that mattered is the margin —
 * operational documents sit at MARGIN (36), the shell at SHELL_MARGIN (54). That
 * difference is real and stays. The rest was accident, settled here once.
 *
 * Callers keep their own rule: the operational footer draws goldRule at 0.75,
 * the shell strokes its own at 0.7. Only the text line is shared.
 */
function drawFooterContentLine(
  doc: PDFDoc,
  g: { left: number; width: number; y: number; pageNum: number; totalPages: number },
): void {
  const { left, width, y, pageNum, totalPages } = g;

  doc.font(FONT_BODY, 7).fillColor(TOKENS.fg3)
     .text(`MC# ${BRAND.mc} · DOT# ${BRAND.dot} · ${BRAND.domain}`, left, y, { lineBreak: false });

  doc.font(FONT_BODY_ITALIC, 7).fillColor(TOKENS.goldDark)
     .text(BRAND.tagline, left, y, { width, align: "center", lineBreak: false });

  doc.font(FONT_BODY, 7).fillColor(TOKENS.fg3)
     .text(`Page ${pageNum} of ${totalPages}`, left, y, { width, align: "right", lineBreak: false });
}

export function drawFooter(
  doc: PDFDoc,
  options: {
    pageNum: number;
    totalPages: number;
    /** accepted for call-site compatibility, never rendered — see above */
    docId?: string;
    /**
     * Y of the footer's gold rule baseline, PDFKit top-down. Defaults to
     * PAGE_H - MARGIN - 12 = 744, which every document drew before this
     * existed and every document still draws when the option is omitted.
     *
     * WHY IT IS OVERRIDABLE. The Bill of Lading puts its rule at 770. That is
     * not a style choice: the BOL is fit-gated to ONE page and its adaptive
     * budget already saturates at four line items, so adopting 744 would
     * spend 30pt of a ~67pt elasticity and cost roughly a row and a half of
     * freight. The alternative was to leave the BOL drawing its own footer,
     * which is the drift the chrome exists to end.
     *
     * Omitting it is byte-identical to before — asserted by footerYDefault
     * and by every render pin, which is the real proof since all seven
     * existing call sites omit it.
     */
    footerY?: number;

    /**
     * Version of the governing terms this document was ISSUED under. Rendered
     * on its own line BELOW the identity line, not appended to it: the identity
     * line already measures ~190pt against a tagline centred from ~268pt, so
     * appending would overprint — the §19 Sub-pattern 8.a failure that put
     * "Standard Net-30" through the adjacent meta cell. Measured, not assumed.
     *
     * Optional because most documents have no terms version; omitted, the
     * footer is byte-identical to before.
     */
    termsVersion?: string | null;
  } = { pageNum: 1, totalPages: 1 }
): void {
  // docId intentionally NOT destructured — nothing below may render it.
  const { pageNum, totalPages, termsVersion, footerY: footerYOverride } = options;
  const footerY = footerYOverride ?? PAGE_H - MARGIN - 12;

  goldRule(doc, footerY - 4, { weight: 0.75 });

  // Operational geometry: MARGIN (36), never SHELL_MARGIN. An operational
  // document that adopted the shell margin would indent its footer 18pt past
  // its own body.
  drawFooterContentLine(doc, {
    left: MARGIN,
    width: PAGE_W - MARGIN * 2,
    y: footerY + 4,
    pageNum,
    totalPages,
  });

  // Terms version stays out of the shared line: only operational documents
  // carry one, and it sits on its OWN line below because the identity line
  // already measures ~190pt against a tagline centred from ~268pt.
  if (termsVersion) {
    doc.font(FONT_BODY, 6.5).fillColor(TOKENS.fg3)
       .text(`Terms version ${termsVersion}`, MARGIN, footerY + 13, { lineBreak: false });
  }
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
const PANEL_BODY_TOP = 22;  // panel top -> body baseline start (clears the 6.5pt label at +8)
const PANEL_PAD_BOTTOM = 10; // measured-height mode only; matches the horizontal inset

/**
 * cream-2 panel utility.
 *
 * `wrap` DEFAULTS TO FALSE and the false path is byte-identical to the original:
 * fixed `h`, body rendered with `lineBreak: false`. Every existing caller is
 * unaffected — the only difference is that the function now also returns the y
 * below the panel, which callers are free to keep ignoring.
 *
 * `wrap: true` is the path that lets this utility absorb the hand-built
 * roundedRect + fillAndStroke + manual wrapped text blocks in pdfService
 * (SKILL.md "Don't hand-build chrome"; CLAUDE.md §13.3 Item 94). In that mode
 * the panel is SIZED FROM THE MEASURED TEXT rather than from `h`, so `h` is
 * ignored and the return value is the only way to learn where the panel ended.
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
  /** The design's `<small>` sub-line under a description. Optional, and left
   *  absent rather than filled with a restatement of the label: an invoice
   *  line that explains nothing should print nothing. */
  note?: string;
}

export interface RemitTo {
  legalName: string;
  mailAddress: string[];
  bankName?: string;
  routingAba?: string;
  accountNumber?: string;
  swift?: string;
}

// ── The navy section tab ────────────────────────────────────────────────────
//
// docs/design/invoice.html and rc.html both end with an override
// block commented "navy section tabs, matching the RC", and it is the single
// most visible change the locked design makes to an SRL document:
//
//     .sec           { background: navy; color: cream; padding: 3px 10px 2px;
//                      font-size: 6.5pt; letter-spacing: .2em; margin: 0 0 8px }
//     .two .col > .k { background: navy; color: gold;  ...same box... }
//
// A section heading stops being gold text on white and becomes a filled navy
// chip. Two variants, and the difference is not decorative: CREAM text marks a
// top-level section of the document (BILL TO, CHARGES, REMIT TO), GOLD text
// marks a column heading inside one (SHIPPER, RECEIVER). Getting those the
// wrong way round reads as a hierarchy error rather than a colour error.
//
// Inline key labels are NOT tabs. The design keeps `.k` as bare gold-dark
// small caps wherever it sits inside a key/value pair, which is why
// CUSTOMER ACCOUNT and ACH / WIRE below still call drawLabel.
//
// GEOMETRY. The design pads 3 top / 2 bottom and that asymmetry is honored
// rather than averaged away: a line box carries descender space below the
// baseline that uppercase text never uses, so equal padding renders visibly
// bottom-heavy. Measured on DM Sans Bold at 6.5pt, ascent 6.45 and descent
// 2.02 give an 8.46pt line and a 13.46pt box, which is within a rounding of
// what the CSS produces at 6.5pt.
//
// The box is sized from currentLineHeight() rather than a hand-guessed cap
// height, so a font substitution grows the box instead of clipping the text.
//
// The trailing character space is excluded from the box width on purpose.
// PDFKit's characterSpacing applies AFTER the final glyph too, so including it
// would leave a visibly wider right pad than left on every tab.
const TAB_TRACKING = 0.2;   // .2em, per the design override
const TAB_PAD_X = 10;       // 10px -> 10pt, the 1:1 mapping ratified in C4
const TAB_PAD_TOP = 3;      // padding: 3px 10px 2px, per the design
const TAB_PAD_BOTTOM = 2;
const TAB_GAP_BELOW = 8;    // margin-bottom: 8px


/** The mono wire-memo box. Fixed: the string inside it is a single line. */
const PAYMENT_REF_BOX_H = 22;

/**
 * The vertical space a section tab occupies, INCLUDING its gap below.
 *
 * Exported so a caller that must budget a page can measure the tab without
 * drawing it. One definition: a second copy of this arithmetic in a caller is
 * how a layout budget silently stops matching the layout.
 */
export function sectionTabHeight(doc: PDFDoc, size: number = 6.5): number {
  doc.font(FONT_BODY_BOLD, size);
  return doc.currentLineHeight() + TAB_PAD_TOP + TAB_PAD_BOTTOM + TAB_GAP_BELOW;
}

/** The fixed height of the payment-reference block, tab and trailing gap included. */
export function paymentReferenceHeight(doc: PDFDoc): number {
  return sectionTabHeight(doc) + PAYMENT_REF_BOX_H + 8;
}

/**
 * Draws a navy section tab and returns the y at which content below it starts,
 * with the design's 8pt gap already applied.
 *
 * @param variant 'cream' for a document section, 'gold' for a column heading.
 */
export function drawSectionTab(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  options: { variant?: 'cream' | 'gold'; size?: number } = {},
): number {
  const { variant = 'cream', size = 6.5 } = options;
  const label = text.toUpperCase();
  const tracking = size * TAB_TRACKING;

  doc.font(FONT_BODY_BOLD, size);
  const glyphW = doc.widthOfString(label) + tracking * Math.max(0, label.length - 1);
  const lineH = doc.currentLineHeight();
  const boxW = glyphW + TAB_PAD_X * 2;
  const boxH = lineH + TAB_PAD_TOP + TAB_PAD_BOTTOM;

  doc.save().fillColor(TOKENS.navy).rect(x, y, boxW, boxH).fill().restore();
  doc.save()
     .fillColor(variant === 'gold' ? TOKENS.gold : TOKENS.cream)
     .font(FONT_BODY_BOLD, size)
     .text(label, x + TAB_PAD_X, y + TAB_PAD_TOP, { characterSpacing: tracking, lineBreak: false })
     .restore();

  return y + boxH + TAB_GAP_BELOW;
}

/**
 * A section heading in the RATE CONFIRMATION's register, per `.sec` in
 * docs/design/rc.html:
 *
 *     .sec    7pt, .16em, weight 700, NAVY, margin-bottom 6
 *     .sec .r right-floated, ink-3, .06em — the governing BCA articles
 *
 * NOT drawSectionTab. The two documents genuinely differ: the invoice's final
 * override fills `.sec` navy with cream text, and the RC keeps it as navy TEXT
 * and puts its navy into the label rail and the terms table head instead. The
 * invoice override's own comment says "matching the RC", meaning it borrowed
 * the RC's navy IDEA — not that the two elements are the same element.
 *
 * `ref` is the design's most useful addition and the reason this is worth a
 * helper: every section on the terms page names the Broker-Carrier Agreement
 * articles it derives from, so a carrier reading a clause can find the
 * governing text rather than take the Rate Confirmation's word for it.
 */
export function drawSectionHeading(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  options: { width?: number; ref?: string; size?: number } = {},
): number {
  const { width = CONTENT_W, ref, size = 7 } = options;
  doc.save().fillColor(TOKENS.navy).font(FONT_BODY_BOLD, size)
     .text(text.toUpperCase(), x, y, { characterSpacing: size * 0.16, lineBreak: false })
     .restore();

  if (ref) {
    const refSize = size;
    const refTrack = refSize * 0.06;
    doc.font(FONT_BODY, refSize);
    // widthOfString excludes character spacing, which is applied after every
    // glyph including the last; the trailing one is blank, so it is left out of
    // the right-alignment or the text drifts left of the margin.
    const refW = doc.widthOfString(ref) + refTrack * Math.max(0, ref.length - 1);
    doc.save().fillColor(TOKENS.fg3).font(FONT_BODY, refSize)
       .text(ref, x + width - refW, y, { characterSpacing: refTrack, lineBreak: false })
       .restore();
  }

  doc.font(FONT_BODY_BOLD, size);
  return y + doc.currentLineHeight() + 6;
}

export function drawBillToBlock(
  doc: PDFDoc, billTo: BillTo, yTop: number,
  xStart: number = MARGIN, width: number = CONTENT_W
): number {
  let curY = drawSectionTab(doc, 'BILL TO', xStart, yTop);

  doc.font(FONT_BODY_BOLD, 12).fillColor(TOKENS.navy)
     .text(billTo.name, xStart, curY, { width });
  curY = doc.y + 2;   // doc.y, not a fixed 14: a half-width column wraps

  if (billTo.attention) {
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2)
       .text(`Attn: ${billTo.attention}`, xStart, curY, { lineBreak: false });
    curY += 11;
  }

  doc.font(FONT_BODY, 9.5).fillColor(TOKENS.fg1);
  for (const line of billTo.addressLines) {
    doc.text(line, xStart, curY, { width });
    curY = doc.y;
  }

  if (billTo.customerAccount) {
    curY += 4;
    drawLabel(doc, 'CUSTOMER ACCOUNT', xStart, curY, { color: TOKENS.goldDark, size: 6.5 });
    curY += 12;
    doc.font(FONT_MONO_BOLD, 10).fillColor(TOKENS.fg1)
       .text(billTo.customerAccount, xStart, curY, { lineBreak: false });
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
  const rcvX = MARGIN + colW;

  // Column headings, so GOLD on navy per `.two .col > .k` in the design — a
  // cream tab here would read as a second top-level section rather than as two
  // columns of one.
  const nameY = drawSectionTab(doc, 'SHIPPER', MARGIN, yTop + 6, { variant: 'gold' });
  drawSectionTab(doc, 'RECEIVER', rcvX, yTop + 6, { variant: 'gold' });

  doc.font(FONT_BODY_BOLD, 10).fillColor(TOKENS.navy)
     .text(shipperName, MARGIN, nameY, { lineBreak: false })
     .text(receiverName, rcvX, nameY, { lineBreak: false });
  const cityY = nameY + 12;
  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2)
     .text(shipperCity, MARGIN, cityY, { lineBreak: false })
     .text(receiverCity, rcvX, cityY, { lineBreak: false });

  // Derived, not fixed. The tab is taller than the bare label it replaced, and
  // a hardcoded +42 would have drawn the closing rule THROUGH the city line.
  const bottomY = cityY + doc.currentLineHeight() + 4;
  goldRule(doc, bottomY, { weight: 0.5 });
  return bottomY + 8;
}

/**
 * The charges table, in the design's `table.ch.open` register.
 *
 *     thead th   transparent, gold-dark 6.5pt small caps, gold rule beneath
 *     tbody td   8pt padding, 9.5pt navy, hairline rule between rows
 *     td small   8pt ink-2 sub-line under the description
 *     last row   gold rule beneath
 *     tfoot .bal cream-2 fill, 1.5pt navy above, gold below, 17pt figure
 *
 * The total stays HERE rather than moving to the balance card as the design's
 * markup does. The card only renders on a partially-paid invoice, so following
 * the markup literally would leave a fully-unpaid invoice — the common case —
 * printing charges and no total. The `tfoot tr.bal` styling is the design's
 * own, applied to the row the document actually needs.
 */
export function drawChargesBlock(
  doc: PDFDoc, charges: InvoiceCharge[],
  yTop: number, width: number = 280,
  xStart: number = PAGE_W - MARGIN - width,
  /**
   * The y this block must not draw past. Rows stop and an overflow line is
   * printed instead, the way the BOL caps its freight table.
   *
   * Optional, but the invoice always passes it. A long accessorial list used
   * to spill onto a second page carrying no header and no footer, while page
   * one went on printing "Page 1 of 1" — so the overflow was invisible both
   * on the document and in its own page count.
   *
   * The TOTAL sums EVERY charge, not the printed ones. A capped invoice
   * under-lists; it never under-bills.
   */
  floorY?: number
): number {
  const right = xStart + width;
  let curY = drawSectionTab(doc, 'CHARGES', xStart, yTop);

  // Open header: no fill, gold-dark labels, gold rule beneath.
  const headSize = 6.5, headTrack = headSize * 0.1;
  doc.save().fillColor(TOKENS.goldDark).font(FONT_BODY_MEDIUM, headSize);
  doc.text('DESCRIPTION', xStart, curY, { characterSpacing: headTrack, lineBreak: false });
  const amtHead = 'AMOUNT';
  const amtHeadW = doc.widthOfString(amtHead) + headTrack * (amtHead.length - 1);
  doc.text(amtHead, right - amtHeadW, curY, { characterSpacing: headTrack, lineBreak: false });
  doc.restore();
  curY += doc.currentLineHeight() + 6;
  doc.save().strokeColor(TOKENS.gold).lineWidth(0.5)
     .moveTo(xStart, curY).lineTo(right, curY).stroke().restore();

  const money = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // How many rows fit — decided BEFORE drawing any, by measurement.
  //
  // A first version decided row by row as it drew and it was wrong in a way
  // that only a rendered document showed: it reserved the balance row but not
  // the overflow NOTICE, so a capped block overshot by the notice height and
  // pushed the fine print through the footer. Reserving after the fact is not
  // possible — the rows are already on the page.
  doc.font(FONT_BODY_BOLD, 17);
  const balReserve = doc.currentLineHeight() + 20;
  const rowHeights = charges.map((ch) => {
    doc.font(FONT_BODY, 9.5);
    let h = 8 + doc.currentLineHeight() + 8;
    if (ch.note) {
      doc.font(FONT_BODY, 8);
      h += 2 + doc.heightOfString(ch.note, { width: width - 90, lineGap: 0 });
    }
    return h;
  });
  doc.font(FONT_BODY_ITALIC, 8);
  const noticeReserve = 6 + doc.currentLineHeight() + 6;

  let drawn = charges.length;
  if (floorY != null) {
    const fits = (n: number) => {
      const rows = rowHeights.slice(0, n).reduce((a, b) => a + b, 0);
      const notice = n < charges.length ? noticeReserve : 0;
      return curY + rows + notice + balReserve <= floorY;
    };
    while (drawn > 0 && !fits(drawn)) drawn--;
  }

  charges.forEach((ch, i) => {
    if (i >= drawn) return;
    curY += 8;                                   // tbody td padding-top
    doc.font(FONT_BODY, 9.5).fillColor(TOKENS.navy)
       .text(ch.label, xStart, curY, { lineBreak: false });
    const amt = money(ch.amount);
    const amtW = doc.widthOfString(amt);
    doc.text(amt, right - amtW, curY, { lineBreak: false });
    curY += doc.currentLineHeight();
    if (ch.note) {
      curY += 2;
      doc.font(FONT_BODY, 8).fillColor(TOKENS.fg2)
         .text(ch.note, xStart, curY, { width: width - 90, lineGap: 0 });
      // text() with a width advances doc.y itself; trust it over an assumed
      // single line, because a long lane wraps and a fixed increment would
      // print the next row on top of it.
      curY = doc.y;
    }
    curY += 8;                                   // tbody td padding-bottom
    // Hairline between rows, gold under the last — `tr:last-child td`.
    const last = i === charges.length - 1;
    doc.save().strokeColor(last ? TOKENS.gold : TOKENS.rule).lineWidth(0.5)
       .moveTo(xStart, curY).lineTo(right, curY).stroke().restore();
  });

  const omitted = charges.length - drawn;
  if (omitted > 0) {
    curY += 6;
    doc.font(FONT_BODY_ITALIC, 8).fillColor(TOKENS.fg2)
       .text(
         `+ ${omitted} further ${omitted === 1 ? 'charge' : 'charges'}, itemised on the attached detail. `
         + `The total below includes ${omitted === 1 ? 'it' : 'them'}.`,
         xStart, curY, { width },
       );
    curY = doc.y + 6;
    doc.save().strokeColor(TOKENS.gold).lineWidth(0.5)
       .moveTo(xStart, curY).lineTo(right, curY).stroke().restore();
  }

  // tfoot tr.bal — the one filled row on the block.
  const balPadTop = 10, balPadBottom = 10;
  // Every charge, printed or capped. See floorY.
  const total = charges.reduce((s, ch) => s + ch.amount, 0);
  const totalStr = money(total);
  doc.font(FONT_BODY_BOLD, 17);
  const balH = doc.currentLineHeight() + balPadTop + balPadBottom;
  doc.save().fillColor(TOKENS.cream2).rect(xStart, curY, width, balH).fill().restore();
  doc.save().strokeColor(TOKENS.navy).lineWidth(1.5)
     .moveTo(xStart, curY).lineTo(right, curY).stroke().restore();
  doc.save().strokeColor(TOKENS.gold).lineWidth(0.5)
     .moveTo(xStart, curY + balH).lineTo(right, curY + balH).stroke().restore();

  const totalW = doc.widthOfString(totalStr);
  doc.font(FONT_BODY_BOLD, 17).fillColor(TOKENS.navy)
     .text(totalStr, right - 8 - totalW, curY + balPadTop, { lineBreak: false });
  // The label is baseline-aligned with the figure, not top-aligned: at 7.5pt
  // against 17pt the difference is visible.
  const labelSize = 7.5;
  doc.font(FONT_BODY_BOLD, labelSize);
  const labelDrop = 17 * 0.72 - labelSize * 0.72;   // cap-height difference
  doc.fillColor(TOKENS.navy)
     .text('TOTAL USD', xStart + 8, curY + balPadTop + labelDrop, {
       characterSpacing: labelSize * 0.16, lineBreak: false,
     });

  return curY + balH;
}

/**
 * The balance card, in the design's `.card` register.
 *
 *     .card       cream fill, rule-2 border, 1.5px NAVY top border, square
 *     .card .k    gold-dark 6.5pt small caps
 *     .card .big  24pt navy, the figure that answers "what do I owe"
 *     .card .crow 8.5pt ink-2 label / navy value, hairline above
 *     .crow.due   gold rule above, navy text
 *
 * Square corners are the design, not an omission: every other panel in this
 * library rounds at 6-8pt, and the card is the one element that does not. That
 * is what makes it read as a stamped total rather than another panel.
 */
export function drawSettlementSummary(
  doc: PDFDoc,
  invoiceAmount: number, amountPaid: number,
  yTop: number, width: number = 280,
  xStart: number = PAGE_W - MARGIN - width
): number {
  const padX = 16, padTop = 14, padBottom = 12;
  const money = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Measure first: the card is sized from its content so a longer figure or an
  // extra row grows it rather than overflowing a fixed height.
  doc.font(FONT_BODY_BOLD, 6.5); const labelH = doc.currentLineHeight();
  doc.font(FONT_BODY_BOLD, 24);  const bigH = doc.currentLineHeight();
  doc.font(FONT_BODY, 8.5);      const rowH = doc.currentLineHeight() + 10;  // 5pt padding each side
  const cardH = padTop + labelH + 6 + bigH + 12 + rowH * 2 + padBottom;

  doc.save().fillColor(TOKENS.cream).rect(xStart, yTop, width, cardH).fill().restore();
  doc.save().strokeColor(TOKENS.border2).lineWidth(0.5)
     .rect(xStart, yTop, width, cardH).stroke().restore();
  doc.save().strokeColor(TOKENS.navy).lineWidth(1.5)
     .moveTo(xStart, yTop).lineTo(xStart + width, yTop).stroke().restore();

  let curY = yTop + padTop;
  drawLabel(doc, 'BALANCE DUE', xStart + padX, curY, { color: TOKENS.goldDark, size: 6.5 });
  curY += labelH + 6;

  const balance = invoiceAmount - amountPaid;
  doc.font(FONT_BODY_BOLD, 24).fillColor(TOKENS.navy)
     .text(money(balance), xStart + padX, curY, { lineBreak: false });
  curY += bigH + 12;

  const crow = (label: string, value: string, gold: boolean) => {
    doc.save().strokeColor(gold ? TOKENS.gold : TOKENS.rule).lineWidth(0.5)
       .moveTo(xStart + padX, curY).lineTo(xStart + width - padX, curY).stroke().restore();
    curY += 5;
    doc.font(FONT_BODY, 8.5).fillColor(gold ? TOKENS.navy : TOKENS.fg2)
       .text(label, xStart + padX, curY, { lineBreak: false });
    doc.font(FONT_BODY_MEDIUM, 8.5).fillColor(TOKENS.navy);
    const vW = doc.widthOfString(value);
    doc.text(value, xStart + width - padX - vW, curY, { lineBreak: false });
    curY += doc.currentLineHeight() + 5;
  };
  crow('Invoice total', money(invoiceAmount), false);
  crow('Amount received', money(amountPaid), true);

  return yTop + cardH + 8;
}

export function drawRemitToBlock(
  doc: PDFDoc, remit: RemitTo, yTop: number,
  xStart: number = MARGIN, width: number = CONTENT_W
): number {
  let curY = drawSectionTab(doc, 'REMIT TO', xStart, yTop);

  doc.font(FONT_BODY_BOLD, 10).fillColor(TOKENS.navy)
     .text(remit.legalName, xStart, curY, { lineBreak: false });
  curY += 13;

  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2);
  for (const line of remit.mailAddress) {
    doc.text(line, xStart, curY, { width });
    curY = doc.y;
  }

  if (remit.bankName || remit.routingAba || remit.accountNumber) {
    curY += 6;
    drawLabel(doc, 'ACH / WIRE', xStart, curY, { color: TOKENS.goldDark, size: 6.5 });
    curY += 12;
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
    if (remit.bankName) {
      doc.text(`Bank: ${remit.bankName}`, xStart, curY, { lineBreak: false });
      curY += 11;
    }
    if (remit.routingAba) {
      doc.font(FONT_MONO, 9);
      doc.text(`ABA / Routing #: ${remit.routingAba}`, xStart, curY, { lineBreak: false });
      curY += 11;
    }
    if (remit.accountNumber) {
      doc.text(`Account #: ${remit.accountNumber}`, xStart, curY, { lineBreak: false });
      curY += 11;
    }
    if (remit.swift) {
      doc.text(`SWIFT: ${remit.swift}`, xStart, curY, { lineBreak: false });
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
  const boxH = PAYMENT_REF_BOX_H;

  const boxY = drawSectionTab(doc, 'PAYMENT REFERENCE (WIRE MEMO)', MARGIN, yTop);

  doc.save()
     .fillColor(TOKENS.cream2)
     .strokeColor(TOKENS.goldDark)
     .lineWidth(0.5)
     .roundedRect(MARGIN, boxY, boxW, boxH, 4)
     .fillAndStroke()
     .restore();

  // 7pt from the box top is where the 9.5pt mono line sits centred in a 22pt
  // box; it was measured against the pre-tab layout and is unchanged.
  doc.font(FONT_MONO_BOLD, 9.5).fillColor(TOKENS.fg1)
     .text(refStr, MARGIN + 12, boxY + 7, { lineBreak: false });

  return boxY + boxH + 8;
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
  // v3.8.art — tempControlled makes the TEMPERATURE row unmissable rather than
  // conditional on data. Previously the row was gated purely on tempSetpointF,
  // so a reefer load whose setpoint was never captured rendered byte-identical
  // to a dry van: silence and not-applicable became indistinguishable, and
  // nobody catches it at the desk because the document looks complete.
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
  // Sprint 51 (Item 130) — tracking acceptance gate as preconditions-tier
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
  // to the DETENTION value in OPERATIONAL TERMS grid. Pairs with T&C clause
  // (7) which mandates 30-min-before + departure notifications. The cell
  // suffix surfaces the obligation at the operational glance level; the
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

  // v3.8.art — the row prints whenever the load is temperature-controlled, even
  // if the setpoint is missing, so a data gap surfaces as a loud instruction
  // instead of an absent row. Frozen freight makes 0°F legitimate, so every
  // check here is against undefined rather than truthiness.
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
      // v3.8.arv — MEASURED to 165.7pt against a 202pt cell. The v3.8.art string
      // ("TEMP-CONTROLLED: setpoint not specified. Call before loading.") was
      // 279.9pt, and this cell draws with lineBreak:false, so PDFKit did not
      // wrap it — the media box clipped the tail and the words "Call before
      // loading." never printed. The instruction written to make a data gap
      // LOUD was the part being silently cut. The label already reads
      // TEMPERATURE, so the value does not need to repeat "TEMP-CONTROLLED".
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
       // left 180pt and the canonical reefer value measures 191.0pt:
       // "36°F (34–38°F) · continuous · pre-cool 34°F". It overran into the
       // adjacent column. 68pt buys 202pt and clears it by 11pt. The v3.8.arn
       // fix made exactly this change in drawRateConTerms and never reached
       // here, because drawEquipmentSpec did not yet carry a value long enough
       // to expose it — v3.8.art gave it one.
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
  const detentionFree = terms.detentionFreeHours ?? DETENTION_FREE_HOURS;
  // v3.8.arn — a literal 0 is not "unset". Nullish coalescing let a caller's
  // `detentionRate: 0` through and published "$0/hr" to the carrier. Treat any
  // non-positive or non-finite rate as unset so a bad write upstream can never
  // again silently promise a carrier nothing.
  const rawDetentionRate = terms.detentionRatePerHour;
  const detentionRate =
    typeof rawDetentionRate === "number" && Number.isFinite(rawDetentionRate) && rawDetentionRate > 0
      ? rawDetentionRate
      : DETENTION_RATE_PER_HOUR;
  let detStr = `$${detentionRate}/hr after ${detentionFree} hrs free`;
  // v3.8.asc — the cap now falls back like every sibling term. It was the ONLY
  // item in this grid with no default: when a caller omitted it the clause simply
  // vanished and the document told the carrier detention was UNCAPPED. Today the
  // sole caller always passes it, so nothing mis-stated — but the Invoice and
  // Settlement generators are queued to call this same function, and a silent
  // omission on a signed page is not a defect worth discovering later.
  const detentionCap = terms.detentionMaxPerStop ?? DETENTION_CAP_PER_STOP;
  if (detentionCap) detStr += `, $${detentionCap}/stop cap`;
  if (terms.detentionNotify) detStr += ' · notify';
  items.push(['DETENTION', detStr]);

  // v3.8.asc/asd — every fallback in this grid now comes from lib/accessorialPolicy.
  // They were bare literals (2 / 50 / 200 / 250 / 4). The values were right, but a
  // literal in a renderer is how the schedule drifts: nothing connects it to the
  // ratified figure, so raising the layover rate in policy would have left this
  // printing the old one on every signed Rate Confirmation.
  //
  // asc did the last three and left the two detention terms behind — which is worth
  // recording, because a partial migration is the more dangerous state. The comment
  // then claimed the fallbacks "come from lib/accessorialPolicy, the single source",
  // and that read as true of the whole function while being false of the two lines
  // directly above it. asd finished the job.
  items.push(['TONU', `$${terms.tonuAmount ?? TONU_AMOUNT} (truck-order-not-used)`]);
  items.push(['LAYOVER', `$${terms.layoverPerDay ?? LAYOVER_RATE_PER_DAY}/day`]);

  if (terms.lumperReimbursement !== false)
    items.push(['LUMPER', 'Reimbursed with original receipt']);
  // The window is the CARRIER'S right to release, not SRL's right to cancel — see
  // CLAUDE.md §5. The label still does not name the party; naming it is pending
  // the implementation.
  //
  // v3.8.aze — the previous note here said e2e/helpers/pdf.ts pins this string
  // character for character. It does not, and did not: grepping "notice without
  // penalty" across e2e/, __tests__/ and scripts/ returns nothing. The only
  // thing that moves when this text changes is the rate-confirmation render
  // pin, which hashes the whole document rather than this string. Recorded
  // because a comment that names a guard nobody has is worse than no comment —
  // it invites the next reader to trust a check that will not fire.
  items.push(['CANCELLATION',
    `${Math.floor(terms.cancellationWindowHours ?? CARRIER_RELEASE_WINDOW_HOURS)}-hour notice without penalty`]);

  if (terms.quickPayTier) items.push(['QUICK PAY', terms.quickPayTier]);

  const colW = CONTENT_W / 2;
  // v3.8.arn — label gutter narrowed 90 -> 68. Cells draw with lineBreak:false,
  // so a value wider than (colW - gutter) overprints the next column's label
  // rather than wrapping. Once DETENTION carries the canonical $250/stop cap it
  // measures ~190pt, over the 180pt a 90pt gutter allowed. The widest label
  // (CANCELLATION) is 55.3pt at 6.5pt with 8% tracking, so 90pt was ~35pt of
  // dead slack; 68pt still clears it by 12.7pt and buys every cell 202pt.
  const labelGutter = 68;
  drawLabel(doc, 'OPERATIONAL TERMS', MARGIN, yTop, { color: TOKENS.goldDark, size: 7 });
  let curY = yTop + 16;
  const lineH = 13;
  items.forEach(([key, val], i) => {
    const col = i % 2;
    const x = MARGIN + col * colW;
    drawLabel(doc, key, x, curY, { color: TOKENS.goldDark, size: 6.5 });
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1)
       .text(val, x + labelGutter, curY, { lineBreak: false });
    if (col === 1) curY += lineH;
  });
  if (items.length % 2 === 1) curY += lineH;
  return curY + 4;
}

/**
 * Sprint 47 (v3.8.abf) — added transitUnit parameter. Default "hours" per
 * broker industry standard drive-hour metric (carriers think in HOS-relevant
 * drive hours, not calendar days). Pass `"days"` explicitly when the caller
 * has already computed calendar transit days (multi-day plan, HOS-strict
 * pacing, etc.). The transitValue param semantics depend on transitUnit:
 *   - transitUnit="hours": transitValue = drive hours (typically miles / 55)
 *   - transitUnit="days":  transitValue = calendar days
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

// ============================================================================
// PUBLIC: DOCUMENT SHELL — AGREEMENT COVER PAGE
// ============================================================================
//
// Ported from docs/design/bca.html, whose printed form is
// docs/design/Silk_Route_Logistics_Design_System.pdf. That HTML is a
// SPECIFICATION, not a runtime artifact: there is no HTML-to-PDF renderer in
// this codebase and introducing one would put a second rendering path under a
// legal document, which is the dual-renderer problem v3.8.avo removed for the
// Rate Confirmation.
//
// CSS pixels convert at 0.75 (96dpi -> 72pt), inches at 72. Where a value below
// looks arbitrary it is the shell's, converted: 1.5in top padding, an 88px gold
// rule, a 5.1in seal at 15% bleeding 1.7in past the right edge.
//
// OPT-IN. Nothing calls this unless asked. The Quick Pay Agreement shares the
// agreement renderer, so a cover applied by default would restyle a second
// signed instrument nobody asked to restyle.

export interface AgreementCoverOptions {
  /** Display title, set in Playfair REGULAR at 52pt. */
  title: string;
  /** Small gold eyebrow under the rule, e.g. "Foundation Edition". */
  edition: string;
  /** Four meta cells across the foot of the identity block. */
  cells: { label: string; value: string }[];
}

/** Uppercase small-caps run with letter-spacing given in em, as the shell does. */
function capsRun(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  o: { size: number; em: number; color: string; font?: string; width?: number },
): void {
  doc.font(o.font ?? FONT_BODY_MEDIUM, o.size)
     .fillColor(o.color)
     .text(text.toUpperCase(), x, y, {
       characterSpacing: o.em * o.size,
       lineBreak: false,
       width: o.width ?? SHELL_CONTENT_W,
     });
}

/**
 * The cover. Draws onto the CURRENT page and does not add one, so the caller
 * decides where it sits in the document.
 */
export function drawAgreementCoverPage(doc: PDFDoc, o: AgreementCoverOptions): void {
  const L = SHELL_MARGIN;
  const R = PAGE_W - SHELL_MARGIN;
  const W = SHELL_CONTENT_W;

  // ── c-top: mark + company, baseline-aligned on a 24pt mark ──
  drawCompassMark(doc, L, SHELL_MARGIN, 24);
  capsRun(doc, BRAND.legalName, L + 24 + 10.5, SHELL_MARGIN + 8, {
    size: 8.5, em: 0.22, color: TOKENS.navy,
  });

  // ── c-mid: 1.5in of air, then the display title ──
  let y = SHELL_MARGIN + 24 + 108;

  doc.font(FONT_DISPLAY, 52).fillColor(TOKENS.navy);
  const titleW = 403.2; // 5.6in max-width
  const titleH = doc.heightOfString(o.title, { width: titleW, lineGap: -6 });
  doc.text(o.title, L, y, { width: titleW, lineGap: -6 });
  y += titleH + 19.5;

  doc.save().strokeColor(TOKENS.gold).lineWidth(1)
     .moveTo(L, y).lineTo(L + 66, y).stroke().restore();
  y += 16.5;

  capsRun(doc, o.edition, L, y, { size: 8, em: 0.26, color: TOKENS.goldDark });
  y += 8 + 16.5;

  doc.font(FONT_BODY_MEDIUM, 8.5).fillColor(TOKENS.navy)
     .text("MC# " + BRAND.mc + "  ·  USDOT# " + BRAND.dot, L, y, { characterSpacing: 0.05 * 8.5, lineBreak: false });
  y += 14.5;
  doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2)
     .text(BRAND.address + "  ·  " + BRAND.domain, L, y, { characterSpacing: 0.02 * 8.5, lineBreak: false });
  y += 14.5 + 39.6; // + 0.55in bottom padding

  // ── c-grid: four cells between gold rules ──
  const gridTop = y;
  const colW = W / 4;
  const CELL_H = 46;
  doc.save().strokeColor(TOKENS.gold).lineWidth(1)
     .moveTo(L, gridTop).lineTo(R, gridTop).stroke().restore();

  o.cells.slice(0, 4).forEach((c, i) => {
    const cx = L + i * colW;
    capsRun(doc, c.label, cx, gridTop + 9, {
      size: 6.5, em: 0.16, color: TOKENS.goldDark, width: colW - 10.5,
    });
    doc.font(FONT_BODY_MEDIUM, 9.5).fillColor(TOKENS.navy)
       .text(c.value, cx, gridTop + 9 + 6.5 + 4.5, {
         width: colW - 10.5, characterSpacing: 0.02 * 9.5,
       });
    if (i < Math.min(o.cells.length, 4) - 1) {
      doc.save().strokeColor(TOKENS.gold).lineWidth(0.5)
         .moveTo(cx + colW - 10.5, gridTop + 6).lineTo(cx + colW - 10.5, gridTop + CELL_H - 6)
         .stroke().restore();
    }
  });

  const gridBottom = gridTop + CELL_H;
  doc.save().strokeColor(TOKENS.gold).lineWidth(1)
     .moveTo(L, gridBottom).lineTo(R, gridBottom).stroke().restore();

  // ── seal: 5.1in at 15%, bleeding 1.7in past the right edge ──
  const SEAL = 367.2;
  doc.save().opacity(0.15);
  drawCompassMark(doc, R + 122.4 - SEAL, gridBottom + 25.2, SEAL);
  doc.restore();

  // ── c-bot: the tagline, italic gold, on the bottom margin ──
  doc.font(FONT_BODY_ITALIC, 9).fillColor(TOKENS.goldDark)
     .text(BRAND.tagline, L, PAGE_H - SHELL_MARGIN - 11, { lineBreak: false });
}

// ============================================================================
// PUBLIC: DOCUMENT SHELL — INTERIOR PAGE MASTER
// ============================================================================
//
// The shell's interior is deliberately lighter than drawHeaderFirstPage /
// drawContinuationHeader: a thin rule, a document name, an edition, and nothing
// else. A signed agreement running to fourteen pages should not repeat a full
// operational header on every one of them.
//
// These are SEPARATE functions rather than options on the existing ones,
// because drawContinuationHeader and drawFooter are shared with the Rate
// Confirmation, BOL, Invoice and Settlement. Adding a mode to them would put a
// branch in the path of four document families to serve one.

/** Top rule + document identity. Returns the y where body content may start. */
export function drawShellRunningHeader(
  doc: PDFDoc,
  o: { left: string; right: string },
): number {
  const L = SHELL_MARGIN;
  const R = PAGE_W - SHELL_MARGIN;
  const y = SHELL_MARGIN;

  doc.font(FONT_BODY_MEDIUM, 7.5).fillColor(TOKENS.navy)
     .text(o.left, L, y, { characterSpacing: 0.06 * 7.5, lineBreak: false });
  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg3)
     .text(o.right, L, y, {
       characterSpacing: 0.04 * 7.5, width: R - L, align: "right", lineBreak: false,
     });

  const ruleY = y + 7.5 + 5.25; // font + padding-bottom 7px
  doc.save().strokeColor(TOKENS.gold).lineWidth(0.7)
     .moveTo(L, ruleY).lineTo(R, ruleY).stroke().restore();

  return ruleY + 22.5; // body padding-top 30px
}

/** Bottom rule + identity, tagline, page number. Three columns, centre-weighted. */
export function drawShellFooter(
  doc: PDFDoc,
  o: { pageNum: number; totalPages: number },
): void {
  const L = SHELL_MARGIN;
  const R = PAGE_W - SHELL_MARGIN;
  const W = R - L;
  const ruleY = PAGE_H - SHELL_MARGIN - 14;

  doc.save().strokeColor(TOKENS.gold).lineWidth(0.7)
     .moveTo(L, ruleY).lineTo(R, ruleY).stroke().restore();

  // Shell geometry: SHELL_MARGIN (54), its own rule weight. The content line is
  // the shared one.
  drawFooterContentLine(doc, {
    left: L,
    width: W,
    y: ruleY + 6, // padding-top 8px
    pageNum: o.pageNum,
    totalPages: o.totalPages,
  });
}

/**
 * A numbered section heading, shell style: the number in gold, the title in
 * navy small caps. Splits "12. Insurance" the way the shell marks it up, and
 * falls back to drawing the whole string as the title when there is no number
 * -- Schedule A has none.
 */
export function drawShellHeading(doc: PDFDoc, heading: string, x: number, y: number): void {
  const m = /^(\d+\.)\s+(.*)$/.exec(heading);
  const num = m ? m[1] : "";
  const title = m ? m[2] : heading;

  let cx = x;
  if (num) {
    doc.font(FONT_BODY_BOLD, 9).fillColor(TOKENS.goldDark)
       .text(num, cx, y, { characterSpacing: 0.02 * 9, lineBreak: false });
    cx += doc.widthOfString(num) + 6; // margin-right 8px
  }
  doc.font(FONT_BODY_BOLD, 9).fillColor(TOKENS.navy)
     .text(title.toUpperCase(), cx, y, {
       characterSpacing: 0.12 * 9, width: PAGE_W - SHELL_MARGIN - cx, lineBreak: false,
     });
}
