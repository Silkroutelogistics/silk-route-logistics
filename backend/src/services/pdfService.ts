import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import bwipjs from "bwip-js";
import { calculateMileage, MileageResult } from "./mileageService";

type PDFDoc = InstanceType<typeof PDFDocument>;

const COMPANY = {
  name: "Silk Route Logistics Inc.",
  address: "Kalamazoo, Michigan",
  cityStateZip: "Kalamazoo, MI",
  phone: "+1 (269) 220-6760",
  email: "whaider@silkroutelogistics.ai",
  website: "silkroutelogistics.ai",
  mc: "01794414",
  dot: "4526880",
};

const LOGO_PATH = path.resolve(__dirname, "../../assets/logo.png");
const hasLogo = fs.existsSync(LOGO_PATH);

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
}

export async function generateBOLFromLoad(load: LoadBOLData): Promise<PDFDoc> {
  const doc = new PDFDocument({ margin: 34, size: "LETTER" });
  const M = 34; // margin
  const CW = 612 - 2 * M; // content width (letter = 612pt)
  const PH = 792; // page height
  const INK = "#1A1A1A";
  const GRAY1 = "#3D3D3D";
  const GRAY2 = "#6E6E6E";
  const GRAY3 = "#AAAAAA";
  const RULE = "#C8C8C8";
  const GOLD = "#B8972F";
  const TINT = "#F8F7F4";
  const HDR_BG = "#2A2A2A";
  const TOT_BG = "#F0EDE6";

  const ref = load.loadNumber || load.referenceNumber;
  const bolNum = ref.startsWith("SRL-") ? `BOL-${ref}` : `BOL-SRL-${ref}`;

  // Generate barcode
  let barcodeBuffer: Buffer | null = null;
  try {
    barcodeBuffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: bolNum,
      scale: 3,
      height: 10,
      includetext: false,
    });
  } catch { /* barcode generation failed — continue without it */ }

  // ════════════════════════════════════════════════════
  // PAGE 1 — SHIPMENT DETAILS
  // ════════════════════════════════════════════════════

  // Gold accent bar at top
  doc.rect(0, PH - 4, 612, 4).fill(GOLD);

  let y = PH - 4;

  // ── Logo
  if (hasLogo) {
    doc.image(LOGO_PATH, M, y - 78, { width: 62, height: 62, fit: [62, 62] });
  }

  // ── Company info
  const tx = M + 76;
  doc.fontSize(15).fillColor(INK).text("SILK ROUTE LOGISTICS INC.", tx, y - 20);
  doc.fontSize(7).fillColor(GRAY1);
  doc.text(COMPANY.address, tx, y - 32);
  doc.text(`${COMPANY.phone}  |  ${COMPANY.email}`, tx, y - 43);
  doc.text(COMPANY.website, tx, y - 54);
  // Tagline
  doc.fontSize(6.5).fillColor(GOLD).text("Where Trust Travels.", tx, y - 66, { oblique: true });

  // ── Title + barcode right
  doc.fontSize(22).fillColor(INK).text("Bill of Lading", 0, y - 14, { align: "right", width: 612 - M });
  doc.fontSize(8).fillColor(GOLD).text("Straight \u2014 Non Negotiable", 0, y - 28, { align: "right", width: 612 - M });

  if (barcodeBuffer) {
    doc.image(barcodeBuffer, 612 - M - 150, y - 68, { width: 150, height: 36 });
    doc.fontSize(7).fillColor(INK).text(bolNum, 612 - M - 150, y - 80, { width: 150, align: "center" });
  }

  y -= 90;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(INK).lineWidth(1.2).stroke();
  doc.moveTo(M, y - 2.5).lineTo(612 - M, y - 2.5).strokeColor(GOLD).lineWidth(0.5).stroke();

  // ── Reference row (5 columns)
  y -= 7;
  const rh = 36;
  const ry = y - rh;
  doc.rect(M, ry, CW, rh).fill(TINT);
  doc.rect(M, ry, CW, rh).strokeColor(RULE).lineWidth(0.4).stroke();
  const cw5 = CW / 5;
  const pickupDateFmt = load.pickupDate instanceof Date
    ? load.pickupDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : String(load.pickupDate);
  const refs = [
    ["BOL #", bolNum],
    ["DATE", pickupDateFmt],
    ["LOAD REF", load.referenceNumber],
    ["EQUIPMENT", load.equipmentType],
    ["MC# / DOT#", `${COMPANY.mc} / ${COMPANY.dot}`],
  ];
  refs.forEach(([lbl, val], i) => {
    const rx = M + i * cw5;
    if (i) doc.moveTo(rx, ry).lineTo(rx, ry + rh).strokeColor(RULE).lineWidth(0.4).stroke();
    doc.fontSize(5.5).fillColor(GRAY2).text(lbl, rx + 6, ry + rh - 10);
    doc.fontSize(i < 4 ? 9 : 8).fillColor(INK).text(val, rx + 6, ry + 5);
  });

  // ── Shipper / Consignee
  y = ry - 8;
  const leftX = M;
  const rightX = M + CW * 0.52;

  // Section labels with gold rule
  doc.fontSize(7).fillColor(GOLD).text("PICKUP FROM", leftX, y);
  doc.text("DELIVER TO", rightX, y);
  y -= 4;
  doc.moveTo(leftX, y).lineTo(leftX + CW * 0.48, y).strokeColor(RULE).lineWidth(0.3).stroke();
  doc.moveTo(rightX, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  y -= 14;
  const shipperName = load.shipperFacility || load.customer?.name || "\u2014";
  doc.fontSize(12).fillColor(INK).text(shipperName, leftX, y);
  doc.fontSize(8.5).fillColor(GRAY1);
  let sty = y - 14;
  if (load.customer?.address || load.originAddress) { doc.text(load.customer?.address || load.originAddress || "", leftX, sty); sty -= 12; }
  const shipperCSZ = load.customer?.city
    ? `${load.customer.city}, ${load.customer.state} ${load.customer.zip}`
    : `${load.originCity}, ${load.originState} ${load.originZip}`;
  doc.text(shipperCSZ, leftX, sty); sty -= 16;
  doc.fontSize(7.5).fillColor(GRAY2);
  const sc = load.originContactName || load.customer?.contactName;
  const sp = load.originContactPhone || load.customer?.phone;
  if (sc || sp) doc.text(`Contact:  ${sc || ""}  |  ${sp || ""}`, leftX, sty);

  const consigneeName = load.consigneeFacility || "\u2014";
  doc.fontSize(12).fillColor(INK).text(consigneeName, rightX, y);
  doc.fontSize(8.5).fillColor(GRAY1);
  let cty = y - 14;
  if (load.destAddress) { doc.text(load.destAddress, rightX, cty); cty -= 12; }
  doc.text(`${load.destCity}, ${load.destState} ${load.destZip}`, rightX, cty); cty -= 16;
  doc.fontSize(7.5).fillColor(GRAY2);
  if (load.destContactName || load.destContactPhone) doc.text(`Contact:  ${load.destContactName || ""}  |  ${load.destContactPhone || ""}`, rightX, cty);

  y = Math.min(sty, cty) - 14;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  // ── Third Party / Schedule
  y -= 8;
  doc.fontSize(7).fillColor(GOLD).text("THIRD PARTY BILL TO", leftX, y);
  doc.text("PICKUP & DELIVERY SCHEDULE", rightX, y);
  y -= 4;
  doc.moveTo(leftX, y).lineTo(leftX + CW * 0.48, y).strokeColor(RULE).lineWidth(0.3).stroke();
  doc.moveTo(rightX, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  y -= 14;
  doc.fontSize(10).fillColor(INK).text(COMPANY.name, leftX, y);
  doc.fontSize(8).fillColor(GRAY1);
  doc.text(COMPANY.address, leftX, y - 13);
  doc.text(COMPANY.phone, leftX, y - 25);

  // Schedule with time windows + route dots
  const deliveryDateFmt = load.deliveryDate instanceof Date
    ? load.deliveryDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : String(load.deliveryDate);
  const puDateFmt = load.pickupDate instanceof Date
    ? load.pickupDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : String(load.pickupDate);
  const pickupWindow = (load.pickupTimeStart && load.pickupTimeEnd) ? `${load.pickupTimeStart} \u2013 ${load.pickupTimeEnd}` : (load.pickupTimeStart || "\u2014");
  const deliveryWindow = (load.deliveryTimeStart && load.deliveryTimeEnd) ? `${load.deliveryTimeStart} \u2013 ${load.deliveryTimeEnd}` : (load.deliveryTimeStart || "\u2014");

  doc.fontSize(6.5).fillColor(GRAY2).text("PICKUP", rightX, y + 2);
  doc.fontSize(11).fillColor(INK).text(puDateFmt, rightX, y - 12);
  doc.fontSize(7.5).fillColor(GRAY2).text(`Window:  ${pickupWindow}`, rightX, y - 24);

  doc.fontSize(6.5).fillColor(GRAY2).text("DELIVERY", rightX, y - 38);
  doc.fontSize(11).fillColor(INK).text(deliveryDateFmt, rightX, y - 50);
  doc.fontSize(7.5).fillColor(GRAY2).text(`Window:  ${deliveryWindow}`, rightX, y - 62);

  // Gold route dots
  const dx = 612 - M - 18;
  doc.circle(dx, PH - (PH - (y - 16)), 4).fill(GOLD);
  doc.circle(dx, PH - (PH - (y - 54)), 4).fill(GOLD);
  doc.moveTo(dx, y - 20).lineTo(dx, y - 50).strokeColor(GOLD).lineWidth(1.2).dash(3, { space: 3 }).stroke();
  doc.undash();

  y -= 76;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  // ── Additional References
  y -= 8;
  doc.fontSize(7).fillColor(GOLD).text("ADDITIONAL REFERENCES", M, y);
  y -= 4;
  doc.moveTo(M, y).lineTo(M + 130, y).strokeColor(RULE).lineWidth(0.3).stroke();
  y -= 14;
  doc.fontSize(6.5).fillColor(GRAY2).text("PO #:", M, y);
  doc.fontSize(8.5).fillColor(INK).text("\u2014", M + 28, y);
  doc.fontSize(6.5).fillColor(GRAY2).text("Pickup Ref #:", M + 120, y);
  doc.fontSize(8.5).fillColor(INK).text("\u2014", M + 178, y);
  doc.fontSize(6.5).fillColor(GRAY2).text("Delivery Ref #:", M + 280, y);
  doc.fontSize(8.5).fillColor(INK).text("\u2014", M + 346, y);

  y -= 14;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  // ── Shipment Details header
  y -= 8;
  doc.fontSize(7).fillColor(GOLD).text("SHIPMENT DETAILS", M, y);
  y -= 14;

  // ── Grid table: header
  const colDefs = [
    { label: "Pieces", w: 44 },
    { label: "Type", w: 34 },
    { label: "Description", w: 114 },
    { label: 'Dims (L\u00D7W\u00D7H)', w: 76 },
    { label: "Weight", w: 66 },
    { label: "Class", w: 36 },
    { label: "NMFC#", w: 44 },
    { label: "HM", w: CW - 44 - 34 - 114 - 76 - 66 - 36 - 44 },
  ];
  const hdrH = 18;
  const dataRowH = 20;

  // Header row (dark bg)
  doc.rect(M, y - hdrH, CW, hdrH).fill(HDR_BG);
  let cx = M;
  colDefs.forEach((col) => {
    doc.fontSize(6).fillColor("#FFFFFF").text(col.label, cx + 4, y - hdrH + 6);
    cx += col.w;
  });
  // Header border + verticals
  doc.rect(M, y - hdrH, CW, hdrH).strokeColor("#444444").lineWidth(0.5).stroke();
  cx = M;
  colDefs.forEach((col) => {
    cx += col.w;
    if (cx < M + CW) doc.moveTo(cx, y).lineTo(cx, y - hdrH).strokeColor("#444444").lineWidth(0.5).stroke();
  });

  const tableTop = y - hdrH;

  // Data row
  const pcs = load.pieces ? String(load.pieces) : "\u2014";
  const dims = (load.dimensionsLength && load.dimensionsWidth && load.dimensionsHeight)
    ? `${load.dimensionsLength}"\u00D7${load.dimensionsWidth}"\u00D7${load.dimensionsHeight}"`
    : "\u2014";
  const rowData = [pcs, "PLT", load.commodity || "General Freight", dims, load.weight ? `${load.weight.toLocaleString()} lbs` : "\u2014", load.freightClass || "\u2014", "\u2014", load.hazmat ? "Yes" : "No"];

  const dry = tableTop - dataRowH;
  doc.rect(M, dry, CW, dataRowH).fill(TINT);
  doc.rect(M, dry, CW, dataRowH).strokeColor(RULE).lineWidth(0.4).stroke();
  cx = M;
  colDefs.forEach((col, ci) => {
    if (ci > 0) doc.moveTo(cx, tableTop).lineTo(cx, dry).strokeColor(RULE).lineWidth(0.4).stroke();
    if (rowData[ci]) {
      const isBold = ci < 3;
      doc.fontSize(8).fillColor(INK);
      if (isBold) doc.font("Helvetica-Bold"); else doc.font("Helvetica");
      doc.text(rowData[ci], cx + 4, dry + 6);
    }
    cx += col.w;
  });
  doc.font("Helvetica"); // reset

  // Totals row
  const totY = dry - dataRowH;
  doc.rect(M, totY, CW, dataRowH).fill(TOT_BG);
  doc.rect(M, totY, CW, dataRowH).strokeColor(INK).lineWidth(0.6).stroke();
  doc.fontSize(7).fillColor(INK).font("Helvetica-Bold");
  doc.text("TOTALS:", M + 4, totY + 6);
  doc.text(pcs + " PLT", M + 44, totY + 6);
  const weightX = M + 44 + 34 + 114 + 76;
  doc.text(load.weight ? `${load.weight.toLocaleString()} lbs` : "\u2014", weightX + 4, totY + 6);
  doc.font("Helvetica");

  y = totY - 10;
  doc.fontSize(7).fillColor(GRAY2);
  doc.text("Declared Value:  NVD", M, y);
  doc.text("Freight Charges:  PREPAID (Third Party)", 0, y, { align: "right", width: 612 - M });

  y -= 12;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  // ── Special Instructions
  y -= 8;
  const instructions = load.specialInstructions || load.notes;
  doc.fontSize(7).fillColor(GOLD).text("SPECIAL INSTRUCTIONS", M, y);
  doc.fontSize(7.5).fillColor(GRAY2).text(instructions || "None", M + 108, y);

  y -= 12;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(RULE).lineWidth(0.3).stroke();

  // ── Signatures — anchored to bottom
  const sigBase = 46;
  const tw = (CW - 24) / 3;

  doc.fontSize(7).fillColor(GOLD).text("SIGNATURES", M, sigBase + 118);
  doc.moveTo(M, sigBase + 114).lineTo(612 - M, sigBase + 114).strokeColor(RULE).lineWidth(0.3).stroke();

  const sigs: [string, string[]][] = [
    ["Shipper / Representative", ["Signature", "Print Name", "Date", "Pieces Tendered"]],
    ["Carrier / Driver", ["Signature", "Driver Name", "Truck #", "Trailer #", "Seal #", "Date"]],
    ["Consignee / Receiver", ["Signature", "Print Name", "Date", "Pieces Received"]],
  ];
  sigs.forEach(([title, fields], i) => {
    const bx = M + i * (tw + 12);
    let by = sigBase + 100;
    doc.fontSize(7).fillColor(INK).font("Helvetica-Bold").text(title, bx, by);
    doc.font("Helvetica");
    by -= 13;
    fields.forEach((f) => {
      doc.fontSize(6.5).fillColor(GRAY2).text(f, bx, by);
      const lw = doc.widthOfString(f) + 5;
      doc.moveTo(bx + lw, by - 2).lineTo(bx + tw, by - 2).strokeColor(GRAY3).lineWidth(0.3).stroke();
      by -= 14;
    });
  });

  // ── Footer p1
  doc.moveTo(M, 34).lineTo(612 - M, 34).strokeColor(GOLD).lineWidth(1).stroke();
  doc.fontSize(6).fillColor(GRAY2).text(
    `${COMPANY.name}  |  ${COMPANY.address}  |  ${COMPANY.phone}  |  ${COMPANY.website}  |  MC# ${COMPANY.mc}  |  DOT# ${COMPANY.dot}`,
    0, 22, { align: "center", width: 612 }
  );
  doc.fontSize(5.5).fillColor(GOLD).text("Where Trust Travels.", 0, 12, { align: "center", width: 612 });
  doc.fontSize(5).fillColor(GRAY3).text("Page 1 of 2", 0, 12, { align: "right", width: 612 - M });

  // ════════════════════════════════════════════════════
  // PAGE 2 — TERMS AND CONDITIONS (17 clauses)
  // ════════════════════════════════════════════════════
  doc.addPage();
  doc.rect(0, PH - 4, 612, 4).fill(GOLD);

  y = PH - 4;
  doc.fontSize(11).fillColor(INK).font("Helvetica-Bold").text("SILK ROUTE LOGISTICS INC.", M, y - 24);
  doc.font("Helvetica").fontSize(7).fillColor(GRAY2).text(`MC# ${COMPANY.mc}  |  DOT# ${COMPANY.dot}  |  ${COMPANY.phone}`, M, y - 36);
  doc.fontSize(9).fillColor(INK).font("Helvetica-Bold").text(bolNum, 0, y - 24, { align: "right", width: 612 - M });
  doc.font("Helvetica").fontSize(7).fillColor(GRAY2).text(`${pickupDateFmt}  |  ${load.referenceNumber}`, 0, y - 36, { align: "right", width: 612 - M });

  y -= 48;
  doc.moveTo(M, y).lineTo(612 - M, y).strokeColor(INK).lineWidth(0.8).stroke();
  y -= 20;
  doc.fontSize(14).fillColor(INK).font("Helvetica-Bold").text("Terms and Conditions", M, y);
  y -= 6;
  doc.moveTo(M, y).lineTo(M + 170, y).strokeColor(GOLD).lineWidth(1.5).stroke();
  y -= 16;

  const tclauses: [string, string][] = [
    ["1. ACCEPTANCE & CARRIAGE",
     "The goods described herein are accepted in apparent good order and condition (except as noted) for carriage subject to the Uniform Straight Bill of Lading and applicable U.S. DOT regulations. This BOL is non-negotiable and serves as receipt of goods only; it does not constitute a separate contract of carriage."],
    ["2. LIABILITY (CARMACK AMENDMENT)",
     "Carrier is liable for loss, damage, or delay to cargo pursuant to 49 U.S.C. \u00A7 14706. Liability extends to the full actual value of the goods. No limitation stated on this BOL or any other document shall reduce Carrier\u2019s liability below full actual value unless a written released-value agreement is executed per 49 CFR \u00A7 1035."],
    ["3. INSURANCE REQUIREMENTS",
     "Carrier shall maintain: (a) Commercial General Liability and Automobile Liability with combined single limits of not less than $1,000,000 per occurrence; (b) Cargo Liability of not less than $100,000 per shipment; (c) Workers\u2019 Compensation as required by law."],
    ["4. CLAIMS",
     "Written claims for loss, damage, or delay must be filed within nine (9) months of delivery or scheduled delivery date. Carrier shall note any damage, shortage, or discrepancy on this BOL or delivery receipt at time of delivery."],
    ["5. INDEPENDENT CONTRACTOR",
     "Carrier operates as an independent contractor with sole control over the manner and means of transportation. Carrier is not an agent, employee, or partner of Silk Route Logistics Inc. (\u201CSRL\u201D)."],
    ["6. DOUBLE BROKERING & SUB-CONTRACTING PROHIBITION",
     "Carrier shall transport all freight on equipment operated exclusively by Carrier. Carrier shall not re-broker, assign, interline, sub-contract, or transfer freight to any third party without prior written consent of SRL. Violation constitutes a material breach."],
    ["7. NON-SOLICITATION & NON-CIRCUMVENTION",
     "Carrier shall not directly or indirectly solicit, divert, or accept traffic from any shipper or customer of SRL where such traffic became known through SRL, for twelve (12) months following the last load tendered. Violation entitles SRL to a commission of 35% of gross transportation revenue."],
    ["8. NON-BILLING",
     "Carrier shall not bill or accept payment from the shipper, consignee, or any third party for transportation arranged by SRL. Carrier waives any tariff, lien, or right to pursue the shipper/consignee for amounts owed."],
    ["9. INDEMNIFICATION",
     "Carrier shall defend, indemnify, and hold harmless SRL from all claims, damages, liabilities, fines, and expenses arising from Carrier\u2019s performance, negligence, or breach."],
    ["10. DETENTION & ACCESSORIALS",
     "All accessorial charges including detention, lumper fees, layover, and TONU must be pre-approved in writing by SRL prior to being incurred. Unapproved charges will not be honored."],
    ["11. FORCE MAJEURE",
     "Neither party shall be liable for failure to perform due to causes beyond its reasonable control, including acts of God, war, terrorism, government action, epidemic, or natural disaster."],
    ["12. DELIVERY RECEIPT & PROOF OF DELIVERY",
     "Carrier shall obtain a signed delivery receipt from the consignee. The delivery receipt must be dated and signed. Signed BOL/POD must accompany all invoices for payment processing."],
    ["13. EQUIPMENT & COMPLIANCE",
     "Carrier certifies that all equipment meets FMCSA/DOT safety standards and holds a Satisfactory safety rating. Carrier shall comply with all applicable laws including ELD mandates and 49 CFR Parts 171-180 for hazardous materials."],
    ["14. CONFIDENTIALITY",
     "All rates, lanes, shipper identities, and business terms are proprietary and confidential. Carrier shall not disclose such information to any third party."],
    ["15. SEVERABILITY",
     "If any provision is held to be invalid, the remaining provisions shall continue in full force and effect."],
    ["16. ENTIRE AGREEMENT",
     "This BOL, together with the Broker-Carrier Agreement and any applicable Rate/Load Confirmation, constitutes the entire agreement. No oral agreements shall be binding unless confirmed in writing."],
    ["17. GOVERNING LAW",
     "This BOL shall be governed by the laws of the State of Michigan and applicable federal transportation law. Freight charges are prepaid unless otherwise noted."],
  ];

  doc.font("Helvetica");
  const fs = 6.8;
  const lh = 9;
  for (const [title, body] of tclauses) {
    doc.fontSize(7.2).fillColor(INK).font("Helvetica-Bold").text(title, M, y);
    y -= lh + 0.5;
    doc.fontSize(fs).fillColor(GRAY1).font("Helvetica");
    const lines = doc.heightOfString(body, { width: CW, lineGap: 0 });
    doc.text(body, M, y, { width: CW, lineGap: 0 });
    y -= lines + 4;
  }

  // Footer p2
  doc.moveTo(M, 36).lineTo(612 - M, 36).strokeColor(GOLD).lineWidth(1).stroke();
  doc.fontSize(6).fillColor(GRAY2).text(
    `${COMPANY.name}  |  ${COMPANY.address}  |  ${COMPANY.phone}  |  ${COMPANY.website}  |  MC# ${COMPANY.mc}  |  DOT# ${COMPANY.dot}`,
    0, 24, { align: "center", width: 612 }
  );
  doc.fontSize(5.5).fillColor(GOLD).text("Where Trust Travels.", 0, 14, { align: "center", width: 612 });
  doc.fontSize(5).fillColor(GRAY3).text("Page 2 of 2", 0, 14, { align: "right", width: 612 - M });

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
