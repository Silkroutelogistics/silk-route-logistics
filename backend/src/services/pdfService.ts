import PDFDocument from "pdfkit";
import { INSURANCE_MINIMUMS } from "../lib/insurancePolicy";
import * as path from "path";
import * as fs from "fs";
import bwipjs from "bwip-js";
import { PackageType } from "@prisma/client";
import { calculateMileage, MileageResult } from "./mileageService";
import { log } from "../lib/logger";
import { generateBOLQRBuffer } from "../utils/qrGenerator";
import { decodeHtmlEntities } from "../utils/htmlEntities";
// ONE derivation rule for every document identifier this file prints. These are
// pure reads: the number is allocated and persisted where the document is
// CREATED, never here, so regenerating a PDF reproduces the same number.
import { documentNumberFor, resolveLoadStem } from "../lib/documentNumber";
// Sprint 45-RC (v3.8.abd) — Item 48 close. Skill chrome library imported from
// backend/src/lib/srl-chrome.ts (mirrored from .claude/skills/srl-brand-design/
// scripts/srl_chrome.ts at session HEAD; manually sync when skill ships canonical
// updates). Path β1 per D6 — sets up Sprint 45-RC2 (Invoice) + 45-RC3 (Settlement
// + ShipperLoadConf) reuse. Other generators in this file (BOL/Invoice/Settlement)
// keep their inline canonical until their dedicated migration sprint.
import {
  drawHeaderFirstPage,
  drawMetaStrip,
  drawPartiesBlock,
  drawShipmentTable,
  drawRateBreakdown,
  drawLaneEconomics,
  drawEquipmentSpec,
  drawCarrierRequirements,
  drawRateConTerms,
  drawSignatureBlock,
  RATE_CON_SIGNATURE_ROLES,
  drawFooter,
  drawContinuationHeader,
  drawPanel,
  registerSkillFonts,
  // v3.8.aqg — Invoice/Settlement migration (Sprint 45-RC2/RC3): the invoice
  // + settlement chrome primitives that were pre-built but never consumed.
  drawBillToBlock,
  drawChargesBlock,
  drawSettlementSummary,
  drawRemitToBlock,
  drawPaymentReference,
  drawLaneReferenceRow,
  FONT_BODY,
  FONT_BODY_BOLD,
  FONT_BODY_ITALIC,
  MARGIN,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
  TOKENS,
  type Party,
  type RateBreakdown,
  type EquipmentSpec,
  type CarrierRequirements,
  type RateConTerms,
  type BillTo,
  type InvoiceCharge,
  type SignatureRole,
} from "../lib/srl-chrome";
import { rcVerifyToken } from "../controllers/verifyController";
// The dwell figures the Rate Confirmation PRINTS and the figures the reconciler
// SETTLES against are the same policy. Import them rather than retyping them, so
// the promise on the signed document and the money in the ledger cannot drift.
// v3.8.asc — repointed from lib/detentionLayover to lib/accessorialPolicy. The
// dwell constants still have exactly one definition (accessorialPolicy re-exports
// them from the engine); this import just also reaches TONU and the release window,
// which had no constant at all and were passed as literals below.
import {
  DETENTION_FREE_HOURS,
  DETENTION_RATE_PER_HOUR,
  DETENTION_CAP_PER_STOP,
  LAYOVER_RATE_PER_DAY,
  TONU_AMOUNT,
  CARRIER_RELEASE_WINDOW_HOURS,
  DETENTION_NOTICE_MINUTES,
  PAPERWORK_DUE_HOURS,
} from "../lib/accessorialPolicy";

type PDFDoc = InstanceType<typeof PDFDocument>;

// v3.8.akg §13.3 Item 8.9 — sourced from canonical authority module.
// Pre-akg: hardcoded MC# 01794414 typo + whaider@ email (wrong per
// §3.10 for shipping documents which should use operations@). akg
// fixes both atomically.
import {
  ENTITY_NAME,
  PRINCIPAL_ADDRESS_ONE_LINE,
  PRINCIPAL_ADDRESS_CITY,
  PRINCIPAL_ADDRESS_STATE,
  PRINCIPAL_ADDRESS_ZIP,
  PHONE,
  OPERATIONS_EMAIL,
  DOMAIN,
  MC_NUMBER,
  DOT_NUMBER,
} from "../config/authority";

const COMPANY = {
  name: ENTITY_NAME,
  address: PRINCIPAL_ADDRESS_ONE_LINE,
  cityStateZip: `${PRINCIPAL_ADDRESS_CITY}, ${PRINCIPAL_ADDRESS_STATE} ${PRINCIPAL_ADDRESS_ZIP}`,
  phone: `+1 ${PHONE}`,
  email: OPERATIONS_EMAIL,
  website: DOMAIN,
  mc: MC_NUMBER,
  dot: DOT_NUMBER,
};

const LOGO_PATH = path.resolve(__dirname, "../assets/logo.png");
const hasLogo = fs.existsSync(LOGO_PATH);

// v3.8.b — transparent (RGBA) compass mark for rendering over the cream
// header band on the BOL v2.9 template. The original logo.png is 8-bit
// RGB (no alpha), which was producing a visible white chip behind the
// mark. This variant ships with the design handoff (build/compass-256.png).
// Scoped to generateBOLFromLoad; rate conf / invoice / settlement PDFs
// continue to use the legacy LOGO_PATH over their white backgrounds.
const LOGO_TRANSPARENT_PATH = path.resolve(__dirname, "../assets/logo-transparent.png");
const hasLogoTransparent = fs.existsSync(LOGO_TRANSPARENT_PATH);

function addHeader(doc: PDFDoc, title: string) {
  if (hasLogo) {
    doc.image(LOGO_PATH, 50, 40, { width: 60 });
  }
  doc.fontSize(8).fillColor("#666666");
  doc.text(COMPANY.name, 400, 40, { align: "right" });
  doc.text(COMPANY.address, 400, 52, { align: "right" });
  doc.text(COMPANY.cityStateZip, 400, 64, { align: "right" });
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, 400, 76, { align: "right" });

  doc.moveTo(50, 100).lineTo(560, 100).strokeColor("#D4A843").lineWidth(2).stroke();

  doc.fontSize(18).fillColor("#1E1E2F").text(title, 50, 115, { align: "center" });
  doc.moveDown(1.5);
}

function addFooter(doc: PDFDoc) {
  const y = doc.page.height - 60;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  doc.fontSize(7).fillColor("#999999");
  doc.text(`${COMPANY.name} | ${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 8, { align: "center" });
  doc.text(`${COMPANY.phone} | ${COMPANY.email} | ${COMPANY.website}`, 50, y + 18, { align: "center" });
}

// Sprint 49 (v3.8.abk, Item 120 + 120.a) — MC# / DOT# render-time strip.
// Storage shape varies by data source (manual registration writes verbatim
// via carrierController.ts:58; FMCSA sync, Apollo import, Lead Hunter may
// each store "MC-XXX", "MC#XXX", "MC XXX", or clean "XXX"). Three existing
// normalizers in the codebase (carrier.ts:64, carrierOkService.ts:132,
// fmcsaService.ts:172) use /^MC-?/i — sufficient for narrow URL/lookup
// input but over-permissive for the arbitrary stored strings we render.
// Item 120.a precision regex: digit lookahead /^MC[-#\s]*(?=\d)/i ensures
// we only strip the prefix when an actual MC number digit follows, avoiding
// over-match on edge cases like a carrier company name starting with "MC".
function normalizeMcNumber(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).replace(/^MC[-#\s]*(?=\d)/i, "").trim();
}
function normalizeDotNumber(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).replace(/^DOT[-#\s]*(?=\d)/i, "").trim();
}

function labelValue(doc: PDFDoc, label: string, value: string, x: number, y: number) {
  doc.fontSize(8).fillColor("#888888").text(label, x, y);
  doc.fontSize(10).fillColor("#1E1E2F").text(value || "—", x, y + 12);
}

interface ShipmentData {
  shipmentNumber: string; proNumber?: string | null; bolNumber?: string | null;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; pieces?: number | null; commodity?: string | null;
  equipmentType: string; rate: number; specialInstructions?: string | null;
  pickupDate: Date; deliveryDate: Date;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null } | null;
  driver?: { firstName: string; lastName: string; phone?: string | null } | null;
  equipment?: { unitNumber: string; type: string } | null;
}

export async function generateBOL(shipment: ShipmentData): Promise<PDFDoc> {
  // Adapt shipment data into the LoadBOLData interface and use the same layout
  const loadData: LoadBOLData = {
    referenceNumber: shipment.shipmentNumber,
    loadNumber: shipment.bolNumber || shipment.shipmentNumber,
    originCity: shipment.originCity,
    originState: shipment.originState,
    originZip: shipment.originZip,
    destCity: shipment.destCity,
    destState: shipment.destState,
    destZip: shipment.destZip,
    weight: shipment.weight,
    pieces: shipment.pieces,
    equipmentType: shipment.equipmentType,
    commodity: shipment.commodity,
    rate: shipment.rate,
    pickupDate: shipment.pickupDate,
    deliveryDate: shipment.deliveryDate,
    specialInstructions: shipment.specialInstructions,
    driverName: shipment.driver ? `${shipment.driver.firstName} ${shipment.driver.lastName}` : null,
    truckNumber: shipment.equipment?.unitNumber || null,
    customer: shipment.customer,
  };
  return await generateBOLFromLoad(loadData);
}

/**
 * Context for BOL PDF generation. Added v3.7.k for the
 * BOL-QR → /track system (Phase 5E.a).
 *
 * `trackingToken` is the 12-char STATUS_ONLY
 * ShipperTrackingToken issued by
 * shipperTrackingTokenService.generateBOLPrintToken()
 * at the controller layer. Phase 5E.b will encode this
 * into a QR printed on the BOL. Until then the parameter
 * is plumbed through but visually unused.
 */
export interface BOLRenderContext {
  trackingToken?: string;
}

interface LoadBOLData {
  referenceNumber: string;
  loadNumber?: string | null;
  /** SRL's own BOL document number (SRL-121485B), allocated when the BOL is
   *  first issued. Optional so the adapter paths and fixtures still type; when
   *  absent the renderer derives revision 1 from the load stem. */
  srlBolNumber?: string | null;
  originCompany?: string | null;
  originAddress?: string | null; originCity: string; originState: string; originZip: string;
  originContactName?: string | null; originContactPhone?: string | null;
  destCompany?: string | null;
  destAddress?: string | null; destCity: string; destState: string; destZip: string;
  destContactName?: string | null; destContactPhone?: string | null;
  shipperFacility?: string | null; consigneeFacility?: string | null;
  // v3.8.d.1 — schema-honest PO/reference chain. Order Builder writes
  // poNumbers[0]; legacy paths populate one of shipperReference /
  // shipperPoNumber / customerRef. Render walks the chain.
  poNumbers?: string[] | null;
  customerRef?: string | null;
  weight?: number | null; pieces?: number | null; equipmentType: string; commodity?: string | null;
  freightClass?: string | null;
  dimensionsLength?: number | null; dimensionsWidth?: number | null; dimensionsHeight?: number | null;
  rate: number; distance?: number | null;
  hazmat?: boolean;
  pickupDate: Date; deliveryDate: Date;
  pickupTimeStart?: string | null; pickupTimeEnd?: string | null;
  deliveryTimeStart?: string | null; deliveryTimeEnd?: string | null;
  specialInstructions?: string | null; notes?: string | null;
  driverName?: string | null; truckNumber?: string | null;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null } | null;
  carrier?: { firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null; dotNumber?: string | null } | null } | null;

  // v2.9 expansions (2026-04-23, v3.7.o). Previously-unsurfaced schema
  // fields and derived carrier/driver identity values. Populated by
  // downloadBOLFromLoad; drawing code does not yet consume these —
  // template rendering lands in Commit 2 / v3.7.p.
  shipperReference?: string | null;
  // Arc 13 — shipperPoNumber removed. It was declared here for a renderer that
  // never consumed it, and the column behind it was never written.
  trailerNumber?: string | null;
  sealNumber?: string | null;
  declaredValue?: number | null;
  driverPhone?: string | null;
  carrierLegalName?: string | null;
  carrierContactName?: string | null;
  proNumber?: string | null;
  releasedValueDeclared?: boolean;
  releasedValueBasis?: "PER_POUND" | "PER_PIECE" | "TOTAL" | "NVD" | null;
  piecesTendered?: number | null;
  piecesReceived?: number | null;

  // v3.8.a — Multi-line shipment support. When present and non-empty,
  // v3.8.d rendering will consume the per-line breakdown; otherwise
  // the flat fields above (pieces, commodity, weight, dimensions*,
  // freightClass, nmfcCode, hazmat) remain authoritative. v3.8.b ships
  // the template but not the multi-line loop yet.
  lineItems?: Array<{
    id: string;
    lineNumber: number;
    pieces: number;
    packageType: PackageType;
    description: string;
    weight: number;
    dimensionsLength?: number | null;
    dimensionsWidth?: number | null;
    dimensionsHeight?: number | null;
    freightClass?: string | null;
    nmfcCode?: string | null;
    hazmat: boolean;
    hazmatUnNumber?: string | null;
    hazmatClass?: string | null;
    hazmatEmergencyContact?: string | null;
    hazmatPlacardRequired?: boolean | null;
    stackable: boolean;
    turnable: boolean;
  }>;
}

export async function generateBOLFromLoad(
  load: LoadBOLData,
  context?: BOLRenderContext,
): Promise<PDFDoc> {
  const doc = new PDFDocument({ margins: { top: 34, bottom: 0, left: 34, right: 34 }, size: "LETTER" });

  // Monkey-patch doc.text to inject an OpenType feature-disable object into
  // every text invocation's options. fontkit accepts `features` as either
  // an array (additive — enables listed features on top of script defaults)
  // or an object (explicit on/off per feature tag). The array form keeps
  // default `liga` enabled and can't disable it; the object form with
  // `liga: false` is the authoritative way to suppress ligature
  // substitution. Disable all four ligature-family features (liga/clig/
  // rlig/dlig) so Playfair Italic + DM Sans Italic don't substitute `fi`
  // with a glyph that truncates the `i` at scale-down (the
  // "classified" → "classifed" bug). Keep `kern: true` so typography
  // still looks good. Covers direct doc.text() calls AND fluent-chained
  // .text() calls (e.g. doc.font(x).fontSize(y).text(str)) — same-
  // technique precedent: v3.7.p Batch B monkey-patched doc.text for HTML
  // entity decoding.
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

  const M = 34;
  const R = 612 - M;
  const CW = R - M;

  // Canonical v2.9 tokens (CLAUDE.md §2.1)
  const NAVY = "#0A2540";
  const FG_2 = "#3A4A5F";
  const FG_3 = "#6B7685";
  const FG_DISABLED = "#A7AEB8";
  const GOLD = "#C5A572";       // structural: rules, dividers, QR frame
  const GOLD_DARK = "#BA7517";  // emphasis: labels, placeholders, tagline
  const CREAM = "#FBF7F0";
  const CREAM_2 = "#F5EEE0";
  const BORDER_1 = "#E5EAF0";
  const BORDER_2 = "#D7DEE8";

  // Register v2.9 fonts. TTFs ship via backend/src/assets/fonts/bol-v2.9/
  // and propagate to Render prod through the dashboard src/assets cp step
  // (CLAUDE.md §2.2).
  const FONT_DIR = path.resolve(__dirname, "../assets/fonts/bol-v2.9");
  doc.registerFont("Playfair-Regular", path.join(FONT_DIR, "PlayfairDisplay-Regular.ttf"));
  doc.registerFont("Playfair-Italic", path.join(FONT_DIR, "PlayfairDisplay-Italic.ttf"));
  doc.registerFont("Playfair-Bold", path.join(FONT_DIR, "PlayfairDisplay-Bold.ttf"));
  doc.registerFont("Playfair-BoldItalic", path.join(FONT_DIR, "PlayfairDisplay-BoldItalic.ttf"));
  doc.registerFont("DMSans-Regular", path.join(FONT_DIR, "DMSans-Regular.ttf"));
  doc.registerFont("DMSans-Italic", path.join(FONT_DIR, "DMSans-Italic.ttf"));
  doc.registerFont("DMSans-Medium", path.join(FONT_DIR, "DMSans-Medium.ttf"));
  doc.registerFont("DMSans-SemiBold", path.join(FONT_DIR, "DMSans-SemiBold.ttf"));
  doc.registerFont("DMSans-Bold", path.join(FONT_DIR, "DMSans-Bold.ttf"));

  // Text-safety wrapper: decode HTML entities from form input. Ligature
  // handling is done separately via the doc.text monkey-patch above
  // (features: ["kern"] disables `liga` substitution at the fontkit layout
  // layer) — we do NOT insert ZWNJ here because U+200C renders as a visible
  // narrow glyph in Playfair/DM Sans italic variants, causing "classified"
  // to render as "classiflied".
  const safe = (s: string | null | undefined): string =>
    decodeHtmlEntities(s ?? "");

  // Placeholder helper per v2.9 designer spec. Empty free-text fields render
  // as bracketed italic GOLD_DARK labels; populated fields use the caller's
  // styling.
  interface FieldDisplay { text: string; isPlaceholder: boolean; }
  const fieldOrPlaceholder = (val: string | null | undefined, placeholder: string): FieldDisplay => {
    const trimmed = safe(val).trim();
    return trimmed
      ? { text: trimmed, isPlaceholder: false }
      : { text: `[${placeholder}]`, isPlaceholder: true };
  };

  // Suffix on the load stem: SRL-121485B. Was `BOL-SRL-121485` — a prefix, which
  // sorts every BOL away from its own load in any text-sorted column.
  const bolNum = documentNumberFor(load.srlBolNumber, load, "BOL") ?? "";

  // QR generation for /track deep-link. Non-fatal on failure — frame
  // renders empty to preserve layout spacing.
  let qrBuffer: Buffer | null = null;
  if (context?.trackingToken) {
    try {
      qrBuffer = await generateBOLQRBuffer(context.trackingToken);
    } catch (err) {
      log.warn({ err }, "[PDF] BOL QR generation failed");
    }
  }

  const pickupDateFmt = load.pickupDate instanceof Date
    ? load.pickupDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : String(load.pickupDate);
  const deliveryDateFmt = load.deliveryDate instanceof Date
    ? load.deliveryDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : String(load.deliveryDate);
  const EM = "—";
  const MIDDOT = "·";
  const TIMES = "×";
  const pickupWin = (load.pickupTimeStart && load.pickupTimeEnd)
    ? `${load.pickupTimeStart}–${load.pickupTimeEnd}`
    : (load.pickupTimeStart || "");
  const deliveryWin = (load.deliveryTimeStart && load.deliveryTimeEnd)
    ? `${load.deliveryTimeStart}–${load.deliveryTimeEnd}`
    : (load.deliveryTimeStart || "");

  // ========================= PAGE 1 =========================
  // PDFKit: Y=0 is TOP, increases downward.

  // Header region — white background (page default) through bottom of QR+BOL#.
  // v3.8.b pivot: the cream band (CREAM_2) was dropped because it created a
  // visible boundary the logo chip didn't integrate into. White page background
  // keeps the compass mark visually unified with the company block.
  // v3.8.ark — 60pt (~0.83"): frees 29pt of band height for the content budget
  // below while remaining comfortably phone-scannable at dock distance (short
  // tracking URL = low-density QR). Was 95.
  const qrSize = 60;
  const qrColX = R - 86;
  const qrColW = 86;
  const qrFrameX = qrColX + (qrColW - qrSize) / 2;
  const qrFrameY = 12;
  const headerBandH = qrFrameY + qrSize + 24; // QR + TRACK label + BOL# with breathing room

  // Gold accent bar at top (very thin)
  doc.rect(0, 0, 612, 3).fill(GOLD);

  // Logo — transparent variant if available (no white chip over cream band).
  // Fallback to the opaque logo.png keeps legacy behavior if the transparent
  // asset is missing for any reason.
  const logoAsset = hasLogoTransparent ? LOGO_TRANSPARENT_PATH : LOGO_PATH;
  if (hasLogo || hasLogoTransparent) {
    doc.image(logoAsset, M, 12, { width: 84, height: 84, fit: [84, 84] });
  }

  // Company block at (M+86, 15) — 5 lines. Shifted 3pt down from prior 12pt
  // to visually balance against the larger 84pt logo.
  const companyX = M + 86;
  doc.font("Playfair-Bold").fontSize(14).fillColor(NAVY)
    .text("SILK ROUTE LOGISTICS INC.", companyX, 15, { lineBreak: false });
  doc.font("DMSans-Regular").fontSize(8).fillColor(FG_2)
    .text(COMPANY.address, companyX, 34, { lineBreak: false });
  doc.text(
    `${COMPANY.phone}  |  ${COMPANY.email}  |  ${COMPANY.website}`,
    companyX, 46, { lineBreak: false },
  );
  doc.font("DMSans-Medium").fontSize(8).fillColor(NAVY)
    .text(`MC# ${COMPANY.mc} ${MIDDOT} DOT# ${COMPANY.dot}`, companyX, 58, { lineBreak: false });
  doc.font("DMSans-Italic").fontSize(8).fillColor(GOLD_DARK)
    .text("Where Trust Travels.", companyX, 70, { lineBreak: false });

  // QR container — rounded cream rect, BORDER_2 stroke, QR image inside
  doc.roundedRect(qrFrameX, qrFrameY, qrSize, qrSize, 3).fill(CREAM);
  doc.lineWidth(0.75).strokeColor(BORDER_2)
    .roundedRect(qrFrameX, qrFrameY, qrSize, qrSize, 3).stroke();
  if (qrBuffer) {
    doc.image(qrBuffer, qrFrameX + 3, qrFrameY + 3, { width: qrSize - 6, height: qrSize - 6 });
  }

  // TRACK label below QR
  doc.font("DMSans-SemiBold").fontSize(6.5).fillColor(GOLD_DARK)
    .text("TRACK", qrColX, qrFrameY + qrSize + 3, {
      width: qrColW, align: "center", characterSpacing: 1.2, lineBreak: false,
    });
  // BOL number — 8pt, drop to 7pt if too wide for the 86pt column
  const bolWidth8 = doc.font("DMSans-Bold").fontSize(8).widthOfString(bolNum);
  const bolFontSize = bolWidth8 > qrColW - 4 ? 7 : 8;
  doc.font("DMSans-Bold").fontSize(bolFontSize).fillColor(NAVY)
    .text(bolNum, qrColX, qrFrameY + qrSize + 12, {
      width: qrColW, align: "center", lineBreak: false,
    });

  // ── v3.8.ark — ADAPTIVE ONE-PAGE BUDGET ─────────────────────────────────
  // The arj layout fit exactly ONE line item; the fit matrix showed 3 rows
  // overlapping the terms strip, 4 rows crashing the footer, 5 rows exploding
  // to five pages. This block computes how much EXTRA height the variable
  // content needs (line-item rows beyond the first, overflow footer, hazmat
  // contact line, wrapped special instructions) and "shaves" that deficit from
  // a prioritized list of inter-section gaps via take() — decorative air goes
  // first, signature row pitch last, and if a pathological combination exceeds
  // total capacity the visible row cap drops (overflow footer keeps the totals
  // honest). Every gap below has a floor, so the page degrades gracefully
  // instead of colliding. Keep BOL_ROW_H in sync with rowH in the table block.
  const BOL_ROW_H = 22;
  const budgetItems: any[] = Array.isArray(load.lineItems) ? load.lineItems : [];
  const budgetHasItems = budgetItems.some((li: any) =>
    (li?.description && String(li.description).trim()) || li?.pieces || li?.weight);
  const nRowsTotal = budgetHasItems ? budgetItems.length : 1;
  const anyHazmat = budgetItems.some((li: any) => li?.hazmat);
  const siMeasureRaw = safe(load.specialInstructions || load.notes).trim();
  const siMeasuredH = siMeasureRaw
    ? doc.font("DMSans-Italic").fontSize(8.25)
        .heightOfString(siMeasureRaw, { width: CW - 160 })
    : 10;
  const siExtraH = siMeasuredH > 12 ? 11 : 0; // wraps to a 2nd line
  const SHAVE_CAPACITY = 45; // sum of all take() maxima below
  const BASE_SLACK = 22;     // measured 1-row headroom (QR 60 + title 42 variant)
  let bolVisibleRows = Math.min(nRowsTotal, 4);
  let bolExtraH = 0, bolDeficit = 0;
  for (;;) {
    const overflowFooterH = nRowsTotal > bolVisibleRows ? 16 : 0;
    bolExtraH = (bolVisibleRows - 1) * BOL_ROW_H + overflowFooterH + (anyHazmat ? 16 : 0) + siExtraH;
    bolDeficit = Math.max(0, bolExtraH - BASE_SLACK);
    if (bolDeficit <= SHAVE_CAPACITY || bolVisibleRows <= 1) break;
    bolVisibleRows--;
  }
  let shavePool = bolDeficit;
  const take = (max: number): number => { const t = Math.min(max, shavePool); shavePool -= t; return t; };

  // Gold rule below header band
  let y = headerBandH + 2;
  doc.lineWidth(1.75).strokeColor(GOLD).moveTo(M, y).lineTo(R, y).stroke();
  y += 10; // v3.8.arj — was 14; top-zone compression per measured spacing audit

  // Title row
  doc.font("Playfair-Bold").fontSize(24).fillColor(NAVY)
    .text("Bill of Lading", M, y, { lineBreak: false });
  doc.font("DMSans-SemiBold").fontSize(8).fillColor(GOLD_DARK)
    .text(`STRAIGHT ${MIDDOT} NON-NEGOTIABLE`, R - 220, y + 10, {
      width: 220, align: "right", characterSpacing: 1.4, lineBreak: false,
    });
  // v3.8.ark — 34 clears Playfair 24pt descenders; arj's 26 overlapped the
  // meta strip (measured gap 12.5pt, needs >=27). Adaptive floor 30.
  // Baseline math: Playfair 24pt descenders reach ~29pt below the text top and
  // the meta strip border sits at this offset — 42 gives ~9pt of clearance at
  // base and ~5pt at the shave floor (38). 34 left the descenders 1pt off the
  // border; arj's 26 visibly overlapped.
  y += 42 - take(4);

  // Meta row — 6 cells
  const metaTop = y;
  const metaH = 34;
  const cw6 = CW / 6;

  interface MetaCell {
    label: string;
    raw: string | null | undefined;
    placeholder: string | null; // null = em-dash if absent; string = bracketed italic placeholder
  }
  // v3.8.d.1 — SHIPPER REF walks the schema's 4-field PO chain. Order
  // Builder writes poNumbers[]; legacy/import paths populate one of
  // shipperReference / shipperPoNumber / customerRef. First non-empty
  // wins; falls through to em-dash if the load truly has no reference.
  //
  // v3.8.d.4 — render all PO numbers from poNumbers[], not just the
  // first. Two-or-fewer POs are comma-joined in full. Three or more
  // truncates to "first, second +N more" so the metaCell width
  // doesn't overflow visually.
  const formatPoList = (pos: string[]): string => {
    const clean = pos.map((p) => safe(p).trim()).filter(Boolean);
    if (clean.length === 0) return "";
    if (clean.length <= 2) return clean.join(", ");
    return `${clean[0]}, ${clean[1]} +${clean.length - 2} more`;
  };
  const shipperRefValue =
    (load.poNumbers && load.poNumbers.length > 0
      ? formatPoList(load.poNumbers)
      : null)
    || load.shipperReference
    || load.customerRef
    || null;

  const metaCells: MetaCell[] = [
    // v3.8.arj — DATE ISSUED now shows the GENERATION date (per Varstar/Echo
    // convention), not the pickup date it previously mislabeled. Also fixes two
    // rendering warts: the weekday prefix made the value wrap (orphaning "2026"
    // onto its own line), and the UTC pickup date rendered a day early in local
    // time. Pickup/delivery dates still appear in the parties Window lines.
    { label: "DATE ISSUED", raw: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), placeholder: null },
    { label: "LOAD REF", raw: load.referenceNumber, placeholder: null },
    { label: "EQUIPMENT", raw: load.equipmentType, placeholder: "Equipment" },
    { label: "PRO #", raw: load.proNumber, placeholder: null },
    { label: "SHIPPER REF", raw: shipperRefValue, placeholder: null },
    // v3.8.ari — the reference BOLs (Echo, Flock, Varstar, SunteckTTS,
    // WorldWide, Coyote) all name the third-party bill-to explicitly rather
    // than just ticking "third party". SRL is that party on every load.
    { label: "FREIGHT CHARGES", raw: "3rd Party · SRL" /* v3.8.arj — previous value wrapped, orphaning "SRL" onto its own line */, placeholder: null },
  ];

  doc.lineWidth(1).strokeColor(BORDER_1).moveTo(M, metaTop).lineTo(R, metaTop).stroke();
  metaCells.forEach((c, i) => {
    const mx = M + i * cw6;
    if (i > 0) {
      doc.lineWidth(1).strokeColor(BORDER_1)
        .moveTo(mx, metaTop).lineTo(mx, metaTop + metaH).stroke();
    }
    doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
      .text(c.label, mx + 6, metaTop + 6, {
        width: cw6 - 10, characterSpacing: 0.8, lineBreak: false,
      });

    const trimmed = safe(c.raw).trim();
    if (trimmed) {
      doc.font("DMSans-Medium").fontSize(9.5).fillColor(NAVY)
        .text(trimmed, mx + 6, metaTop + 18, { width: cw6 - 10, lineBreak: false });
    } else if (c.placeholder) {
      doc.font("DMSans-Italic").fontSize(9.5).fillColor(GOLD_DARK)
        .text(`[${c.placeholder}]`, mx + 6, metaTop + 18, { width: cw6 - 10, lineBreak: false });
    } else {
      doc.font("DMSans-Medium").fontSize(9.5).fillColor(NAVY)
        .text(EM, mx + 6, metaTop + 18, { width: cw6 - 10, lineBreak: false });
    }
  });
  y = metaTop + metaH + 14 - take(3); // v3.8.ark adaptive (floor 11)

  // PARTIES section header + rounded cream container
  doc.font("DMSans-SemiBold").fontSize(8).fillColor(GOLD_DARK)
    .text("PARTIES", M, y, { characterSpacing: 1.2, lineBreak: false });
  y += 11 - take(2); // v3.8.ark adaptive (floor 9)

  const partiesPad = 12;
  const partiesTop = y;
  const partiesInnerW = (CW - partiesPad * 3) / 2;
  const partiesH = 92;

  doc.roundedRect(M, partiesTop, CW, partiesH, 4).fill(CREAM_2);
  doc.lineWidth(0.5).strokeColor(BORDER_1)
    .roundedRect(M, partiesTop, CW, partiesH, 4).stroke();

  const shipperX = M + partiesPad;
  const consigneeX = M + CW / 2 + partiesPad / 2;

  // Side labels
  doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
    .text(`SHIPPER ${MIDDOT} PICKUP FROM`, shipperX, partiesTop + partiesPad, {
      characterSpacing: 1.0, lineBreak: false,
    });
  doc.text(`CONSIGNEE ${MIDDOT} DELIVER TO`, consigneeX, partiesTop + partiesPad, {
    characterSpacing: 1.0, lineBreak: false,
  });

  // Render party column — returns the final y cursor
  const renderParty = (
    side: "shipper" | "consignee",
    cx: number,
    cy: number,
  ): void => {
    // v3.8.d.1 — Shipper/Consignee read from the per-load physical-
    // location fields (CLAUDE.md §3.9). Order Builder writes
    // load.originCompany / load.destCompany; legacy paths may have
    // populated shipperFacility / consigneeFacility instead. Customer
    // record is the BILLING entity, never the consignee — fallback to
    // load.customer is shipper-side defensive only (last resort when
    // no load-level company is present).
    const facility = side === "shipper"
      ? fieldOrPlaceholder(
          load.originCompany || load.shipperFacility || load.customer?.name,
          "Shipper Facility",
        )
      : fieldOrPlaceholder(
          load.destCompany || load.consigneeFacility,
          "Consignee Facility",
        );
    const addr = side === "shipper"
      ? fieldOrPlaceholder(load.originAddress || load.customer?.address, "Street Address")
      : fieldOrPlaceholder(load.destAddress, "Street Address");
    const city = side === "shipper" ? load.originCity : load.destCity;
    const state = side === "shipper" ? load.originState : load.destState;
    const zip = side === "shipper" ? load.originZip : load.destZip;
    const cityLine = fieldOrPlaceholder(
      city && state ? `${city}, ${state} ${zip ?? ""}` : "",
      "City, ST ZIP",
    );
    const contactName = side === "shipper"
      ? safe(load.originContactName || load.customer?.contactName).trim()
      : safe(load.destContactName).trim();
    const contactPhone = side === "shipper"
      ? safe(load.originContactPhone || load.customer?.phone).trim()
      : safe(load.destContactPhone).trim();
    // When both fields are empty, render as em-dash (factual absence)
    // rather than a "[Contact · Phone]" placeholder that prints into
    // the BOL as if it were content. Matches §2.1 placeholder-vs-empty
    // convention — placeholders only when caller asks for one.
    const contact: FieldDisplay = (contactName || contactPhone)
      ? { text: `Contact: ${contactName || EM}  ${MIDDOT}  ${contactPhone || EM}`, isPlaceholder: false }
      : { text: `Contact: ${EM}  ${MIDDOT}  ${EM}`, isPlaceholder: false };
    const dateFmt = side === "shipper" ? pickupDateFmt : deliveryDateFmt;
    const win = side === "shipper" ? pickupWin : deliveryWin;
    const windowText = win
      ? `Window: ${dateFmt}  ${MIDDOT}  ${win}`
      : `Window: ${dateFmt}  ${MIDDOT}  [HH:MM–HH:MM]`;
    const windowIsPlaceholder = !win;

    let ly = cy;
    // Facility name — Playfair-Bold if present, italic GOLD_DARK if placeholder
    doc.font(facility.isPlaceholder ? "DMSans-Italic" : "Playfair-Bold")
      .fontSize(11).fillColor(facility.isPlaceholder ? GOLD_DARK : NAVY)
      .text(facility.text, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 16;

    doc.font(addr.isPlaceholder ? "DMSans-Italic" : "DMSans-Italic")
      .fontSize(8.25).fillColor(addr.isPlaceholder ? GOLD_DARK : FG_2)
      .text(addr.text, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 11;

    doc.font(cityLine.isPlaceholder ? "DMSans-Italic" : "DMSans-Italic")
      .fontSize(8.25).fillColor(cityLine.isPlaceholder ? GOLD_DARK : FG_2)
      .text(cityLine.text, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 13;

    doc.font(contact.isPlaceholder ? "DMSans-Italic" : "DMSans-Regular")
      .fontSize(7.75).fillColor(contact.isPlaceholder ? GOLD_DARK : FG_3)
      .text(contact.text, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 11;

    doc.font(windowIsPlaceholder ? "DMSans-Italic" : "DMSans-Regular")
      .fontSize(7.75).fillColor(windowIsPlaceholder ? GOLD_DARK : FG_3)
      .text(windowText, cx, ly, { width: partiesInnerW, lineBreak: false });
  };

  renderParty("shipper", shipperX, partiesTop + partiesPad + 14);
  renderParty("consignee", consigneeX, partiesTop + partiesPad + 14);
  y = partiesTop + partiesH + 12 - take(2); // v3.8.ark adaptive (floor 10)

  // Shipment details table — rounded container, NAVY header, dashed body separators, CREAM_2 totals
  doc.font("DMSans-SemiBold").fontSize(8).fillColor(GOLD_DARK)
    .text("SHIPMENT DETAILS", M, y, { characterSpacing: 1.2, lineBreak: false });
  y += 11 - take(2); // v3.8.ark adaptive (floor 9)

  const tblTop = y;
  const colDefs: Array<{ label: string; w: number }> = [
    { label: "PCS", w: 38 },
    { label: "TYPE", w: 44 },
    { label: "DESCRIPTION", w: 160 },
    { label: `DIMS (L${TIMES}W${TIMES}H)`, w: 90 },
    { label: "WEIGHT", w: 70 },
    { label: "CLASS", w: 42 },
    { label: "NMFC#", w: 48 },
  ];
  const usedW = colDefs.reduce((s, c) => s + c.w, 0);
  colDefs.push({ label: "HM", w: CW - usedW });
  const hdrH = 18;
  const rowH = 22;
  const totH = 22;

  // v3.8.d — Multi-line shipment rendering. When load.lineItems is present
  // and non-empty, iterate per-row (cap at MAX_ROWS); otherwise fall back
  // to the legacy single-row from flat Load fields. Totals always reflect
  // the full lineItems array (not capped) so the BOL is mathematically
  // honest even when overflow is hidden.
  const MAX_ROWS = 10;
  const allLineItems = load.lineItems ?? [];
  const useMulti = allLineItems.length > 0;
  const renderedItems = useMulti ? allLineItems.slice(0, Math.min(MAX_ROWS, bolVisibleRows)) : [];
  const overflowCount = useMulti ? Math.max(0, allLineItems.length - Math.min(MAX_ROWS, bolVisibleRows)) : 0;

  type Cell = { text: string; placeholder: boolean; bold?: boolean };
  const dimsStr = (l?: number | null, w?: number | null, h?: number | null): string =>
    (l && w && h) ? `${l}"${TIMES}${w}"${TIMES}${h}"` : EM;

  const buildLineItemRow = (li: NonNullable<LoadBOLData["lineItems"]>[number]): Cell[] => {
    const liDesc = safe(li.description).trim();
    return [
      { text: String(li.pieces), placeholder: false, bold: true },
      { text: li.packageType, placeholder: false },
      liDesc
        ? { text: liDesc, placeholder: false }
        : { text: "[Description]", placeholder: true },
      { text: dimsStr(li.dimensionsLength, li.dimensionsWidth, li.dimensionsHeight), placeholder: false },
      { text: `${li.weight.toLocaleString()} lb`, placeholder: false, bold: true },
      { text: safe(li.freightClass).trim() || EM, placeholder: false },
      { text: safe(li.nmfcCode).trim() || EM, placeholder: false },
      { text: li.hazmat ? "Yes" : "No", placeholder: false },
    ];
  };

  const buildFlatRow = (): Cell[] => {
    const pcsValueLocal = load.pieces != null ? String(load.pieces) : EM;
    const dimsLocal = dimsStr(load.dimensionsLength, load.dimensionsWidth, load.dimensionsHeight);
    const weightStrLocal = load.weight ? `${load.weight.toLocaleString()} lb` : EM;
    const descRawLocal = safe(load.commodity).trim();
    const descCellLocal: Cell = descRawLocal
      ? { text: descRawLocal, placeholder: false }
      : { text: "[Description]", placeholder: true };
    return [
      { text: pcsValueLocal, placeholder: false, bold: true },
      { text: "PLT", placeholder: false },
      descCellLocal,
      { text: dimsLocal, placeholder: false },
      { text: weightStrLocal, placeholder: false, bold: true },
      { text: safe(load.freightClass).trim() || EM, placeholder: false },
      { text: EM, placeholder: false },
      { text: load.hazmat ? "Yes" : "No", placeholder: false },
    ];
  };

  const rows: Cell[][] = useMulti
    ? renderedItems.map(buildLineItemRow)
    : [buildFlatRow()];

  // Totals aggregate the FULL lineItems array (including overflow) so the
  // strip stays honest even when rendering is capped.
  let totalPieces = 0;
  let totalWeight = 0;
  if (useMulti) {
    for (const li of allLineItems) {
      totalPieces += li.pieces;
      totalWeight += li.weight;
    }
  } else {
    totalPieces = load.pieces ?? 0;
    totalWeight = load.weight ?? 0;
  }
  const totalPiecesStr = totalPieces > 0 ? String(totalPieces) : EM;
  const totalWeightStr = totalWeight > 0 ? `${totalWeight.toLocaleString()} lb` : EM;

  const overflowH = overflowCount > 0 ? 16 : 0;
  const tblBodyH = rowH * rows.length;
  const tblH = hdrH + tblBodyH + totH + overflowH;

  // Container stroke
  doc.lineWidth(0.5).strokeColor(BORDER_1)
    .roundedRect(M, tblTop, CW, tblH, 4).stroke();

  // Header row — NAVY fill inside rounded clip
  doc.save();
  doc.roundedRect(M, tblTop, CW, tblH, 4).clip();
  doc.rect(M, tblTop, CW, hdrH).fill(NAVY);
  doc.restore();

  let cx = M;
  colDefs.forEach((c) => {
    doc.font("DMSans-SemiBold").fontSize(8).fillColor(CREAM)
      .text(c.label, cx + 6, tblTop + 5, {
        width: c.w - 8, characterSpacing: 0.8, lineBreak: false,
      });
    cx += c.w;
  });

  // Body rows — one per LoadLineItem (or single fallback from flat fields)
  const bodyTop = tblTop + hdrH;
  rows.forEach((cells, ri) => {
    const rowY = bodyTop + ri * rowH;

    // Dashed horizontal separator between body rows (not above first row)
    if (ri > 0) {
      doc.save();
      doc.lineWidth(0.5).strokeColor(BORDER_1).dash(2, { space: 2 })
        .moveTo(M + 4, rowY).lineTo(R - 4, rowY).stroke();
      doc.undash();
      doc.restore();
    }

    cx = M;
    colDefs.forEach((c, ci) => {
      const cell = cells[ci];
      if (ci > 0) {
        doc.save();
        doc.lineWidth(0.5).strokeColor(BORDER_1).dash(2, { space: 2 })
          .moveTo(cx, rowY + 2).lineTo(cx, rowY + rowH - 2).stroke();
        doc.undash();
        doc.restore();
      }
      doc.font(cell.placeholder ? "DMSans-Italic" : cell.bold ? "DMSans-Bold" : "DMSans-Regular")
        .fontSize(9).fillColor(cell.placeholder ? GOLD_DARK : NAVY)
        .text(cell.text, cx + 6, rowY + 6, { width: c.w - 10, lineBreak: false });
      cx += c.w;
    });
  });

  // Totals row — solid top border, CREAM_2 fill
  const totY = bodyTop + tblBodyH;
  doc.save();
  doc.roundedRect(M, tblTop, CW, tblH, 4).clip();
  doc.rect(M, totY, CW, totH).fill(CREAM_2);
  doc.restore();
  doc.lineWidth(1).strokeColor(BORDER_1).moveTo(M, totY).lineTo(R, totY).stroke();

  doc.font("DMSans-Bold").fontSize(9).fillColor(NAVY);
  let tcx = M + 6;
  doc.text("TOTALS:", tcx, totY + 7, {
    width: colDefs[0].w + colDefs[1].w - 8, characterSpacing: 0.6, lineBreak: false,
  });
  tcx = M + colDefs[0].w + colDefs[1].w + 6;
  doc.text(totalPiecesStr, tcx, totY + 7, { width: colDefs[2].w - 8, lineBreak: false });
  tcx = M + colDefs[0].w + colDefs[1].w + colDefs[2].w + colDefs[3].w + 6;
  doc.text(totalWeightStr, tcx, totY + 7, { width: colDefs[4].w - 8, lineBreak: false });

  // Overflow footer — only if line items exceeded MAX_ROWS cap
  if (overflowCount > 0) {
    const ovY = totY + totH;
    doc.save();
    doc.roundedRect(M, tblTop, CW, tblH, 4).clip();
    doc.rect(M, ovY, CW, overflowH).fill(CREAM_2);
    doc.restore();
    doc.lineWidth(0.5).strokeColor(BORDER_1).moveTo(M, ovY).lineTo(R, ovY).stroke();
    doc.font("DMSans-Italic").fontSize(8).fillColor(GOLD_DARK)
      .text(
        `+${overflowCount} additional line item${overflowCount === 1 ? "" : "s"} — full manifest attached`,
        M + 8, ovY + 4,
        { width: CW - 16, align: "center", lineBreak: false },
      );
  }

  y = tblTop + tblH + 12 - take(2); // v3.8.ark adaptive (floor 10)

  // v3.8.arj — hazmat shipments require a 24-hour emergency response phone on
  // the shipping paper (49 CFR 172.604). Conditional: renders only when a line
  // is flagged hazmat, so the everyday dry-van BOL pays no space for it.
  if ((load.lineItems ?? []).some((li: any) => li.hazmat)) {
    doc.font("DMSans-SemiBold").fontSize(7).fillColor(NAVY)
      .text("24-HR EMERGENCY CONTACT (49 CFR 172.604):", M, y, { lineBreak: false });
    doc.lineWidth(0.75).strokeColor(NAVY).moveTo(M + 200, y + 8).lineTo(M + 340, y + 8).stroke();
    y += 16;
  }

  // Special Instructions — single row cream container
  const siH = 28 + siExtraH; // v3.8.ark — +11 when instructions wrap to a 2nd line
  doc.roundedRect(M, y, CW, siH, 4).fill(CREAM_2);
  doc.lineWidth(0.5).strokeColor(BORDER_1).roundedRect(M, y, CW, siH, 4).stroke();
  doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
    .text("SPECIAL INSTRUCTIONS", M + 10, y + 10, {
      characterSpacing: 1.0, lineBreak: false,
    });
  // v3.8.d.1 — empty Special Instructions renders factual "None" rather
  // than the prior "None  ·  [per-load notes]" placeholder which leaked
  // designer-tooling syntax into the printed BOL.
  const siBodyRaw = safe(load.specialInstructions || load.notes).trim();
  const siDisplay: FieldDisplay = siBodyRaw
    ? { text: siBodyRaw, isPlaceholder: false }
    : { text: "None", isPlaceholder: false };
  doc.font("DMSans-Italic").fontSize(8.25)
    .fillColor(siDisplay.isPlaceholder ? GOLD_DARK : FG_2)
    .text(siDisplay.text, M + 150, y + 9, {
      width: CW - 160, height: siH - 12, ellipsis: true, // v3.8.ark — wrap allowed (2-line cap via height+ellipsis)
    });
  y += siH + 10 - take(2); // v3.8.ark adaptive (floor 8)

  // Released Value form row
  const rvH = 36;
  doc.roundedRect(M, y, CW, rvH, 4).fill(CREAM_2);
  doc.lineWidth(1).strokeColor(NAVY).roundedRect(M, y, CW, rvH, 4).stroke();

  const rvLabelX = M + 10;
  const rvMidY = y + rvH / 2;

  doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
    .text("RELEASED VALUE", rvLabelX, y + 6, {
      characterSpacing: 1.0, lineBreak: false,
    });

  const declaredOn = load.releasedValueDeclared === true
    && load.releasedValueBasis
    && load.releasedValueBasis !== "NVD";
  const nvdOn = load.releasedValueBasis === "NVD";

  // Checkbox helper
  const drawCheckbox = (cx2: number, cy2: number, size: number, checked: boolean): void => {
    doc.lineWidth(0.75).strokeColor(NAVY)
      .rect(cx2, cy2, size, size).stroke();
    if (checked) {
      doc.lineWidth(1.1).strokeColor(NAVY)
        .moveTo(cx2 + 1.5, cy2 + 1.5).lineTo(cx2 + size - 1.5, cy2 + size - 1.5).stroke()
        .moveTo(cx2 + size - 1.5, cy2 + 1.5).lineTo(cx2 + 1.5, cy2 + size - 1.5).stroke();
    }
  };

  // Layout: "[ ] Declared $ ______ /lb    [ ] NVD (full Carmack)    Shipper initial: ______"
  const rvBaseY = y + 20;
  const cbSize = 10;
  let rvCx = rvLabelX + 110;

  drawCheckbox(rvCx, rvBaseY - 2, cbSize, !!declaredOn);
  rvCx += cbSize + 6;
  doc.font("DMSans-Regular").fontSize(8.25).fillColor(NAVY)
    .text("Declared $", rvCx, rvBaseY, { lineBreak: false });
  rvCx += 48;

  // Amount line — rendered value if populated, else handwriting blank
  const amountStr = load.declaredValue != null
    ? load.declaredValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
  const amountLineW = 52;
  doc.lineWidth(0.5).strokeColor(NAVY)
    .moveTo(rvCx, rvBaseY + 9).lineTo(rvCx + amountLineW, rvBaseY + 9).stroke();
  if (amountStr) {
    doc.font("DMSans-Medium").fontSize(8.25).fillColor(NAVY)
      .text(amountStr, rvCx, rvBaseY, { width: amountLineW, align: "center", lineBreak: false });
  }
  rvCx += amountLineW + 4;

  // Basis unit based on enum
  const basisUnit = load.releasedValueBasis === "PER_POUND" ? "/lb"
    : load.releasedValueBasis === "PER_PIECE" ? "/piece"
    : load.releasedValueBasis === "TOTAL" ? "total"
    : "/lb";
  doc.font("DMSans-Regular").fontSize(8.25).fillColor(NAVY)
    .text(basisUnit, rvCx, rvBaseY, { lineBreak: false });
  rvCx += 28;

  // NVD checkbox
  drawCheckbox(rvCx, rvBaseY - 2, cbSize, !!nvdOn);
  rvCx += cbSize + 6;
  doc.font("DMSans-Regular").fontSize(8.25).fillColor(NAVY)
    .text("NVD", rvCx, rvBaseY, { lineBreak: false });
  rvCx += 24;
  doc.font("DMSans-Italic").fontSize(7.75).fillColor(FG_2)
    .text("(full Carmack liability applies)", rvCx, rvBaseY + 0.5, { lineBreak: false });

  // Right-aligned shipper initial
  const initLabelW = 72;
  const initLineW = 40;
  const initTotalW = initLabelW + initLineW + 6;
  const initX = R - 10 - initTotalW;
  doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
    .text("SHIPPER INITIAL:", initX, rvBaseY + 2, {
      width: initLabelW, characterSpacing: 1.0, lineBreak: false,
    });
  doc.lineWidth(0.5).strokeColor(NAVY)
    .moveTo(initX + initLabelW + 4, rvBaseY + 9)
    .lineTo(initX + initLabelW + 4 + initLineW, rvBaseY + 9).stroke();

  y += rvH + 4;

  // Carmack citation below row
  doc.font("DMSans-Italic").fontSize(7).fillColor(FG_3)
    .text("Per 49 U.S.C. § 14706(c)", M, y, { lineBreak: false });
  y += 10 - take(2); // v3.8.ark adaptive (floor 8)

  // Signature blocks — 3 columns
  // v3.8.arj/ark — signature row pitch. Base 28pt keeps 9pt of pen room below
  // each underline (drawSigField rules at by+19). Under deficit the pitch
  // shaves down to 24pt (5pt pen room — compact but writable), consuming the
  // REMAINING pool after all decorative gaps, spread across the 6-row carrier
  // column (the tall pole).
  const certShave = take(2);
  const sigRowShave = Math.min(4, Math.ceil(shavePool / 6));
  shavePool = Math.max(0, shavePool - sigRowShave * 6);
  const SIG_ROW = 28 - sigRowShave;
  const sigColGap = 12;
  const sigColW = (CW - sigColGap * 2) / 3;
  const sigTop = y;

  // Helper: draw a labeled blank line; optionally pre-populate with a value
  const drawSigField = (
    bx: number,
    by: number,
    fw: number,
    label: string,
    value: string,
  ): void => {
    doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
      .text(label, bx, by, {
        width: fw, characterSpacing: 1.0, lineBreak: false,
      });
    if (value) {
      doc.font("DMSans-Medium").fontSize(8.5).fillColor(NAVY)
        .text(value, bx, by + 8, { width: fw, lineBreak: false });
    }
    doc.lineWidth(0.5).strokeColor(BORDER_2)
      .moveTo(bx, by + 19).lineTo(bx + fw, by + 19).stroke();
  };

  const sigBlocks: Array<{
    title: string;
    cert: string;
    render: (bx: number, cy: number) => number;
  }> = [
    {
      title: "SHIPPER · REPRESENTATIVE",
      cert: "Certifies contents are properly classified, packaged, marked, and labeled per DOT regulations (49 CFR 172).",
      render: (bx, cy) => {
        let by = cy;
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += SIG_ROW;
        drawSigField(bx, by, sigColW, "PRINT NAME", ""); by += SIG_ROW;
        const halfW = (sigColW - 8) / 2;
        const ptValue = load.piecesTendered != null ? String(load.piecesTendered) : "";
        drawSigField(bx, by, halfW, "PIECES TENDERED", ptValue);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += SIG_ROW;

        // v3.8.ari — TRAILER LOADED / FREIGHT COUNTED attestation.
        // Verified present on every broker BOL in the reference set (Echo,
        // Flock, Varstar, SunteckTTS, XPO, Armstrong). It allocates liability
        // for the count: "shipper load and count" vs a driver-verified count
        // materially changes who owns an overage/shortage claim. Its absence
        // was the single biggest gap against industry practice.
        // Placed in the SHIPPER column because it is a shipper-side attestation,
        // and because this column ends 90pt above the CARRIER column — free
        // vertical space that costs the one-page budget nothing.
        const cbSize = 6.5;
        const cbRow = (labelText: string, opts: string[], rowY: number): number => {
          doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
            .text(labelText, bx, rowY, { width: sigColW, characterSpacing: 1.0, lineBreak: false });
          let oy = rowY + 10;
          for (const o of opts) {
            drawCheckbox(bx, oy - 0.5, cbSize, false);
            doc.font("DMSans-Regular").fontSize(7).fillColor(NAVY)
              .text(o, bx + cbSize + 4, oy, { width: sigColW - cbSize - 4, lineBreak: false });
            oy += 10;
          }
          return oy;
        };
        by = cbRow("TRAILER LOADED", ["By shipper", "By driver"], by) + 4;
        by = cbRow("FREIGHT COUNTED", ["By shipper", "By driver / pallets said to contain", "By driver / pieces"], by);
        return by;
      },
    },
    {
      title: "CARRIER · DRIVER",
      cert: "Receipt in apparent good order except as noted. Required placards received; emergency response info available (49 CFR 172).",
      render: (bx, cy) => {
        let by = cy;
        // carrierLegalName is pre-derived by pdfController.downloadBOLFromLoad
        // from carrier.carrierProfile.companyName || carrier.company.
        const carrierLegalName = safe(load.carrierLegalName ?? load.carrier?.company).trim();
        drawSigField(bx, by, sigColW, "CARRIER LEGAL NAME", carrierLegalName); by += SIG_ROW;
        const halfW = (sigColW - 8) / 2;
        const mcNo = safe(load.carrier?.carrierProfile?.mcNumber).trim();
        const dotNo = safe(load.carrier?.carrierProfile?.dotNumber).trim();
        drawSigField(bx, by, halfW, "MC #", mcNo);
        drawSigField(bx + halfW + 8, by, halfW, "DOT #", dotNo);
        by += SIG_ROW;
        const driverNm = safe(load.driverName).trim();
        drawSigField(bx, by, sigColW, "DRIVER NAME", driverNm); by += SIG_ROW;
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += SIG_ROW;
        const truckNo = safe(load.truckNumber).trim();
        const trailerNo = safe(load.trailerNumber).trim();
        drawSigField(bx, by, halfW, "TRUCK #", truckNo);
        drawSigField(bx + halfW + 8, by, halfW, "TRAILER #", trailerNo);
        by += SIG_ROW;
        const sealNo = safe(load.sealNumber).trim();
        drawSigField(bx, by, halfW, "SEAL #", sealNo);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += SIG_ROW;
        return by;
      },
    },
    {
      title: "CONSIGNEE · RECEIVER",
      cert: "Acknowledges delivery — any exceptions noted above.",
      render: (bx, cy) => {
        let by = cy;
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += SIG_ROW;
        drawSigField(bx, by, sigColW, "PRINT NAME", ""); by += SIG_ROW;
        const halfW = (sigColW - 8) / 2;
        const prValue = load.piecesReceived != null ? String(load.piecesReceived) : "";
        drawSigField(bx, by, halfW, "PIECES RECEIVED", prValue);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += SIG_ROW;

        // v3.8.ari — Section 7 (non-delivery without payment of freight).
        // Present on Echo, Varstar, SunteckTTS, XPO, WorldWide and Coyote in
        // the reference set. Uses the CONSIGNEE column's free vertical space —
        // this column ends ~90pt above the CARRIER column.
        doc.font("DMSans-Regular").fontSize(6.25).fillColor(FG_3)
          .text(
            "The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.",
            bx, by, { width: sigColW, lineGap: 0.2 },
          );
        by = doc.y + 2;
        return by;
      },
    },
  ];

  let maxSigBottom = sigTop; // v3.8.arj — feeds the dynamic terms strip below
  sigBlocks.forEach((blk, i) => {
    const bx = M + i * (sigColW + sigColGap);
    let by = sigTop;
    doc.font("DMSans-SemiBold").fontSize(8.5).fillColor(GOLD_DARK)
      .text(blk.title, bx, by, {
        width: sigColW, characterSpacing: 1.2, lineBreak: false,
      });
    by += 12;
    doc.lineWidth(1).strokeColor(GOLD).moveTo(bx, by).lineTo(bx + sigColW, by).stroke();
    by += 6;
    doc.font("DMSans-Italic").fontSize(7.75).fillColor(FG_2)
      .text(blk.cert, bx, by, { width: sigColW, lineGap: 1.5 });
    by = doc.y + 8 - certShave;
    maxSigBottom = Math.max(maxSigBottom, blk.render(bx, by));
  });

  // Footer page 1
  // v3.8.h — fyLine moved 755 → 770 (15pt down). The carrier signature
  // column (column 2 of 3) is the tallest at 6 rows × 30pt + ~40pt of
  // title/cert overhead. With fyLine=755 the SEAL # / DATE row's
  // underline at y≈756 sat right on top of the footer rule, and the
  // centered "Where Trust Travels." tagline at footerY=763 visually
  // collided with the SEAL # / DATE labels in the carrier column.
  // Moving fyLine to 770 (footerY=778) gives the signature block 15pt
  // of additional clearance. Letter is 792pt; footer text bottom now
  // ~785pt, which leaves 7pt to the page edge — within typical
  // print-safe range for modern printers and unaffected for digital
  // PDF viewing. Page-2 footer uses the same constant so it shifts
  // identically (T&C content area unaffected — wraps and ends well
  // above the footer regardless).
  const fyLine = 770;

  // v3.8.ara — condensed terms strip carrying the legal substance now that the
  // T&C page is gone: Carmack governing law + released-value cross-reference,
  // SRL's broker (not carrier) status, the claims window, and incorporation of
  // the Broker–Carrier Agreement by reference.
  //
  // SIZED TO MEASURED SPACE, not guessed. The tallest signature column (CARRIER
  // · DRIVER) was measured ending at y=746.97 and the footer rule is at 770, so
  // the real budget is ~23pt. An earlier draft of this strip started at 748 with
  // two full paragraphs (~28pt) and would have run through both the signature
  // block above and the footer rule below. This is one paragraph at 5.75pt that
  // wraps to 2 lines (~14pt) starting at 750 — verified to end above 770.
  // v3.8.arj — DYNAMIC: anchored to the measured tallest signature column
  // instead of a fixed constant. The v3.8.ari checkbox block grew the shipper
  // column past the old fixed 750 and collided with this strip because column
  // bottoms were computed and then DISCARDED. Now any future field addition
  // moves the strip down with it (clamped so it can never cross the footer
  // rule at 770; the verify script asserts the whole page still fits).
  const termsY = Math.min(maxSigBottom + 8, 752);
  doc.font("DMSans-Regular").fontSize(6).fillColor(NAVY) // v3.8.arj — navy + 6pt: FG_3 gray at 5.75pt was the weakest element on a B&W print
    .text(
      "Non-negotiable straight bill of lading; goods in apparent good order except as noted. Carrier cargo liability per Carmack, 49 U.S.C. § 14706 " +
      "(released value § 14706(c)); claims within nine (9) months. SRL is a licensed property broker, not a motor carrier; carriage is subject to the " +
      "Broker–Carrier Agreement. Michigan law governs.",
      M, termsY, { width: CW, lineGap: 0.25 },
    );

  doc.lineWidth(1).strokeColor(GOLD).moveTo(M, fyLine).lineTo(R, fyLine).stroke();
  const footerY = fyLine + 8;
  const footerThirdW = CW / 3;
  doc.font("DMSans-Regular").fontSize(7).fillColor(FG_3)
    .text(
      `MC# ${COMPANY.mc} ${MIDDOT} DOT# ${COMPANY.dot} ${MIDDOT} ${COMPANY.website}`,
      M, footerY, { width: footerThirdW, lineBreak: false },
    );
  doc.font("DMSans-Italic").fontSize(7).fillColor(GOLD_DARK)
    .text("Where Trust Travels.", M + footerThirdW, footerY, {
      width: footerThirdW, align: "center", lineBreak: false,
    });
  doc.font("DMSans-Regular").fontSize(7).fillColor(FG_3)
    .text("Page 1 of 1", M + 2 * footerThirdW, footerY, {
      width: footerThirdW, align: "right", lineBreak: false,
    });

  // v3.8.ara — BOL is a ONE-PAGE document. PROVISIONAL: see caveat below.
  //
  // Pre-ara a second page carried only the Terms and Conditions. The reasoning
  // for folding it onto page 1 is operational: a BOL is a dock document that
  // gets printed, signed, and handed over, and a loose second sheet is routinely
  // separated and lost.
  //
  // CAVEAT (v3.8.arg, honesty correction). An earlier version of this comment
  // asserted that "industry practice (Echo, Flock Freight, Varstar)" is a
  // single-page straight BOL. That was written from general knowledge, NOT from
  // examining those companies' actual documents — no such reference existed in
  // this repo when the change was made. The operational reasoning above stands
  // on its own, but the competitive-conformance claim was not verified and has
  // been withdrawn. Wasi is gathering real reference BOLs (three current ones
  // plus Dirk's); re-evaluate field inventory, signature-block structure, legal
  // density, and whether those documents are genuinely one page once they land.
  // If any ships as page-1 + a separate terms sheet, revisit this decision.
  //
  // The legal substance is preserved, not dropped:
  //   - The Carmack released-value election + 49 U.S.C. § 14706(c) citation
  //     stay on page 1 where the shipper actually initials them.
  //   - The full T&C body lives in the Broker-Carrier Agreement, which the
  //     carrier e-signs at activation and which controls between Broker and
  //     Carrier; page 1 incorporates it by reference in the terms strip below.
  // A BOL that references its governing agreement is the standard construction.

  doc.end();
  return doc;
}

interface LoadData {
  // ARC 21 — declared so a rate confirmation can print the CARRIER number.
  carrierRate?: number | null;
  referenceNumber: string;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; equipmentType: string; commodity?: string | null;
  rate: number; distance?: number | null;
  pickupDate: Date; deliveryDate: Date; notes?: string | null;
  carrier?: { id: string; firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null } | null } | null;
}

export function generateRateConfirmation(load: LoadData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "RATE CONFIRMATION");

  let y = 155;

  labelValue(doc, "Reference Number", load.referenceNumber, 50, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 400, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Broker Info
  doc.fontSize(11).fillColor("#D4A843").text("BROKER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 50, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 14);
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, 50, y + 28);

  // Carrier Info
  doc.fontSize(11).fillColor("#D4A843").text("CARRIER", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  if (load.carrier) {
    doc.text(load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`, 310, y);
    if (load.carrier.carrierProfile?.mcNumber) doc.text(`MC#: ${load.carrier.carrierProfile.mcNumber}`, 310, y + 14);
    if (load.carrier.phone) doc.text(`Tel: ${load.carrier.phone}`, 310, y + 28);
  }

  y += 55;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Load Details
  doc.fontSize(11).fillColor("#D4A843").text("LOAD DETAILS", 50, y);
  y += 20;

  labelValue(doc, "Origin", `${load.originCity}, ${load.originState} ${load.originZip}`, 50, y);
  labelValue(doc, "Destination", `${load.destCity}, ${load.destState} ${load.destZip}`, 310, y);
  y += 35;
  labelValue(doc, "Pickup Date", load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Delivery Date", load.deliveryDate.toLocaleDateString(), 200, y);
  labelValue(doc, "Equipment", load.equipmentType, 350, y);
  y += 35;
  labelValue(doc, "Commodity", load.commodity || "General Freight", 50, y);
  if (load.weight) labelValue(doc, "Weight", `${load.weight.toLocaleString()} lbs`, 200, y);
  if (load.distance) {
    labelValue(doc, "Distance", `${load.distance.toLocaleString()} mi`, 350, y);
  }

  y += 45;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Rate
  doc.fontSize(11).fillColor("#D4A843").text("COMPENSATION", 50, y);
  y += 20;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text("Linehaul Rate:", 50, y);
  // ARC 21 — a rate confirmation states what SRL pays the CARRIER. This
  // printed `load.rate`, which on the primary creation path is the CUSTOMER
  // number — the same class as Item 220.1, here with no fallback softening it
  // and on a document a carrier signs. §13.3 Item 227.
  doc.text(`$${(load.carrierRate ?? 0).toLocaleString()}`, 200, y, { align: "left" });
  y += 18;
  doc.fontSize(12).fillColor("#1E1E2F").text("Total:", 50, y);
  doc.text(`$${(load.carrierRate ?? 0).toLocaleString()}`, 200, y);

  if (load.notes) {
    y += 35;
    doc.fontSize(9).fillColor("#D4A843").text("SPECIAL INSTRUCTIONS", 50, y);
    y += 14;
    doc.fontSize(9).fillColor("#1E1E2F").text(load.notes, 50, y, { width: 510 });
  }

  // Signatures
  y = 580;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 20;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Authorized by Silk Route Logistics", 50, y);
  doc.text("Accepted by Carrier", 350, y);

  doc.moveTo(50, y + 35).lineTo(250, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(350, y + 35).lineTo(550, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();

  addFooter(doc);
  doc.end();
  return doc;
}

// ─── Mileage-aware distance label for PDFs ──────────────────

export function getMileageLabel(distance: number | null | undefined, source?: string): string {
  if (!distance) return "—";
  if (source === "pcmiler") return `${distance.toLocaleString()} mi (PC*Miler Practical Miles)`;
  if (source === "milemaker") return `${distance.toLocaleString()} mi (MileMaker Practical Miles)`;
  return `~${distance.toLocaleString()} mi (estimated)`;
}

export function getMileageFootnote(source?: string): string | null {
  if (!source || source === "google_estimated" || source === "google") {
    return "* Mileage: estimated via routing software. Final billing subject to industry-standard practical truck miles.";
  }
  return null;
}

// ─── Enhanced Multi-Page Rate Confirmation ───────────────────

interface EnhancedRCLoadData {
  // ARC 21 — the RC prints what SRL pays the carrier.
  carrierRate?: number | null;
  // Sprint 51 (Item 129) — id required for RC verification URL token derivation.
  // Pre-Sprint-51 the generator only needed referenceNumber; the verifier needs
  // both (id + referenceNumber + salt) to hash-match against stored loads.
  id?: string;
  referenceNumber: string;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; pieces?: number | null; equipmentType: string; commodity?: string | null;
  rate: number; distance?: number | null;
  pickupDate: Date; deliveryDate: Date;
  notes?: string | null; specialInstructions?: string | null;
  carrier?: { firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null; dotNumber?: string | null } | null } | null;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null; email?: string | null } | null;
  // Sprint 48 (Item 108) — tender expiration banner data path. Active tender
  // is the latest OFFERED|ACCEPTED tender for this load; banner renders only
  // when expiresAt > now. Optional — older RCs that pre-date the controller
  // include extension still render cleanly without banner.
  tenders?: Array<{ expiresAt: Date; status: string }> | null;
  // Sprint 49 (Item 119) — AE header sub-line data path. poster is the AE
  // who created the load (canonical AE relation via Load.posterId → User).
  // Single-AE pre-Oct-2026 (Wasi); multi-AE deferred to future sprint.
  poster?: { firstName: string; lastName: string; phone?: string | null } | null;
  // Sprint 49 (Item 118) — appointment flag suffix on parties block windows.
  // Load.appointmentRequired (schema:2075). Modal does not currently surface
  // a toggle — read directly from Load.
  appointmentRequired?: boolean | null;
  // Sprint 49 (Item 117) — pickup #/PO # data path for meta strip 8-cell.
  //
  // Arc 13 — the Load fallbacks are gone. Load.pickupNumber and
  // Load.shipperPoNumber were never written by anything, in the entire history
  // of the repo, so the "formData primary + Load fallback" chain only ever
  // resolved on its first link. poNumbers stays: it IS populated, and it is what
  // the BOL renders.
  poNumbers?: string[] | null;
  // v3.8.arr — CLAUDE.md §3.9 compliance. These are the canonical physical
  // pickup and delivery identities and they already exist on Load; the BOL in
  // this same file has always read them. The Rate Confirmation never did, so it
  // printed the BILLING CUSTOMER over the ORIGIN city — two different companies
  // on one line — with no street address at all, and a literal "Consignee TBD"
  // on a document headed BINDING. All 7 Wasi-supplied reference rate
  // confirmations name the facility at each stop; 6 of 7 print a street.
  // §3.9: "Customer (billing entity) address is NEVER used on shipping documents
  // unless origin fields are empty."
  originCompany?: string | null;
  originAddress?: string | null;
  originContactName?: string | null;
  originContactPhone?: string | null;
  shipperFacility?: string | null;
  destCompany?: string | null;
  destAddress?: string | null;
  destContactName?: string | null;
  destContactPhone?: string | null;
  consigneeFacility?: string | null;
  // v3.8.arr — appointment windows. Page 2 conditions BOTH detention and TONU
  // on "your appointment window", and the document printed a bare date with no
  // time. Conditioning payment on a window that is never disclosed is
  // unenforceable against the carrier and indefensible to them.
  pickupTimeStart?: string | null;
  pickupTimeEnd?: string | null;
  deliveryTimeStart?: string | null;
  deliveryTimeEnd?: string | null;
  // v3.8.art — reefer spec. Root capture is Order Builder, carried through the
  // Tender workflow, rendered here automatically. temperatureControlled, tempMin
  // and tempMax already existed and were already REQUIRED in Order Builder on a
  // reefer load; the Rate Confirmation simply never read them, which is how a
  // reefer load produced a document with no temperature on it at all before
  // v3.8.arm. tempSetpoint is the one number a driver dials in; the min/max pair
  // is the acceptable range around it.
  temperatureControlled?: boolean | null;
  tempMin?: number | null;
  tempMax?: number | null;
  tempSetpoint?: number | null;
  preCoolTo?: number | null;
  reeferContinuous?: boolean | null;
}

function sectionTitle(doc: PDFDoc, title: string, y: number): number {
  doc.fontSize(11).fillColor("#D4A843").text(title, 50, y);
  doc.moveTo(50, y + 15).lineTo(560, y + 15).strokeColor("#D4A843").lineWidth(0.5).stroke();
  return y + 22;
}

function checkPageBreak(doc: PDFDoc, y: number, needed: number): number {
  if (y + needed > doc.page.height - 80) {
    addFooter(doc);
    doc.addPage();
    addHeader(doc, "RATE CONFIRMATION (cont.)");
    return 155;
  }
  return y;
}

/**
 * Build the operational terms grid the Rate Confirmation prints.
 *
 * Extracted from `generateEnhancedRateConfirmation` so the dwell figures on the
 * signed document are reachable from a test. They were not before, and the gap
 * was load-bearing rather than cosmetic: the unit suite pinned
 * DETENTION_CAP_PER_STOP to the literal 250, but nothing pinned the PRINTED grid
 * to that constant. Replacing `detentionMaxPerStop` here with a literal 300
 * published "$50/hr after 2 hrs free, $300/stop cap" on a document a carrier
 * signs while settlement kept paying $250, and every runnable pre-commit gate
 * stayed green: tsc clean, the dwell unit suite 50/50, and verify-rc-matrix
 * "ALL CASES PASS" (it checks page count and dead space, not cell text). The
 * only gate that saw it was e2e/helpers/pdf.ts, which this repo does not run.
 *
 * A testable seam on a money path is worth more than a tidy module boundary, so
 * this is exported. The test asserts the identity in the direction that matters:
 * the figures this builder emits ARE the reconciler's constants, not merely
 * numbers equal to them today.
 */
export function buildRateConOperationalTerms(
  formData: Record<string, any>,
  quickPayApplied?: string
): RateConTerms {
  const fd = formData || {};
  // ── v3.8.asb — this cell states the election, not the tier ───────────────
  //
  // The OPERATIONAL TERMS grid has a cell labelled QUICK PAY that printed the
  // carrier's TIER NAME: a row reading "QUICK PAY — SILVER" beside DETENTION,
  // TONU and LAYOVER, all of which state money. It named a membership where
  // its neighbours name a price, so the one cell on the page a carrier would
  // look at to find their fee gave them a word instead of a number. This is
  // the same defect as the meta-strip cell and it was in two places; the
  // generator now passes the applied election here as well.
  //
  // The "—" no-tier sentinel is still normalised away, so an empty or unknown
  // value drops the cell rather than rendering a dash beside a money label.
  const qpTier = quickPayApplied && quickPayApplied !== "—" ? quickPayApplied : undefined;

  // Operational terms — detention / TONU / layover / lumper / cancellation / QP.
  // Sprint 50 (Item 127, Path β belt-and-suspenders) — detentionNotify: true
  // appends " · notify" to the DETENTION cell as a glance-level reminder of
  // the 30-min-before notification obligation locked in T&C clause (7).
  return {
    // v3.8.asc — was `fd.detentionRate` alone, the one dwell figure in this object
    // not bound to a constant. The rate printed on a signed page was decided by
    // whatever happened to be frozen into an RC row months ago, never by policy.
    // A stored rate still wins — an RC that promised a specific rate must keep
    // printing it — but the fallback is now the ratified figure rather than a
    // literal buried two files away in the renderer.
    detentionRatePerHour: (fd.detentionRate as number | undefined) ?? DETENTION_RATE_PER_HOUR,
    // v3.8.arn — the renderer's cap branch had never fired: it is gated on
    // detentionMaxPerStop and this object never passed one, so no cap has ever
    // printed on a Rate Confirmation.
    // v3.8.ars — 200 -> 250, deliberately EQUAL to the layover day rate. At 200
    // the cap was reached at billable hour 4 while auto-layover did not fire
    // until hour 24, so a carrier held overnight earned nothing across an
    // 18-hour gap. Setting cap = layover rate makes a day of waiting worth the
    // same number whichever instrument pays it, which is how Campbell's
    // published schedule handles it ($360 cap / $360 per 24-hour layover) and
    // what Scotlynn's "$50/HR OR UNTIL LAYOVER OR $300 IS HIT" is reaching for.
    detentionMaxPerStop: DETENTION_CAP_PER_STOP,
    detentionFreeHours: DETENTION_FREE_HOURS,
    detentionNotify: true,
    // ── Ownership of the remaining money/term cells ─────────────────────────
    // These three have printed for the whole life of the document from `??`
    // fallbacks inside drawRateConTerms, because this object — the function's
    // ONLY caller — never passed them. The values below are exactly what those
    // fallbacks rendered, so this changes no output. What it changes is who
    // decides: three numbers on a document a carrier signs move out of a
    // renderer default and into a reviewable, greppable choice at the call
    // site. The renderer keeps its fallbacks as defence in depth, but it is no
    // longer the place the value is chosen.
    //
    // TONU and layover are ratified in CLAUDE.md §5. v3.8.asc: the literal 200
    // became TONU_AMOUNT, so all three now come from lib/accessorialPolicy and
    // there is nothing left here for a policy change to miss.
    tonuAmount: TONU_AMOUNT,
    layoverPerDay: LAYOVER_RATE_PER_DAY,
    // RESOLVED 2026-08-15, and this comment previously said the opposite. The
    // window is ratified — as the CARRIER'S release window: the carrier may
    // release a load up to this many hours before pickup without penalty. It is
    // NOT a window for SRL to cancel penalty-free, which is the reading that made
    // this cell and the TONU clause contradict each other on the same signed page.
    // Reframed, they govern different parties and can coexist.
    //
    // Still open, and deliberately not fixed here: the grid renders the line as
    // "4-hour notice without penalty" without naming the releasing party. It must
    // name the carrier when the rule is actually enforced by a writer — nothing
    // enforces it today. e2e/helpers/pdf.ts pins that string character for
    // character, so the label and the test move in the same change.
    cancellationWindowHours: CARRIER_RELEASE_WINDOW_HOURS,
    quickPayTier: qpTier,
  };
}

/**
 * Sprint 45-RC (v3.8.abd) — Item 48 close. Path β1 migration: skill chrome
 * library imported from backend/src/lib/srl-chrome.ts; legacy hand-built
 * chrome (addHeader/addFooter/sectionTitle/checkPageBreak/labelValue) no
 * longer called from this generator. Other generators (BOL/Invoice/
 * Settlement) keep those helpers alive until their dedicated sprints
 * (45-RC2/3) migrate them.
 *
 * 8 findings resolved:
 *   #1 phantom blanks (was 6 pages) → dynamic flow, drawContinuationHeader
 *      fires on actual overflow only; canonical 2-page layout per skill RC
 *      anatomy (pdf-chrome.md)
 *   #2 address duplicated → BRAND.address single-line from skill lib
 *   #3 no QR (intentional) → skill canonical SKILL.md:86 confirms RC
 *      has no scan workflow; includeQr: false explicit
 *   #4 generic logo → drawCompassMark via PNG fallback (60/120/240/480)
 *      from src/lib/srl_compass_*.png (Sprint 44b cp -r src/lib step)
 *   #5 carrier section empty → carrier identity captured in
 *      RATE_CON_SIGNATURE_ROLES (Carrier Acceptance), not body
 *   #6 TOTAL bare → drawRateBreakdown (linehaul + FSC + accessorials →
 *      bold Total Carrier Pay) + drawLaneEconomics (MILES/TRANSIT/
 *      $/MILE pills) + drawRateConTerms (detention/TONU/layover grid)
 *   #7 chrome drift → skill canonical Times-Bold + Helvetica + #0A2540
 *      navy + #C5A572/#BA7517 golds via wrapped builder calls
 *   #8 rate breakdown on page 4 (Phase A2 pixel verification finding) →
 *      drawRateBreakdown ON PAGE 1 below parties block per skill anatomy;
 *      drawContinuationHeader-driven flow eliminates forced page breaks
 *
 * Item 8.8 leading-zero MC# inherited from skill BRAND verbatim per D7
 * carry-forward — dedicated sprint closes across all 14 surfaces.
 */
export function generateEnhancedRateConfirmation(load: EnhancedRCLoadData, formData: Record<string, any>): PDFDoc {
  const fd = formData || {};
  // v3.8.arq — the footer RULE is drawn at PAGE_H - MARGIN - 12 - 4, which is
  // 792 - 36 - 12 - 4 = 740. Body content must finish above it. The previous
  // 749 ceiling sat NINE POINTS BELOW the rule it was supposed to protect,
  // which is how three lines shipped rendering through the footer.
  const RC_CONTENT_FLOOR = 738;
  // v3.8.aro — bufferPages lets the footer be stamped AFTER all content is laid
  // out, so "Page N of M" reports the real total instead of a hardcoded 2. Until
  // now the page count was a constant and every content addition became a
  // trimming exercise against a fixed budget; the maximal fixture has run as
  // little as 14pt of slack. Content should not lose to layout on a document
  // that carries money terms. References run longer than this: Scotlynn 2 pages,
  // Allen Lund 4, Schneider 5.
  const doc = new PDFDocument({ size: "LETTER", margin: 0, bufferPages: true });

  // Sprint 47 (v3.8.abf, Item 101) — register skill canonical fonts on this
  // doc instance. Required for Playfair-Bold / DMSans-* references inside
  // skill chrome functions to resolve. Without this call, fontkit throws
  // "Font not found" on first text() invocation. Mirror of BOL v2.9 pattern.
  registerSkillFonts(doc);

  // Was `RC-SRL-${fd.referenceNumber || load.referenceNumber}`. Two defects in
  // one line, both live in production output:
  //   1. referenceNumber ALREADY carries the "SRL-" stem, so this rendered
  //      RC-SRL-SRL-121488 on every page header of every Rate Confirmation.
  //   2. it preferred formData over the load record and ignored loadNumber, so
  //      the RC could print a different identifier than the BOL for one load.
  // Now: the persisted rateConNumber, else revision 1 off the load stem.
  // `fd.rateConNumber` is injected by the caller from the RateConfirmation row
  // (see rateConfirmationController.renderFormData) rather than stored in
  // formData, so there is still exactly one persisted copy: the rateConNumber
  // column. Callers that render an unsaved preview pass nothing and get
  // revision 1 derived from the stem, which is what a first issue would get.
  const docId = documentNumberFor(fd.rateConNumber, load, "RATE_CONFIRMATION") ?? "";

  // The load stem, which is NOT the document number. `docId` identifies THIS
  // Rate Confirmation (SRL-121488R2 on a re-issue); `stem` identifies the
  // freight (SRL-121488) and is what the body copy means when it tells a driver
  // which load to check in against, or names the load in the invoicing subject
  // line. Conflating them would put a revision suffix in a driver instruction.
  const stem = resolveLoadStem(load) ?? "";

  // ─── PAGE 1 ────────────────────────────────────────────────────
  // Header (no QR — RC carrier-portal artifact, no scan event per skill)
  let y = drawHeaderFirstPage(doc, {
    docTitle: "Rate Confirmation",
    subtitle: "Carrier-Issued · Binding",
    loadId: docId,
    includeQr: false,
  });

  // Sprint 49 (Item 119) — AE header sub-line. Renders below the subtitle
  // when poster relation is included on the load. Skips cleanly when null
  // (older RCs pre-Sprint-49 controller include extension, or system-generated
  // loads without an explicit AE). Format: "AE: <Name> · <Phone>".
  if (load.poster) {
    const aeName = `${load.poster.firstName} ${load.poster.lastName}`.trim();
    const aePhone = load.poster.phone ? ` · ${load.poster.phone}` : "";
    doc.font(FONT_BODY, 8).fillColor(TOKENS.fg2);
    doc.text(`AE: ${aeName}${aePhone}`, MARGIN, y - 2, { lineBreak: false });
    y += 12;
  }

  // Sprint 51 (Item 129) — RC verification URL anti-fraud header sub-line.
  // FreightWaves 2026 fake-rate-con pattern: carriers receive thousands of
  // phishing RCs impersonating legitimate brokers; surfacing the verification
  // URL lets honest carriers confirm authenticity before committing the load.
  // Token is deterministic SHA-256 hash of (load.id + refNum + salt) — see
  // verifyController.rcVerifyToken. Hash-scan-lookup on backend; Item 146
  // tracks the O(1) schema-field migration when load volume reaches ~10K.
  if (load.id) {
    const verifyToken = rcVerifyToken({ id: load.id, referenceNumber: load.referenceNumber });
    doc.font(FONT_BODY, 7.5).fillColor(TOKENS.goldDark);
    doc.text(`Verify this RC: silkroutelogistics.ai/verify/${verifyToken}`, MARGIN, y - 2, { lineBreak: false });
    y += 12;
  }

  // Meta strip — Sprint 49 (Item 117) extended 6 → 8 cells. PICKUP # and PO #
  // render conditionally (empty string passed when null/empty so the cell shows
  // em-dash per drawMetaStrip skill canonical, instead of orphan labels).
  // formData primary + Load fallback per Sprint 48 hybrid precedence pattern.
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const pickupStr = fd.pickupDate || (load.pickupDate instanceof Date ? load.pickupDate.toLocaleDateString() : null) || "—";
  const deliveryStr = fd.deliveryDate || (load.deliveryDate instanceof Date ? load.deliveryDate.toLocaleDateString() : null) || "—";
  const equipment = fd.equipmentType || load.equipmentType || "—";
  const termsLabel = fd.paymentTerms || "Net-30";
  // ── v3.8.asb — the QUICK PAY cell states the FEE APPLIED TO THIS LOAD ────
  //
  // It used to print the carrier's TIER NAME ("SILVER"), and before that the
  // word "Standard". Neither is a fee. A carrier charged $60 on a $2,000 load
  // could not find "3%" anywhere on any document, while carrierPayments.ts
  // told them "the fee is confirmed in writing on the rate confirmation" and
  // schema.prisma asserted "the RC prints quickPaySpeed + quickPayFeePercent
  // as applied to THIS load". It printed neither. Quick Pay Agreement §7
  // requires the deduction be verifiable on the document's face; a tier name
  // is not verifiable against a dollar figure.
  //
  // The value is resolved from what the load actually elected, in this order:
  //   1. fd.quickPaySpeed + fd.quickPayFeePercent — both halves, written by
  //      autoRateConfirmationService. The fee alone is ambiguous (3% is Silver
  //      seven-day AND Platinum same-day), so speed is what disambiguates it.
  //   2. fd.quickPayFeePercent alone — validators/rateConfirmation.ts declares
  //      quickPayFeePercent but NOT quickPaySpeed, so a Zod parse on any AE
  //      edit strips the speed and leaves the percent. That path still has a
  //      real fee to state and must not fall through to "not elected".
  //   3. no fee — the load is on standard terms. Per the 2026-08-16 decision
  //      Quick Pay defaults OFF per load, so this is the ordinary case and it
  //      has to say so plainly rather than imply an election that never
  //      happened.
  //
  // There WAS an fd.quickPayCellValue, pre-computed upstream, which this
  // renderer never read. Its own comment claimed the strings were pre-measured
  // to fit; they were not — "Same-day · 5%" measures 69.6pt against a 67.5pt
  // cell and would have overprinted TERMS, the Item 152 defect. It was deleted
  // in v3.8.asb. The renderer owns its own geometry and measures below rather
  // than trusting an upstream claim about a font it cannot see.
  const qpFeePct =
    typeof fd.quickPayFeePercent === "number" && fd.quickPayFeePercent > 0 ? fd.quickPayFeePercent : null;
  const qpSpeedRaw = typeof fd.quickPaySpeed === "string" ? fd.quickPaySpeed.toUpperCase() : null;
  // A non-zero percent is what decides this, and NOT a speed of "STANDARD"
  // sitting beside it. The two can disagree, and when they do the money
  // follows the percent: integrationService derives the speed from the frozen
  // percent (resolveQuickPaySpeed compares it against the tier's same-day
  // rate) and only zeroes the fee when that derivation yields STANDARD, which
  // it cannot do for a non-zero percent. So a load carrying 3% and a STANDARD
  // label is charged 3%. Reading the label instead of the percent would print
  // "not elected" on a load the ledger bills — which is the whole defect this
  // change exists to close, reintroduced through the side door.
  const qpElected = qpFeePct !== null;
  const qpSameDay = qpSpeedRaw === "SAME_DAY";
  // Speed wording matches what the TERMS cell beside it prints for the same
  // load (autoRateConfirmationService election.paymentTerms), so the two cells
  // read as one statement rather than two vocabularies.
  const qpSpeedLabel = qpSameDay ? "Same day" : "7 days";

  // Measured fit, not asserted fit. The meta strip draws every cell with
  // lineBreak:false, so a value wider than its column silently overprints its
  // neighbour — there is no wrap and no error. Rather than hand-check a string
  // and leave the next editor to rediscover the constraint, the renderer walks
  // a ladder of candidates and takes the first that measures inside the column
  // with a 4pt gutter. Worst case it degrades to the bare percent, which is
  // still the number the carrier is charged. Measured at DMSans-Regular 10pt
  // (drawMetaStrip's own font/size) against CONTENT_W/8 = 67.5pt:
  //   "3% · 7-day"  48.4pt   "5% same day"  61.5pt   "Not elected"  54.1pt
  //   "5% · same day" 66.1pt is inside the column but inside the gutter too,
  //   so it is not first in the ladder.
  const qpCellValue = (() => {
    const ladder = qpElected
      ? qpSameDay
        ? [`${qpFeePct}% same day`, `${qpFeePct}% SD`, `${qpFeePct}%`]
        : [`${qpFeePct}% · 7-day`, `${qpFeePct}% 7-day`, `${qpFeePct}%`]
      : ["Not elected", "None"];
    const budget = CONTENT_W / 8 - 4;
    doc.font(FONT_BODY, 10);
    return ladder.find((s) => doc.widthOfString(s) <= budget) ?? ladder[ladder.length - 1];
  })();
  // Arc 13 — was `fd.pickupNumber || load.pickupNumber || ""`. The middle term
  // read a column nothing has ever written, so it could only ever contribute an
  // empty string to a chain that had already resolved or already failed.
  const pickupNumStr = fd.pickupNumber || "";
  // Arc 13 — the trailing `|| load.shipperPoNumber` is gone with the column.
  // poNumbers is the populated source and always was; the removed link could
  // only ever have contributed an empty string.
  const poNumStr = fd.poNumber || (load.poNumbers && load.poNumbers.length > 0 ? load.poNumbers[0] : "") || "";

  y = drawMetaStrip(doc, {
    "DATE ISSUED": dateStr,
    "LOAD REF": stem,
    "PICKUP": pickupStr,
    "DELIVERY": deliveryStr,
    "PICKUP #": pickupNumStr,
    "PO #": poNumStr,
    "QUICK PAY": qpCellValue,
    "TERMS": termsLabel,
  }, y - 4);

  // Parties block — Shipper + Consignee in cream-2 panels
  // Sprint 47 (Item 102) — y-offset bumped from `y - 4` to `y + 12`.
  // The drawMetaStrip return value y is at the meta strip's bottom edge;
  // the parties block has its own PARTIES small-caps label that needs
  // clearance from the meta-strip row above. Sprint 45-RC's `y - 4`
  // collided the parties label with the meta strip's DATE value row;
  // user-visible overlap on every RC PDF.
  // v3.8.arr — §3.9 order: AE override, then the load's own physical origin,
  // then the billing customer only as a last resort.
  const shipperAddrLines: string[] = [];
  const shipperStreet = fd.shipperAddress || load.originAddress || load.customer?.address;
  if (shipperStreet) shipperAddrLines.push(shipperStreet);
  // v3.8.arr — the load's ORIGIN city is authoritative, not the customer's.
  // This previously preferred load.customer?.city, so a load picking up in
  // Colton for a customer headquartered elsewhere printed the customer's city
  // beside the customer's name — a pickup address that exists nowhere on the
  // trip. Only an explicit AE override outranks the origin.
  const shipperCSZ = fd.shipperCity
    ? `${fd.shipperCity}, ${fd.shipperState || ""} ${fd.shipperZip || ""}`.replace(/\s+/g, " ").trim()
    : `${load.originCity}, ${load.originState} ${load.originZip}`;
  shipperAddrLines.push(shipperCSZ);

  const consigneeAddrLines: string[] = [];
  // v3.8.arr — read the load destination, not just an AE override.
  const consigneeStreet = fd.consigneeAddress || load.destAddress;
  if (consigneeStreet) consigneeAddrLines.push(consigneeStreet);
  const consigneeCSZ = fd.consigneeCity
    ? `${fd.consigneeCity}, ${fd.consigneeState || ""} ${fd.consigneeZip || ""}`.replace(/\s+/g, " ").trim()
    : `${load.destCity}, ${load.destState} ${load.destZip}`;
  consigneeAddrLines.push(consigneeCSZ);

  // v3.8.arr — appointment windows. Page 2 conditions BOTH detention ("not
  // payable if you arrive outside your appointment window") and TONU ("you must
  // have been inside your appointment window") on a window the document was
  // printing as a bare date with no times. The load carries the times already;
  // only an AE-typed override was ever read. Conditioning payment on an
  // undisclosed window is unenforceable against the carrier and indefensible
  // to them. 7 of 7 reference rate confirmations print a time or an explicit
  // hours range.
  const timeRange = (a?: string | null, b?: string | null): string | undefined => {
    const from = (a ?? "").trim();
    const to = (b ?? "").trim();
    if (from && to) return from === to ? from : `${from}-${to}`;
    return from || to || undefined;
  };
  const pickupWindowStr = fd.pickupTimeWindow || timeRange(load.pickupTimeStart, load.pickupTimeEnd);
  const deliveryWindowStr = fd.deliveryTimeWindow || timeRange(load.deliveryTimeStart, load.deliveryTimeEnd);

  // v3.8.arr — the person at the DOCK, not the billing contact. The customer
  // phone stays only as a last resort; a driver calling it reaches accounts
  // payable, not the gate.
  const shipContact = fd.shipperContact || load.originContactName;
  const shipPhone = fd.shipperPhone || load.originContactPhone;
  const shipperContactLine = (shipContact && shipPhone)
    ? `${shipContact} · ${shipPhone}`
    : (shipContact || shipPhone || load.customer?.phone || undefined);
  const consContact = fd.consigneeContact || load.destContactName;
  const consPhone = fd.consigneePhone || load.destContactPhone;
  const consigneeContactLine = (consContact && consPhone)
    ? `${consContact} · ${consPhone}`
    : (consContact || consPhone || undefined);

  // Sprint 49 (Item 118) — appointment flag suffix on parties block windows.
  // Reads fd.appointmentRequired (RC modal future toggle, not yet wired) OR
  // load.appointmentRequired (canonical schema field today). Suffix " · APPT"
  // surfaces the appointment requirement at the point a carrier eyes the
  // window — industry-standard convention.
  const apptFlag = (fd.appointmentRequired === true || load.appointmentRequired === true)
    ? " · APPT"
    : "";
  // Sprint 49 (Item 121) — consignee name fallback changed from em-dash to
  // "Consignee TBD" so the field communicates intent (data missing, fill in)
  // rather than ambiguous em-dash that could read as "no consignee."
  // Shipper retains 2-tier fallback (formData → load.customer → em-dash)
  // because customer is usually populated; em-dash there is rare.
  const shipperParty: Party = {
    // v3.8.arr — §3.9: the facility at pickup, never the billing entity.
    name: fd.shipperName || load.originCompany || load.shipperFacility || load.customer?.name || "—",
    addressLines: shipperAddrLines,
    contact: shipperContactLine,
    window: pickupStr !== "—"
      ? `${pickupStr}${pickupWindowStr ? " · " + pickupWindowStr : ""}${apptFlag}`
      : undefined,
  };
  const consigneeParty: Party = {
    // v3.8.arr — §3.9: the facility at delivery. "Consignee TBD" was printed
    // unconditionally because no load-level fallback existed at all.
    name: fd.consigneeName || load.destCompany || load.consigneeFacility || "Consignee TBD",
    addressLines: consigneeAddrLines,
    contact: consigneeContactLine,
    window: deliveryStr !== "—"
      ? `${deliveryStr}${deliveryWindowStr ? " · " + deliveryWindowStr : ""}${apptFlag}`
      : undefined,
  };
  y = drawPartiesBlock(doc, shipperParty, consigneeParty, y + 12);

  // Lane economics — MILES / TRANSIT / $/MILE pills (only with distance)
  // ARC 21 — CLOSES §13.3 Item 220.1.
  //
  // Arc 14 found this fallback reads the CUSTOMER rate — `load.rate` on the
  // primary creation path — and recorded it as latent because both live
  // producers happen to set `lineHaulRate`. Latent is not fixed: a future
  // producer that omits the key would print SRL's customer rate as carrier
  // pay on a document the carrier signs. Arc 14's own rehearsal demonstrated
  // it accidentally, reading $5,100 against an agreed $4,100.
  const linehaul = (fd.lineHaulRate ?? load.carrierRate ?? 0) as number;
  const fsc = (fd.fuelSurcharge as number | undefined) ?? 0;
  const accs = (fd.accessorials as Array<{ description?: string; type?: string; amount: number }> | undefined) ?? [];
  const accSum = accs.reduce((s, a) => s + Number(a.amount || 0), 0);
  const totalCarrierPay = (fd.totalCharges as number | undefined) ?? (linehaul + fsc + accSum);
  const miles = load.distance ?? null;
  if (miles && miles > 0) {
    // Sprint 47 (Item 100) — transit in drive hours per broker industry
    // standard (carriers think in HOS-relevant drive hours, not calendar
    // days). 55 mph industry-standard highway average for solo loaded.
    // Pre-Sprint-47 was `miles / 500` days which renders "2.7 days" for a
    // 1,352-mile lane — technically correct under 500 mi/day HOS solo but
    // UX-poor; carriers convert mentally to drive hours regardless.
    const transitHours = miles / 55;
    y = drawLaneEconomics(doc, miles, transitHours, totalCarrierPay, y - 4, "hours");
  }

  // Equipment spec — type + temp-setpoint if reefer.
  // v3.8.arm — the setpoint now falls back to the LOAD's own temperature
  // fields. Pre-arm this read only fd.tempRequirements, which is populated
  // solely when an AE types it into the RC form — so a reefer load built in
  // Order Builder (which captures temperatureControlled + tempMin + tempMax as
  // REQUIRED fields) rendered a rate confirmation with no temperature on it at
  // all. A retrieved-corpus check makes the cost concrete: all 4 real rate
  // confirmations (Scotlynn, TQL x2, Leonard's) carry a setpoint on the face.
  const tempRaw = fd.tempRequirements ? String(fd.tempRequirements) : "";
  const tempMatch = tempRaw.match(/-?\d+(\.\d+)?/);
  const loadTempMin = (load as any).tempMin;
  const loadTempMax = (load as any).tempMax;
  // v3.8.art — resolution order: the AE's free-text override, then the load's own
  // setpoint (the field Order Builder now captures), then the bottom of the
  // acceptable range as a last resort. `typeof === "number"` rather than a
  // truthiness check throughout, because 0°F is a legitimate frozen setpoint.
  const loadSetpoint = load.tempSetpoint;
  const tempSetpointResolved = tempMatch
    ? parseFloat(tempMatch[0])
    : (typeof loadSetpoint === "number"
        ? loadSetpoint
        : (typeof loadTempMin === "number" ? loadTempMin : undefined));
  const isTempControlled = Boolean(
    load.temperatureControlled === true
    || tempRaw
    || typeof loadSetpoint === "number"
    || typeof loadTempMin === "number",
  );
  // v3.8.art — the full reefer spec now reaches page 1, where a driver actually
  // looks before rolling. Previously only the setpoint was passed, so run mode
  // and pre-cool lived four paragraphs into page 2 — and most reefers default to
  // cycle-sentry, so a driver reading "38°F" on page 1 and setting 38 on cycle
  // is the excursion claim SRL cannot afford on its first cold-chain customer.
  // Every check is against null/undefined, never truthiness: 0°F is a legitimate
  // frozen setpoint and reeferContinuous === false is a deliberate instruction.
  const equipSpec: EquipmentSpec = {
    type: equipment,
    tempControlled: load.temperatureControlled === true || tempSetpointResolved !== undefined,
    tempSetpointF: tempSetpointResolved,
    tempMinF: load.tempMin ?? undefined,
    tempMaxF: load.tempMax ?? undefined,
    tempContinuous: load.reeferContinuous ?? undefined,
    preCoolToF: load.preCoolTo ?? undefined,
  };
  y = drawEquipmentSpec(doc, equipSpec, y);

  // CARRIER · ASSIGNED body section (Sprint 48 Item 106) — Sprint 45-RC
  // removed this per too-purist skill interpretation; industry-standard RCs
  // (CHR/Coyote/RXO/Landstar) all surface carrier identity body-section
  // above commodity. Signature block alone is insufficient for at-a-glance
  // recognition. formData primary + load.carrier fallback per hybrid pattern
  // already used for shipper/consignee in this generator.
  const carrierName = fd.carrierName
    || load.carrier?.company
    || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}`.trim() : "—");
  // Sprint 49 (Items 120 + 120.a) — render-time strip via precise regex
  // /^MC[-#\s]*(?=\d)/i + /^DOT[-#\s]*(?=\d)/i. Storage shape varies by
  // data source; the digit lookahead ensures we only strip the prefix
  // when an MC/DOT number digit follows, avoiding over-match on edge
  // cases like a carrier company name starting with "MC".
  const rawMc = fd.carrierMcNumber || load.carrier?.carrierProfile?.mcNumber;
  const rawDot = fd.carrierDotNumber || load.carrier?.carrierProfile?.dotNumber;
  const carrierMc = normalizeMcNumber(rawMc) || "—";
  const carrierDot = normalizeDotNumber(rawDot) || "—";
  const carrierPhone = fd.carrierPhone || load.carrier?.phone || "—";
  const carrierContact = fd.carrierContact
    || fd.dispatcherName
    || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}`.trim() : "—");

  const carrierLabelY = y;
  doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
  doc.text("CARRIER · ASSIGNED", MARGIN, carrierLabelY, {
    characterSpacing: 7 * 0.08,
    lineBreak: false,
  });

  const carrierPanelY = carrierLabelY + 12;
  const carrierPanelH = 58;
  // Item 94 (A-5) — frame via drawPanel instead of a hand-built
  // roundedRect + fillAndStroke, per SKILL.md "Don't hand-build chrome".
  // FRAME ONLY, deliberately: the body is three rows at three different
  // font/size/color combinations (11pt bold fg1 name, 8.5pt fg2 MC/DOT,
  // 8.5pt fg2 conditional contact) at fixed offsets, and drawPanel takes a
  // single bodyText rendered at one font, so the rows stay hand-rendered
  // below. With wrap omitted (false) and no bodyText, drawPanel honors `h`
  // and emits exactly the save/fill/stroke/roundedRect/fillAndStroke/restore
  // sequence this replaced — byte-identical output, one owner for the tokens.
  drawPanel(doc, { x: MARGIN, y: carrierPanelY, w: CONTENT_W, h: carrierPanelH });

  doc.font(FONT_BODY_BOLD, 11).fillColor(TOKENS.fg1);
  doc.text(carrierName, MARGIN + 12, carrierPanelY + 9, { lineBreak: false });
  doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2);
  doc.text(`MC# ${carrierMc}    DOT# ${carrierDot}`, MARGIN + 12, carrierPanelY + 26, { lineBreak: false });

  // Sprint 49.b (Item 138) — contact + phone line empty-suppression. When
  // both values fall through to em-dash sentinel (profile-only carriers
  // without linked User record, no phone), render no line at all instead
  // of "— · —" which reads as broken. Same defensive class as Sprint 48
  // DRIVER & EQUIPMENT row gating.
  const hasCarrierContact = carrierContact && carrierContact !== "—";
  const hasCarrierPhone = carrierPhone && carrierPhone !== "—";
  if (hasCarrierContact || hasCarrierPhone) {
    const contactParts: string[] = [];
    if (hasCarrierContact) contactParts.push(carrierContact);
    if (hasCarrierPhone) contactParts.push(carrierPhone);
    doc.text(contactParts.join(" · "), MARGIN + 12, carrierPanelY + 41, { lineBreak: false });
  }

  y = carrierPanelY + carrierPanelH + 10;

  // Driver & Equipment mini-row (Sprint 48 Item 107) — renders only when
  // at least one field populated; driver assignment can post-date RC issue.
  if (fd.driverName || fd.driverPhone || fd.truckNumber || fd.trailerNumber) {
    doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
    doc.text("DRIVER & EQUIPMENT", MARGIN, y, {
      characterSpacing: 7 * 0.08,
      lineBreak: false,
    });
    y += 12;
    const driverParts = [
      fd.driverName ? `Driver: ${fd.driverName}` : null,
      fd.driverPhone ? String(fd.driverPhone) : null,
      fd.truckNumber ? `Tractor #${fd.truckNumber}` : null,
      fd.trailerNumber ? `Trailer #${fd.trailerNumber}` : null,
    ].filter(Boolean) as string[];
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2);
    doc.text(driverParts.join("  ·  "), MARGIN, y, { lineBreak: false });
    y += 16;
  }

  // Shipment table — single commodity row
  const wt = (fd.weight as number | undefined) ?? load.weight;
  const pcs = (fd.pieces as number | undefined) ?? load.pieces;
  const commodityName = fd.commodity || load.commodity || "General Freight";
  y = drawShipmentTable(doc, {
    headers: ["PCS", "DESCRIPTION", "WEIGHT", "DIMS", "HM"],
    rows: [
      [
        pcs ? String(pcs) : "—",
        String(commodityName),
        wt ? `${wt.toLocaleString()} lbs` : "—",
        fd.dims || "—",
        fd.hazmat ? "Y" : "N",
      ],
    ],
    yTop: y,
  });

  // Rate breakdown ON PAGE 1 (Sprint 45-RC finding #8 — was on page 4)
  const rate: RateBreakdown = {
    linehaul,
    fuelSurcharge: fsc > 0 ? fsc : undefined,
    accessorials: accs.length > 0
      ? accs.map((a) => ({ label: a.description || a.type || "Accessorial", amount: Number(a.amount || 0) }))
      : undefined,
  };
  y = drawRateBreakdown(doc, rate, y - 8);

  // ── v3.8.asb — the panel states the APPLIED terms, not a price list ──────
  //
  // This panel used to print a hardcoded 4-cell grid of the whole §8 ladder
  // whenever a tier was set: TIER / STANDARD / 7-DAY QP / SAME-DAY QP. A menu
  // is fine as context. A menu INSTEAD of the applied number is what let a
  // carrier be charged a fee that appears on no document, because the grid
  // showed all three prices and never said which one was taken on this load.
  //
  // So the panel now has two states and they are decided by the ELECTION, not
  // by whether a tier happens to be set:
  //
  //   elected     → what was applied to this load: speed, fee, and where the
  //                 fee lands in dollars on the rate confirmed here. That is
  //                 the "verifiable on its face" the Quick Pay Agreement §7
  //                 requires — a carrier can check the deduction against this
  //                 document without asking anyone.
  //   not elected → says so plainly, then the carrier's OWN tier's terms as
  //                 context for a future load. Their tier, not all three:
  //                 a carrier has one tier and the other two rows were never
  //                 information, only noise. It cannot contradict the meta
  //                 strip cell because both read the same election.
  //
  // The tier ladder below is context ONLY and is never the source of what is
  // charged; the applied fee comes from the election frozen onto the load.
  const tierUpper = (fd.carrierPaymentTier as string | undefined)?.toUpperCase();
  const tierFees: Record<string, { netDays: number; sevenDay: number; sameDay: number }> = {
    SILVER:   { netDays: 30, sevenDay: 3, sameDay: 5 },
    GOLD:     { netDays: 21, sevenDay: 2, sameDay: 4 },
    PLATINUM: { netDays: 14, sevenDay: 1, sameDay: 3 },
  };
  const tierData = tierUpper && tierFees[tierUpper] ? tierFees[tierUpper] : null;
  const tierLabel = tierUpper ? tierUpper.charAt(0) + tierUpper.slice(1).toLowerCase() : null;

  // Dollar figures print only when this rate confirmation carries no
  // accessorial lines, which is every auto-generated one. The reason is
  // narrow and deliberate: the fee base is line haul plus fuel plus approved
  // accessorials, LESS anything reimbursed at cost, and the at-cost test lives
  // in integrationService (isAtCostReimbursement — lumper is the ratified
  // case). Re-implementing that test here would put a second copy of a money
  // rule in the codebase, which is the way two ladders diverged before. So
  // when accessorials exist the panel states speed and fee and leaves the
  // arithmetic to the settlement, which owns the rule. When they do not, the
  // base is unambiguous and the carrier gets the arithmetic on the page.
  const qpFeeBase = accs.length === 0 ? linehaul + fsc : null;
  const qpFeeAmount =
    qpElected && qpFeeBase !== null ? Math.round(qpFeeBase * (qpFeePct as number)) / 100 : null;
  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const qpLabelY = y;
  doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
  doc.text("QUICK PAY · CARAVAN PARTNER PROGRAM", MARGIN, qpLabelY, {
    characterSpacing: 7 * 0.08,
    lineBreak: false,
  });
  // The basis for the percentage, right-aligned on the label row.
  //
  // It belongs beside the number, but it cannot cost height: page 1 renders
  // with 22pt of clearance above the footer rule, and one accessorial line in
  // the rate breakdown eats 16pt of that. A third row inside the panel was
  // written first and scripts/verify-rc-matrix.ts caught it colliding with the
  // footer on the accessorial fixture — which is what that gate is for. The
  // label row has 88pt of unused width at this size, so this is free.
  // Measured: label 163.6pt + note 276.2pt + 12pt gap = 451.8pt of 540pt.
  if (qpElected) {
    doc.font(FONT_BODY, 7).fillColor(TOKENS.fg3);
    doc.text(
      "Fee applies to line haul, fuel and approved accessorials, less at-cost reimbursements.",
      MARGIN,
      qpLabelY + 1,
      { width: CONTENT_W, align: "right", lineBreak: false },
    );
  }
  const qpPanelY = qpLabelY + 12;
  const qpPanelH = 42;
  // Item 94 (A-5) — frame via drawPanel, per SKILL.md "Don't hand-build
  // chrome". FRAME ONLY: both body paths are unexpressible as a single
  // bodyText. The tier path is a 4-column grid (per-cell align:center, 7pt
  // fg3 header over 10pt bold fg1 value); the no-tier path is two 8pt fg2
  // lines at a 12pt inset. drawPanel renders one string at FONT_BODY 9 /
  // fg1 / 10pt inset, so both bodies stay hand-rendered below. `h` is
  // honored with wrap omitted, so the rect is byte-identical.
  drawPanel(doc, { x: MARGIN, y: qpPanelY, w: CONTENT_W, h: qpPanelH });
  if (qpElected) {
    // ELECTED — what was applied to this load. Two or four cells depending on
    // whether the arithmetic can be stated without re-implementing the at-cost
    // rule (see qpFeeBase above).
    const qpCells: [string, string][] =
      qpFeeAmount !== null && qpFeeBase !== null
        ? [
            ["SPEED", qpSpeedLabel],
            ["QUICK PAY FEE", `${qpFeePct}%`],
            ["FEE ON THIS RATE", money(qpFeeAmount)],
            ["NET ON THIS RATE", money(Math.round((qpFeeBase - qpFeeAmount) * 100) / 100)],
          ]
        : [
            ["SPEED", qpSpeedLabel],
            ["QUICK PAY FEE", `${qpFeePct}%`],
          ];
    const cellW = CONTENT_W / qpCells.length;
    qpCells.forEach(([head, val], i) => {
      const cx = MARGIN + i * cellW;
      doc.font(FONT_BODY, 7).fillColor(TOKENS.fg3);
      doc.text(head, cx, qpPanelY + 8, { width: cellW, align: "center", lineBreak: false });
      doc.font(FONT_BODY_BOLD, 10).fillColor(TOKENS.fg1);
      doc.text(val, cx, qpPanelY + 22, { width: cellW, align: "center", lineBreak: false });
    });
  } else {
    // NOT ELECTED — the ordinary case, since Quick Pay is off per load unless
    // the carrier elects it. Line 1 states the absence so the cell above is
    // never read as a fee that was hidden. Line 2 is the carrier's own tier as
    // context for a future load, or the ladder when no tier is on the form.
    doc.font(FONT_BODY, 8).fillColor(TOKENS.fg2);
    const noneLine1 = tierLabel
      ? `No Quick Pay elected on this load. It pays on standard ${tierLabel} terms at no fee.`
      : "No Quick Pay elected on this load. It pays on your standard tier terms at no fee.";
    const noneLine2 =
      tierData && tierLabel
        ? `${tierLabel} Quick Pay, if elected on a later load: ${tierData.sevenDay}% at 7 days, ${tierData.sameDay}% same day. Ask operations@silkroutelogistics.ai.`
        : "Caravan Partner Program Quick Pay: Silver 3% · Gold 2% · Platinum 1% at 7 days, plus 2% for same day.";
    doc.text(noneLine1, MARGIN + 12, qpPanelY + 10, { width: CONTENT_W - 24, lineBreak: false });
    doc.text(noneLine2, MARGIN + 12, qpPanelY + 24, { width: CONTENT_W - 24, lineBreak: false });
  }
  y = qpPanelY + qpPanelH + 12;


  // The OPERATIONAL TERMS grid's QUICK PAY cell gets the applied election, not
  // the tier name. Its cells are 202pt at FONT_BODY 9 (srl-chrome
  // drawRateConTerms, labelGutter 68), so the long form fits with room:
  // "5% same day on this load" measures 106.3pt.
  const qpTermsCell = qpElected
    ? `${qpFeePct}% ${qpSameDay ? "same day" : "at 7 days"} on this load`
    : "Not elected on this load";
  const opTerms: RateConTerms = buildRateConOperationalTerms(fd, qpTermsCell);
  y = drawRateConTerms(doc, opTerms, y - 4);

  // ── v3.8.arm — DOCK & DISPATCH ──────────────────────────────────────────
  // Sourced from a corpus of REAL rate confirmations retrieved this sprint
  // (Scotlynn and TQL court exhibits via CourtListener, TQL modern, Leonard's
  // Express live TMS output). Frequencies below are over those 4 documents.
  // Every line here is an OPERATING INSTRUCTION for the driver or dispatcher,
  // never a covenant — covenants stay in the BCA per the counsel-confirmed
  // architecture (Dirk Beckwith, Foster Swift). Placed on page 1 below the
  // operational terms grid: this is the last thing the driver reads before
  // rolling, and page 1 carried ~85pt of dead space pre-arm.
  // v3.8.arq — the label is drawn inside drawDockBlock below, so it travels with
  // the body when the block defers to page 2. Drawing it here as well left an
  // orphan heading stranded on page 1 above nothing.
  y -= 6;

  const dockLines: string[] = [
    // Driver / truck / trailer capture — driver 4 of 4, truck+trailer 3 of 4.
    // SRL captured the carrier as a legal entity and nothing about the physical
    // unit, so dispatch could not tell a shipper gate who was arriving and
    // tracking had no driver cell to start from.
    // V-2 — colon, not an em-dash: this is a label introducing fields, and
    // references/voice.md does not want em-dashes as sentence connectors.
    "Before pickup: Driver ____________  Cell ____________  Truck # ________  Trailer # ________",
    // Identity at the dock — 0 of 18 retrieved documents carry this, yet every
    // fraud source in the corpus names check-in identity as the highest-signal
    // tell. NOT a restatement of the BCA re-brokering covenant: that binds the
    // carrier; this tells an honest driver what to do when someone ELSE tries it.
    "Check in at both stops as Silk Route Logistics, load " + stem + ". The BOL must name SRL as broker. If it names another company or MC number, do not load. Call (269) 220-6760.",
    // Seals — 4 of 4 real rate confirmations address seals; SRL printed nothing.
    "Seals: record the number on the BOL at pickup; the receiver removes it, not the driver. Broken or missing seal at delivery: call before the doors open.",
    // Check calls — 2 of 4 state an explicit clock time. SRL runs check calls
    // (CheckCall model; SRL-handled check calls are a published §4 floor
    // benefit) but never told the driver when they were due.
    "Check calls: by 8:00 AM Eastern daily in transit and on arrival at each stop. Running late: call before the appointment.",
    // v3.8.art — detention evidence. SRL promises detention and never required
    // the proof needed to bill it, so the first disputed claim costs $250 out of
    // margin with nothing to present to the shipper. MoLo: "Signed in/out times
    // and all accessorial or lumper receipts must be submitted within 24 hours
    // or they will not be reimbursed." Schneider: detention "must be clearly
    // noted on the bill of lading".
    "Detention pay needs proof: have the facility write your in and out times on the BOL. No times on the BOL, no detention.",
    // v3.8.art — Transervice, the single most practical clause in the corpus:
    // "Carrier shall call TIS and make appropriate notations prior to signing
    // the BOL or leaving the shipping facility in the event Carrier is not
    // allowed on the shipping dock to witness loading."
    "If the dock will not let you watch the load or count it, note that on the BOL before you sign and call SRL. Signing a clean BOL says you received everything on it in good order.",
    // v3.8.art — Allen Lund requires the driver to verify the seal number
    // MATCHES the BOL, not merely to record it; MoLo requires a reseal after
    // each stop. SRL said only "record the number".
    "Check the seal number on the trailer matches the number written on the BOL before you leave. Reseal after any stop where the doors open.",
    // v3.8.art — Transervice OS&D. SRL carried nothing on overage, shortage or
    // damage anywhere on the document: "All overage, shortage, and damage must
    // be reported to TIS immediately following the occurrence of the OS&D, with
    // such OS&D noted on the Bill of Lading."
    "Overage, shortage, damage, accident, theft or any delay that puts delivery at risk: note it on the BOL and call SRL immediately, not at delivery.",
    // v3.8.art — Schneider: "Carrier must contact Schneider (do not call the
    // customer)". SRL has ONE customer; a driver negotiating directly with them
    // both disintermediates SRL and removes SRL's visibility of the load.
    "Bring every issue to SRL, not to the shipper or receiver. Do not negotiate appointments, rates or accessorials with the facility.",
    // v3.8.art — Allen Lund states trailer condition four separate ways on the
    // only food load in the corpus; MoLo names FSMA explicitly. SRL hauls
    // refrigerated food for a food shipper and named neither.
    "Trailer must be clean, dry, odor-free and empty on arrival, and food-grade for food loads. No trailer that last hauled garbage, chemicals or hazmat. If it fails any of these, do not load.",
  ];

  // v3.8.arq — MEASURE before drawing, and defer to page 2 when page 1 cannot
  // hold it. v3.8.arm moved this block onto page 1 on the strength of "page 1
  // has 85pt of dead space" — a number produced by a gate fixture that set
  // `miles` while the generator reads `load.distance`, so drawLaneEconomics
  // (~54pt) never rendered under test. On a real load page 1 has no slack, and
  // these lines rendered at y=783 on a 792pt page: below the footer and inside
  // most printers' non-printable margin. The three lines falling off the page
  // were the seal protocol, the check-call schedule, and the phone number a
  // driver is told to call when a document looks forged.
  const drawDockBlock = (): void => {
    doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
    doc.text("DOCK & DISPATCH", MARGIN, y, { characterSpacing: 7 * 0.08, lineBreak: false });
    y += 12;
    doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg2);
    doc.text(dockLines.join("\n"), MARGIN, y, { width: CONTENT_W, lineGap: 0.5, paragraphGap: 1.5 });
    y = doc.y;
  };

  doc.font(FONT_BODY, 7.5);
  const dockH = 12 + doc.heightOfString(dockLines.join("\n"), {
    width: CONTENT_W, lineGap: 0.5, paragraphGap: 1.5,
  });
  const dockOnPage1 = y + dockH <= RC_CONTENT_FLOOR;
  if (dockOnPage1) drawDockBlock();

  // v3.8.aro — footers are stamped at the end over the buffered page range, so
  // no drawFooter call belongs here any more.
  doc.addPage();

  // ─── PAGE 2 ────────────────────────────────────────────────────
  y = drawContinuationHeader(doc, "Rate Confirmation", docId);

  // v3.8.arq — deferred from page 1 when the lane band left no room. Dock and
  // dispatch instructions lead page 2 rather than being buried after the terms:
  // they are the last thing a driver needs before rolling.
  if (!dockOnPage1) {
    drawDockBlock();
    y += 14;
  }

  // v3.8.aro — page-break helper. Any page-2+ block that might not fit calls
  // this first. PDFKit's own auto-pagination would add a bare page with no
  // continuation header, so overflow has to be handled explicitly. The 749
  // ceiling matches the clearance gate in scripts/verify-rc-matrix.ts: the
  // footer rule is drawn at y≈755 and a body baseline past 749 collides with
  // it — which is exactly how a line once rendered THROUGH the footer while
  // the matrix still scored it clean.
  const rcEnsureRoom = (needed: number): void => {
    if (y + needed <= RC_CONTENT_FLOOR) return;
    doc.addPage();
    y = drawContinuationHeader(doc, "Rate Confirmation", docId);
  };

  // Carrier requirements — insurance minimums (skill canonical defaults).
  // Sprint 51 (Item 130) — trackingAcceptance bullet added per sub-pattern 4
  // application (Phase A correction: tracking is preconditions-tier, not
  // legal exposure tier — belongs alongside insurance minimums, not in T&C).
  const reqs: CarrierRequirements = {
    cargoInsuranceMin: INSURANCE_MINIMUMS.cargoInsurance,
    autoLiabilityMin: INSURANCE_MINIMUMS.autoLiability,
    generalLiabilityMin: INSURANCE_MINIMUMS.generalLiability,
    trackingAcceptance: true,
  };
  y = drawCarrierRequirements(doc, reqs, y);

  // Special instructions — cream-2 frame via drawPanel, body still rendered
  // here. Item 94 (A-5): drawPanel now HAS a wrap mode, but this block cannot
  // adopt it without moving pixels, so only the frame was migrated.
  //
  // Why wrap is not used here. drawPanel's measured mode is built around an
  // INSIDE label: it fixes the body at panelTop + PANEL_BODY_TOP (22) to clear
  // a 6.5pt label at +8, and pads PANEL_PAD_BOTTOM (10) below. This panel
  // renders its label OUTSIDE and above the rect, so its body sits at
  // panelTop + 10 with 18pt below. Adopting wrap would push the body down 12pt
  // into a gap reserved for a label that is not there, cut the bottom pad from
  // 18 to 10, and grow the rect by ~4pt plus one lineGap per wrapped line.
  // That is a visible change to a shipped document, so the frame is migrated
  // and the measure + body render stay put. Closing the gap properly means
  // teaching drawPanel a label-outside body offset — a change to srl-chrome.ts,
  // which is not this file's to make.
  //
  // Known latent defect, deliberately preserved: the height below is measured
  // WITHOUT lineGap but the body renders WITH lineGap: 1, so the panel
  // under-measures by ~1pt per wrapped line. Correcting it would also move
  // pixels; it belongs with the wrap migration above, not here.
  const instructions = fd.specialInstructions || load.specialInstructions || load.notes;
  if (instructions || fd.pickupInstructions || fd.deliveryInstructions || fd.appointmentRequired) {
    const instrParts: string[] = [];
    if (instructions) instrParts.push(String(instructions));
    if (fd.pickupInstructions) instrParts.push(`Pickup: ${fd.pickupInstructions}`);
    if (fd.deliveryInstructions) instrParts.push(`Delivery: ${fd.deliveryInstructions}`);
    if (fd.appointmentRequired) instrParts.push("** APPOINTMENT REQUIRED **");
    const instrBody = instrParts.join("\n\n");

    const labelY = y;
    doc.font("Helvetica-Bold", 7).fillColor(TOKENS.goldDark);
    doc.text("SPECIAL INSTRUCTIONS", MARGIN, labelY, {
      characterSpacing: 7 * 0.08,
      lineBreak: false,
    });

    // Sprint 47.b (Item 104) — body height measurement + body render must
    // use SAME font for heightOfString to match actual text height. Both
    // swapped from Helvetica (legacy fallback) to FONT_BODY skill canonical
    // (DMSans-Regular). Safe post-Item-103 monkey-patch which suppresses
    // fontkit ligature substitution that would otherwise affect DMSans.
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
    const bodyHeight = doc.heightOfString(instrBody, { width: CONTENT_W - 20 });
    const panelH = bodyHeight + 28;

    // cream-2 frame — drawPanel with wrap omitted honors the measured `h`
    // computed above and emits the identical rect. See the block comment
    // above for why the wrap mode itself is not used.
    drawPanel(doc, { x: MARGIN, y: labelY + 12, w: CONTENT_W, h: panelH });

    // wrapped body text
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1);
    doc.text(instrBody, MARGIN + 10, labelY + 22, { width: CONTENT_W - 20, lineGap: 1 });

    y = labelY + 12 + panelH + 12;
  }

  // Governing Terms — v3.8 counsel-confirmed architecture (Dirk Beckwith,
  // Foster Swift, 2026-06). The substantive legal terms (Carmack, insurance
  // limits, indemnification, governing law, venue, the full re-brokering
  // covenant, food-safety, and CARB) now live in the Broker-Carrier Agreement.
  // This Rate Confirmation is a clean operational form that REFERENCES the
  // BCA — per Dirk's confirmed structure ("substantive terms in the BCA; the
  // BOL and Rate Confirmation become clean standard forms that reference it").
  // The prior embedded numbered T&C enumeration and the stale "BCA v3.1 dated
  // February 26, 2026" citation are removed; only per-load operational
  // reminders remain. E2E RC_PDF_REQUIRED updated in the same commit — the
  // governing-law + venue strings ("State of Michigan", "Kalamazoo County")
  // now assert on the BCA, not the RC; "BCA v3.1" added to RC_PDF_FORBIDDEN.
  doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
  doc.text("GOVERNING TERMS", MARGIN, y, {
    characterSpacing: 7 * 0.08,
    lineBreak: false,
  });
  y += 14;

  const governingClauses = [
    // v3.8.arl — 49 CFR 371.7 requires a broker to operate under its registered
    // name and bars it from representing its operations to be those of a
    // carrier. None of the 5 reference rate confirmations carried an equivalent
    // statement; it is the cheapest compliance line available to us.
    "Silk Route Logistics Inc. is an FMCSA-licensed property broker (USDOT 4526880, MC# 1794414). SRL arranges transportation. SRL does not transport freight.",
    "This Rate Confirmation is governed by the Broker-Carrier Agreement between Silk Route Logistics Inc. and Carrier (the “BCA”). In the event of conflict, the BCA controls.",
    "Acceptance: Carrier's signature below, or Carrier's dispatch of a unit, arrival at the pickup location, or commencement of transport, whichever occurs first, constitutes binding acceptance of this Rate Confirmation and the BCA.",
    // v3.8.arp — detention clock-start. "2 hrs free" never said free from WHAT,
    // which is the single largest money ambiguity on the document: a driver who
    // gates in four hours early could bill from arrival while SRL believed it
    // owed from the appointment. Scotlynn runs the clock from appointment time;
    // Landstar from arrival-plus-notification; an earlier draft here used "later
    // of arrival or appointment", which adversarial review showed is wrong in
    // BOTH directions — it pays for a carrier's own lateness (money the shipper
    // will correctly refuse to reimburse) and pays nothing when a driver arrives
    // early to help and is taken before the appointment. This wording mirrors
    // the on-time gate the TONU clause below already applies, so one rule
    // governs both rather than two different ones on one page.
    // v3.8.ars — the conversion sentence is the point of raising the cap to
    // equal the layover rate. Without it the two instruments could both bill the
    // same hours: an overnight hold would collect the $250 cap AND $250 layover
    // for one day. Landstar's published tariff makes layover explicitly ADDITIVE
    // to detention, so a carrier citing the only public tariff in the corpus
    // would win that argument against a document that stayed silent.
    // v3.8.asc — the three figures in this clause are interpolated, not typed.
    // They were correct, but this is the sentence a carrier signs, and it was the
    // last place stating the cap, the layover rate and the notice window as prose
    // literals. If policy moves and this string does not, SRL is contractually
    // bound to the old number on every document already in a carrier's inbox.
    `Accessorial charges require SRL's prior written approval (operations@silkroutelogistics.ai). Detention free time starts when you arrive, and runs separately at each stop. Detention is not payable if you arrive outside your appointment window. At the $${DETENTION_CAP_PER_STOP} per stop cap detention converts to layover at $${LAYOVER_RATE_PER_DAY} per day; the two do not stack for the same hours. Notify SRL by call or text at least ${DETENTION_NOTICE_MINUTES} minutes before detention begins and again on departure.`,
    // v3.8.arp — TONU qualification. SRL priced TONU at $200 and printed no rule
    // for earning it, so a carrier who dispatched and drove 90 miles and one who
    // never left the yard had identical claims. Two gates, per Wasi 2026-08-14.
    // Gate 1 is the only TONU condition found verbatim on a real rate
    // confirmation (TQL PO# 33614902: no TONU "UNLESS TQL HAS PROVIDED THE
    // CARRIER WITH LOAD DETAILS ... AND APPROVED THE CARRIER TO BEGIN DRIVING").
    // Gate 2 is Wasi's Bison rule. They are deliberately NOT a strict AND: a
    // cancellation while the driver is still en route would otherwise deny a
    // carrier who did everything right, which is the bad-faith pattern the
    // research flagged. Arrival only gates the case where arrival happened.
    // Notice is satisfiable by TEXT precisely because §6 business hours are
    // Mon-Fri 7-7 — a voicemail at 6pm Friday must not cost a carrier $200.
    "TONU: payable only if SRL gave you the pickup number and shipper address and cleared you to head to pickup, and SRL or the shipper then cancels. If you already arrived, you must have been inside your appointment window. Not payable if you cancel, or if your trailer is rejected as non-compliant. Call or text SRL before you leave.",
    // v3.8.asc — the 24 is interpolated. It had four independent copies: here, the
    // Broker-Carrier Agreement §5, the Compass document-timeliness grading window,
    // and PAPERWORK_DUE_HOURS itself. CLAUDE.md §9 instructs that a change to one
    // "must move the other in the same commit" — an instruction only needed because
    // nothing enforced it. Now three of the four read the constant.
    `Carrier shall report any discrepancy between this Rate Confirmation and the Bill of Lading to SRL before proceeding. Signed BOL, POD, and supporting paperwork are due within ${PAPERWORK_DUE_HOURS} hours of delivery.`,
  ];
  // v3.8.arl — customTerms APPENDS; it must never REPLACE the mandatory core.
  // Pre-arl this read `(fd.customTerms) || governingClauses.join()`, so the
  // first AE to set per-load custom terms would ship a Rate Confirmation with
  // NO governing clauses at all: no BCA incorporation, no acceptance clause, no
  // accessorial prior-approval requirement, no paperwork deadline. The core
  // block is now always printed and per-load additions append under their own
  // heading.
  const customAddendum = (fd.customTerms as string | undefined)?.trim();
  const governingBody = customAddendum
    ? governingClauses.join("\n") + "\nADDITIONAL TERMS FOR THIS LOAD: " + customAddendum
    : governingClauses.join("\n");

  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg2);
  // v3.8.arm — page-2 blocks run tighter (lineGap 1→0.5, gap 14→10). The
  // maximal fixture (long special instructions + per-load custom terms +
  // reefer temperature block, all at once) overflowed the footer rule by ~18pt
  // once DOCK & DISPATCH and TEMPERATURE CONTROL landed. A terms page tolerates
  // bottom whitespace in the common case far better than it tolerates a body
  // line rendering through the footer, so the compression is unconditional
  // rather than an adaptive shave.
  doc.text(governingBody, MARGIN, y, { width: CONTENT_W, lineGap: 0.5, paragraphGap: 1.5 });
  y = doc.y + 10;

  // ── v3.8.arm — TEMPERATURE CONTROL (conditional) ────────────────────────
  // Renders only on temp-controlled loads, same conditional pattern as the
  // BOL's hazmat contact line. Setpoint + run mode appear on 4 of 4 real rate
  // confirmations in the retrieved corpus; SRL had no temperature semantics on
  // the document at all. The BOL-mismatch instruction is the operationally
  // important half: it stops a driver signing a bill that contradicts the
  // tender, which is where cold-chain claims are won or lost.
  if (isTempControlled) {
    const tempRangeStr =
      typeof loadTempMin === "number" && typeof loadTempMax === "number"
        ? String(loadTempMin) + "°F to " + String(loadTempMax) + "°F"
        : tempRaw || (typeof tempSetpointResolved === "number" ? String(tempSetpointResolved) + "°F" : "per bill of lading");
    doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
    rcEnsureRoom(60);
    doc.text("TEMPERATURE CONTROL", MARGIN, y, { characterSpacing: 7 * 0.08, lineBreak: false });
    y += 12;
    doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg2);
    doc.text(
      // v3.8.art — the numbers now print on page 1 in the EQUIPMENT block, so
      // this block carries only what page 1 cannot: the conflict procedure and
      // the download. Repeating the setpoint here invited the two to drift.
      // Transervice inverts the authority ("Always refer to BOL for the required
      // reefer temperature ... obtain written confirmation of the correct
      // temperature from the shipper"); SRL asserts its own number and stops the
      // driver instead, which suits a broker whose customer set the spec.
      "Set point and run mode are on page 1 under EQUIPMENT. Run continuous, not cycle-sentry, unless this Rate Confirmation says otherwise in writing. Pre-cool the trailer before loading. If the BOL shows a different temperature than this Rate Confirmation, do not sign it and do not load. Call (269) 220-6760 and SRL will confirm the correct temperature with the shipper in writing. Download the reefer at delivery and send it with your paperwork.",
      MARGIN, y, { width: CONTENT_W, lineGap: 0.5 },
    );
    y = doc.y + 10;
  }

  // ── v3.8.arl — INVOICING ────────────────────────────────────────────────
  // Present on 5 of 5 reference rate confirmations (Greatwide, MoLo, Steam,
  // Transervice) and absent from BOTH the SRL rate confirmation and the BCA —
  // a genuine gap, not something the counsel-confirmed architecture moved.
  // The RC previously told a carrier WHEN paperwork was due but never where to
  // send it, what to attach, or when the payment clock starts. That left an
  // undefined clock underneath a PUBLISHED §8 Net-30/21/14 commitment.
  // Operational only: no new contractual obligation is created here.
  doc.font(FONT_BODY_BOLD, 7).fillColor(TOKENS.goldDark);
  // v3.8.arp — reserve INVOICING (~90pt) plus the anti-fraud line and tender
  // banner (~62pt) that follow it, so the payment instructions never split
  // across a page. Deliberately NOT sized to include the signature block: that
  // has its own guard below, and reserving for both here pushed every case to
  // three pages with page 2 nearly empty.
  rcEnsureRoom(160);
  doc.text("INVOICING", MARGIN, y, { characterSpacing: 7 * 0.08, lineBreak: false });
  y += 12;

  const invoiceMcRaw = String(
    fd.carrierMcNumber || load.carrier?.carrierProfile?.mcNumber || "",
  ).replace(/^MC-?/i, "").trim();
  const invoiceSubject = invoiceMcRaw
    ? "Subject: Invoice · Load " + stem + " · MC " + invoiceMcRaw
    : "Subject: Invoice · Load " + stem;

  const invoiceLines = [
    "Send to: accounting@silkroutelogistics.ai",
    invoiceSubject,
    // v3.8.art — the signed Rate Confirmation joins the packet. Allen Lund makes
    // it a hard gate ("FINAL PAYMENT CANNOT BE MADE WITHOUT A SIGNED COPY OF THE
    // BILL OF LADING AND A SIGNED COPY OF THE RATE CONFIRMATION"); MoLo and
    // Schneider both require the document returned with the invoice. SRL printed
    // a signature block and never said where to send it, so it asked for a
    // signature it could not collect.
    "Attach a signed copy of this Rate Confirmation, the signed BOL, a clean POD, and original receipts for any approved lumper or accessorial charge.",
    "Put the SRL load number on the invoice. One invoice per load; do not batch loads onto one invoice.",
    // v3.8.art — Steam: "Your invoice should match the final Rate Confirmation
    // sent from Steam. Any invoice that does not match ... may be disputed and
    // delayed. Please contact your broker before invoicing." Preventing the
    // mismatch is cheaper than adjudicating it.
    "Your invoice must match this Rate Confirmation. If you think a figure here is wrong, call SRL before you invoice rather than billing a different number.",
    "Payment terms run from the date SRL receives a complete packet. An incomplete packet does not start the clock.",
  ].join("\n");

  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg2);
  doc.text(invoiceLines, MARGIN, y, { width: CONTENT_W, lineGap: 0.5, paragraphGap: 1.5 });
  y = doc.y + 10;

  // ── v3.8.arl — anti-fraud domain anchor ─────────────────────────────────
  // The verify URL (Sprint 51, Item 129) is genuinely ahead of the field —
  // none of the 5 reference rate confirmations had one — but it has a
  // structural hole: a forger impersonating SRL prints their OWN lookalike
  // verify URL and it resolves against their own site. Anchoring the sending
  // domain, and directing a suspicious carrier to the number on our FMCSA
  // record rather than the number printed here, is what makes the control
  // mean something. The last sentence is deliberately self-distrusting:
  // every contact detail on a forged rate confirmation is chosen by the forger.
  doc.font(FONT_BODY, 6.75).fillColor(TOKENS.fg3);
  doc.text(
    // v3.8.arp — reworded from a NEGATION to an ESCALATION. This line used to
    // read "do not call the number printed on this document", which flatly
    // contradicted the two places on page 1 that tell a driver to call
    // (269) 220-6760 the moment something looks wrong. On a legitimate document
    // that made the fastest correct action look forbidden; the contradiction was
    // the defect, not the number. Wasi's call (2026-08-14): keep the number.
    // The independent-verification path still exists for the case it was written
    // for — a FORGED rate confirmation, where every printed contact detail is
    // the forger's — but now as a second step rather than a denial of the first.
    "SRL sends rate confirmations only from @silkroutelogistics.ai. We will never change our remit-to address or banking details by email. If anything here looks wrong, call SRL at (269) 220-6760. If you have any doubt this document is genuine, verify us independently against our FMCSA record for MC# 1794414 before you move the freight.",
    MARGIN, y, { width: CONTENT_W, lineGap: 0.5 },
  );
  y = doc.y + 12;

  // Tender expiration banner (Sprint 48 Item 108) — surfaces tender SLA
  // deadline above signature block so carrier sees expiry at point of
  // commitment. Defensive: renders ONLY when active tender exists with
  // expiresAt > now. <2h until expiry escalates from warning (amber) to
  // danger (red). Semantic colors per CLAUDE.md §2.1 (no TOKENS export for
  // these yet — inline hex avoids skill-canonical drift).
  const activeTender = load.tenders?.find((t) =>
    (t.status === "OFFERED" || t.status === "ACCEPTED")
    && new Date(t.expiresAt) > new Date(),
  );
  if (activeTender) {
    const expiresAt = new Date(activeTender.expiresAt);
    const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    const isUrgent = hoursUntilExpiry < 2;
    const bannerBg = isUrgent ? "#F6E3E3" : "#FBEFD4";
    const bannerFg = isUrgent ? "#9B2C2C" : "#B07A1A";
    const bannerH = 28;
    doc.save()
      .fillColor(bannerBg)
      .strokeColor(bannerFg)
      .lineWidth(1)
      .roundedRect(MARGIN, y, CONTENT_W, bannerH, 6)
      .fillAndStroke()
      .restore();
    const expiryStr = expiresAt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    doc.font(FONT_BODY_BOLD, 9).fillColor(bannerFg);
    doc.text(
      `TENDER EXPIRES: ${expiryStr}${isUrgent ? "  ·  URGENT" : ""}`,
      MARGIN,
      y + 9,
      { width: CONTENT_W, align: "center", lineBreak: false },
    );
    y += bannerH + 12;
  }

  // Signature — RATE_CON_SIGNATURE_ROLES (1 block: Carrier Acceptance only,
  // not the BOL three-block pattern; skill canonical for Rate Cons)
  // Sprint 48.c (Item 117) — pre-fill CARRIER LEGAL NAME / MC # / DOT # from
  // the same hybrid sources used by the page-1 CARRIER · ASSIGNED block.
  // Carrier writes only AUTHORIZED SIGNATORY / TITLE / SIGNATURE / DATE at
  // signing time. Industry-standard RC pattern (CHR / Coyote / RXO).
  const sigPrefill: Record<string, string> = {};
  if (carrierName && carrierName !== "—") sigPrefill["CARRIER LEGAL NAME"] = carrierName;
  if (carrierMc && carrierMc !== "—") sigPrefill["MC #"] = carrierMc;
  if (carrierDot && carrierDot !== "—") sigPrefill["DOT #"] = carrierDot;
  // Sprint 49.b (Item 139) — block height 180 → 210 to accommodate 26pt
  // row spacing × 7 RC fields = 182pt + certification + label header.
  //
  // v3.8.arp — the signature block must never straddle a page boundary. It is
  // the tallest element on the document and the one a carrier signs; half a
  // signature block at the foot of one page with the ruled fields on the next
  // is how a returned copy comes back unsigned. 214 = the declared 210 height
  // (which already covers the CARRIER · ACCEPTANCE label — measured 508.5 to
  // ~700 in a rendered doc) plus 4pt of slack. An earlier 232 padded for a
  // label header twice and tipped every fixture to three pages with page 2
  // nearly empty, which is the opposite of the problem being solved.
  // v3.8.art — 214 -> 232 to reserve the return-instruction line below the block.
  rcEnsureRoom(232);
  drawSignatureBlock(doc, y, {
    roles: RATE_CON_SIGNATURE_ROLES,
    height: 210,
    prefilledValues: sigPrefill,
  });

  // v3.8.art — close the signature loop. SRL printed a 7-field acceptance block
  // and gave no return channel, so it asked for a signature it had no way to
  // collect, then fell back to arguing whether dispatch occurred. Greatwide:
  // "Carrier must sign load confirmation and fax back to agency at ...". MoLo:
  // "Please sign and return to MoLo". Allen Lund: "PRINT & SIGN THIS PAGE and
  // then EMAIL to ...". 3 of 7 name a return channel; SRL named none.
  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg2);
  doc.text(
    "Sign and return this page to operations@silkroutelogistics.ai before dispatch. A signed copy also travels with your invoice.",
    MARGIN, y + 214, { width: CONTENT_W, lineGap: 0.5 },
  );

  // v3.8.aro — stamp every buffered page with a truthful "Page N of M". Before
  // this the total was the literal 2, so any third page would have shipped with
  // no footer at all: no gold rule, no MC#/DOT#, no page number. A carrier
  // holding an unnumbered page cannot tell whether they received the whole
  // document, which matters on a document that incorporates the BCA by
  // reference and carries a signature block.
  const rcPages = doc.bufferedPageRange();
  for (let i = 0; i < rcPages.count; i++) {
    doc.switchToPage(rcPages.start + i);
    // "unversioned" rather than blank or today's constant: rate confirmations
    // issued before v3.8.awm were issued under terms nobody recorded, and the
    // document should say so instead of implying a version it cannot prove.
    drawFooter(doc, {
      pageNum: i + 1,
      totalPages: rcPages.count,
      docId,
      termsVersion: fd.rcTermsVersion || "unversioned",
    });
  }
  doc.flushPages();

  doc.end();
  return doc;
}

/**
 * Shipper-facing Load Confirmation PDF — omits all carrier cost/rate information.
 */
/**
 * v3.8.aqg — Shipper Load Confirmation migrated onto the SRL skill chrome
 * (Sprint 45-RC3): compass header, meta strip (reference / date / equipment /
 * commodity / weight / agreed rate), the SHIPPER + CONSIGNEE parties block, a
 * wrapped Special Instructions panel, and a two-party AUTHORIZED-BY / SHIPPER
 * signature block. Customer-facing — shows the agreed shipper rate only, never
 * carrier cost.
 */
export function generateShipperLoadConfirmation(load: EnhancedRCLoadData, formData: Record<string, any>): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  registerSkillFonts(doc);
  const fd = formData || {};

  const money = (n: number) =>
    `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d?: Date | string | null) => {
    if (!d) return "—";
    if (typeof d === "string") return d;
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };
  const smallLabel = (text: string, x: number, ly: number, size = 7) =>
    doc.font(FONT_BODY_BOLD, size).fillColor(TOKENS.goldDark)
       .text(text.toUpperCase(), x, ly, { characterSpacing: 0.8, lineBreak: false });

  const SHIPPER_LC_SIGNATURE_ROLES: SignatureRole[] = [
    { title: "AUTHORIZED BY · SILK ROUTE LOGISTICS", certification: "Broker confirms this booking at the agreed rate.", fields: ["PRINT NAME", "TITLE", "SIGNATURE", "DATE"] },
    { title: "ACKNOWLEDGED BY · SHIPPER", certification: "Shipper acknowledges the booking terms above.", fields: ["PRINT NAME", "TITLE", "SIGNATURE", "DATE"] },
  ];

  // Shipper-facing Load Confirmation. This is the booking acknowledgement, not
  // one of the five numbered documents, so it carries the bare load stem with no
  // suffix — inventing a sixth letter for it would be scope the scheme has not
  // ratified. It now resolves the stem through the shared rule (loadNumber, then
  // referenceNumber) instead of preferring the AE-editable formData copy.
  const docId = resolveLoadStem(load) ?? "";
  const shipperRate = Number(fd.customerRate ?? (load as any).customerRate ?? 0);

  // Header
  let y = drawHeaderFirstPage(doc, {
    docTitle: "Load Confirmation",
    subtitle: "Shipper Copy · Booking Confirmation",
    loadId: docId,
    includeQr: false,
  });

  // Meta strip
  y = drawMetaStrip(
    doc,
    {
      "REFERENCE": docId,
      "DATE": fmtDate(new Date()),
      "EQUIPMENT": fd.equipmentType || load.equipmentType,
      "COMMODITY": fd.commodity || load.commodity || "General Freight",
      "WEIGHT": load.weight ? `${load.weight.toLocaleString()} lbs` : null,
      "AGREED RATE": money(shipperRate),
    },
    y,
  );
  y += 12;

  // Parties (shipper / origin + consignee / destination)
  const shipperCity = `${fd.shipperCity || load.customer?.city || load.originCity}, ${fd.shipperState || load.customer?.state || load.originState} ${fd.shipperZip || load.customer?.zip || load.originZip || ""}`.trim();
  const consigneeCity = `${fd.consigneeCity || load.destCity}, ${fd.consigneeState || load.destState} ${fd.consigneeZip || load.destZip || ""}`.trim();
  const shipper: Party = {
    name: fd.shipperName || load.customer?.name || `${load.originCity}, ${load.originState}`,
    addressLines: [fd.shipperAddress || load.customer?.address || "", shipperCity].filter(Boolean),
    window: `Pickup ${fmtDate(fd.pickupDate || load.pickupDate)}${fd.pickupTimeWindow ? " · " + fd.pickupTimeWindow : ""}`,
  };
  const consignee: Party = {
    name: fd.consigneeName || `${load.destCity}, ${load.destState}`,
    addressLines: [fd.consigneeAddress || "", consigneeCity].filter(Boolean),
    window: `Delivery ${fmtDate(fd.deliveryDate || load.deliveryDate)}${fd.deliveryTimeWindow ? " · " + fd.deliveryTimeWindow : ""}`,
  };
  y = drawPartiesBlock(doc, shipper, consignee, y, 100);
  y += 14;

  // Special Instructions (wrapped cream-2 panel)
  const rawInstr = fd.specialInstructions || load.specialInstructions || load.notes;
  if (rawInstr) {
    const text = decodeHtmlEntities(String(rawInstr));
    const boxW = CONTENT_W;
    const textH = doc.font(FONT_BODY, 9).heightOfString(text, { width: boxW - 24 });
    const boxH = 26 + textH + 10;
    doc.save().fillColor(TOKENS.cream2).strokeColor(TOKENS.border1).lineWidth(0.5)
       .roundedRect(MARGIN, y, boxW, boxH, 6).fillAndStroke().restore();
    smallLabel("SPECIAL INSTRUCTIONS", MARGIN + 10, y + 8, 7);
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg1).text(text, MARGIN + 12, y + 24, { width: boxW - 24 });
    y += boxH + 14;
  }

  // Authorization signatures (Broker + Shipper)
  y = drawSignatureBlock(doc, y, { roles: SHIPPER_LC_SIGNATURE_ROLES, height: 118 });

  drawFooter(doc, { pageNum: 1, totalPages: 1, docId });
  doc.end();
  return doc;
}

interface InvoiceLineItemData {
  description: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  invoiceNumber: string;
  /** Customer-facing document number (SRL-121485I, or …S for a supplemental),
   *  allocated at invoice creation. Optional so the email-attach path and older
   *  rows still type; absent falls back to the internal INV- sequence. */
  srlDocNumber?: string | null;
  invoiceKind?: "BASE" | "SUPPLEMENTAL" | null;
  amount: number; status: string;
  lineHaulAmount?: number | null; fuelSurchargeAmount?: number | null;
  accessorialsAmount?: number | null; totalAmount?: number | null;
  factoringFee?: number | null; advanceAmount?: number | null; paidAmount?: number | null;
  dueDate?: Date | null; createdAt: Date;
  load: {
    referenceNumber: string; loadNumber?: string | null;
    originCity: string; originState: string;
    // ARC 21 — `rate` dropped: this invoice renderer never printed it, and
    // the caller no longer selects it. The invoice total comes from the
    // invoice, not from the load.
    destCity: string; destState: string;
    pickupDate: Date; deliveryDate: Date;
    customer?: {
      name?: string | null; contactName?: string | null;
      billingContactName?: string | null; paymentTerms?: string | null;
      address?: string | null; city?: string | null; state?: string | null; zip?: string | null;
      billingAddress?: string | null; billingCity?: string | null; billingState?: string | null; billingZip?: string | null;
    } | null;
  };
  user?: { firstName: string; lastName: string; company?: string | null } | null;
  lineItems?: InvoiceLineItemData[];
}

/**
 * v3.8.aqg — Invoice migrated onto the SRL skill chrome (Sprint 45-RC2),
 * matching the Rate Confirmation register: Playfair/DM Sans fonts + ligature
 * suppression (via registerSkillFonts), compass header, meta strip, lane
 * reference, BILL TO + CHARGES (from the structured line-haul / FSC /
 * accessorial columns the old plain layout ignored), optional balance-due
 * summary, REMIT TO, and a wire payment reference. Degrades gracefully when
 * customer/user are absent (e.g. the email-attach path) — no crash.
 */
export function generateInvoicePDF(invoice: InvoiceData): PDFDoc {
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  registerSkillFonts(doc);

  const fmtDate = (d?: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;
  const titleCase = (s: string) =>
    (s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const cust = invoice.load.customer;
  const terms = (cust?.paymentTerms || "Net 30").trim();
  // Customer-facing number, which is NOT invoiceNumber: that column is the
  // internal accounting sequence (INV-<n>) owned by lib/invoiceNumber.ts and is
  // deliberately left alone. The customer sees the SRL stem so this invoice
  // files with its own BOL and rate con.
  const docId =
    documentNumberFor(
      invoice.srlDocNumber,
      invoice.load,
      invoice.invoiceKind === "SUPPLEMENTAL" ? "SUPPLEMENTAL_INVOICE" : "INVOICE",
    ) ?? invoice.invoiceNumber;

  // Header (REFERENCE mode — no QR; invoice # in the upper-right filing slot)
  let y = drawHeaderFirstPage(doc, {
    docTitle: "Invoice",
    subtitle: "Accounts Receivable",
    loadId: docId,
    includeQr: false,
  });

  // Meta strip
  y = drawMetaStrip(
    doc,
    {
      "DATE ISSUED": fmtDate(invoice.createdAt),
      "INVOICE #": invoice.invoiceNumber,
      "LOAD REF": invoice.load.referenceNumber,
      "TERMS": terms,
      "DUE DATE": fmtDate(invoice.dueDate),
      "STATUS": titleCase(invoice.status),
    },
    y,
  );
  y += 12;

  // Lane reference (origin → destination with dates)
  y = drawLaneReferenceRow(
    doc,
    `${invoice.load.originCity}, ${invoice.load.originState}`,
    `Pickup ${fmtDate(invoice.load.pickupDate) ?? "—"}`,
    `${invoice.load.destCity}, ${invoice.load.destState}`,
    `Delivery ${fmtDate(invoice.load.deliveryDate) ?? "—"}`,
    y,
  );
  y += 8;

  // BILL TO (left) + CHARGES (right)
  const billName =
    cust?.billingContactName?.trim() ||
    cust?.name?.trim() ||
    invoice.user?.company?.trim() ||
    (invoice.user ? `${invoice.user.firstName} ${invoice.user.lastName}`.trim() : "") ||
    "Customer";
  const addrLines = (a?: string | null, c?: string | null, s?: string | null, z?: string | null): string[] => {
    const street = (a || "").trim();
    const cityLine = ([c, s].filter((v) => v && v.trim()).join(", ") + (z && z.trim() ? ` ${z.trim()}` : "")).trim();
    return [street, cityLine].filter(Boolean);
  };
  let billLines = addrLines(cust?.billingAddress, cust?.billingCity, cust?.billingState, cust?.billingZip);
  if (!billLines.length) billLines = addrLines(cust?.address, cust?.city, cust?.state, cust?.zip);
  const attn = cust?.contactName?.trim();
  const billTo: BillTo = {
    name: billName,
    addressLines: billLines.length ? billLines : ["—"],
    attention: attn && attn !== billName ? attn : undefined,
  };
  const billBottom = drawBillToBlock(doc, billTo, y);

  // Charges — prefer the structured line-haul / FSC / accessorial columns
  // (the old plain layout ignored them). Fall back to line items, then rate.
  const charges: InvoiceCharge[] = [];
  if (invoice.lineHaulAmount != null) charges.push({ label: "Line Haul", amount: invoice.lineHaulAmount });
  if (invoice.fuelSurchargeAmount != null && invoice.fuelSurchargeAmount > 0)
    charges.push({ label: "Fuel Surcharge", amount: invoice.fuelSurchargeAmount });
  if (invoice.accessorialsAmount != null && invoice.accessorialsAmount > 0)
    charges.push({ label: "Accessorials", amount: invoice.accessorialsAmount });
  if (charges.length === 0 && invoice.lineItems && invoice.lineItems.length) {
    for (const li of invoice.lineItems)
      charges.push({ label: li.description || li.type.replace(/_/g, " "), amount: li.amount });
  }
  if (charges.length === 0)
    // ARC 21 — an invoice bills the CUSTOMER, so its line haul is the customer
  // rate. The load's legacy column is gone from this interface entirely.
  charges.push({ label: "Line Haul", amount: invoice.totalAmount ?? invoice.amount });
  const chargesBottom = drawChargesBlock(doc, charges, y, 280);

  y = Math.max(billBottom, chargesBottom) + 16;

  // Partial-payment balance-due summary, when applicable
  if (invoice.paidAmount != null && invoice.paidAmount > 0) {
    const invTotal = invoice.totalAmount ?? invoice.amount;
    y = drawSettlementSummary(doc, invTotal, invoice.paidAmount, y, 280);
    y += 8;
  }

  // REMIT TO (Silk Route Logistics). COMPANY.address is already the full
  // one-line address (street + city/state/zip), so don't repeat cityStateZip.
  y = drawRemitToBlock(
    doc,
    { legalName: COMPANY.name, mailAddress: [COMPANY.address, COMPANY.email] },
    y,
  );
  y += 6;

  // Wire payment reference memo
  y = drawPaymentReference(
    doc,
    (cust?.name || billName).slice(0, 20),
    invoice.load.referenceNumber,
    invoice.invoiceNumber,
    y,
  );
  y += 4;

  doc.font(FONT_BODY_ITALIC, 8.5).fillColor(TOKENS.fg3)
     .text(`Please remit payment per terms (${terms}). Questions: ${COMPANY.email}.`, MARGIN, y, {
       width: CONTENT_W,
       lineBreak: true,
     });

  drawFooter(doc, { pageNum: 1, totalPages: 1, docId });
  doc.end();
  return doc;
}

// ─── Settlement PDF ──────────────────────────────────

interface SettlementPDFData {
  settlementNumber: string;
  periodStart: Date;
  periodEnd: Date;
  period: string;
  grossPay: number;
  deductions: number;
  netSettlement: number;
  status: string;
  carrier: { firstName: string; lastName: string; company?: string | null };
  carrierPays: {
    // v3.8.asg — the per-load settlement document number (SRL-121485P).
    //
    // Optional because a settlement can legitimately span loads created before
    // the numbering scheme, and because a load with no stem cannot have one. The
    // row falls back to the load reference rather than printing a blank cell.
    srlDocNumber?: string | null;
    load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; pickupDate: Date; deliveryDate: Date };
    amount: number;
    quickPayDiscount: number | null;
    netAmount: number;
  }[];
}

/**
 * v3.8.aqg — Carrier Settlement migrated onto the SRL skill chrome (Sprint
 * 45-RC3): compass header, meta strip, PAY TO (carrier), a paginated
 * navy-banded loads table with per-page continuation headers, and a hand-built
 * Net Settlement summary panel (Gross Pay / Quick Pay Discount / Other
 * Deductions → Net) in the RC's doc-specific-composite register.
 */
export function generateSettlementPDF(settlement: SettlementPDFData): PDFDoc {
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  registerSkillFonts(doc);

  const money = (n: number) =>
    `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d?: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
  // Compact (no year) — used for the period-range start so it fits its meta cell.
  const fmtDateShort = (d?: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
  const titleCase = (s: string) =>
    (s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const smallLabel = (text: string, x: number, ly: number, size = 6.5) =>
    doc.font(FONT_BODY_BOLD, size).fillColor(TOKENS.goldDark)
       .text(text.toUpperCase(), x, ly, { characterSpacing: 0.8, lineBreak: false });

  const docId = settlement.settlementNumber;
  const carrierName =
    settlement.carrier.company?.trim() ||
    `${settlement.carrier.firstName} ${settlement.carrier.lastName}`.trim() ||
    "Carrier";
  const totalGross = settlement.carrierPays.reduce((s, cp) => s + cp.amount, 0);
  const quickPayTotal = settlement.carrierPays.reduce((s, cp) => s + (cp.quickPayDiscount || 0), 0);
  const otherDeductions = Math.max(0, settlement.deductions - quickPayTotal);

  // v3.8.asg — the first column carries the per-load settlement document number
  // when the load has one. The …P number CONTAINS the load reference
  // (SRL-121485 -> SRL-121485P), so nothing is lost by preferring it and the
  // carrier gets the exact string to quote when querying one line of a rollup.
  //
  // Column width is unchanged at 92pt deliberately: one extra character on a
  // reference that already fits. The cells draw with lineBreak:false, so a value
  // wider than its column overprints the next one rather than wrapping — do not
  // widen the value further without re-measuring.
  const headers = ["LOAD / DOC #", "LANE", "DELIVERED", "GROSS PAY"];
  const colWidths = [92, 268, 92, 88];
  const rows = settlement.carrierPays.map((cp) => [
    cp.srlDocNumber || cp.load.referenceNumber,
    `${cp.load.originCity}, ${cp.load.originState} → ${cp.load.destCity}, ${cp.load.destState}`,
    fmtDate(cp.load.deliveryDate),
    money(cp.amount),
  ]);
  const rowH = 18;
  const headerH = 16;
  const FOOTER_TOP = PAGE_H - MARGIN - 30;
  const SUMMARY_H = 120; // reserved on the page where the table ends
  const CONT_TOP = MARGIN + 52; // ~ drawContinuationHeader return

  // Page 1 header + meta + PAY TO
  let y = drawHeaderFirstPage(doc, {
    docTitle: "Carrier Settlement",
    subtitle: "Statement of Account",
    loadId: docId,
    includeQr: false,
  });
  y = drawMetaStrip(
    doc,
    {
      "SETTLEMENT #": settlement.settlementNumber,
      "PERIOD": `${fmtDateShort(settlement.periodStart)} – ${fmtDate(settlement.periodEnd)}`,
      "CYCLE": titleCase(settlement.period),
      "LOADS": String(settlement.carrierPays.length),
      "STATUS": titleCase(settlement.status),
    },
    y,
  );
  y += 12;
  smallLabel("PAY TO", MARGIN, y, 7);
  doc.font(FONT_BODY_BOLD, 12).fillColor(TOKENS.navy).text(carrierName, MARGIN, y + 14, { lineBreak: false });
  y += 34;

  // Paginate the loads table (reserve summary space on the ending page)
  const capacity = (topY: number) => Math.max(1, Math.floor((FOOTER_TOP - SUMMARY_H - topY - headerH) / rowH));
  const chunks: string[][][] = [];
  let idx = 0;
  let topY = y;
  while (idx < rows.length) {
    const cap = capacity(topY);
    chunks.push(rows.slice(idx, idx + cap));
    idx += cap;
    topY = CONT_TOP;
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  for (let p = 0; p < chunks.length; p++) {
    const isLast = p === chunks.length - 1;
    const tableTop = p === 0 ? y : drawContinuationHeader(doc, "Carrier Settlement", docId);
    const tableBottom = drawShipmentTable(doc, {
      headers,
      rows: chunks[p],
      totalsRow: isLast ? ["", "", "Total Gross", money(totalGross)] : undefined,
      yTop: tableTop,
      colWidths,
    });

    if (isLast) {
      // Net Settlement summary panel (right) + payment note (left)
      const sumW = 280;
      const sumX = PAGE_W - MARGIN - sumW;
      const sy = tableBottom + 10;
      const summaryRows: [string, number][] = [["Gross Pay", settlement.grossPay || totalGross]];
      if (quickPayTotal > 0) summaryRows.push(["Quick Pay Discount", -quickPayTotal]);
      if (otherDeductions > 0) summaryRows.push(["Other Deductions", -otherDeductions]);
      const panelH = 16 + summaryRows.length * 16 + 26;

      doc.save().fillColor(TOKENS.cream2).strokeColor(TOKENS.border1).lineWidth(0.5)
         .roundedRect(sumX, sy, sumW, panelH, 6).fillAndStroke().restore();

      let ry = sy + 14;
      for (const [label, amt] of summaryRows) {
        doc.font(FONT_BODY, 10).fillColor(TOKENS.fg2).text(label, sumX + 12, ry, { lineBreak: false });
        const str = (amt < 0 ? "-" : "") + money(Math.abs(amt));
        doc.font(FONT_BODY, 10).fillColor(TOKENS.fg1);
        const w = doc.widthOfString(str);
        doc.text(str, sumX + sumW - 12 - w, ry, { lineBreak: false });
        ry += 16;
      }
      doc.save().strokeColor(TOKENS.goldDark).lineWidth(0.6)
         .moveTo(sumX + 12, ry - 3).lineTo(sumX + sumW - 12, ry - 3).stroke().restore();
      ry += 4;
      doc.font(FONT_BODY_BOLD, 11).fillColor(TOKENS.goldDark).text("Net Settlement", sumX + 12, ry, { lineBreak: false });
      doc.font(FONT_BODY_BOLD, 12);
      const netStr = money(settlement.netSettlement);
      const netW = doc.widthOfString(netStr);
      doc.text(netStr, sumX + sumW - 12 - netW, ry, { lineBreak: false });

      smallLabel("PAYMENT", MARGIN, sy, 7);
      doc.font(FONT_BODY_ITALIC, 8.5).fillColor(TOKENS.fg3)
         .text(
           `Remitted via ACH or check per your Quick Pay election and standard terms. Questions: ${COMPANY.email}.`,
           MARGIN, sy + 14, { width: sumX - MARGIN - 20, lineBreak: true },
         );
    }

    drawFooter(doc, { pageNum: p + 1, totalPages, docId });
    if (!isLast) doc.addPage();
  }

  doc.end();
  return doc;
}

/** Generate invoice PDF and return as Buffer */
export async function generateInvoicePdf(invoice: InvoiceData): Promise<Buffer> {
  const doc = generateInvoicePDF(invoice);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
