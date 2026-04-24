import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import bwipjs from "bwip-js";
import { PackageType } from "@prisma/client";
import { calculateMileage, MileageResult } from "./mileageService";
import { log } from "../lib/logger";
import { generateBOLQRBuffer } from "../utils/qrGenerator";
import { decodeHtmlEntities } from "../utils/htmlEntities";

type PDFDoc = InstanceType<typeof PDFDocument>;

const COMPANY = {
  name: "Silk Route Logistics Inc.",
  address: "2317 S 35th St, Galesburg, MI 49053",
  cityStateZip: "Galesburg, MI 49053",
  phone: "+1 (269) 220-6760",
  email: "whaider@silkroutelogistics.ai",
  website: "silkroutelogistics.ai",
  mc: "01794414",
  dot: "4526880",
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
  originAddress?: string | null; originCity: string; originState: string; originZip: string;
  originContactName?: string | null; originContactPhone?: string | null;
  destAddress?: string | null; destCity: string; destState: string; destZip: string;
  destContactName?: string | null; destContactPhone?: string | null;
  shipperFacility?: string | null; consigneeFacility?: string | null;
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

  const ref = load.loadNumber || load.referenceNumber;
  const bolNum = ref.startsWith("SRL-") ? `BOL-${ref}` : `BOL-SRL-${ref}`;

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
  const qrSize = 95;
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
    `${COMPANY.phone}  |  operations@silkroutelogistics.ai  |  ${COMPANY.website}`,
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

  // Gold rule below header band
  let y = headerBandH + 2;
  doc.lineWidth(1.75).strokeColor(GOLD).moveTo(M, y).lineTo(R, y).stroke();
  y += 14;

  // Title row
  doc.font("Playfair-Bold").fontSize(24).fillColor(NAVY)
    .text("Bill of Lading", M, y, { lineBreak: false });
  doc.font("DMSans-SemiBold").fontSize(8).fillColor(GOLD_DARK)
    .text(`STRAIGHT ${MIDDOT} NON-NEGOTIABLE`, R - 220, y + 10, {
      width: 220, align: "right", characterSpacing: 1.4, lineBreak: false,
    });
  y += 38;

  // Meta row — 6 cells
  const metaTop = y;
  const metaH = 34;
  const cw6 = CW / 6;

  interface MetaCell {
    label: string;
    raw: string | null | undefined;
    placeholder: string | null; // null = em-dash if absent; string = bracketed italic placeholder
  }
  const metaCells: MetaCell[] = [
    { label: "DATE ISSUED", raw: pickupDateFmt, placeholder: null },
    { label: "LOAD REF", raw: load.referenceNumber, placeholder: null },
    { label: "EQUIPMENT", raw: load.equipmentType, placeholder: "Equipment" },
    { label: "PRO #", raw: load.proNumber, placeholder: null },
    { label: "SHIPPER REF", raw: load.shipperReference, placeholder: "Shipper Ref" },
    { label: "FREIGHT CHARGES", raw: "Prepaid · Third Party", placeholder: null },
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
  y = metaTop + metaH + 18;

  // PARTIES section header + rounded cream container
  doc.font("DMSans-SemiBold").fontSize(8).fillColor(GOLD_DARK)
    .text("PARTIES", M, y, { characterSpacing: 1.2, lineBreak: false });
  y += 13;

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
    const facility = side === "shipper"
      ? fieldOrPlaceholder(load.shipperFacility || load.customer?.name, "Shipper Facility")
      : fieldOrPlaceholder(load.consigneeFacility, "Consignee Facility");
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
    const contact: FieldDisplay = (contactName || contactPhone)
      ? { text: `Contact: ${contactName || EM}  ${MIDDOT}  ${contactPhone || EM}`, isPlaceholder: false }
      : { text: "[Contact · Phone]", isPlaceholder: true };
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
  y = partiesTop + partiesH + 16;

  // Shipment details table — rounded container, NAVY header, dashed body separators, CREAM_2 totals
  doc.font("DMSans-SemiBold").fontSize(8).fillColor(GOLD_DARK)
    .text("SHIPMENT DETAILS", M, y, { characterSpacing: 1.2, lineBreak: false });
  y += 13;

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
  const tblBodyH = rowH;
  const tblH = hdrH + tblBodyH + totH;

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

  // Body row
  const bodyY = tblTop + hdrH;
  const pcsValue = load.pieces != null ? String(load.pieces) : EM;
  const dims = (load.dimensionsLength && load.dimensionsWidth && load.dimensionsHeight)
    ? `${load.dimensionsLength}"${TIMES}${load.dimensionsWidth}"${TIMES}${load.dimensionsHeight}"`
    : EM;
  const weightStr = load.weight ? `${load.weight.toLocaleString()} lb` : EM;
  const descRaw = safe(load.commodity).trim();
  const descCell: FieldDisplay = descRaw
    ? { text: descRaw, isPlaceholder: false }
    : { text: "[Description]", isPlaceholder: true };
  const bodyCells: Array<{ text: string; placeholder: boolean; bold?: boolean }> = [
    { text: pcsValue, placeholder: false, bold: true },
    { text: "PLT", placeholder: false },
    { text: descCell.text, placeholder: descCell.isPlaceholder },
    { text: dims, placeholder: false },
    { text: weightStr, placeholder: false, bold: true },
    { text: safe(load.freightClass).trim() || EM, placeholder: false },
    { text: EM, placeholder: false },
    { text: load.hazmat ? "Yes" : "No", placeholder: false },
  ];

  cx = M;
  colDefs.forEach((c, ci) => {
    const cell = bodyCells[ci];
    if (ci > 0) {
      // Dashed vertical separator between body columns
      doc.save();
      doc.lineWidth(0.5).strokeColor(BORDER_1).dash(2, { space: 2 })
        .moveTo(cx, bodyY + 2).lineTo(cx, bodyY + rowH - 2).stroke();
      doc.undash();
      doc.restore();
    }
    doc.font(cell.placeholder ? "DMSans-Italic" : cell.bold ? "DMSans-Bold" : "DMSans-Regular")
      .fontSize(9).fillColor(cell.placeholder ? GOLD_DARK : NAVY)
      .text(cell.text, cx + 6, bodyY + 6, { width: c.w - 10, lineBreak: false });
    cx += c.w;
  });

  // Totals row — solid top border, CREAM_2 fill
  const totY = bodyY + rowH;
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
  doc.text(pcsValue, tcx, totY + 7, { width: colDefs[2].w - 8, lineBreak: false });
  tcx = M + colDefs[0].w + colDefs[1].w + colDefs[2].w + colDefs[3].w + 6;
  doc.text(weightStr, tcx, totY + 7, { width: colDefs[4].w - 8, lineBreak: false });

  y = tblTop + tblH + 14;

  // Special Instructions — single row cream container
  const siH = 28;
  doc.roundedRect(M, y, CW, siH, 4).fill(CREAM_2);
  doc.lineWidth(0.5).strokeColor(BORDER_1).roundedRect(M, y, CW, siH, 4).stroke();
  doc.font("DMSans-SemiBold").fontSize(6.75).fillColor(GOLD_DARK)
    .text("SPECIAL INSTRUCTIONS", M + 10, y + 10, {
      characterSpacing: 1.0, lineBreak: false,
    });
  const siBodyRaw = safe(load.specialInstructions || load.notes).trim();
  const siDisplay: FieldDisplay = siBodyRaw
    ? { text: siBodyRaw, isPlaceholder: false }
    : { text: "None  ·  [per-load notes]", isPlaceholder: true };
  doc.font("DMSans-Italic").fontSize(8.25)
    .fillColor(siDisplay.isPlaceholder ? GOLD_DARK : FG_2)
    .text(siDisplay.text, M + 150, y + 9, {
      width: CW - 160, height: siH - 14, ellipsis: true, lineBreak: false,
    });
  y += siH + 10;

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
  y += 14;

  // Signature blocks — 3 columns
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
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += 30;
        drawSigField(bx, by, sigColW, "PRINT NAME", ""); by += 30;
        const halfW = (sigColW - 8) / 2;
        const ptValue = load.piecesTendered != null ? String(load.piecesTendered) : "";
        drawSigField(bx, by, halfW, "PIECES TENDERED", ptValue);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += 30;
        return by;
      },
    },
    {
      title: "CARRIER · DRIVER",
      cert: "Acknowledges receipt of shipment in apparent good order, except as noted.",
      render: (bx, cy) => {
        let by = cy;
        // carrierLegalName is pre-derived by pdfController.downloadBOLFromLoad
        // from carrier.carrierProfile.companyName || carrier.company.
        const carrierLegalName = safe(load.carrierLegalName ?? load.carrier?.company).trim();
        drawSigField(bx, by, sigColW, "CARRIER LEGAL NAME", carrierLegalName); by += 30;
        const halfW = (sigColW - 8) / 2;
        const mcNo = safe(load.carrier?.carrierProfile?.mcNumber).trim();
        const dotNo = safe(load.carrier?.carrierProfile?.dotNumber).trim();
        drawSigField(bx, by, halfW, "MC #", mcNo);
        drawSigField(bx + halfW + 8, by, halfW, "DOT #", dotNo);
        by += 30;
        const driverNm = safe(load.driverName).trim();
        drawSigField(bx, by, sigColW, "DRIVER NAME", driverNm); by += 30;
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += 30;
        const truckNo = safe(load.truckNumber).trim();
        const trailerNo = safe(load.trailerNumber).trim();
        drawSigField(bx, by, halfW, "TRUCK #", truckNo);
        drawSigField(bx + halfW + 8, by, halfW, "TRAILER #", trailerNo);
        by += 30;
        const sealNo = safe(load.sealNumber).trim();
        drawSigField(bx, by, halfW, "SEAL #", sealNo);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += 30;
        return by;
      },
    },
    {
      title: "CONSIGNEE · RECEIVER",
      cert: "Acknowledges delivery — any exceptions noted above.",
      render: (bx, cy) => {
        let by = cy;
        drawSigField(bx, by, sigColW, "SIGNATURE", ""); by += 30;
        drawSigField(bx, by, sigColW, "PRINT NAME", ""); by += 30;
        const halfW = (sigColW - 8) / 2;
        const prValue = load.piecesReceived != null ? String(load.piecesReceived) : "";
        drawSigField(bx, by, halfW, "PIECES RECEIVED", prValue);
        drawSigField(bx + halfW + 8, by, halfW, "DATE", "");
        by += 30;
        return by;
      },
    },
  ];

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
    by = doc.y + 8;
    blk.render(bx, by);
  });

  // Footer page 1
  const fyLine = 755;
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
    .text("Page 1 of 2", M + 2 * footerThirdW, footerY, {
      width: footerThirdW, align: "right", lineBreak: false,
    });

  // ========================= PAGE 2 =========================
  doc.addPage();
  doc.rect(0, 0, 612, 3).fill(GOLD);

  // Condensed header (no QR column). Same transparent-variant preference as page 1.
  if (hasLogo || hasLogoTransparent) {
    doc.image(logoAsset, M, 12, { width: 28, height: 28, fit: [28, 28] });
  }
  doc.font("Playfair-Bold").fontSize(10).fillColor(NAVY)
    .text("SILK ROUTE LOGISTICS INC.", M + 34, 13, { lineBreak: false });
  doc.font("DMSans-Regular").fontSize(7).fillColor(FG_3)
    .text(`${bolNum} ${MIDDOT} Terms and Conditions (continued)`, M + 34, 26, { lineBreak: false });
  doc.font("DMSans-Bold").fontSize(8).fillColor(NAVY)
    .text(bolNum, R - 220, 13, { width: 220, align: "right", lineBreak: false });
  doc.font("DMSans-Regular").fontSize(7).fillColor(FG_3)
    .text(`${pickupDateFmt} ${MIDDOT} ${load.referenceNumber}`, R - 220, 26, {
      width: 220, align: "right", lineBreak: false,
    });

  y = 50;
  doc.lineWidth(1).strokeColor(GOLD).moveTo(M, y).lineTo(R, y).stroke();
  y += 14;

  // T&C title
  doc.font("Playfair-Bold").fontSize(16).fillColor(NAVY)
    .text("Terms and Conditions", M, y, { lineBreak: false });
  y += 24;

  const tclauses: Array<[string, string]> = [
    ["1. ACCEPTANCE & CARRIAGE", "The goods described herein are accepted in apparent good order and condition (except as noted) for carriage subject to the Uniform Straight Bill of Lading and applicable U.S. DOT regulations. This BOL is non-negotiable and serves as receipt of goods only."],
    ["2. LIABILITY (CARMACK AMENDMENT)", "Carrier is liable for loss, damage, or delay to cargo pursuant to 49 U.S.C. § 14706. Liability extends to the full actual value of the goods unless a written released-value agreement is executed per 49 CFR § 1035."],
    ["3. INSURANCE REQUIREMENTS", "Carrier shall maintain: (a) Commercial General Liability and Automobile Liability min $1,000,000 per occurrence; (b) Cargo Liability min $100,000 per shipment; (c) Workers’ Compensation as required by law."],
    ["4. CLAIMS", "Written claims must be filed within nine (9) months of delivery. Carrier shall note any damage, shortage, or discrepancy on this BOL at time of delivery."],
    ["5. INDEPENDENT CONTRACTOR", "Carrier operates as an independent contractor. Carrier is not an agent, employee, or partner of Silk Route Logistics Inc."],
    ["6. DOUBLE BROKERING PROHIBITION", "Carrier shall not re-broker, assign, interline, sub-contract, or transfer freight to any third party without prior written consent of SRL. Violation constitutes a material breach."],
    ["7. NON-SOLICITATION", "Carrier shall not solicit traffic from any shipper or customer of SRL for twelve (12) months following the last load. Violation entitles SRL to 35% commission on diverted revenue."],
    ["8. NON-BILLING", "Carrier shall not bill or accept payment from the shipper/consignee. Carrier waives any tariff or lien rights."],
    ["9. INDEMNIFICATION", "Carrier shall defend, indemnify, and hold harmless SRL from all claims, damages, and expenses arising from Carrier’s performance or breach."],
    ["10. DETENTION & ACCESSORIALS", "All accessorial charges must be pre-approved in writing by SRL. Unapproved charges will not be honored."],
    ["11. FORCE MAJEURE", "Neither party shall be liable for failure to perform due to causes beyond reasonable control including acts of God, war, epidemic, or natural disaster."],
    ["12. PROOF OF DELIVERY", "Carrier shall obtain a signed delivery receipt. Signed BOL/POD must accompany all invoices for payment processing."],
    ["13. EQUIPMENT & COMPLIANCE", "Carrier certifies equipment meets FMCSA/DOT standards. Carrier shall comply with ELD mandates and 49 CFR Parts 171-180 for hazardous materials."],
    ["14. CONFIDENTIALITY", "All rates, lanes, and business terms are proprietary. Carrier shall not disclose to any third party."],
    ["15. SEVERABILITY", "If any provision is invalid, remaining provisions continue in full force."],
    ["16. ENTIRE AGREEMENT", "This BOL with the Broker-Carrier Agreement constitutes the entire agreement. No oral modifications are binding."],
    ["17. GOVERNING LAW", "Governed by Michigan law and applicable federal transportation law. Freight charges are prepaid unless otherwise noted."],
  ];

  // Two-column T&C. Split 9/8 — clauses 1-9 left, 10-17 right.
  const tcGap = 14;
  const tcColW = (CW - tcGap) / 2;
  const tcLeftX = M;
  const tcRightX = M + tcColW + tcGap;
  const tcTop = y;

  const renderClause = (title: string, body: string, cx: number, cy: number): number => {
    doc.font("DMSans-Bold").fontSize(9).fillColor(NAVY)
      .text(title, cx, cy, { width: tcColW, lineBreak: false });
    let ny = cy + 11;
    doc.font("DMSans-Regular").fontSize(8.5).fillColor(FG_2)
      .text(body, cx, ny, { width: tcColW, lineGap: 1 });
    return doc.y + 6;
  };

  let leftY = tcTop;
  for (let i = 0; i < 9; i++) {
    leftY = renderClause(tclauses[i][0], tclauses[i][1], tcLeftX, leftY);
  }
  let rightY = tcTop;
  for (let i = 9; i < tclauses.length; i++) {
    rightY = renderClause(tclauses[i][0], tclauses[i][1], tcRightX, rightY);
  }

  // Footer page 2 (matches page 1)
  doc.lineWidth(1).strokeColor(GOLD).moveTo(M, fyLine).lineTo(R, fyLine).stroke();
  const f2y = fyLine + 8;
  doc.font("DMSans-Regular").fontSize(7).fillColor(FG_3)
    .text(
      `MC# ${COMPANY.mc} ${MIDDOT} DOT# ${COMPANY.dot} ${MIDDOT} ${COMPANY.website}`,
      M, f2y, { width: footerThirdW, lineBreak: false },
    );
  doc.font("DMSans-Italic").fontSize(7).fillColor(GOLD_DARK)
    .text("Where Trust Travels.", M + footerThirdW, f2y, {
      width: footerThirdW, align: "center", lineBreak: false,
    });
  doc.font("DMSans-Regular").fontSize(7).fillColor(FG_3)
    .text("Page 2 of 2", M + 2 * footerThirdW, f2y, {
      width: footerThirdW, align: "right", lineBreak: false,
    });

  void FG_DISABLED; // reserved for future disabled-text rendering
  void rightY; void leftY;

  doc.end();
  return doc;
}

interface LoadData {
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
  doc.text(`$${load.rate.toLocaleString()}`, 200, y, { align: "left" });
  y += 18;
  doc.fontSize(12).fillColor("#1E1E2F").text("Total:", 50, y);
  doc.text(`$${load.rate.toLocaleString()}`, 200, y);

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
  referenceNumber: string;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; pieces?: number | null; equipmentType: string; commodity?: string | null;
  rate: number; distance?: number | null;
  pickupDate: Date; deliveryDate: Date;
  notes?: string | null; specialInstructions?: string | null;
  carrier?: { firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null; dotNumber?: string | null } | null } | null;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null; email?: string | null } | null;
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

export function generateEnhancedRateConfirmation(load: EnhancedRCLoadData, formData: Record<string, any>): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const fd = formData || {};

  // Page 1
  addHeader(doc, "RATE CONFIRMATION");

  let y = 155;

  // Reference & Date
  labelValue(doc, "Reference Number", fd.referenceNumber || load.referenceNumber, 50, y);
  labelValue(doc, "Load Number", fd.loadNumber || load.referenceNumber, 250, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 450, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 10;

  // Section 2 — Shipper / Origin
  y = sectionTitle(doc, "SHIPPER / ORIGIN", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(fd.shipperName || load.customer?.name || "—", 50, y);
  if (fd.shipperAddress || load.customer?.address) doc.text(fd.shipperAddress || load.customer?.address || "", 50, y + 14);
  const shipperCSZ = fd.shipperCity || load.customer?.city
    ? `${fd.shipperCity || load.customer?.city || ""}, ${fd.shipperState || load.customer?.state || ""} ${fd.shipperZip || load.customer?.zip || ""}`
    : `${load.originCity}, ${load.originState} ${load.originZip}`;
  doc.text(shipperCSZ, 50, y + 28);
  if (fd.shipperContact) labelValue(doc, "Contact", fd.shipperContact, 310, y);
  if (fd.shipperPhone || load.customer?.phone) labelValue(doc, "Phone", fd.shipperPhone || load.customer?.phone || "", 310, y + 20);
  if (fd.shipperRefNumber) labelValue(doc, "Ref #", fd.shipperRefNumber, 450, y);

  y += 60;

  // Section 3 — Consignee / Destination
  y = checkPageBreak(doc, y, 80);
  y = sectionTitle(doc, "CONSIGNEE / DESTINATION", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(fd.consigneeName || "—", 50, y);
  if (fd.consigneeAddress) doc.text(fd.consigneeAddress, 50, y + 14);
  const consigneeCSZ = fd.consigneeCity
    ? `${fd.consigneeCity}, ${fd.consigneeState || ""} ${fd.consigneeZip || ""}`
    : `${load.destCity}, ${load.destState} ${load.destZip}`;
  doc.text(consigneeCSZ, 50, y + 28);
  if (fd.consigneeContact) labelValue(doc, "Contact", fd.consigneeContact, 310, y);
  if (fd.consigneePhone) labelValue(doc, "Phone", fd.consigneePhone, 310, y + 20);
  if (fd.consigneeRefNumber) labelValue(doc, "Ref #", fd.consigneeRefNumber, 450, y);

  y += 60;

  // Section 4 — Carrier Information
  y = checkPageBreak(doc, y, 100);
  y = sectionTitle(doc, "CARRIER INFORMATION", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  const carrierName = fd.carrierName || load.carrier?.company || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : "—");
  doc.text(carrierName, 50, y);
  if (fd.carrierMcNumber || load.carrier?.carrierProfile?.mcNumber) {
    doc.text(`MC#: ${fd.carrierMcNumber || load.carrier?.carrierProfile?.mcNumber}`, 50, y + 14);
  }
  if (fd.carrierDotNumber || load.carrier?.carrierProfile?.dotNumber) {
    doc.text(`DOT#: ${fd.carrierDotNumber || load.carrier?.carrierProfile?.dotNumber}`, 200, y + 14);
  }
  if (fd.carrierAddress) doc.text(fd.carrierAddress, 50, y + 28);
  if (fd.carrierCity) doc.text(`${fd.carrierCity}, ${fd.carrierState || ""} ${fd.carrierZip || ""}`, 50, y + 42);

  if (fd.carrierContact || load.carrier?.phone) labelValue(doc, "Contact", fd.carrierContact || "", 310, y);
  if (fd.carrierPhone || load.carrier?.phone) labelValue(doc, "Phone", fd.carrierPhone || load.carrier?.phone || "", 310, y + 20);
  if (fd.driverName) labelValue(doc, "Driver", fd.driverName, 310, y + 40);
  if (fd.truckNumber) labelValue(doc, "Truck #", fd.truckNumber, 450, y + 40);
  if (fd.trailerNumber) labelValue(doc, "Trailer #", fd.trailerNumber, 450, y + 60);

  y += 85;

  // Multi-Stop Section (if applicable)
  if (fd.isMultiStop && fd.stops && Array.isArray(fd.stops) && fd.stops.length > 0) {
    y = checkPageBreak(doc, y, 40 + fd.stops.length * 35);
    y = sectionTitle(doc, "ADDITIONAL STOPS", y);
    for (let i = 0; i < fd.stops.length; i++) {
      const stop = fd.stops[i];
      y = checkPageBreak(doc, y, 35);
      doc.fontSize(9).fillColor("#D4A843").text(`Stop ${i + 1} — ${stop.type || "STOP"}`, 50, y);
      y += 12;
      doc.fontSize(9).fillColor("#1E1E2F");
      doc.text(stop.company || "—", 50, y);
      if (stop.address) doc.text(stop.address, 200, y);
      if (stop.city) doc.text(`${stop.city}, ${stop.state || ""} ${stop.zip || ""}`, 350, y);
      y += 14;
      if (stop.contact) { doc.text(`Contact: ${stop.contact}${stop.phone ? " | " + stop.phone : ""}`, 50, y); y += 12; }
      if (stop.refNumber) { doc.text(`Ref: ${stop.refNumber}`, 50, y); y += 12; }
      if (stop.instructions) { doc.text(`Instructions: ${stop.instructions}`, 50, y, { width: 510 }); y += 12; }
    }
    if (fd.extraStopPay) {
      doc.fontSize(9).fillColor("#1E1E2F").text(`Extra Stop Pay: $${Number(fd.extraStopPay).toLocaleString()}`, 50, y);
      y += 16;
    }
  }

  // Section 5 — Equipment & Commodity
  y = checkPageBreak(doc, y, 60);
  y = sectionTitle(doc, "EQUIPMENT & COMMODITY", y);
  labelValue(doc, "Equipment", fd.equipmentType || load.equipmentType, 50, y);
  labelValue(doc, "Commodity", fd.commodity || load.commodity || "General Freight", 200, y);
  labelValue(doc, "Weight", load.weight ? `${load.weight.toLocaleString()} lbs` : (fd.weight ? `${fd.weight} lbs` : "—"), 380, y);
  y += 25;
  if (fd.pieces || load.pieces) labelValue(doc, "Pieces", String(fd.pieces || load.pieces), 50, y);
  if (fd.dims) labelValue(doc, "Dimensions", fd.dims, 200, y);
  if (fd.hazmat) labelValue(doc, "Hazmat", "Yes", 380, y);
  if (fd.tempRequirements) labelValue(doc, "Temp Req", fd.tempRequirements, 450, y);
  y += 20;
  // Distance — mileage-service-aware label
  if (load.distance) {
    const mileageSource = fd.mileageSource || "google_estimated";
    const distLabel = mileageSource === "google_estimated"
      ? `~${load.distance.toLocaleString()} mi (estimated)`
      : mileageSource === "pcmiler"
      ? `${load.distance.toLocaleString()} mi (PC*Miler Practical)`
      : mileageSource === "milemaker"
      ? `${load.distance.toLocaleString()} mi (MileMaker Practical)`
      : `${load.distance.toLocaleString()} mi`;
    labelValue(doc, "Distance", distLabel, 50, y);
    if (fd.driveTimeHours) labelValue(doc, "Drive Time", `${fd.driveTimeHours}h`, 300, y);
    if (fd.tollCost) labelValue(doc, "Est. Tolls", `$${Number(fd.tollCost).toFixed(2)}`, 430, y);
  }

  y += 25;

  // Section 6 — Dates & Times
  y = checkPageBreak(doc, y, 50);
  y = sectionTitle(doc, "DATES & TIMES", y);
  labelValue(doc, "Pickup Date", fd.pickupDate || load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Pickup Window", fd.pickupTimeWindow || "—", 200, y);
  labelValue(doc, "Delivery Date", fd.deliveryDate || load.deliveryDate.toLocaleDateString(), 350, y);
  labelValue(doc, "Delivery Window", fd.deliveryTimeWindow || "—", 500, y);

  y += 35;

  // Section 7 — Rates & Charges
  y = checkPageBreak(doc, y, 120);
  y = sectionTitle(doc, "RATES & CHARGES", y);
  doc.fontSize(10).fillColor("#1E1E2F");

  const linehaul = fd.lineHaulRate ?? load.rate;
  doc.text("Line Haul Rate:", 50, y); doc.text(`$${Number(linehaul).toLocaleString()}`, 250, y);
  y += 16;

  if (fd.fuelSurcharge) {
    doc.text("Fuel Surcharge:", 50, y); doc.text(`$${Number(fd.fuelSurcharge).toLocaleString()}`, 250, y);
    y += 16;
  }

  if (fd.detentionRate) {
    doc.text("Detention Rate:", 50, y); doc.text(`$${Number(fd.detentionRate).toLocaleString()}/hr`, 250, y);
    y += 16;
  }

  if (fd.accessorials && Array.isArray(fd.accessorials)) {
    for (const acc of fd.accessorials) {
      doc.text(`${acc.description}:`, 50, y); doc.text(`$${Number(acc.amount).toLocaleString()}`, 250, y);
      y += 16;
    }
  }

  y += 4;
  doc.moveTo(50, y).lineTo(350, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 8;
  const total = fd.totalCharges ?? linehaul;
  doc.fontSize(13).fillColor("#1E1E2F").text("TOTAL:", 50, y);
  doc.text(`$${Number(total).toLocaleString()}`, 250, y);
  y += 20;

  if (fd.paymentTerms) {
    doc.fontSize(9).fillColor("#888888").text(`Payment Terms: ${fd.paymentTerms}`, 50, y);
    y += 16;
  }

  // Section 8 — Special Instructions
  const instructions = fd.specialInstructions || load.specialInstructions || load.notes;
  if (instructions || fd.pickupInstructions || fd.deliveryInstructions) {
    y = checkPageBreak(doc, y, 80);
    y = sectionTitle(doc, "SPECIAL INSTRUCTIONS", y);
    doc.fontSize(9).fillColor("#1E1E2F");
    if (instructions) { doc.text(instructions, 50, y, { width: 510 }); y += doc.heightOfString(instructions, { width: 510 }) + 8; }
    if (fd.pickupInstructions) { doc.text(`Pickup: ${fd.pickupInstructions}`, 50, y, { width: 510 }); y += 16; }
    if (fd.deliveryInstructions) { doc.text(`Delivery: ${fd.deliveryInstructions}`, 50, y, { width: 510 }); y += 16; }
    if (fd.appointmentRequired) { doc.fillColor("#dc2626").text("** APPOINTMENT REQUIRED **", 50, y); y += 16; }
  }

  // Payment Terms
  if (fd.carrierPaymentTier || fd.paymentTerms || fd.factoringCompany) {
    y = checkPageBreak(doc, y, 80);
    y = sectionTitle(doc, "PAYMENT TERMS", y);
    doc.fontSize(9).fillColor("#1E1E2F");
    if (fd.carrierPaymentTier) { doc.text(`Payment Tier: ${fd.carrierPaymentTier}`, 50, y); y += 14; }
    if (fd.quickPayFeePercent) { doc.text(`QuickPay Fee: ${fd.quickPayFeePercent}%`, 50, y); y += 14; }
    if (fd.paymentTerms) { doc.text(`Terms: ${fd.paymentTerms}`, 50, y); y += 14; }
    if (fd.factoringCompany) {
      doc.text(`Factoring Company: ${fd.factoringCompany}`, 50, y); y += 14;
      if (fd.factoringContact) { doc.text(`Factoring Contact: ${fd.factoringContact}`, 50, y); y += 14; }
      if (fd.factoringEmail) { doc.text(`Factoring Email: ${fd.factoringEmail}`, 50, y); y += 14; }
    }

    // Document Checklist
    if (fd.docChecklist) {
      y += 4;
      doc.fontSize(8).fillColor("#888888").text("Required Documents:", 50, y); y += 12;
      const checks = fd.docChecklist;
      const items = [
        { key: "signedRateCon", label: "Signed Rate Confirmation" },
        { key: "signedBol", label: "Signed BOL" },
        { key: "pod", label: "Proof of Delivery" },
        { key: "carrierInvoice", label: "Carrier Invoice" },
        { key: "lumperReceipt", label: "Lumper Receipt" },
        { key: "scaleTicket", label: "Scale Ticket" },
        { key: "tempLog", label: "Temperature Log" },
      ];
      for (const item of items) {
        if (checks[item.key]) {
          doc.fontSize(8).fillColor("#1E1E2F").text(`  \u2713 ${item.label}`, 50, y); y += 11;
        }
      }
    }
    y += 8;
  }

  // Section 9 — Terms & Conditions
  y = checkPageBreak(doc, y, 100);
  y = sectionTitle(doc, "TERMS & CONDITIONS", y);
  doc.fontSize(7).fillColor("#666666");
  const defaultTerms = "Carrier agrees to transport the above-described shipment under the terms and conditions set forth herein. " +
    "Carrier shall maintain cargo insurance of not less than $100,000 and auto liability of not less than $1,000,000 combined single limit. " +
    "Carrier shall comply with all applicable federal, state, and local laws and regulations. " +
    "This rate confirmation, when signed by both parties, constitutes a binding contract.";
  const terms = fd.customTerms || defaultTerms;
  doc.text(terms, 50, y, { width: 510 });
  y += doc.heightOfString(terms, { width: 510 }) + 15;

  // Section 10 — Signatures
  y = checkPageBreak(doc, y, 100);
  y = sectionTitle(doc, "SIGNATURES", y);
  y += 5;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Authorized by Broker", 50, y);
  doc.text("Accepted by Carrier", 310, y);
  y += 15;

  if (fd.brokerSignature) {
    doc.fontSize(12).fillColor("#1E1E2F").text(fd.brokerSignature, 50, y);
  }
  if (fd.carrierSignature) {
    doc.fontSize(12).fillColor("#1E1E2F").text(fd.carrierSignature, 310, y);
  }

  y += 20;
  doc.moveTo(50, y).lineTo(250, y).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(310, y).lineTo(550, y).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  y += 5;

  doc.fontSize(7).fillColor("#888888");
  doc.text(fd.brokerSignDate || "Date: _______________", 50, y);
  doc.text(fd.carrierSignDate || "Date: _______________", 310, y);

  // Mileage footnote (only for estimated/Google sources)
  const mileageNote = getMileageFootnote(fd.mileageSource);
  if (mileageNote) {
    y += 25;
    y = checkPageBreak(doc, y, 20);
    doc.fontSize(6.5).fillColor("#999999").text(mileageNote, 50, y, { width: 510 });
  }

  addFooter(doc);
  doc.end();
  return doc;
}

/**
 * Shipper-facing Load Confirmation PDF — omits all carrier cost/rate information.
 */
export function generateShipperLoadConfirmation(load: EnhancedRCLoadData, formData: Record<string, any>): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const fd = formData || {};

  addHeader(doc, "LOAD CONFIRMATION");

  let y = 155;

  // Reference & Date
  labelValue(doc, "Reference Number", fd.referenceNumber || load.referenceNumber, 50, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 450, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 10;

  // Broker Info
  y = sectionTitle(doc, "BROKER", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 50, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 14);
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, 50, y + 28);
  y += 50;

  // Shipper / Origin
  y = checkPageBreak(doc, y, 80);
  y = sectionTitle(doc, "SHIPPER / ORIGIN", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(fd.shipperName || load.customer?.name || "—", 50, y);
  if (fd.shipperAddress || load.customer?.address) doc.text(fd.shipperAddress || load.customer?.address || "", 50, y + 14);
  const shipperCSZ = fd.shipperCity || load.customer?.city
    ? `${fd.shipperCity || load.customer?.city || ""}, ${fd.shipperState || load.customer?.state || ""} ${fd.shipperZip || load.customer?.zip || ""}`
    : `${load.originCity}, ${load.originState} ${load.originZip}`;
  doc.text(shipperCSZ, 50, y + 28);
  y += 55;

  // Consignee / Destination
  y = checkPageBreak(doc, y, 80);
  y = sectionTitle(doc, "CONSIGNEE / DESTINATION", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(fd.consigneeName || "—", 50, y);
  if (fd.consigneeAddress) doc.text(fd.consigneeAddress, 50, y + 14);
  const consigneeCSZ = fd.consigneeCity
    ? `${fd.consigneeCity}, ${fd.consigneeState || ""} ${fd.consigneeZip || ""}`
    : `${load.destCity}, ${load.destState} ${load.destZip}`;
  doc.text(consigneeCSZ, 50, y + 28);
  y += 55;

  // Equipment & Commodity
  y = checkPageBreak(doc, y, 50);
  y = sectionTitle(doc, "EQUIPMENT & COMMODITY", y);
  labelValue(doc, "Equipment", fd.equipmentType || load.equipmentType, 50, y);
  labelValue(doc, "Commodity", fd.commodity || load.commodity || "General Freight", 200, y);
  labelValue(doc, "Weight", load.weight ? `${load.weight.toLocaleString()} lbs` : "—", 380, y);
  y += 35;

  // Dates
  y = checkPageBreak(doc, y, 50);
  y = sectionTitle(doc, "SCHEDULE", y);
  labelValue(doc, "Pickup Date", fd.pickupDate || load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Pickup Window", fd.pickupTimeWindow || "—", 200, y);
  labelValue(doc, "Delivery Date", fd.deliveryDate || load.deliveryDate.toLocaleDateString(), 350, y);
  labelValue(doc, "Delivery Window", fd.deliveryTimeWindow || "—", 500, y);
  y += 35;

  // Shipper Rate (customer-facing, NO carrier cost)
  y = checkPageBreak(doc, y, 60);
  y = sectionTitle(doc, "RATE", y);
  const shipperRate = fd.customerRate ?? load.customer ? (load as any).customerRate || load.rate : load.rate;
  doc.fontSize(12).fillColor("#1E1E2F").text("Agreed Rate:", 50, y);
  doc.text(`$${Number(shipperRate).toLocaleString()}`, 200, y);
  y += 30;

  // Special Instructions
  const instructions = fd.specialInstructions || load.specialInstructions || load.notes;
  if (instructions) {
    y = checkPageBreak(doc, y, 60);
    y = sectionTitle(doc, "SPECIAL INSTRUCTIONS", y);
    doc.fontSize(9).fillColor("#1E1E2F").text(instructions, 50, y, { width: 510 });
    y += doc.heightOfString(instructions, { width: 510 }) + 15;
  }

  // Signatures
  y = checkPageBreak(doc, y, 80);
  y = sectionTitle(doc, "AUTHORIZATION", y);
  y += 10;
  doc.fontSize(8).fillColor("#888888");
  doc.text("Authorized by Silk Route Logistics", 50, y);
  doc.text("Acknowledged by Shipper", 310, y);
  y += 30;
  doc.moveTo(50, y).lineTo(250, y).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(310, y).lineTo(550, y).strokeColor("#1E1E2F").lineWidth(0.5).stroke();

  addFooter(doc);
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
  invoiceNumber: string; amount: number; status: string;
  factoringFee?: number | null; advanceAmount?: number | null;
  dueDate?: Date | null; createdAt: Date;
  load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; rate: number; pickupDate: Date; deliveryDate: Date };
  user: { firstName: string; lastName: string; company?: string | null };
  lineItems?: InvoiceLineItemData[];
}

export function generateInvoicePDF(invoice: InvoiceData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const hasLineItems = invoice.lineItems && invoice.lineItems.length > 0;

  addHeader(doc, "INVOICE");

  let y = 155;

  labelValue(doc, "Invoice Number", invoice.invoiceNumber, 50, y);
  labelValue(doc, "Date", invoice.createdAt.toLocaleDateString(), 250, y);
  labelValue(doc, "Status", invoice.status, 400, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Bill To
  doc.fontSize(11).fillColor("#D4A843").text("BILL TO", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(invoice.user.company || `${invoice.user.firstName} ${invoice.user.lastName}`, 50, y);

  // From
  doc.fontSize(11).fillColor("#D4A843").text("FROM", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 310, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 310, y + 14);

  y += 50;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Load Details
  doc.fontSize(11).fillColor("#D4A843").text("LOAD DETAILS", 50, y);
  y += 20;

  labelValue(doc, "Reference", invoice.load.referenceNumber, 50, y);
  labelValue(doc, "Route", `${invoice.load.originCity}, ${invoice.load.originState} → ${invoice.load.destCity}, ${invoice.load.destState}`, 200, y);
  y += 35;
  labelValue(doc, "Pickup", invoice.load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Delivery", invoice.load.deliveryDate.toLocaleDateString(), 200, y);

  y += 45;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  if (hasLineItems) {
    // Line Items Table
    doc.fontSize(11).fillColor("#D4A843").text("LINE ITEMS", 50, y);
    y += 20;

    // Table header
    doc.fontSize(8).fillColor("#888888");
    doc.text("Description", 50, y);
    doc.text("Type", 250, y);
    doc.text("Qty", 340, y);
    doc.text("Rate", 390, y);
    doc.text("Amount", 470, y);
    y += 14;
    doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
    y += 8;

    // Table rows
    doc.fontSize(9).fillColor("#1E1E2F");
    for (const li of invoice.lineItems!) {
      if (y > 650) { addFooter(doc); doc.addPage(); addHeader(doc, "INVOICE (cont.)"); y = 155; }
      doc.text(li.description, 50, y, { width: 195 });
      doc.text(li.type.replace(/_/g, " "), 250, y);
      doc.text(String(li.quantity), 340, y);
      doc.text(`$${li.rate.toLocaleString()}`, 390, y);
      doc.text(`$${li.amount.toLocaleString()}`, 470, y);
      y += 18;
    }

    // Subtotal
    y += 5;
    doc.moveTo(380, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
    y += 8;

    const subtotal = invoice.lineItems!.reduce((s, li) => s + li.amount, 0);
    doc.fontSize(10).fillColor("#1E1E2F");
    doc.text("Subtotal:", 390, y); doc.text(`$${subtotal.toLocaleString()}`, 470, y);
    y += 18;

    if (invoice.factoringFee) {
      doc.text("Factoring Fee:", 390, y); doc.text(`-$${invoice.factoringFee.toLocaleString()}`, 470, y);
      y += 18;
    }

    doc.fontSize(13).fillColor("#1E1E2F");
    doc.text("Total Due:", 390, y); doc.text(`$${invoice.amount.toLocaleString()}`, 470, y);
    y += 25;
  } else {
    // Simple amount layout (fallback)
    doc.fontSize(11).fillColor("#D4A843").text("AMOUNT", 50, y);
    y += 20;

    doc.fontSize(10).fillColor("#1E1E2F");
    doc.text("Load Rate:", 50, y); doc.text(`$${invoice.load.rate.toLocaleString()}`, 250, y);
    y += 18;
    if (invoice.factoringFee) {
      doc.text("Factoring Fee:", 50, y); doc.text(`-$${invoice.factoringFee.toLocaleString()}`, 250, y);
      y += 18;
    }
    doc.fontSize(14).fillColor("#1E1E2F");
    doc.text("Total Due:", 50, y); doc.text(`$${invoice.amount.toLocaleString()}`, 250, y);
    y += 25;
  }

  if (invoice.dueDate) {
    doc.fontSize(9).fillColor("#888888").text(`Due Date: ${invoice.dueDate.toLocaleDateString()}`, 50, y);
    y += 20;
  }

  // Payment Instructions
  y += 15;
  doc.fontSize(9).fillColor("#D4A843").text("PAYMENT INSTRUCTIONS", 50, y);
  y += 14;
  doc.fontSize(9).fillColor("#1E1E2F");
  doc.text("Please remit payment to Silk Route Logistics Inc.", 50, y);
  doc.text("For questions, contact accounting@silkroutelogistics.ai", 50, y + 14);

  addFooter(doc);
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
    load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; pickupDate: Date; deliveryDate: Date };
    amount: number;
    quickPayDiscount: number | null;
    netAmount: number;
  }[];
}

export function generateSettlementPDF(settlement: SettlementPDFData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "CARRIER SETTLEMENT STATEMENT");

  let y = 155;

  // Settlement info
  labelValue(doc, "Settlement #", settlement.settlementNumber, 50, y);
  labelValue(doc, "Period", `${settlement.periodStart.toLocaleDateString()} — ${settlement.periodEnd.toLocaleDateString()}`, 200, y);
  labelValue(doc, "Status", settlement.status, 450, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Carrier info
  doc.fontSize(11).fillColor("#D4A843").text("CARRIER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(settlement.carrier.company || `${settlement.carrier.firstName} ${settlement.carrier.lastName}`, 50, y);

  // From
  doc.fontSize(11).fillColor("#D4A843").text("ISSUED BY", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 310, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 310, y + 14);

  y += 50;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Loads table
  doc.fontSize(11).fillColor("#D4A843").text("LOADS", 50, y);
  y += 20;

  // Table header
  doc.fontSize(8).fillColor("#888888");
  doc.text("Reference", 50, y);
  doc.text("Route", 150, y);
  doc.text("Pickup", 340, y);
  doc.text("Delivery", 420, y);
  doc.text("Gross Pay", 500, y);
  y += 14;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 8;

  // Table rows
  doc.fontSize(9).fillColor("#1E1E2F");
  for (const cp of settlement.carrierPays) {
    if (y > 630) { addFooter(doc); doc.addPage(); addHeader(doc, "SETTLEMENT (cont.)"); y = 155; }
    doc.text(cp.load.referenceNumber, 50, y);
    doc.text(`${cp.load.originCity}, ${cp.load.originState} → ${cp.load.destCity}, ${cp.load.destState}`, 150, y, { width: 185 });
    doc.text(cp.load.pickupDate.toLocaleDateString(), 340, y);
    doc.text(cp.load.deliveryDate.toLocaleDateString(), 420, y);
    doc.text(`$${cp.amount.toLocaleString()}`, 500, y);
    y += 18;
  }

  y += 10;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Deductions section
  doc.fontSize(11).fillColor("#D4A843").text("SUMMARY", 50, y);
  y += 20;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text("Gross Pay:", 50, y); doc.text(`$${settlement.grossPay.toLocaleString()}`, 250, y);
  y += 18;

  // QuickPay deductions
  const quickPayTotal = settlement.carrierPays.reduce((s, cp) => s + (cp.quickPayDiscount || 0), 0);
  if (quickPayTotal > 0) {
    doc.text("QuickPay Discount:", 50, y); doc.text(`-$${quickPayTotal.toLocaleString()}`, 250, y);
    y += 18;
  }

  const otherDeductions = settlement.deductions - quickPayTotal;
  if (otherDeductions > 0) {
    doc.text("Other Deductions:", 50, y); doc.text(`-$${otherDeductions.toLocaleString()}`, 250, y);
    y += 18;
  }

  y += 5;
  doc.moveTo(50, y).lineTo(350, y).strokeColor("#D4A843").lineWidth(1).stroke();
  y += 10;

  doc.fontSize(14).fillColor("#1E1E2F");
  doc.text("Net Settlement:", 50, y); doc.text(`$${settlement.netSettlement.toLocaleString()}`, 250, y);

  // Payment instructions
  y += 40;
  doc.fontSize(9).fillColor("#D4A843").text("PAYMENT INSTRUCTIONS", 50, y);
  y += 14;
  doc.fontSize(9).fillColor("#1E1E2F");
  doc.text("Payment will be remitted via ACH or check within the standard payment terms.", 50, y);
  doc.text("For questions, contact accounting@silkroutelogistics.ai", 50, y + 14);

  addFooter(doc);
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
