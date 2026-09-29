import PDFDocument from "pdfkit";
import { INSURANCE_MINIMUMS, formatMinimum } from "../lib/insurancePolicy";
import * as path from "path";
import * as fs from "fs";
import bwipjs from "bwip-js";
import { PackageType } from "@prisma/client";
import { calculateMileage, MileageResult } from "./mileageService";
import { log } from "../lib/logger";
import { generateBOLQRBuffer } from "../utils/qrGenerator";
import type { ResolvedStopContacts } from "../lib/stopContact";
import { BOL_TEMPLATE_VERSION, RC_TEMPLATE_VERSION } from "../lib/documentTemplateVersions";
import { formatStopWindow } from "../lib/stopWindow";
import { documentDate } from "../lib/documentDate";
import { decodeHtmlEntities } from "../utils/htmlEntities";
// ONE derivation rule for every document identifier this file prints. These are
// pure reads: the number is allocated and persisted where the document is
// CREATED, never here, so regenerating a PDF reproduces the same number.
import {
  documentDigits,
  documentNumberFor,
  printedLoadNumber,
  resolveLoadStem,
  type LoadStemSource,
} from "../lib/documentNumber";
// Skill chrome library imported from backend/src/lib/srl-chrome.ts (mirrored
// from .claude/skills/srl-brand-design/scripts/srl_chrome.ts at session HEAD;
// manually sync when the skill ships canonical updates).
//
// EVERY GENERATOR IN THIS FILE IS NOW ON THE SHARED CHROME. Invoice and
// Settlement migrated at v3.8.aqg; the Bill of Lading at v3.8.baf-bak. This
// comment used to say the BOL "keeps its inline canonical until its dedicated
// migration sprint" — that sprint has happened and closed.
//
// WHAT THE BOL TOOK, AND WHAT IT DID NOT. It draws the letterhead
// (drawHeaderFirstPage, includeQr), the footer (drawFooter, footerY override)
// and its fonts (registerSkillFonts) from the chrome, so every future fix to
// those reaches it. Its BODY — meta strip, parties block, shipment table,
// signature strip — stays here as v2.10 body canon (v2.9 through v3.8.bhq; the
// version marker lives ONLY in these comments, because the BOL renders none —
// see the note below), because those four
// are genuinely different components from the chrome primitives that share
// their names, and one of them differs in compliance content rather than
// styling. §13.3 carries the ruling and the measurements.
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
  drawSectionHeading,
  paymentReferenceHeight,
  drawLaneReferenceRow,
  FONT_BODY,
  FONT_BODY_BOLD,
  FONT_BODY_ITALIC,
  FONT_DISPLAY_BOLD,
  FONT_DISPLAY_ITALIC,
  drawCompassMark,
  BRAND,
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
  ACCOUNTING_EMAIL,
  COMPLIANCE_EMAIL,
  DOMAIN,
  MC_NUMBER,
  DOT_NUMBER,
} from "../config/authority";
import {
  rcCountersignStatement,
  type RcCountersign,
} from "../lib/rcCountersign";
import { mcDigits } from "../lib/mcNumber";

// The load reference a page prints (§21.2, corrected 2026-09-26). A page whose
// own number is in the bare scheme (it begins with the load's digits) or that
// has no number yet prints the digits: 121494. A page issued before the scheme
// (SRL-121494R, INV-…) gets null, and its caller keeps the reference that page
// was issued with, so a regenerated copy still matches the one already sent.
function bareLoadRef(docNumber: string | null | undefined, load: LoadStemSource): string | null {
  const digits = documentDigits(resolveLoadStem(load));
  if (!digits) return null;
  return !docNumber || docNumber.startsWith(digits) ? digits : null;
}

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
// v3.8.bmy — that rule moved to lib/mcNumber (mcDigits) unchanged, so every
// surface that prints a carrier's MC number shares it; this was the only one
// that had it right.
function normalizeDotNumber(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).replace(/^DOT[-#\s]*(?=\d)/i, "").trim();
}

function labelValue(doc: PDFDoc, label: string, value: string, x: number, y: number) {
  doc.fontSize(8).fillColor("#888888").text(label, x, y);
  doc.fontSize(10).fillColor("#1E1E2F").text(value || "—", x, y + 12);
}

// v3.8.baf — the legacy shipment-keyed BOL generator and its ShipmentData
// shape were deleted here.
//
// It rendered from a Shipment row rather than a Load, and its only caller was
// GET /pdf/bol/:shipmentId, which nothing reached: every frontend surface —
// the carrier my-loads page, the AE load board, the shipper detail drawer —
// calls /pdf/bol-load/:loadId, and so do both fit gates, the render pin and
// the ligature test. Zero callers across backend/src, frontend/src and e2e.
//
// It also carried no v2.9 chrome. A second, older-looking bill of lading
// reachable by URL is the document drift this migration exists to end, and
// it would have been the one document the shared chrome never reached.
//
// generateBOLFromLoad below is now the only BOL generator.
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
  /** Resolved dock contacts (lib/stopContact). The assembler fills this; the
   *  renderer reads ONLY this. Absent = blank handwrite lines. */
  stopContacts?: ResolvedStopContacts | null;
  destCompany?: string | null;
  destAddress?: string | null; destCity: string; destState: string; destZip: string;
  destContactName?: string | null; destContactPhone?: string | null;
  shipperFacility?: string | null; consigneeFacility?: string | null;
  // v3.8.d.1 — schema-honest PO/reference chain. Order Builder writes
  // poNumbers[0]; legacy paths populate one of shipperReference /
  // shipperPoNumber / customerRef. Render walks the chain.
  /** Per-side appointments (v3.8.bhy). `appointmentNumber` is the legacy
   *  single column and is the delivery-side fallback. */
  pickupAppointment?: string | null;
  deliveryAppointment?: string | null;
  appointmentNumber?: string | null;
  pallets?: number | null;
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

  // v3.8.bai — the local ligature monkey-patch was deleted here.
  //
  // It disabled liga/clig/rlig/dlig on every doc.text call, because fontkit
  // substitutes an fi ligature that renders "Confirmation" as "Confrmation"
  // in Playfair. registerSkillFonts has carried the identical patch since
  // v3.8.abg, when the same bug surfaced on the Rate Confirmation — so this
  // was a second copy of one fix, and the copy is the thing that drifts.
  const M = 34;
  const R = 612 - M;
  const CW = R - M;

  // Canonical tokens (CLAUDE.md §2.1)
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

  // v3.8.bai — the nine registerFont calls became registerSkillFonts.
  //
  // IDENTICAL FILES. The chrome registers the same nine faces from the same
  // backend/src/assets/fonts/bol-v2.9 directory, so this is a deletion of a
  // duplicate rather than a change of typeface — which is why this is the one
  // commit of the migration where the render pin is expected NOT to move.
  // It also brings the ligature suppression the patch above used to do.
  registerSkillFonts(doc);

  // Text-safety wrapper: decode HTML entities from form input. Ligature
  // handling is done separately via the doc.text monkey-patch above
  // (features: ["kern"] disables `liga` substitution at the fontkit layout
  // layer) — we do NOT insert ZWNJ here because U+200C renders as a visible
  // narrow glyph in Playfair/DM Sans italic variants, causing "classified"
  // to render as "classiflied".
  const safe = (s: string | null | undefined): string =>
    decodeHtmlEntities(s ?? "");

  // v2.10 (ruling 5) — AN EMPTY FIELD RENDERS BLANK.
  //
  // The v2.9 spec filled empty free-text fields with a bracketed italic label:
  // `[Shipper Facility]`, `[Street Address]`, `[City, ST ZIP]`. On a screen
  // that reads as "you have not filled this in". On the document a driver
  // carries to a dock it reads as a template nobody finished — the same
  // complaint as the `[HH:MM–HH:MM]` window, and the same answer: print what
  // is known and leave the rest as space somebody can write in.
  const fieldOrBlank = (val: string | null | undefined): string => safe(val).trim();

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
    ? load.pickupDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : String(load.pickupDate);
  const deliveryDateFmt = load.deliveryDate instanceof Date
    ? load.deliveryDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : String(load.deliveryDate);
  const MIDDOT = "·";
  const TIMES = "×";
  // Windows come from lib/stopWindow, shared with the rate confirmation. An
  // end-with-no-start now prints ("by 14:00" is a real delivery shape) where
  // the old expression silently dropped it.
  const pickupWin = formatStopWindow(load.pickupTimeStart, load.pickupTimeEnd);
  const deliveryWin = formatStopWindow(load.deliveryTimeStart, load.deliveryTimeEnd);

  // ========================= PAGE 1 =========================
  // PDFKit: Y=0 is TOP, increases downward.

  // v3.8.baj — THE LETTERHEAD IS SHARED. Compass, company block, tagline, QR
  // frame, TRACK label, document number and the gold rule all come from
  // drawHeaderFirstPage — the same call the Rate Confirmation and Invoice make.
  //
  // WHAT CHANGED VISUALLY: the 84pt logo.png raster becomes the 72pt drawn
  // compass mark. That is the operational register, and it is why this
  // commit's render pin moves.
  //
  // WHY yTop IS 18 AND NOT MARGIN. The chrome puts its rule at yTop + 80; the
  // BOL's sat at 98, so 18 lands it exactly where v2.9 had it and every body
  // anchor below is undisturbed. Passing MARGIN would push the whole body down
  // 18pt on a document fit-gated to ONE page whose adaptive budget already
  // saturates at four line items. The letterhead is therefore identical to the
  // RC and Invoice in COMPOSITION and sits 18pt higher on the page — the only
  // arrangement under which both halves of the parity criterion hold.
  //
  // The title row is NOT taken from the chrome: it draws 22pt at MARGIN, the
  // BOL's is 24pt at 34. Both are body geometry, both v2.10 canon.
  //
  // THE BOL CARRIES NO RENDERED TEMPLATE VERSION. "v2.10" exists only in these
  // comments and in the anchor baseline, so a stored BOL cannot be asked which
  // template drew it. Keeping archived BOLs "version-faithful" is therefore a
  // convention — not to regenerate them — rather than something the document
  // can prove about itself. Banked; adding a marker is its own change.
  const headerBottom = drawHeaderFirstPage(doc, {
    includeQr: true,
    qrBuffer: qrBuffer ?? undefined,
    loadId: bolNum,
    yTop: 18,
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

  // The gold rule is drawn by drawHeaderFirstPage above; headerBottom is the
  // y just beneath it, matching what `headerBandH + 2` then `+= 10` produced.
  let y = headerBottom;

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
    placeholder: string | null; // v2.10: retained for the cell inventory; an absent value renders blank
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
    { label: "LOAD REF", raw: bareLoadRef(bolNum, load) ?? load.referenceNumber, placeholder: null },
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

    // v2.10 (ruling 5) — an empty cell is EMPTY. It used to print either a
    // bracketed italic label or an em-dash; both are marks a reader has to
    // interpret, and on a dock the honest rendering of "we do not have this"
    // is space to write it in. The label above the cell already names it.
    const trimmed = safe(c.raw).trim();
    if (trimmed) {
      doc.font("DMSans-Medium").fontSize(9.5).fillColor(NAVY)
        .text(trimmed, mx + 6, metaTop + 18, { width: cw6 - 10, lineBreak: false });
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
      ? fieldOrBlank(load.originCompany || load.shipperFacility || load.customer?.name)
      : fieldOrBlank(load.destCompany || load.consigneeFacility);
    // §3.9 sanctions the customer ADDRESS as a last resort when the origin
    // fields are empty — and only the address. The billing CONTACT is never a
    // fallback anywhere on this document; see lib/stopContact.
    const addr = side === "shipper"
      ? fieldOrBlank(load.originAddress || load.customer?.address)
      : fieldOrBlank(load.destAddress);
    const city = side === "shipper" ? load.originCity : load.destCity;
    const state = side === "shipper" ? load.originState : load.destState;
    const zip = side === "shipper" ? load.originZip : load.destZip;
    const cityLine = fieldOrBlank(city && state ? `${city}, ${state} ${zip ?? ""}` : "");
    // WHO IS AT THE DOCK — decided by lib/stopContact, never here.
    //
    // This read was `load.originContactName || load.customer?.contactName`, so
    // a load carrying no stop contact printed the customer's BILLING contact on
    // the shipper line. Production 2026-09-23: SRL-121497 prints "Monika Pape",
    // Beekeepers' accounts-payable contact, on the document that sends a driver
    // to Steuart Nutrition's dock in Erlanger. The fallback is gone, and the
    // resolver exposes no tier that could reach a billing contact.
    //
    // The resolver also carries an email; the BOL prints name and phone only.
    // A driver at a gate phones. This line is `lineBreak: false` at
    // partiesInnerW, so a third field risks overrunning the column — the rate
    // confirmation is where the address is printed.
    const resolvedContact = side === "shipper"
      ? load.stopContacts?.shipper
      : load.stopContacts?.consignee;
    const contactName = safe(resolvedContact?.name).trim();
    const contactPhone = safe(resolvedContact?.phone).trim();
    // Nothing resolved leaves a blank handwrite line, which somebody at the dock
    // can fill in. A name nobody there recognises cannot be corrected by anyone
    // who reads it.
    const contact = (contactName || contactPhone)
      ? `Contact: ${[contactName, contactPhone].filter(Boolean).join(`  ${MIDDOT}  `)}`
      : "Contact:";
    const dateFmt = side === "shipper" ? pickupDateFmt : deliveryDateFmt;
    const win = side === "shipper" ? pickupWin : deliveryWin;
    // NO PLACEHOLDER REACHES THE PAGE (ruling 3). This printed a literal
    // `[HH:MM–HH:MM]` when the load carried no window — 4 of 7 live loads on
    // production 2026-09-23, SRL-121497 among them. A driver reading it sees a
    // form nobody finished, on the document that sends them to a dock. With no
    // time recorded the line is the date, which is the whole of what we know.
    // The appointment rides the window line rather than taking a row of its
    // own. Measured: the party block is a FIXED 92pt and the five rows already
    // in it end at ~86pt, so a sixth row overflows the box and pushes text past
    // its own border. Appended, the worst realistic line measures 219.4pt
    // against 254pt of column — it fits, and every downstream anchor stays put.
    // The side is named by the column the line sits in (SHIPPER / CONSIGNEE),
    // the same way Contact and Window already are.
    // Delivery falls back to the legacy single column, which is where loads
    // created before the split still carry their number.
    const appt = side === "shipper"
      ? safe(load.pickupAppointment).trim()
      : safe(load.deliveryAppointment ?? load.appointmentNumber).trim();
    const apptText = appt ? `  ${MIDDOT}  Appt: ${appt}` : "";
    const windowText = win
      ? `Window: ${dateFmt}  ${MIDDOT}  ${win}${apptText}`
      : `Window: ${dateFmt}${apptText}`;

    let ly = cy;
    // One styling per line now: with no bracketed placeholder there is no
    // placeholder STATE to signal, so the italic/gold variants are gone. Row
    // advances are unchanged, so an empty line leaves its space rather than
    // collapsing the block — which is what makes it writable at the dock.
    doc.font("Playfair-Bold")
      .fontSize(11).fillColor(NAVY)
      .text(facility, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 16;

    doc.font("DMSans-Italic")
      .fontSize(8.25).fillColor(FG_2)
      .text(addr, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 11;

    doc.font("DMSans-Italic")
      .fontSize(8.25).fillColor(FG_2)
      .text(cityLine, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 13;

    doc.font("DMSans-Regular")
      .fontSize(7.75).fillColor(FG_3)
      .text(contact, cx, ly, { width: partiesInnerW, lineBreak: false });
    ly += 11;

    // One styling, because there is no longer a placeholder state to signal.
    doc.font("DMSans-Regular")
      .fontSize(7.75).fillColor(FG_3)
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
    (l && w && h) ? `${l}"${TIMES}${w}"${TIMES}${h}"` : "";

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
      { text: safe(li.freightClass).trim(), placeholder: false },
      { text: safe(li.nmfcCode).trim(), placeholder: false },
      { text: li.hazmat ? "Yes" : "No", placeholder: false },
    ];
  };

  const buildFlatRow = (): Cell[] => {
    const pcsValueLocal = load.pieces != null ? String(load.pieces) : "";
    const dimsLocal = dimsStr(load.dimensionsLength, load.dimensionsWidth, load.dimensionsHeight);
    const weightStrLocal = load.weight ? `${load.weight.toLocaleString()} lb` : "";
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
      { text: safe(load.freightClass).trim(), placeholder: false },
      { text: "", placeholder: false },
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
  const totalPiecesStr = totalPieces > 0 ? String(totalPieces) : "";
  const totalWeightStr = totalWeight > 0 ? `${totalWeight.toLocaleString()} lb` : "";

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
        `+${overflowCount} additional line item${overflowCount === 1 ? "" : "s"}; full manifest attached`,
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
  // "None" rather than blank, deliberately: this is the one field where an
  // empty space invites somebody to write an instruction the carrier never
  // agreed to. Stating that there are none is the safer absence.
  const siDisplay = safe(load.specialInstructions || load.notes).trim() || "None";
  doc.font("DMSans-Italic").fontSize(8.25)
    .fillColor(FG_2)
    .text(siDisplay, M + 150, y + 9, {
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
  // v2.10 (ruling 3) — 7pt, not 7.75.
  //
  // MEASURED, not eyeballed: at 7.75 this run ended at x=448.4 and the
  // SHIPPER INITIAL block starts at x=450, so the two cleared each other by
  // 1.6pt. Every advance in this row is a constant and the string is a
  // literal, so that gap was deterministic — it never actually overprinted,
  // and the audit's "collision" was a misreading. But 1.6pt at 7.75pt type is
  // about half a sidebearing, which is why it READS as touching. Dropping to
  // 7pt buys real air without moving anything else on the row.
  doc.font("DMSans-Italic").fontSize(7).fillColor(FG_2)
    .text("(full Carmack liability applies)", rvCx, rvBaseY + 1, { lineBreak: false });

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
        const mcNo = mcDigits(safe(load.carrier?.carrierProfile?.mcNumber)) ?? "";
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
      cert: "Acknowledges delivery; any exceptions noted above.",
      render: (bx, cy) => {
        let by = cy;
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += SIG_ROW;
        drawSigField(bx, by, sigColW, "PRINT NAME", ""); by += SIG_ROW;
        const halfW = (sigColW - 8) / 2;
        const prValue = load.piecesReceived != null ? String(load.piecesReceived) : "";
        drawSigField(bx, by, halfW, "PIECES RECEIVED", prValue);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += SIG_ROW;

        // v2.10 (ruling 1c) — THE CONSIGNEE COLUMN CARRIES NO SECTION 7 TEXT,
        // and no other element carries it either. Section 7 non-recourse is a
        // CONSIGNOR election; printing it beneath the RECEIVER's signature
        // implied the receiver was agreeing to it, which is the defect this
        // removes.
        //
        // IT IS REMOVED RATHER THAN RELOCATED, because both candidate homes
        // were measured and neither fits (ruling 1, outcome c):
        //   (a) second row of the Released Value box — fit matrix 7/7 at one
        //       page, but the box grows 36->50 and the four elements below it
        //       (Per 49 U.S.C. and all three signature titles) drift exactly
        //       -14pt, failing anchor parity.
        //   (b) one line in the footer legal block — fails 7/7: maxContentY
        //       rises to 763-770 and crosses the footer rule (770) in three
        //       cases.
        // Four earlier shipper-block variants failed 6, 5, 3 and 7 of 7.
        //
        // BANKED: "Section 7 placement, pending counsel review." Whether the
        // clause must appear at all is a legal question, not a layout one --
        // it is optional under the Uniform Straight BOL and SRL is the broker,
        // not the carrier it would bind.
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

  // v3.8.bak — THE FOOTER IS THE MASTER. Gold rule, identity line, centred
  // tagline and page number all come from drawFooter, the same call every
  // other operational document makes.
  //
  // footerY 774, not 770. The chrome draws its rule at footerY - 4, so 774
  // lands the rule exactly on the BOL's fyLine and the identity line exactly
  // on its 778. The override exists for this document specifically: the BOL
  // is fit-gated to one page and the chrome default of 744 would have cost
  // 30pt of a ~67pt elasticity — roughly a row and a half of freight.
  //
  // The terms strip above stays local. It is not chrome: it is this
  // document's legal substance, dynamically anchored to the tallest
  // signature column so a future field addition moves it rather than
  // colliding with it.
  drawFooter(doc, {
    pageNum: 1, totalPages: 1, footerY: fyLine + 4,
    // v2.10 — the page now states which template drew it. It used to say so
    // only in a source comment, so a stored BOL could not be asked.
    templateVersion: BOL_TEMPLATE_VERSION,
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
    const legacyMc = mcDigits(load.carrier.carrierProfile?.mcNumber);
    if (legacyMc) doc.text(`MC#: ${legacyMc}`, 310, y + 14);
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
  /** Per-side appointments (v3.8.bhy). `appointmentNumber` is the legacy
   *  single column and is the delivery-side fallback. */
  pickupAppointment?: string | null;
  deliveryAppointment?: string | null;
  appointmentNumber?: string | null;
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
  carrier?: { firstName: string; lastName: string; company?: string | null; phone?: string | null; email?: string | null; carrierProfile?: { mcNumber?: string | null; dotNumber?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; contactPhone?: string | null } | null } | null;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null; email?: string | null } | null;
  // Sprint 48 (Item 108) — tender expiration banner data path. Active tender
  // is the latest OFFERED|ACCEPTED tender for this load; banner renders only
  // when expiresAt > now. Optional — older RCs that pre-date the controller
  // include extension still render cleanly without banner.
  tenders?: Array<{ expiresAt: Date; status: string }> | null;
  // Sprint 49 (Item 119) — AE header sub-line data path. poster is the AE
  // who created the load (canonical AE relation via Load.posterId → User).
  // Single-AE pre-Oct-2026 (Wasi); multi-AE deferred to future sprint.
  poster?: { firstName: string; lastName: string; phone?: string | null; email?: string | null } | null;
  // v3.8.bhq — `appointmentRequired` removed (ruling 7). It was declared here
  // as "Load.appointmentRequired (schema:2075)" and THERE IS NO SUCH FIELD ON
  // THE LOAD MODEL: schema line 2995 is customer_facilities.appointment_required.
  // So `load.appointmentRequired` was permanently undefined and the " · APPT"
  // suffix it drove could never fire from a load. The real flag lives on the
  // facility, reachable only through a link the load-creation path stopped
  // writing in May — banked at §13.3 with the linking regression it depends on.
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
  /** Resolved dock contacts (lib/stopContact). Filled by the assembler; the
   *  renderer reads ONLY this. Absent = the contact line is omitted. */
  stopContacts?: ResolvedStopContacts | null;
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
  /** v3.8.boe — Design System 3 fields. All optional: every caller that
   *  omits them renders the documented fallback, never a placeholder. */
  pallets?: number | null;
  hazmat?: boolean | null;
  hazmatClass?: string | null;
  cargoValue?: number | null;
  declaredValue?: number | null;
  pickupNumber?: string | null;
  shipperReference?: string | null;
  deliveryReference?: string | null;
  pickupInstructions?: string | null;
  deliveryInstructions?: string | null;
  driverInstructions?: string | null;
  loadStops?: Array<{
    stopNumber: number; stopType: string; facilityName?: string | null; address?: string | null;
    city: string; state: string; zip?: string | null; appointmentDate?: Date | string | null;
    appointmentTime?: string | null; appointmentRef?: string | null; hookType?: string | null;
    contactName?: string | null; contactPhone?: string | null; notes?: string | null;
  }> | null;
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
    // "24-hour notice without penalty" without naming the releasing party. It
    // must name the carrier when the rule is actually enforced by a writer —
    // nothing enforces it today.
    //
    // v3.8.azf — the figure above was 4 until W1/W2 widened the window to
    // twenty-four hours. The claim that "e2e/helpers/pdf.ts pins that string
    // character for character" was removed rather than updated: it was never
    // true. Grepping "notice without penalty" across e2e/, __tests__/ and
    // scripts/ returns nothing. What actually moves is the rate-confirmation
    // render pin, which hashes the whole document.
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
/**
 * The closing clause of every Rate Confirmation (v3.8.bls). Part of the terms:
 * changing it is a terms-version bump in lib/agreementVersions.
 *
 * The two acts that bind are exactly the two BCA Art. 24 names: electronic
 * acceptance, or pickup of the shipment (owner ruling 2026-09-28, closing
 * backlog Item 333(f)). The bls text also bound a carrier on dispatching a unit
 * or arriving at the pickup location. The BCA controls on a conflict, so those
 * two never bound anyone; they only made the page claim more than the
 * agreement does. The structure follows the industry "Agreement to be Bound"
 * clause the owner supplied: acceptance and transport bind even without a
 * signature, and the master agreement is incorporated by reference.
 */
export const RC_AGREEMENT_TO_BE_BOUND =
  "Carrier has read this entire Rate Confirmation. By accepting it electronically through SRL's signing link, or by " +
  "picking up the shipment, Carrier agrees to be bound by this Rate Confirmation, even without a signature on it, and " +
  "to comply with every rate, term, condition, special instruction and other requirement it contains. In addition to " +
  "the terms of this Rate Confirmation, this shipment is governed by the Broker-Carrier Agreement between SRL and " +
  "Carrier, which is incorporated in this Rate Confirmation by reference. A carrier that does not agree to every term " +
  "must decline the load and must not pick it up.";

export function generateEnhancedRateConfirmation(load: EnhancedRCLoadData, formData: Record<string, any>): PDFDoc {
  // v3.8.boe — Design System 3 rate confirmation (docs/design/rc-final). The
  // layout is the owner's final design; the CONTENT is the ratified one:
  // accessorial figures read lib/accessorialPolicy (never the design's retired
  // $50/$250), the Agreement to be Bound is RC_AGREEMENT_TO_BE_BOUND (bmx), the
  // Quick Pay row prints the election recorded for this load (ruling 1,
  // 2026-09-28), and everything the design dropped that the RC must carry is
  // kept on the terms pages: broker statement, BCA governs, BOL discrepancy,
  // dock and dispatch rules, insurance minimums, invoicing, the fraud notice,
  // the verify link, the countersignature and both version stamps.
  const fd = formData || {};
  const FLOOR = 734; // footer gold rule sits at 740
  const doc = new PDFDocument({ size: "LETTER", margin: 0, bufferPages: true });
  registerSkillFonts(doc);
  const SEMI = "DMSans-SemiBold";
  const X = MARGIN;
  const W = CONTENT_W;
  const docId = documentNumberFor(fd.rateConNumber, load, "RATE_CONFIRMATION") ?? "";
  const stem = bareLoadRef(docId, load) ?? resolveLoadStem(load) ?? "";
  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const policyMoney = (n: number) => money(n);

  // ── measuring helpers ────────────────────────────────────────────────────
  const textH = (s: string, font: string, size: number, width: number, lineGap = 0.6) => {
    doc.font(font, size);
    return doc.heightOfString(s, { width, lineGap });
  };
  const fit = (s: string, font: string, size: number, width: number): string => {
    doc.font(font, size);
    if (doc.widthOfString(s) <= width) return s;
    let t = s;
    while (t.length > 1 && doc.widthOfString(t + "…") > width) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  };
  const capsLabel = (s: string, x: number, y: number, size: number, color: string, opts: { width?: number; align?: "left" | "right" | "center" } = {}) => {
    doc.font(FONT_BODY_BOLD, size).fillColor(color);
    doc.text(s.toUpperCase(), x, y, { characterSpacing: size * 0.12, lineBreak: false, ...opts });
  };
  const sectionLabel = (s: string, y: number, right?: string): number => {
    capsLabel(s, X, y, 8, TOKENS.goldDark);
    if (right) {
      doc.font(FONT_BODY, 7).fillColor(TOKENS.navy);
      doc.text(right, X, y + 1, { width: W, align: "right", lineBreak: false });
    }
    return y + 14;
  };
  const hRule = (y: number, color: string, weight: number, x = X, w = W) => {
    doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(weight).strokeColor(color).stroke().restore();
  };

  // ── pagination ───────────────────────────────────────────────────────────
  let y = 0;
  const runningHeader = (): number => {
    const top = MARGIN;
    capsLabel(`${BRAND.legalName} · Rate Confirmation · Load ${stem}`, X, top, 7.5, TOKENS.navy);
    doc.font(FONT_BODY, 8).fillColor(TOKENS.navy);
    doc.text("Terms and conditions", X, top, { width: W, align: "right", lineBreak: false });
    hRule(top + 14, TOKENS.gold, 1.5);
    return top + 26;
  };
  const newPage = () => {
    doc.addPage();
    y = runningHeader();
  };
  const ensureRoom = (h: number) => {
    if (y + h > FLOOR) newPage();
  };

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — letterhead
  // ════════════════════════════════════════════════════════════════════════
  const LOGO = 56;
  drawCompassMark(doc, X, MARGIN, LOGO);
  const coX = X + LOGO + 14;
  doc.font(FONT_DISPLAY_BOLD, 15).fillColor(TOKENS.navy);
  doc.text(BRAND.legalName, coX, MARGIN + 1, { lineBreak: false });
  doc.font(FONT_BODY, 8).fillColor(TOKENS.fg2);
  doc.text(PRINCIPAL_ADDRESS_ONE_LINE, coX, MARGIN + 21, { lineBreak: false });
  doc.text(`+1 ${PHONE} · ${OPERATIONS_EMAIL}`, coX, MARGIN + 32, { lineBreak: false });
  doc.font(FONT_BODY_BOLD, 8).fillColor(TOKENS.navy);
  doc.text(`MC# ${MC_NUMBER} · USDOT# ${DOT_NUMBER}`, coX, MARGIN + 43, { lineBreak: false });
  doc.font(FONT_DISPLAY_ITALIC, 9).fillColor(TOKENS.goldDark);
  doc.text(BRAND.tagline, coX, MARGIN + 55, { lineBreak: false });

  // Right: load number, RC number, issued. No revision field (owner,
  // 2026-09-28); a re-issue already carries its own number (…R2) under
  // RC NUMBER, which is what a dispute needs.
  //
  // ISSUED is the issuance instant, which the countersign already records
  // (stamped once in sendRateConfirmation and the auto-issue path, and stored
  // in formData as JSON, so it can arrive as a string). Only a draft, which has
  // no countersign, falls back to the render time. Reading the clock here for
  // an issued RC would restate its issue time on every re-render.
  const csAt = (fd.rcCountersign as { at?: Date | string } | undefined)?.at;
  const csDate = csAt ? new Date(csAt) : null;
  const issuedAt = csDate && !Number.isNaN(csDate.getTime()) ? csDate : new Date();
  const issuedStr =
    issuedAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    issuedAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }) +
    " ET";
  capsLabel("Load number", X, MARGIN, 7, TOKENS.navy, { width: W, align: "right" });
  doc.font(FONT_BODY_BOLD, 17).fillColor(TOKENS.navy);
  doc.text(stem || "—", X, MARGIN + 10, { width: W, align: "right", lineBreak: false });
  const refColW = 118;
  const issuedX = X + W - refColW;
  const rcNoX = issuedX - 80;
  capsLabel("RC number", rcNoX, MARGIN + 36, 7, TOKENS.navy, { width: 72, align: "right" });
  capsLabel("Issued", issuedX, MARGIN + 36, 7, TOKENS.navy, { width: refColW, align: "right" });
  doc.font(FONT_BODY, 8.5).fillColor(TOKENS.navy);
  doc.text(docId || stem || "—", rcNoX, MARGIN + 47, { width: 72, align: "right", lineBreak: false });
  doc.text(issuedStr, issuedX, MARGIN + 47, { width: refColW, align: "right", lineBreak: false });
  hRule(MARGIN + LOGO + 12, TOKENS.gold, 1.5);
  y = MARGIN + LOGO + 22;

  // Title row
  doc.font(FONT_DISPLAY_BOLD, 24).fillColor(TOKENS.navy);
  doc.text("Rate Confirmation", X, y, { lineBreak: false });
  capsLabel("Carrier dispatch · Binding on acceptance", X, y + 12, 7.5, TOKENS.navy, { width: W, align: "right" });
  y += 30;
  if (load.id) {
    const verifyToken = rcVerifyToken({ id: load.id, referenceNumber: load.referenceNumber });
    doc.font(FONT_BODY, 7.5).fillColor(TOKENS.goldDark);
    doc.text(`Verify this RC: ${DOMAIN}/verify/${verifyToken}`, X, y, { lineBreak: false });
    y += 13;
  }
  y += 4;

  // ── carrier + shipment ───────────────────────────────────────────────────
  const COL_GAP = 24;
  const colW = (W - COL_GAP) / 2;
  const rightX = X + colW + COL_GAP;

  const carrierName = fd.carrierName
    || load.carrier?.company
    || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}`.trim() : "")
    || "—";
  const prof = load.carrier?.carrierProfile ?? null;
  const carrierStreet = fd.carrierAddress || prof?.address || "";
  const carrierCsz = fd.carrierCity
    ? `${fd.carrierCity}, ${fd.carrierState || ""} ${fd.carrierZip || ""}`.replace(/\s+/g, " ").trim()
    : prof?.city
      ? `${prof.city}, ${prof.state || ""} ${prof.zip || ""}`.replace(/\s+/g, " ").trim()
      : "";
  const carrierAddr = [carrierStreet, carrierCsz].filter(Boolean);
  const carrierDot = normalizeDotNumber(fd.carrierDotNumber || prof?.dotNumber) || "—";
  const carrierPhone = fd.carrierPhone || load.carrier?.phone || prof?.contactPhone || "—";
  const carrierContact = fd.carrierContact
    || fd.dispatcherName
    || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}`.trim() : "")
    || "—";

  // Shipment facts
  const equipment = fd.equipmentType || load.equipmentType || "—";
  const tempRaw = fd.tempRequirements ? String(fd.tempRequirements) : "";
  const tempMatch = tempRaw.match(/-?\d+(\.\d+)?/);
  const loadTempMin = load.tempMin;
  const loadTempMax = load.tempMax;
  const setpoint: number | undefined = tempMatch
    ? parseFloat(tempMatch[0])
    : typeof load.tempSetpoint === "number"
      ? load.tempSetpoint
      : typeof loadTempMin === "number" ? loadTempMin : undefined;
  const isTempControlled = Boolean(
    load.temperatureControlled === true || tempRaw || typeof load.tempSetpoint === "number" || typeof loadTempMin === "number",
  );
  const runMode = load.reeferContinuous === false ? "cycle" : "continuous";
  const tempSpec = isTempControlled
    ? typeof setpoint === "number"
      ? `${setpoint}°F ${runMode}`
      : typeof loadTempMin === "number" && typeof loadTempMax === "number"
        ? `${loadTempMin}°F to ${loadTempMax}°F`
        : "temperature per BOL"
    : "";
  const equipmentLine = tempSpec ? `${equipment} · ${tempSpec}` : equipment;
  const commodityName = fd.commodity || load.commodity || "General freight";
  const hazmat = Boolean(fd.hazmat ?? load.hazmat);
  const hazmatText = hazmat ? `Hazmat: Yes${load.hazmatClass ? ` (Class ${load.hazmatClass})` : ""}` : "Hazmat: No";
  const wt = (fd.weight as number | undefined) ?? load.weight ?? null;
  const pcs = (fd.pieces as number | undefined) ?? load.pieces ?? null;
  const pallets = (fd.pallets as number | undefined) ?? load.pallets ?? null;
  const weightParts = [
    wt ? `${Number(wt).toLocaleString("en-US")} lb` : null,
    pallets ? `${pallets} pallets` : pcs ? `${pcs} pcs` : null,
  ].filter(Boolean) as string[];
  const valueNum = (fd.cargoValue as number | undefined) ?? load.cargoValue ?? load.declaredValue ?? null;
  const miles = load.distance ?? null;

  // Stops. The load's stop list when it has one (multi-stop); otherwise the
  // origin and destination on the load. Per-stop contacts come from the
  // resolved dock contacts, never the billing customer (§3.9).
  type RcStop = {
    type: "Pickup" | "Delivery"; city: string; name: string; address: string; contact: string;
    date: string; window: string; appt: string; mode: string; refs: string; note: string;
  };
  const hookLabel = (h: string | null | undefined, type: "Pickup" | "Delivery") =>
    h === "DROP_HOOK" ? "Drop trailer" : h === "PRELOADED" ? "Preloaded trailer" : h === "LIVE_LOAD_UNLOAD" ? (type === "Pickup" ? "Live load" : "Live unload") : "";
  const pickupNumber = fd.pickupNumber || load.pickupNumber || "";
  const poList = (fd.poNumber ? [String(fd.poNumber)] : (load.poNumbers ?? [])).filter(Boolean);
  const poText = poList.length > 2 ? `${poList.slice(0, 2).join(", ")} +${poList.length - 2} more` : poList.join(", ");
  const pickupRefs = [
    pickupNumber ? `PU# ${pickupNumber}` : null,
    poText ? `PO ${poText}` : null,
    load.shipperReference ? `Shipper ref ${load.shipperReference}` : null,
  ].filter(Boolean).join(" · ");
  const deliveryRefs = [load.deliveryReference ? `Ref ${load.deliveryReference}` : null].filter(Boolean).join(" · ");

  const stops: RcStop[] = [];
  const loadStops = (load.loadStops ?? []).slice().sort((a, b) => a.stopNumber - b.stopNumber);
  if (loadStops.length >= 2) {
    loadStops.forEach((s, i) => {
      const type = s.stopType === "DELIVERY" ? "Delivery" : "Pickup";
      const csz = `${s.city}, ${s.state} ${s.zip || ""}`.trim();
      stops.push({
        type,
        city: `${s.city}, ${s.state}`,
        name: s.facilityName || (type === "Pickup" ? "Shipper" : "Consignee"),
        address: [s.address, csz].filter(Boolean).join(", "),
        contact: [s.contactName, s.contactPhone].filter(Boolean).join(" · "),
        date: documentDate(s.appointmentDate) ?? "",
        window: s.appointmentTime || "",
        appt: s.appointmentRef || "",
        mode: hookLabel(s.hookType, type),
        refs: i === 0 ? pickupRefs : i === loadStops.length - 1 && type === "Delivery" ? deliveryRefs : "",
        note: s.notes || "",
      });
    });
  } else {
    const shipResolved = load.stopContacts?.shipper;
    const consResolved = load.stopContacts?.consignee;
    const shipContact = [fd.shipperContact || shipResolved?.name, fd.shipperPhone || shipResolved?.phone].filter(Boolean).join(" · ");
    const consContact = [fd.consigneeContact || consResolved?.name, fd.consigneePhone || consResolved?.phone].filter(Boolean).join(" · ");
    const shipStreet = fd.shipperAddress || load.originAddress || "";
    const shipCsz = fd.shipperCity
      ? `${fd.shipperCity}, ${fd.shipperState || ""} ${fd.shipperZip || ""}`.replace(/\s+/g, " ").trim()
      : `${load.originCity}, ${load.originState} ${load.originZip}`;
    const consStreet = fd.consigneeAddress || load.destAddress || "";
    const consCsz = fd.consigneeCity
      ? `${fd.consigneeCity}, ${fd.consigneeState || ""} ${fd.consigneeZip || ""}`.replace(/\s+/g, " ").trim()
      : `${load.destCity}, ${load.destState} ${load.destZip}`;
    stops.push({
      type: "Pickup",
      city: `${load.originCity}, ${load.originState}`,
      name: fd.shipperName || load.originCompany || load.shipperFacility || "Shipper",
      address: [shipStreet, shipCsz].filter(Boolean).join(", "),
      contact: shipContact,
      date: documentDate(fd.pickupDate) ?? documentDate(load.pickupDate) ?? "",
      window: fd.pickupTimeWindow || formatStopWindow(load.pickupTimeStart, load.pickupTimeEnd) || "",
      appt: fd.pickupAppointment || load.pickupAppointment || "",
      mode: "",
      refs: pickupRefs,
      note: fd.pickupInstructions || load.pickupInstructions || "",
    });
    stops.push({
      type: "Delivery",
      city: `${load.destCity}, ${load.destState}`,
      name: fd.consigneeName || load.destCompany || load.consigneeFacility || "Consignee",
      address: [consStreet, consCsz].filter(Boolean).join(", "),
      contact: consContact,
      date: documentDate(fd.deliveryDate) ?? documentDate(load.deliveryDate) ?? "",
      window: fd.deliveryTimeWindow || formatStopWindow(load.deliveryTimeStart, load.deliveryTimeEnd) || "",
      appt: fd.deliveryAppointment || load.deliveryAppointment || load.appointmentNumber || "",
      mode: "",
      refs: deliveryRefs,
      note: fd.deliveryInstructions || load.deliveryInstructions || "",
    });
  }
  const many = stops.length > 2;
  const nPick = stops.filter((s) => s.type === "Pickup").length;
  const nDel = stops.length - nPick;

  // Column tops: section label, bold name, address lines.
  const drawColumnTop = (x: number, label: string, name: string, lines: string[]): number => {
    let cy = sectionLabel(label, y);
    doc.font(SEMI, 12).fillColor(TOKENS.navy);
    doc.text(fit(name, SEMI, 12, colW), x, cy, { lineBreak: false });
    cy += 16;
    doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2);
    for (const l of lines) {
      doc.text(fit(l, FONT_BODY, 9, colW), x, cy, { lineBreak: false });
      cy += 12;
    }
    return cy + 3;
  };
  // sectionLabel draws at X; draw the right label by hand.
  const carrierTopEnd = drawColumnTop(X, "Carrier", carrierName, carrierAddr.length ? carrierAddr : ["Address on file with SRL"]);
  capsLabel("Shipment", rightX, y, 8, TOKENS.goldDark);
  let sy = y + 14;
  doc.font(SEMI, 12).fillColor(TOKENS.navy);
  doc.text(fit(equipmentLine, SEMI, 12, colW), rightX, sy, { lineBreak: false });
  sy += 16;
  doc.font(FONT_BODY, 9).fillColor(TOKENS.fg2);
  doc.text(fit(`${commodityName} · ${hazmatText}`, FONT_BODY, 9, colW), rightX, sy, { lineBreak: false });
  sy += 12;
  doc.text("Exclusive use", rightX, sy, { lineBreak: false });
  sy += 15;
  const kvTop = Math.max(carrierTopEnd, sy);
  const KV_LABEL = 76;
  const kvRow = 13;
  const drawKv = (x: number, rows: [string, string][], h: number) => {
    doc.save().rect(x, kvTop, colW, h).fill(TOKENS.cream2).restore();
    doc.save().rect(x, kvTop, colW, 2).fill(TOKENS.gold).restore();
    rows.forEach(([k, v], i) => {
      const ry = kvTop + 9 + i * kvRow;
      capsLabel(k, x + 12, ry + 1, 7, TOKENS.navy);
      doc.font(FONT_BODY, 9).fillColor(TOKENS.navy);
      doc.text(fit(v, FONT_BODY, 9, colW - KV_LABEL - 24), x + 12 + KV_LABEL, ry, { lineBreak: false });
    });
  };
  const carrierRows: [string, string][] = [
    ["MC · USDOT", `MC# ${mcDigits(fd.carrierMcNumber || prof?.mcNumber) || "—"} · USDOT# ${carrierDot}`],
    ["Dispatch", carrierContact],
    ["Phone", carrierPhone],
  ];
  const shipmentRows: [string, string][] = [
    ["Weight", weightParts.join(" · ") || "—"],
    ["Value", typeof valueNum === "number" && valueNum > 0 ? money(valueNum).replace(/\.00$/, "") : "Not declared"],
    ["Distance", miles && miles > 0 ? `${Math.round(miles).toLocaleString("en-US")} mi` : "—"],
    ["Stops", `${stops.length} · ${nPick} ${nPick === 1 ? "pickup" : "pickups"}, ${nDel} ${nDel === 1 ? "delivery" : "deliveries"}`],
  ];
  const kvH = 12 + Math.max(carrierRows.length, shipmentRows.length) * kvRow;
  drawKv(X, carrierRows, kvH);
  drawKv(rightX, shipmentRows, kvH);
  y = kvTop + kvH + 12;

  // ── route and stops ──────────────────────────────────────────────────────
  const C1 = 40, GAP = 12;
  const restW = W - C1 - GAP * 3;
  const C2 = Math.round(restW * (2.1 / 5.8));
  const C3 = Math.round(restW * (1.3 / 5.8));
  const C4 = restW - C2 - C3;
  const x2 = X + C1 + GAP, x3 = x2 + C2 + GAP, x4 = x3 + C3 + GAP;
  const stopRowH = (s: RcStop): number => {
    const h2 = 13 + textH(s.address, FONT_BODY, 8.5, C2, 0.4) + (s.contact ? 11 : 0);
    const h3 = 13 + (s.window ? 11 : 0) + (s.appt ? 11 : 0);
    const h4 = (s.mode ? 12 : 0) + (s.refs ? textH(s.refs, FONT_BODY, 8.5, C4, 0.4) + 1 : 0) + (s.note ? textH(s.note, FONT_BODY_ITALIC, 8, C4, 0.4) + 2 : 0);
    return Math.max(many ? 30 : 34, h2, h3, h4) + (many ? 8 : 12);
  };
  ensureRoom(40 + stopRowH(stops[0]));
  hRule(y, TOKENS.borderStrong, 0.75);
  y += 9;
  const fromCity = stops[0]?.city ?? "";
  const toCity = stops[stops.length - 1]?.city ?? "";
  doc.font(FONT_BODY_BOLD, 10.5).fillColor(TOKENS.navy);
  const fromW = doc.widthOfString(fromCity);
  const toW = doc.widthOfString(toCity);
  doc.text(fromCity, X, y, { lineBreak: false });
  doc.text(toCity, X + W - toW, y, { lineBreak: false });
  const lineY = y + 6;
  const l0 = X + fromW + 10, l1 = X + W - toW - 10;
  const summary = `${miles && miles > 0 ? `${Math.round(miles).toLocaleString("en-US")} mi · ` : ""}${stops.length} stops`.toUpperCase();
  doc.font(FONT_BODY_BOLD, 7.5);
  const sumW = doc.widthOfString(summary) + summary.length * 7.5 * 0.12;
  const mid = (l0 + l1) / 2;
  doc.save().circle(l0 + 3, lineY, 3).fill(TOKENS.navy).restore();
  doc.save().circle(l1 - 3, lineY, 3).fill(TOKENS.navy).restore();
  doc.save().dash(2, { space: 2 }).lineWidth(0.75).strokeColor(TOKENS.gold)
    .moveTo(l0 + 8, lineY).lineTo(mid - sumW / 2 - 6, lineY).stroke()
    .moveTo(mid + sumW / 2 + 6, lineY).lineTo(l1 - 8, lineY).stroke().undash().restore();
  capsLabel(summary, mid - sumW / 2, lineY - 3.5, 7.5, TOKENS.goldDark);
  y += 20;

  stops.forEach((s, i) => {
    const rh = stopRowH(s);
    if (y + rh > FLOOR) newPage();
    if (i > 0) hRule(y, TOKENS.border2, 0.5);
    const ry = y + (many ? 5 : 7);
    const isPickup = s.type === "Pickup";
    doc.save().circle(X + 10, ry + 9, 9).fill(isPickup ? TOKENS.navy : TOKENS.gold).restore();
    doc.font(FONT_BODY_BOLD, 9.5).fillColor(isPickup ? TOKENS.white : TOKENS.navy);
    doc.text(String(i + 1), X + 1, ry + 4, { width: 18, align: "center", lineBreak: false });
    capsLabel(s.type, X, ry + 22, 6.5, TOKENS.goldDark);
    // facility
    doc.font(SEMI, 10).fillColor(TOKENS.navy);
    doc.text(fit(s.name, SEMI, 10, C2), x2, ry, { lineBreak: false });
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2);
    doc.text(s.address, x2, ry + 13, { width: C2, lineGap: 0.4 });
    let fy = doc.y;
    if (s.contact) {
      doc.text(fit(s.contact, FONT_BODY, 8.5, C2), x2, fy, { lineBreak: false });
      fy += 11;
    }
    // when
    doc.font(FONT_BODY_BOLD, 9.5).fillColor(TOKENS.navy);
    doc.text(s.date || "Date to be confirmed", x3, ry, { width: C3, lineBreak: false });
    let wy = ry + 13;
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2);
    if (s.window) { doc.text(fit(s.window, FONT_BODY, 8.5, C3), x3, wy, { lineBreak: false }); wy += 11; }
    if (s.appt) {
      doc.font(FONT_BODY_BOLD, 8).fillColor(TOKENS.goldDark);
      doc.text(fit(`Appt ${s.appt}`, FONT_BODY_BOLD, 8, C3), x3, wy, { lineBreak: false });
    }
    // service, refs, note
    let ny = ry;
    if (s.mode) {
      doc.font(FONT_BODY_BOLD, 8.5).fillColor(TOKENS.navy);
      doc.text(s.mode, x4, ny, { width: C4, lineBreak: false });
      ny += 12;
    }
    if (s.refs) {
      doc.font(FONT_BODY, 8.5).fillColor(TOKENS.navy);
      doc.text(s.refs, x4, ny, { width: C4, lineGap: 0.4 });
      ny = doc.y + 1;
    }
    if (s.note) {
      doc.font(FONT_BODY_ITALIC, 8).fillColor(TOKENS.fg2);
      doc.text(s.note, x4, ny, { width: C4, lineGap: 0.4 });
    }
    y += rh;
  });
  hRule(y, TOKENS.borderStrong, 0.75);
  y += 12;

  // ── rate + total card ────────────────────────────────────────────────────
  const linehaul = Number(fd.lineHaulRate ?? load.carrierRate ?? 0);
  const fsc = Number((fd.fuelSurcharge as number | undefined) ?? 0);
  const accs = (fd.accessorials as Array<{ description?: string; type?: string; amount: number }> | undefined) ?? [];
  const accSum = accs.reduce((s, a) => s + Number(a.amount || 0), 0);
  const totalCarrierPay = Number((fd.totalCharges as number | undefined) ?? (linehaul + fsc + accSum));

  const qpFeePct = typeof fd.quickPayFeePercent === "number" && fd.quickPayFeePercent > 0 ? fd.quickPayFeePercent : null;
  const qpSpeedRaw = typeof fd.quickPaySpeed === "string" ? fd.quickPaySpeed.toUpperCase() : null;
  const qpElected = qpFeePct !== null;
  const qpSameDay = qpSpeedRaw === "SAME_DAY";
  const qpLabel = qpElected ? (qpSameDay ? `${qpFeePct}% same day` : `${qpFeePct}% · 7-day`) : "Not elected";
  const qpFeeBase = accs.length === 0 ? linehaul + fsc : null;
  const qpFeeAmount = qpElected && qpFeeBase !== null ? Math.round(qpFeeBase * (qpFeePct as number)) / 100 : null;
  const tierUpper = (fd.carrierPaymentTier as string | undefined)?.toUpperCase();
  const tierLabel = tierUpper ? tierUpper.charAt(0) + tierUpper.slice(1).toLowerCase() : null;
  const termsLabel = fd.paymentTerms || "Net-30";

  const CARD_W = 170;
  const tableW = W - CARD_W - 24;
  const cardX = X + tableW + 24;
  const chargeRows: { d: string; note?: string; amt: string }[] = [
    {
      d: "Line haul",
      note: miles && miles > 0 && linehaul > 0 ? `${Math.round(miles).toLocaleString("en-US")} mi · ${money(linehaul / miles)} per mi` : undefined,
      amt: money(linehaul),
    },
  ];
  if (fsc > 0) chargeRows.push({ d: "Fuel surcharge", amt: money(fsc) });
  for (const a of accs) chargeRows.push({ d: a.description || a.type || "Accessorial", note: "Approved before dispatch", amt: money(Number(a.amount || 0)) });
  if (fsc <= 0 && accs.length === 0) chargeRows.push({ d: "Accessorials", note: "None pre-approved · see terms", amt: money(0) });
  const chargeRowH = (r: { note?: string }) => (r.note ? 24 : 16);
  const tableH = 14 + 6 + chargeRows.reduce((s, r) => s + chargeRowH(r), 0);

  const cardRows: [string, string][] = [
    ["Payment", tierLabel ? `${tierLabel} · ${termsLabel}` : termsLabel],
    ["Quick Pay", qpLabel],
  ];
  if (qpElected && qpFeeAmount !== null && qpFeeBase !== null) {
    cardRows.push(["Quick Pay fee", money(qpFeeAmount)]);
    cardRows.push(["Net on this rate", money(Math.round((qpFeeBase - qpFeeAmount) * 100) / 100)]);
  }
  const cardNote = qpElected
    ? "Fee applies to line haul, fuel and approved accessorials, less at-cost reimbursements."
    : tierLabel
      ? `No Quick Pay elected on this load. It pays on standard ${tierLabel} terms at no fee.`
      : "No Quick Pay elected on this load. It pays on your standard tier terms at no fee.";
  const cardNoteH = textH(cardNote, FONT_BODY, 7, CARD_W - 24, 0.4);
  const cardH = 10 + 28 + cardRows.length * 16 + 6 + cardNoteH + 10;
  const rateH = 14 + Math.max(tableH, cardH);
  ensureRoom(rateH + 4);

  sectionLabel("Carrier rate", y);
  capsLabel("Total carrier pay", cardX, y, 8, TOKENS.goldDark);
  const blockTop = y + 14;
  // charges table
  let ty = blockTop;
  capsLabel("Description", X, ty, 7, TOKENS.navy);
  capsLabel("Amount", X, ty, 7, TOKENS.navy, { width: tableW, align: "right" });
  ty += 11;
  hRule(ty, TOKENS.navy, 0.75, X, tableW);
  ty += 6;
  for (const r of chargeRows) {
    doc.font(SEMI, 10).fillColor(TOKENS.navy);
    doc.text(fit(r.d, SEMI, 10, tableW - 90), X, ty, { lineBreak: false });
    doc.font(FONT_BODY, 10).fillColor(TOKENS.navy);
    doc.text(r.amt, X, ty, { width: tableW, align: "right", lineBreak: false });
    if (r.note) {
      doc.font(FONT_BODY, 8).fillColor(TOKENS.fg2);
      doc.text(fit(r.note, FONT_BODY, 8, tableW - 90), X, ty + 12, { lineBreak: false });
    }
    ty += chargeRowH(r);
    hRule(ty - 3, TOKENS.border2, 0.5, X, tableW);
  }
  // card
  const cardH2 = Math.max(cardH, tableH);
  doc.save().rect(cardX, blockTop, CARD_W, cardH2).fillAndStroke(TOKENS.cream, TOKENS.border2).restore();
  doc.save().rect(cardX, blockTop, CARD_W, 1.5).fill(TOKENS.navy).restore();
  doc.font(FONT_BODY_BOLD, 22).fillColor(TOKENS.navy);
  doc.text(money(totalCarrierPay), cardX + 12, blockTop + 10, { width: CARD_W - 24, lineBreak: false });
  let cy = blockTop + 40;
  for (const [k, v] of cardRows) {
    hRule(cy, TOKENS.border1, 0.5, cardX + 12, CARD_W - 24);
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg2);
    doc.text(k, cardX + 12, cy + 4, { lineBreak: false });
    doc.font(FONT_BODY_BOLD, 8.5).fillColor(TOKENS.navy);
    doc.text(fit(v, FONT_BODY_BOLD, 8.5, CARD_W - 90), cardX + 12, cy + 4, { width: CARD_W - 24, align: "right", lineBreak: false });
    cy += 16;
  }
  doc.font(FONT_BODY, 7).fillColor(TOKENS.fg3);
  doc.text(cardNote, cardX + 12, cy + 4, { width: CARD_W - 24, lineGap: 0.4 });
  y = blockTop + Math.max(tableH, cardH2) + 12;

  // ── contacts ─────────────────────────────────────────────────────────────
  const aeName = load.poster ? `${load.poster.firstName} ${load.poster.lastName}`.trim() : "";
  const RIB_GAP = 10;
  const ribW = (W - RIB_GAP * 2) / 3;
  const ribbon: { label: string; bold: string; lines: string[]; small: string }[] = [
    {
      label: "Your SRL dispatcher",
      bold: aeName || "SRL Operations",
      lines: [load.poster?.phone || `+1 ${PHONE}`, load.poster?.email || OPERATIONS_EMAIL],
      small: "Call before heading to the shipper, at loading, at delivery. Any delay: call us before the customer.",
    },
    {
      label: "After hours · emergency",
      bold: `+1 ${PHONE}`,
      lines: ["Business hours Mon–Fri 7am–7pm ET"],
      small: "After-hours emergency line for loads in transit: breakdowns, accidents, appointment changes.",
    },
    {
      label: "Paperwork · claims",
      bold: OPERATIONS_EMAIL,
      lines: [`BOL, POD, receipts within ${PAPERWORK_DUE_HOURS} hours`],
      small: `Invoices: ${ACCOUNTING_EMAIL} · Claims: ${COMPLIANCE_EMAIL}`,
    },
  ];
  const ribInner = ribW - 20;
  const ribContentH = (r: (typeof ribbon)[number]) =>
    14 + 13 + r.lines.length * 11 + textH(r.small, FONT_BODY, 7, ribInner, 0.3) + 6;
  const ribH = Math.max(...ribbon.map(ribContentH));
  ensureRoom(ribH + 6);
  ribbon.forEach((r, i) => {
    const bx = X + i * (ribW + RIB_GAP);
    doc.save().rect(bx, y, ribW, ribH).lineWidth(0.5).strokeColor(TOKENS.border2).stroke().restore();
    doc.save().rect(bx, y, ribW, 14).fill(TOKENS.navy).restore();
    capsLabel(r.label, bx + 10, y + 4, 6.5, TOKENS.gold);
    const boldSize = doc.font(FONT_BODY_BOLD, 10).widthOfString(r.bold) <= ribInner ? 10 : 8.5;
    doc.font(FONT_BODY_BOLD, boldSize).fillColor(TOKENS.navy);
    doc.text(fit(r.bold, FONT_BODY_BOLD, boldSize, ribInner), bx + 10, y + 18, { lineBreak: false });
    let ly = y + 31;
    doc.font(FONT_BODY, 8).fillColor(TOKENS.fg2);
    for (const l of r.lines) {
      doc.text(fit(l, FONT_BODY, 8, ribInner), bx + 10, ly, { lineBreak: false });
      ly += 11;
    }
    doc.font(FONT_BODY, 7).fillColor(TOKENS.fg3);
    doc.text(r.small, bx + 10, ly + 1, { width: ribInner, lineGap: 0.3 });
  });
  y += ribH + 8;

  const finePrint =
    `This rate is inclusive of fuel and all accessorials unless listed above. Send the signed BOL, POD and lumper receipts to ` +
    `${OPERATIONS_EMAIL} within ${PAPERWORK_DUE_HOURS} hours of delivery, and your invoice to ${ACCOUNTING_EMAIL} as set out ` +
    `in the terms. Payment terms are tier-based under the Caravan Partner Program: Silver Net-30, Gold Net-21, Platinum ` +
    `Net-14. Quick Pay is governed by the Caravan Quick Pay Agreement. Terms and conditions follow.`;
  ensureRoom(textH(finePrint, FONT_BODY, 7.75, W, 0.5) + 2);
  doc.font(FONT_BODY, 7.75).fillColor(TOKENS.fg2);
  doc.text(finePrint, X, y, { width: W, lineGap: 0.5 });
  y = doc.y;

  // ════════════════════════════════════════════════════════════════════════
  // TERMS AND CONDITIONS
  // ════════════════════════════════════════════════════════════════════════
  if (doc.bufferedPageRange().count === 1) newPage();
  else y += 14;
  const KCOL = 112;
  const VCOL = W - KCOL - 10;

  // Accessorial terms — every figure from lib/accessorialPolicy.
  const accessorialRows: { item: string; rate: string; cond: string }[] = [
    {
      item: "Detention",
      rate: `${policyMoney(DETENTION_RATE_PER_HOUR)} per hour`,
      cond:
        `${DETENTION_FREE_HOURS} hours free at each stop from arrival; free time does not carry over between stops. Then ` +
        `${policyMoney(DETENTION_RATE_PER_HOUR)} per hour, capped at ${policyMoney(DETENTION_CAP_PER_STOP)} per stop. Not ` +
        `payable if Carrier arrived outside the appointment window. Carrier notifies SRL dispatch ${DETENTION_NOTICE_MINUTES} ` +
        `minutes before detention begins and again on departure. Have the facility write your in and out times on the BOL: ` +
        `no times on the BOL, no detention.`,
    },
    {
      item: "Layover",
      rate: `${policyMoney(LAYOVER_RATE_PER_DAY)} per day`,
      cond:
        `Where Carrier must stay overnight at SRL or shipper request through no fault of Carrier. Once detention reaches its ` +
        `${policyMoney(DETENTION_CAP_PER_STOP)} cap the first layover day begins; detention and layover do not both run for ` +
        `the same hours.`,
    },
    {
      item: "Truck order not used",
      rate: policyMoney(TONU_AMOUNT),
      cond:
        `Where SRL or the shipper cancels a confirmed load on the day of pickup or after Carrier has been dispatched. Not ` +
        `owed where cancellation results from Carrier's late arrival, non-compliant equipment, insurance lapse, or other ` +
        `Carrier breach. Call or text SRL before you leave for the shipper.`,
    },
    {
      item: "Carrier release window",
      rate: `${CARRIER_RELEASE_WINDOW_HOURS} hours before pickup`,
      cond:
        `Carrier may release the load without penalty by notice not less than ${CARRIER_RELEASE_WINDOW_HOURS} hours before ` +
        `the scheduled pickup appointment.`,
    },
    {
      item: "Lumper",
      rate: "At cost",
      cond:
        "Reimbursed at cost against a legible original receipt submitted with the delivery paperwork. No markup and no admin " +
        "fee. SRL issues no money codes, so dispatch authorization is required before the driver pays.",
    },
  ];
  const accRowH = (r: { cond: string }) => Math.max(26, textH(r.cond, FONT_BODY, 8.5, VCOL, 0.6)) + 9;
  ensureRoom(14 + 16 + accRowH(accessorialRows[0]));
  y = sectionLabel("Accessorial terms", y);
  capsLabel("Item · rate", X, y, 7, TOKENS.navy);
  capsLabel("Condition", X + KCOL + 10, y, 7, TOKENS.navy);
  y += 11;
  hRule(y, TOKENS.navy, 0.75);
  y += 5;
  for (const r of accessorialRows) {
    const rh = accRowH(r);
    if (y + rh > FLOOR) newPage();
    doc.font(FONT_BODY_BOLD, 8.5).fillColor(TOKENS.navy);
    doc.text(r.item, X, y, { width: KCOL, lineBreak: false });
    doc.font(SEMI, 8).fillColor(TOKENS.goldDark);
    doc.text(r.rate, X, y + 11, { width: KCOL, lineBreak: false });
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg1);
    doc.text(r.cond, X + KCOL + 10, y, { width: VCOL, lineGap: 0.6 });
    y += rh;
    hRule(y - 4, TOKENS.border2, 0.5);
  }
  y += 8;

  // Paragraph section (conditions, invoicing, special instructions).
  const paragraphs = (label: string, paras: string[], right?: string) => {
    const first = textH(paras[0], FONT_BODY, 8.5, W, 0.6);
    ensureRoom(14 + first);
    y = sectionLabel(label, y, right);
    paras.forEach((p, i) => {
      const h = textH(p, FONT_BODY, 8.5, W, 0.6);
      if (i > 0) ensureRoom(h);
      doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg1);
      doc.text(p, X, y, { width: W, lineGap: 0.6 });
      y = doc.y + 5;
    });
    y += 6;
  };

  paragraphs("Conditions", [
    `Silk Route Logistics Inc. is an FMCSA-licensed property broker (USDOT ${DOT_NUMBER}, MC# ${MC_NUMBER}). SRL arranges ` +
      `transportation. SRL does not transport freight. This Rate Confirmation is governed by the Broker-Carrier Agreement ` +
      `between Silk Route Logistics Inc. and Carrier (the “BCA”). In the event of conflict, the BCA controls.`,
    `Accessorial charges not listed above must be approved in writing by SRL dispatch (${OPERATIONS_EMAIL}) before they are ` +
      `incurred; unapproved charges will not be honored. Carrier shall not re-broker, assign, or subcontract this load, and ` +
      `SRL pays only the carrier named on page 1. Any change to rate, stops, or schedule is valid only when issued by SRL as ` +
      `a revised Rate Confirmation.`,
    `If Carrier will miss a pickup or delivery appointment for any reason, Carrier must notify SRL dispatch immediately and ` +
      `before contacting the customer. Where Carrier's late pickup or delivery, missed appointment, or documentation failure ` +
      `directly causes a documented customer chargeback, fine, or penalty, Carrier is liable for that amount, not to exceed ` +
      `the line-haul revenue of this load absent gross negligence. Carrier communicates driver available hours at booking and ` +
      `again when empty; where hours prevent on-time service SRL will adjust the schedule or release Carrier without penalty. ` +
      `The safe and legal operation of the vehicle supersedes any instruction from SRL or its customer.`,
    `Carrier shall report any discrepancy between this Rate Confirmation and the Bill of Lading to SRL before proceeding. ` +
      `Bring every issue to SRL, not to the shipper or receiver. Do not negotiate appointments, rates or accessorials with ` +
      `the facility.`,
  ], "BCA Art. 8, 24, 25");

  // Requirements: label / text rows.
  const tempRange =
    typeof loadTempMin === "number" && typeof loadTempMax === "number"
      ? `${loadTempMin}°F to ${loadTempMax}°F`
      : typeof setpoint === "number" ? `${setpoint}°F` : "the temperature on the BOL";
  const reqRows: [string, string][] = [
    [
      "Before dispatch",
      `Driver calls SRL dispatch before heading to the shipper. Check in at every stop as Silk Route Logistics, load ${stem}. ` +
        `The BOL must name SRL as broker; if it names another company or MC number, do not load and call (269) 220-6760. ` +
        `Trailer must be food grade, clean, dry, odor free, fully empty, and used exclusively for this load. No trailer that ` +
        `last hauled garbage, chemicals or hazmat. If it fails any of these, do not load.`,
    ],
    [
      "At the shipper",
      `Driver verifies load number, PO, and destination on the BOL before leaving. Seal is applied at origin and the seal ` +
        `number recorded on the BOL. Freight secured with a minimum of two load locks or straps. Carrier scales the load ` +
        `before departing and is responsible for legal weight. If the dock will not let you watch the load or count it, note ` +
        `that on the BOL before you sign and call SRL.`,
    ],
    [
      "In transit",
      (isTempControlled
        ? `Maintain ${tempRange} ${runMode} for the full transit; pre-cool the trailer before loading and download the reefer ` +
          `at delivery. If the BOL shows a different temperature than this Rate Confirmation, do not sign it and do not load; ` +
          `call SRL. `
        : "") +
        `Tracking for the duration of the load by any mutually agreed method: ELD integration, third-party platform, the ` +
        `Caravan carrier portal, driver location sharing, or check calls at pickup, in transit, and at delivery. Check calls ` +
        `by 8:00 AM Eastern daily in transit and on arrival at each stop; running late, call before the appointment. ` +
        `Check-call requests are answered within 30 minutes during business hours. Reseal after any stop where the doors open.`,
    ],
    [
      "At delivery",
      `A broken or missing seal must be reported to SRL dispatch before the doors open; the receiver removes the seal, not ` +
        `the driver. Overage, shortage, damage, accident, theft or any delay that puts delivery at risk: note it on the BOL ` +
        `and call SRL immediately, not at delivery. Signing a clean BOL says you received everything on it in good order. ` +
        `Signed BOL, POD, and supporting paperwork are due within ${PAPERWORK_DUE_HOURS} hours of delivery.`,
    ],
    [
      "Insurance",
      `Carrier keeps its insurance in force for the full duration of this load at or above these minimums: Cargo: ` +
        `${formatMinimum(INSURANCE_MINIMUMS.cargoInsurance)} · Auto liability: ${formatMinimum(INSURANCE_MINIMUMS.autoLiability)} · ` +
        `General liability: ${formatMinimum(INSURANCE_MINIMUMS.generalLiability)}, and notifies SRL at once of any ` +
        `cancellation or lapse.`,
    ],
    [
      "California",
      `Any equipment operating in California must comply with California Air Resources Board regulations, including the ` +
        `Truck and Bus Rule and TRU requirements. Carrier is responsible for resulting fines.`,
    ],
  ];
  const reqRowH = (t: string) => textH(t, FONT_BODY, 8.5, VCOL, 0.6) + 9;
  ensureRoom(14 + reqRowH(reqRows[0][1]));
  y = sectionLabel("Requirements", y, "BCA Art. 20 to 23");
  for (const [k, t] of reqRows) {
    const rh = reqRowH(t);
    if (y + rh > FLOOR) newPage();
    capsLabel(k, X, y + 1, 7.5, TOKENS.navy);
    doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg1);
    doc.text(t, X + KCOL + 10, y, { width: VCOL, lineGap: 0.6 });
    y += rh;
    hRule(y - 4, TOKENS.border2, 0.5);
  }
  y += 8;

  // Special instructions + per-load additional terms.
  const special: string[] = [];
  const general = fd.specialInstructions || load.specialInstructions || load.notes;
  if (general) special.push(String(general));
  const driverNotes = fd.driverInstructions || load.driverInstructions;
  if (driverNotes) special.push(`Driver: ${driverNotes}`);
  if (fd.appointmentRequired) special.push("Appointment required at every stop.");
  const customAddendum = (fd.customTerms as string | undefined)?.trim();
  if (customAddendum) special.push(`Additional terms for this load: ${customAddendum}`);
  if (special.length) paragraphs("Special instructions", special);

  const invoiceMc = mcDigits(fd.carrierMcNumber || prof?.mcNumber) ?? "";
  paragraphs("Invoicing and payment", [
    `Send your invoice to ${ACCOUNTING_EMAIL} with the subject “Invoice · Load ${stem}${invoiceMc ? ` · MC ${invoiceMc}` : ""}”. ` +
      `Attach this Rate Confirmation, the signed BOL, a clean POD, and original receipts for any approved lumper or ` +
      `accessorial charge. Put the SRL load number on the invoice; one invoice per load, never batched.`,
    `Your invoice must match this Rate Confirmation. If you think a figure here is wrong, call SRL before you invoice rather ` +
      `than billing a different number. Payment terms run from the date SRL receives a complete packet; an incomplete packet ` +
      `does not start the clock.`,
  ]);

  const antiFraud =
    `SRL sends rate confirmations only from @${DOMAIN}. We will never change our remit-to address or banking details by ` +
    `email. If anything here looks wrong, call SRL at ${PHONE}. If you have any doubt this document is genuine, verify us ` +
    `independently against our FMCSA record for MC# ${MC_NUMBER} before you move the freight.`;
  ensureRoom(textH(antiFraud, FONT_BODY, 7.25, W, 0.5) + 8);
  doc.font(FONT_BODY, 7.25).fillColor(TOKENS.fg3);
  doc.text(antiFraud, X, y, { width: W, lineGap: 0.5 });
  y = doc.y + 10;

  const activeTender = load.tenders?.find(
    (t) => (t.status === "OFFERED" || t.status === "ACCEPTED") && new Date(t.expiresAt) > new Date(),
  );
  if (activeTender) {
    ensureRoom(40);
    const expiresAt = new Date(activeTender.expiresAt);
    const isUrgent = (expiresAt.getTime() - Date.now()) / 3_600_000 < 2;
    const bg = isUrgent ? TOKENS.dangerBg : TOKENS.warningBg;
    const fg = isUrgent ? TOKENS.danger : TOKENS.warning;
    doc.save().fillColor(bg).strokeColor(fg).lineWidth(1).roundedRect(X, y, W, 28, 6).fillAndStroke().restore();
    const expiryStr = expiresAt.toLocaleString("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    doc.font(FONT_BODY_BOLD, 9).fillColor(fg);
    doc.text(`TENDER EXPIRES: ${expiryStr}${isUrgent ? "  ·  URGENT" : ""}`, X, y + 9, { width: W, align: "center", lineBreak: false });
    y += 40;
  }

  // Agreement to be bound, with SRL's countersignature inside the box.
  const countersign = (fd.rcCountersign ?? null) as RcCountersign | null;
  const csStatement = countersign ? rcCountersignStatement(countersign) : null;
  const BOX_PAD = 18;
  const boundTextH = textH(RC_AGREEMENT_TO_BE_BOUND, FONT_BODY, 8.5, W - BOX_PAD * 2, 0.8);
  const csH = csStatement ? textH(csStatement, FONT_BODY_ITALIC, 8, W - BOX_PAD * 2, 1) + 8 : 0;
  const boxH = 12 + 20 + 12 + boundTextH + csH + 14;
  ensureRoom(boxH);
  doc.save().rect(X, y, W, boxH).fill(TOKENS.cream2).restore();
  doc.save().rect(X, y, W, 2).fill(TOKENS.gold).restore();
  doc.font(FONT_DISPLAY_BOLD, 13).fillColor(TOKENS.navy);
  doc.text("Agreement to be bound", X, y + 12, { width: W, align: "center", lineBreak: false });
  // The article this clause rests on: BCA Art. 24 binds an accepted Rate
  // Confirmation (Art. 8 only settles which document wins a conflict).
  doc.font(FONT_BODY_ITALIC, 7.5).fillColor(TOKENS.goldDark);
  doc.text("Broker-Carrier Agreement, BCA Art. 24", X, y + 30, { width: W, align: "center", lineBreak: false });
  doc.font(FONT_BODY, 8.5).fillColor(TOKENS.fg1);
  doc.text(RC_AGREEMENT_TO_BE_BOUND, X + BOX_PAD, y + 44, { width: W - BOX_PAD * 2, lineGap: 0.8 });
  if (csStatement) {
    doc.font(FONT_BODY_ITALIC, 8).fillColor(TOKENS.fg2);
    doc.text(csStatement, X + BOX_PAD, doc.y + 8, { width: W - BOX_PAD * 2, lineGap: 1 });
  }
  y += boxH;

  // Footer on every page: identity, tagline, page N of M, template and terms versions.
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    drawFooter(doc, {
      pageNum: i + 1,
      totalPages: pages.count,
      docId,
      termsVersion: fd.rcTermsVersion || "unversioned",
      templateVersion: RC_TEMPLATE_VERSION,
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
  const fmtDate = (d?: Date | string | null) => documentDate(d) ?? "—";
  const smallLabel = (text: string, x: number, ly: number, size = 7) =>
    doc.font(FONT_BODY_BOLD, size).fillColor(TOKENS.goldDark)
       .text(text.toUpperCase(), x, ly, { characterSpacing: 0.8, lineBreak: false });

  const SHIPPER_LC_SIGNATURE_ROLES: SignatureRole[] = [
    { title: "AUTHORIZED BY · SILK ROUTE LOGISTICS", certification: "Broker confirms this booking at the agreed rate.", fields: ["PRINT NAME", "TITLE", "SIGNATURE", "DATE"] },
    { title: "ACKNOWLEDGED BY · SHIPPER", certification: "Shipper acknowledges the booking terms above.", fields: ["PRINT NAME", "TITLE", "SIGNATURE", "DATE"] },
  ];

  // Shipper-facing Load Confirmation. This is the booking acknowledgement, not
  // one of the five numbered documents, so it carries the load number with no
  // suffix — inventing a sixth letter for it would be scope the scheme has not
  // ratified. It has no number of its own, so it is generated now every time and
  // prints the digits (SRL-121494 -> 121494), resolved through the shared rule.
  const docId = printedLoadNumber(load) ?? "";
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
  /** Customer-facing document number (121498I; SRL-121494I on one issued before
   *  the prefix was dropped; a supplemental has its own form), allocated at
   *  invoice creation. Optional so the email-attach path and older rows still
   *  type; absent falls back to the internal INV- sequence. */
  srlDocNumber?: string | null;
  invoiceKind?: "BASE" | "SUPPLEMENTAL" | null;
  amount: number; status: string;
  lineHaulAmount?: number | null; fuelSurchargeAmount?: number | null;
  accessorialsAmount?: number | null; totalAmount?: number | null;
  factoringFee?: number | null; advanceAmount?: number | null; paidAmount?: number | null;
  dueDate?: Date | null; createdAt: Date;
  load: {
    referenceNumber: string; loadNumber?: string | null;
    /** The load record's POs: the ONLY source of the PO an invoice prints (ruled
     *  2026-09-26). Every caller that loads a load with `select` must fetch it. */
    poNumbers?: string[] | null;
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
    // G-14: stored dates are midnight UTC; format in UTC so a non-UTC host does not print the day before.
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const titleCase = (s: string) =>
    (s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const cust = invoice.load.customer;
  const terms = (cust?.paymentTerms || "Net 30").trim();
  // §21.2 ruling 3 — ONE number on the page, and it is always a number that was
  // ACTUALLY ISSUED to this invoice.
  //
  // The document used to print two. The header filing slot showed a number
  // derived from the load while the meta strip and the payment reference showed
  // the invoiceNumber column, so a customer told to quote their invoice number
  // had two to choose from and no way to know which one the AR inbox would
  // recognise. On a new invoice those now agree by construction, because
  // invoiceNumber mirrors srlDocNumber.
  //
  // THE FALLBACK IS THE PERSISTED COLUMN, NEVER A COMPUTED ONE. documentNumberFor
  // will happily derive SRL-5001I from the load when srlDocNumber is null, which
  // is right for a BOL that has no number of its own and wrong here: a legacy
  // invoice DOES have a number, the customer has it in their accounts-payable
  // system and on the remittance advice they already sent, and printing a derived
  // reference on a regenerated copy would put a string in front of them that was
  // never issued. Legacy rows therefore keep their INV- number on their own
  // document, which is what "read-only mirror" means from the customer's side.
  const docId = invoice.srlDocNumber ?? invoice.invoiceNumber;
  const loadRef = bareLoadRef(docId, invoice.load) ?? invoice.load.referenceNumber;

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
      "INVOICE #": docId,
      "LOAD REF": loadRef,
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
  // ── The design's two-column pairings ──────────────────────────────────────
  //
  // `.two`   BILL TO | REMIT TO, column-gap 40
  // `.cgrid` CHARGES | balance card, card 2.4in, column-gap 28
  //
  // These are not cosmetic. Stacking the four blocks vertically — which is what
  // this document did before the restyle — spends about 190pt of page on
  // whitespace and block headers, and the restyled blocks are taller than the
  // ones they replaced. Measured on a realistic invoice, the stacked version
  // rendered its last line 44pt BELOW the footer rule with only four line
  // items, and split onto a phantom second page carrying no header and no
  // footer at eight, while page one went on claiming "Page 1 of 1". Pairing
  // them, as the design does, is what makes the page fit.
  const TWO_GAP = 40;
  const twoColW = (CONTENT_W - TWO_GAP) / 2;
  const CARD_W = 173;          // 2.4in
  const CGRID_GAP = 28;
  const chargesW = CONTENT_W - CARD_W - CGRID_GAP;

  const billToBottom = drawBillToBlock(doc, billTo, y, MARGIN, twoColW);

  // PO (ruled 2026-09-26). Read from Load.poNumbers and nothing else: not a
  // hand-filled field, not the shipper's or customer's reference column. Two
  // delivered packets printed POs their own load records do not hold (TO3665
  // on 121492I, PO1861 on 121494I), both through the old hand-filled template.
  // An AP desk that matches on PO rejects or short-pays an invoice quoting one
  // it does not recognise, so a load with no PO says so rather than guessing.
  const poNumbers = (invoice.load.poNumbers ?? []).map((p) => (p ?? "").trim()).filter(Boolean);
  if (poNumbers.length === 0) {
    log.warn({ invoice: docId, load: loadRef }, "[Invoice] no PO on the load record; the invoice prints 'PO: none on file'");
  }
  doc.font(FONT_BODY, 9.5).fillColor(TOKENS.fg1)
     .text(`PO: ${poNumbers.length ? poNumbers.join(", ") : "none on file"}`, MARGIN, billToBottom, { width: twoColW });
  const billBottom = doc.y + 4;

  // REMIT TO (Silk Route Logistics). COMPANY.address is already the full
  // one-line address (street + city/state/zip), so don't repeat cityStateZip.
  const remitBottom = drawRemitToBlock(
    doc,
    { legalName: COMPANY.name, mailAddress: [COMPANY.address, COMPANY.email] },
    y,
    MARGIN + twoColW + TWO_GAP,
    twoColW,
  );
  y = Math.max(billBottom, remitBottom) + 14;

  // Charges — prefer the structured line-haul / FSC / accessorial columns
  // (the old plain layout ignored them). Fall back to line items, then rate.
  const charges: InvoiceCharge[] = [];
  const laneNote = `${invoice.load.originCity}, ${invoice.load.originState} to ${invoice.load.destCity}, ${invoice.load.destState}`;
  if (invoice.lineHaulAmount != null)
    charges.push({ label: "Line Haul", amount: invoice.lineHaulAmount, note: laneNote });
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
    charges.push({ label: "Line Haul", amount: invoice.totalAmount ?? invoice.amount, note: laneNote });

  // 738 is the same floor verify-rc-matrix holds the Rate Confirmation to:
  // drawFooter puts its gold rule at PAGE_H - MARGIN - 16 = 740, and 738 buys
  // 2pt of baseline clearance above it.
  //
  // The charges block is NOT the last thing on the page, so it cannot be given
  // the page floor. It gets the floor MINUS everything that follows —
  // measured, not estimated, because the fine print wraps to a different number
  // of lines with the terms string and a guessed constant would be wrong on
  // exactly the invoices that are already tight.
  const FOOTER_FLOOR = 738;
  const fineText = `Please remit payment per terms (${terms}). Questions: ${COMPANY.email}.`;
  doc.font(FONT_BODY, 7.5);
  const tailH =
    14                                              // gap after the charges row
    + paymentReferenceHeight(doc)
    + 10                                            // .fine rule + padding-top
    + doc.heightOfString(fineText, { width: CONTENT_W, lineGap: 1.5 });
  const chargesBottom = drawChargesBlock(doc, charges, y, chargesW, MARGIN, FOOTER_FLOOR - tailH);

  // Partial-payment balance card, beside the charges rather than under them.
  // `.card` carries margin-top: 22 in the design, which is what drops it clear
  // of the CHARGES tab and lines it up with the first charge row.
  let cardBottom = y;
  if (invoice.paidAmount != null && invoice.paidAmount > 0) {
    const invTotal = invoice.totalAmount ?? invoice.amount;
    cardBottom = drawSettlementSummary(
      doc, invTotal, invoice.paidAmount, y + 22, CARD_W, MARGIN + chargesW + CGRID_GAP,
    );
  }
  y = Math.max(chargesBottom, cardBottom) + 14;

  // Wire payment reference memo
  y = drawPaymentReference(
    doc,
    (cust?.name || billName).slice(0, 20),
    loadRef,
    docId, // the wire memo quotes the same number as the page
    y,
  );
  y += 4;

  // `.fine` in the design: a hairline rule, then 7.5pt tertiary ink. Not
  // italic — the design reserves italic for the tagline, and a whole
  // paragraph of it reads as an aside rather than as terms.
  doc.save().strokeColor(TOKENS.rule).lineWidth(0.5)
     .moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke().restore();
  y += 10;
  doc.font(FONT_BODY, 7.5).fillColor(TOKENS.fg3)
     .text(fineText, MARGIN, y, {
       width: CONTENT_W,
       lineGap: 1.5,
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
