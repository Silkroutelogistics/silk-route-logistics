/**
 * Compass PDF Report Generator
 * Generates a compact 1-2 page professional PDF summary of Compass carrier compliance checks.
 */

import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import type { CarrierVettingReport, VettingCheck, CheckResult, DataSource } from "./carrierVettingService";

type PDFDoc = InstanceType<typeof PDFDocument>;

const COMPANY = {
  name: "Silk Route Logistics Inc.",
  location: "Galesburg, MI",
  mc: "MC# 01794414",
  dot: "DOT# 4526880",
};

const LOGO_PATH = path.resolve(__dirname, "../../assets/logo.png");
const hasLogo = fs.existsSync(LOGO_PATH);

// Colors
const COLOR = {
  pass: "#16a34a",
  warning: "#d97706",
  fail: "#dc2626",
  navy: "#0d1b2a",
  gold: "#c9a84c",
  lightGray: "#e5e7eb",
  medGray: "#888888",
  darkText: "#1e1e2f",
};

const SYMBOL: Record<CheckResult, string> = {
  PASS: "\u2713",    // check mark
  WARNING: "\u26A0", // warning triangle
  FAIL: "\u2717",    // x mark
};

const RESULT_COLOR: Record<CheckResult, string> = {
  PASS: COLOR.pass,
  WARNING: COLOR.warning,
  FAIL: COLOR.fail,
};

const SOURCE_INDICATOR: Record<DataSource, string> = {
  LIVE: "\uD83D\uDFE2",  // green circle
  DB: "\uD83D\uDD35",    // blue circle
  SELF: "\u26AA",         // white circle
};

// Category grouping for the 35 checks
interface CheckCategory {
  name: string;
  indices: number[]; // 1-based check numbers
}

const CATEGORIES: CheckCategory[] = [
  { name: "FMCSA Authority & Safety", indices: [1, 2, 3, 4, 5, 6, 7] },
  { name: "Insurance & Financial", indices: [3, 8, 17, 21] },
  { name: "Identity & Fraud", indices: [11, 12, 13, 14, 15, 19, 23, 30, 31] },
  { name: "Compliance & Documentation", indices: [16, 20, 24, 26, 29, 32, 33, 34, 35] },
  { name: "Performance & Operations", indices: [9, 10, 18, 25, 27, 28] },
];

export interface CompassCarrierData {
  companyName: string;
  dotNumber: string;
  mcNumber: string;
  contactName: string;
  tier: string;
  milestone: string;
}

/** Map check names to their data source */
function inferSource(check: VettingCheck): DataSource {
  if (check.source) return check.source;
  const name = check.name.toLowerCase();
  // LIVE: FMCSA API, OFAC, CSA, SAM.gov, ELD, overbooking
  if (name.includes("fmcsa") || name.includes("out of service") || name.includes("safety rating")
    || name.includes("double-broker risk") || name.includes("fleet size") || name.includes("new carrier risk")
    || name.includes("ofac") || name.includes("csa") || name.includes("sam.gov")
    || name.includes("eld") || name.includes("overbooking") || name.includes("mcs-150")
    || name.includes("boc-3")) {
    return "LIVE";
  }
  // DB: internal records
  if (name.includes("insurance minimums") || name.includes("insurance expiry") || name.includes("historical")
    || name.includes("document") || name.includes("agreement") || name.includes("fraud report")
    || name.includes("probationary") || name.includes("vin") || name.includes("authority age")) {
    return "DB";
  }
  // SELF: carrier-reported data
  if (name.includes("ucr") || name.includes("irp") || name.includes("ifta")
    || name.includes("identity") || name.includes("email") || name.includes("voip")
    || name.includes("chameleon") || name.includes("business entity") || name.includes("biometric")
    || name.includes("tin") || name.includes("facial")) {
    return "SELF";
  }
  return "DB";
}

function addHeader(doc: PDFDoc, carrierName: string) {
  if (hasLogo) {
    doc.image(LOGO_PATH, 50, 30, { width: 50, height: 50 });
  }

  // Title block
  doc.fontSize(14).fillColor(COLOR.navy).font("Helvetica-Bold");
  doc.text("COMPASS CARRIER COMPLIANCE REPORT", 110, 33);
  doc.fontSize(11).fillColor(COLOR.gold).font("Helvetica-Bold");
  doc.text(carrierName.toUpperCase(), 110, 50);

  // Company info right-aligned
  doc.fontSize(6.5).fillColor(COLOR.medGray).font("Helvetica");
  doc.text(COMPANY.name, 400, 33, { align: "right" });
  doc.text(COMPANY.location, 400, 42, { align: "right" });
  doc.text(`${COMPANY.mc} | ${COMPANY.dot}`, 400, 51, { align: "right" });

  doc.moveTo(50, 70).lineTo(560, 70).strokeColor(COLOR.gold).lineWidth(1.5).stroke();
}

function addFooter(doc: PDFDoc, carrierName: string) {
  const y = doc.page.height - 40;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  doc.moveTo(50, y).lineTo(560, y).strokeColor(COLOR.lightGray).lineWidth(0.5).stroke();
  doc.fontSize(5.5).fillColor(COLOR.medGray).font("Helvetica");
  doc.text(
    `Compass Report \u2014 ${carrierName} \u2014 Generated ${dateStr} \u2014 ${COMPANY.name} \u2014 CONFIDENTIAL`,
    50, y + 4, { align: "center", width: 510 }
  );
}

function drawSeparator(doc: PDFDoc, y: number) {
  doc.moveTo(50, y).lineTo(560, y).strokeColor(COLOR.gold).lineWidth(0.5).stroke();
}

function ensureSpace(doc: PDFDoc, needed: number, carrierName: string): number {
  const y = (doc as any).y as number;
  if (y + needed > doc.page.height - 50) {
    doc.addPage();
    addHeader(doc, carrierName);
    addFooter(doc, carrierName);
    return 80;
  }
  return y;
}

export function generateCompassReport(
  report: CarrierVettingReport,
  carrierData: CompassCarrierData
): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const cName = carrierData.companyName || "Unknown Carrier";

  // ── Page 1: Header & Summary ──
  addHeader(doc, cName);
  addFooter(doc, cName);

  let y = 76;

  // Compact carrier info line
  doc.fontSize(7).fillColor(COLOR.darkText).font("Helvetica");
  doc.text(
    `DOT#: ${carrierData.dotNumber}  |  MC#: ${carrierData.mcNumber}  |  Contact: ${carrierData.contactName}  |  Tier: ${carrierData.tier}  |  Milestone: ${carrierData.milestone}`,
    50, y
  );
  y += 10;

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated: ${dateStr}`, 50, y);
  y += 12;

  drawSeparator(doc, y);
  y += 8;

  // ── Compact Score/Grade/Risk summary in one row ──
  const scoreColor = report.score >= 80 ? COLOR.pass : report.score >= 60 ? COLOR.warning : COLOR.fail;

  // Score box (small)
  doc.roundedRect(50, y, 80, 32, 3).fillAndStroke(scoreColor, scoreColor);
  doc.fontSize(16).fillColor("#ffffff").font("Helvetica-Bold");
  doc.text(`${report.score}/100`, 50, y + 4, { width: 80, align: "center" });
  doc.fontSize(6).fillColor("#ffffff").font("Helvetica");
  doc.text("SCORE", 50, y + 23, { width: 80, align: "center" });

  // Grade box
  doc.roundedRect(138, y, 50, 32, 3).fillAndStroke(COLOR.navy, COLOR.navy);
  doc.fontSize(16).fillColor(COLOR.gold).font("Helvetica-Bold");
  doc.text(report.grade, 138, y + 4, { width: 50, align: "center" });
  doc.fontSize(6).fillColor("#ffffff").font("Helvetica");
  doc.text("GRADE", 138, y + 23, { width: 50, align: "center" });

  // Risk/Recommendation/Trend inline
  doc.fontSize(8).fillColor(COLOR.darkText).font("Helvetica");
  doc.text(`Risk: ${report.riskLevel}  |  Recommendation: ${report.recommendation}`, 200, y + 6);
  if (report.scoreDelta !== null) {
    const arrow = report.scoreDelta > 0 ? "+" : "";
    doc.text(`Trend: ${report.trendDirection || "N/A"} (${arrow}${report.scoreDelta})`, 200, y + 18);
  }

  y += 40;
  drawSeparator(doc, y);
  y += 6;

  // ── Flags (compact, inline) ──
  if (report.flags.length > 0) {
    doc.fontSize(7).fillColor(COLOR.warning).font("Helvetica-Bold");
    doc.text("FLAGS: ", 50, y, { continued: true });
    doc.fillColor(COLOR.darkText).font("Helvetica");
    doc.text(report.flags.join("  \u2022  "), { width: 500 });
    y = (doc as any).y + 4;
    drawSeparator(doc, y);
    y += 6;
  }

  // ── Source legend ──
  doc.fontSize(5.5).fillColor(COLOR.medGray).font("Helvetica");
  doc.text(
    `${SOURCE_INDICATOR.LIVE} LIVE = Real-time API    ${SOURCE_INDICATOR.DB} DB = Stored Profile    ${SOURCE_INDICATOR.SELF} SELF = Carrier Self-Reported`,
    50, y
  );
  y += 10;

  // ── Detailed Check Results — 3-column compact grid ──
  doc.fontSize(8).fillColor(COLOR.navy).font("Helvetica-Bold");
  doc.text(`CHECK RESULTS (${report.checks.length} Checks)`, 50, y);
  y += 10;

  // Build a map for efficient lookup
  const checkMap = new Map<number, VettingCheck>();
  report.checks.forEach((check, i) => {
    checkMap.set(i + 1, check);
  });

  const rendered = new Set<number>();
  const COL_WIDTH = 165;
  const COL_STARTS = [50, 220, 390];
  const CHECK_HEIGHT = 9; // compact row height

  for (const category of CATEGORIES) {
    y = ensureSpace(doc, 20, cName);

    // Category header
    doc.fontSize(7.5).fillColor(COLOR.gold).font("Helvetica-Bold");
    doc.text(category.name.toUpperCase(), 50, y);
    y += 10;

    // Collect checks for this category
    const catChecks: { idx: number; check: VettingCheck }[] = [];
    for (const idx of category.indices) {
      if (rendered.has(idx)) continue;
      const check = checkMap.get(idx);
      if (!check) continue;
      rendered.add(idx);
      catChecks.push({ idx, check });
    }

    // Render in 3-column grid
    let col = 0;
    for (const { check } of catChecks) {
      if (col === 0) {
        y = ensureSpace(doc, CHECK_HEIGHT + 2, cName);
      }

      const x = COL_STARTS[col];
      const symbol = SYMBOL[check.result];
      const color = RESULT_COLOR[check.result];
      const src = SOURCE_INDICATOR[inferSource(check)];

      // Symbol
      doc.fontSize(7).fillColor(color).font("Helvetica-Bold");
      doc.text(`${symbol}`, x, y, { continued: false });

      // Name + detail truncated
      const detailTrunc = check.detail.length > 30 ? check.detail.slice(0, 28) + ".." : check.detail;
      doc.fontSize(6).fillColor(COLOR.darkText).font("Helvetica");
      doc.text(`${check.name}`, x + 8, y, { continued: false });
      doc.fontSize(5.5).fillColor(color).font("Helvetica");
      doc.text(`${detailTrunc} ${src}`, x + 8, y + 7 > y + CHECK_HEIGHT ? y + CHECK_HEIGHT - 2 : y + 7 > 0 ? y + 7 : y, { continued: false, width: COL_WIDTH - 12 });

      col++;
      if (col >= 3) {
        col = 0;
        y += CHECK_HEIGHT + 8;
      }
    }

    // Finish row if partially filled
    if (col > 0) {
      y += CHECK_HEIGHT + 8;
      col = 0;
    }
    y += 2;
  }

  // Render any remaining checks not in defined categories
  const remainingChecks: VettingCheck[] = [];
  report.checks.forEach((check, i) => {
    if (!rendered.has(i + 1)) remainingChecks.push(check);
  });

  if (remainingChecks.length > 0) {
    y = ensureSpace(doc, 20, cName);
    doc.fontSize(7.5).fillColor(COLOR.gold).font("Helvetica-Bold");
    doc.text("OTHER CHECKS", 50, y);
    y += 10;

    let col = 0;
    for (const check of remainingChecks) {
      if (col === 0) {
        y = ensureSpace(doc, CHECK_HEIGHT + 2, cName);
      }

      const x = COL_STARTS[col];
      const symbol = SYMBOL[check.result];
      const color = RESULT_COLOR[check.result];
      const src = SOURCE_INDICATOR[inferSource(check)];

      doc.fontSize(7).fillColor(color).font("Helvetica-Bold");
      doc.text(`${symbol}`, x, y, { continued: false });

      const detailTrunc = check.detail.length > 30 ? check.detail.slice(0, 28) + ".." : check.detail;
      doc.fontSize(6).fillColor(COLOR.darkText).font("Helvetica");
      doc.text(`${check.name}`, x + 8, y, { continued: false });
      doc.fontSize(5.5).fillColor(color).font("Helvetica");
      doc.text(`${detailTrunc} ${src}`, x + 8, y + 7, { continued: false, width: COL_WIDTH - 12 });

      col++;
      if (col >= 3) {
        col = 0;
        y += CHECK_HEIGHT + 8;
      }
    }
    if (col > 0) y += CHECK_HEIGHT + 8;
  }

  doc.end();
  return doc;
}
