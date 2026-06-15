import PDFDocument from "pdfkit";
import { prisma } from "../config/database";
import {
  registerSkillFonts, drawCompassMark, drawFooter, TOKENS,
  FONT_BODY, FONT_BODY_BOLD, FONT_BODY_ITALIC, FONT_DISPLAY_BOLD, FONT_DISPLAY_ITALIC, FONT_MONO_BOLD,
  PAGE_W, PAGE_H, MARGIN, CONTENT_W,
} from "../lib/srl-chrome";

/**
 * v3.8.anc — SRL Driver Academy Sprint T5: completion certificate PDF.
 *
 * Generated ON-DEMAND from the driver's PASSED DriverCourseProgress (no stored
 * file — always fresh, no pass-time async/storage failure). A centered,
 * ceremonial layout built from the srl-chrome primitives. The disclaimer makes
 * clear this is an educational-completion record, NOT a government credential
 * or proof of regulatory compliance (§14 posture).
 */

export interface CertificateData {
  driverName: string;
  courseTitle: string;
  courseCategory: string;
  scorePct: number;
  completedAt: Date;
  expiresAt: Date | null;
  carrierName: string | null;
  certId: string;
}

function fmtLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Resolve the certificate data for a driver+course, or null if the driver has
 * not PASSED that PUBLISHED course (callers return 404 on null). The single
 * source for both the driver-facing and carrier-facing download endpoints.
 */
export async function buildCertificateData(driverId: string, slug: string): Promise<CertificateData | null> {
  // Slug-format guard (review fix): course slugs are lowercase kebab; reject
  // anything else before it touches the DB query.
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const progress = await prisma.driverCourseProgress.findFirst({
    where: { driverId, status: "PASSED", course: { slug, status: "PUBLISHED" } },
    select: {
      bestScorePct: true, completedAt: true, expiresAt: true,
      driver: { select: { firstName: true, lastName: true, carrierProfile: { select: { companyName: true } } } },
      course: { select: { title: true, category: true } },
    },
  });
  if (!progress || !progress.completedAt) return null;
  return {
    driverName: `${progress.driver.firstName} ${progress.driver.lastName}`.trim(),
    courseTitle: progress.course.title,
    courseCategory: progress.course.category,
    scorePct: progress.bestScorePct ?? 0,
    completedAt: progress.completedAt,
    expiresAt: progress.expiresAt,
    carrierName: progress.driver.carrierProfile?.companyName ?? null,
    certId: `${driverId.slice(-6)}-${slug}`.toUpperCase(),
  };
}

export function generateTrainingCertificate(data: CertificateData): PDFKit.PDFDocument {
  // bottom margin 0 prevents auto-pagination (§3.11); the cert is a single page.
  const doc = new PDFDocument({ size: "LETTER", margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN } });
  registerSkillFonts(doc);

  // Double gold border frame.
  doc.lineWidth(2).strokeColor(TOKENS.gold).rect(MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN).stroke();
  doc.lineWidth(0.75).strokeColor(TOKENS.goldDark).rect(MARGIN + 7, MARGIN + 7, PAGE_W - 2 * MARGIN - 14, PAGE_H - 2 * MARGIN - 14).stroke();

  const cx = PAGE_W / 2;
  const left = MARGIN;

  drawCompassMark(doc, cx - 28, 86, 56);

  let y = 162;
  doc.font(FONT_BODY_BOLD).fontSize(10).fillColor(TOKENS.goldDark)
    .text("SILK ROUTE LOGISTICS  ·  DRIVER ACADEMY", left, y, { width: CONTENT_W, align: "center", characterSpacing: 1.5 });

  y += 30;
  doc.font(FONT_DISPLAY_BOLD).fontSize(30).fillColor(TOKENS.navy)
    .text("Certificate of Completion", left, y, { width: CONTENT_W, align: "center" });

  y += 56;
  doc.font(FONT_BODY).fontSize(12).fillColor(TOKENS.fg2)
    .text("This certifies that", left, y, { width: CONTENT_W, align: "center" });

  y += 26;
  doc.font(FONT_DISPLAY_ITALIC).fontSize(26).fillColor(TOKENS.navy)
    .text(data.driverName, left, y, { width: CONTENT_W, align: "center" });

  y += 46;
  doc.lineWidth(1).strokeColor(TOKENS.gold).moveTo(cx - 70, y).lineTo(cx + 70, y).stroke();

  y += 18;
  doc.font(FONT_BODY).fontSize(12).fillColor(TOKENS.fg2)
    .text("has successfully completed the course", left, y, { width: CONTENT_W, align: "center" });

  y += 26;
  doc.font(FONT_BODY_BOLD).fontSize(18).fillColor(TOKENS.navy)
    .text(data.courseTitle, left, y, { width: CONTENT_W, align: "center" });

  y += 24;
  doc.font(FONT_BODY).fontSize(10).fillColor(TOKENS.fg3)
    .text(data.courseCategory, left, y, { width: CONTENT_W, align: "center" });

  y += 40;
  doc.font(FONT_BODY).fontSize(12).fillColor(TOKENS.fg1)
    .text(`Score ${data.scorePct}%      ·      Completed ${fmtLongDate(data.completedAt)}`, left, y, { width: CONTENT_W, align: "center" });

  if (data.expiresAt) {
    y += 18;
    doc.font(FONT_BODY_ITALIC).fontSize(9.5).fillColor(TOKENS.fg3)
      .text(`Valid through ${fmtLongDate(data.expiresAt)}`, left, y, { width: CONTENT_W, align: "center" });
  }
  if (data.carrierName) {
    y += 20;
    doc.font(FONT_BODY).fontSize(10).fillColor(TOKENS.fg3)
      .text(`Carrier: ${data.carrierName}`, left, y, { width: CONTENT_W, align: "center" });
  }

  // Disclaimer + reference near the bottom (above the brand footer).
  const by = PAGE_H - 132;
  doc.font(FONT_BODY_ITALIC).fontSize(7.5).fillColor(TOKENS.fg3)
    .text(
      "This certificate reflects completion of an educational training module within SRL Driver Academy. It is not a government-issued credential or proof of regulatory compliance.",
      left + 60, by, { width: CONTENT_W - 120, align: "center" },
    );
  doc.font(FONT_MONO_BOLD).fontSize(7).fillColor(TOKENS.fg3)
    .text(`Certificate ID: ${data.certId}`, left, by + 26, { width: CONTENT_W, align: "center" });

  drawFooter(doc, { pageNum: 1, totalPages: 1 });
  doc.end();
  return doc;
}
