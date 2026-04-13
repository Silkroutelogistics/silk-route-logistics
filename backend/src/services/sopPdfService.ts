import PDFDocument from "pdfkit";

/**
 * Generate a branded SOP PDF — Google Docs style with SRL branding.
 *
 * Layout:
 * - Header: SRL logo watermark (light gold), company name, document title
 * - Meta bar: Version, Author, Category, Date, Pages
 * - Content: Clean body text with section headers
 * - Footer: Page numbers, confidentiality notice, SRL contact
 */
export function generateSOPPdf(sop: {
  title: string;
  category: string;
  version: string;
  author: string;
  description?: string | null;
  content?: string | null;
  pages?: number;
  updatedAt?: Date | string;
}): typeof PDFDocument.prototype {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: {
      Title: sop.title,
      Author: sop.author,
      Subject: `SRL SOP — ${sop.category}`,
      Creator: "Silk Route Logistics TMS",
    },
  });

  const pageWidth = 612;
  const contentWidth = pageWidth - 120; // 60 margin each side
  const gold = "#C9A84C";
  const navy = "#0F1117";
  const gray = "#6B7280";
  const lightGray = "#E5E7EB";

  // ─── Helper: Draw Header ──────────────────────────────

  function drawHeader() {
    const y = 40;

    // Gold accent line at very top
    doc.rect(0, 0, pageWidth, 4).fill(gold);

    // Company name
    doc.font("Helvetica-Bold").fontSize(10).fillColor(gold);
    doc.text("SILK ROUTE LOGISTICS INC.", 60, y, { width: contentWidth });

    // Tagline
    doc.font("Helvetica").fontSize(7).fillColor(gray);
    doc.text("Where Trust Travels.", 60, y + 14);

    // Right side: MC# and DOT#
    doc.font("Helvetica").fontSize(7).fillColor(gray);
    doc.text("MC# 01794414  |  DOT# 4526880", 60, y, { width: contentWidth, align: "right" });
    doc.text("(269) 220-6760  |  silkroutelogistics.ai", 60, y + 10, { width: contentWidth, align: "right" });

    // Divider line
    doc.moveTo(60, y + 28).lineTo(pageWidth - 60, y + 28).strokeColor(lightGray).lineWidth(0.5).stroke();

    return y + 38;
  }

  // ─── Helper: Draw Footer ──────────────────────────────

  function drawFooter(pageNum: number) {
    const y = 732;

    // Divider
    doc.moveTo(60, y).lineTo(pageWidth - 60, y).strokeColor(lightGray).lineWidth(0.5).stroke();

    // Left: Confidentiality
    doc.font("Helvetica").fontSize(6.5).fillColor(gray);
    doc.text("CONFIDENTIAL — Silk Route Logistics Inc. Internal Use Only", 60, y + 6, { width: contentWidth * 0.6 });

    // Center: Page number
    doc.font("Helvetica").fontSize(7).fillColor(gray);
    doc.text(`Page ${pageNum}`, 60, y + 6, { width: contentWidth, align: "center" });

    // Right: Version
    doc.text(`${sop.version}`, 60, y + 6, { width: contentWidth, align: "right" });
  }

  // ─── Page 1: Title Page ───────────────────────────────

  let cursorY = drawHeader();

  // Watermark "SRL" in large faded gold
  doc.save();
  doc.font("Helvetica-Bold").fontSize(180).fillColor(gold).opacity(0.04);
  doc.text("SRL", 80, 200, { width: contentWidth, align: "center" });
  doc.restore();

  // Category badge
  cursorY += 40;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(gold);
  doc.text(sop.category.toUpperCase(), 60, cursorY, { width: contentWidth });

  // Title
  cursorY += 20;
  doc.font("Helvetica-Bold").fontSize(24).fillColor(navy);
  doc.text(sop.title, 60, cursorY, { width: contentWidth, lineGap: 4 });
  cursorY = (doc as any).y + 16;

  // Description
  if (sop.description) {
    doc.font("Helvetica").fontSize(11).fillColor(gray);
    doc.text(sop.description, 60, cursorY, { width: contentWidth, lineGap: 3 });
    cursorY = (doc as any).y + 20;
  }

  // Meta info box
  const metaY = cursorY + 10;
  doc.rect(60, metaY, contentWidth, 60).fillColor("#F9FAFB").fill();
  doc.rect(60, metaY, contentWidth, 60).strokeColor(lightGray).lineWidth(0.5).stroke();

  const metaItems = [
    { label: "Version", value: sop.version },
    { label: "Author", value: sop.author },
    { label: "Category", value: sop.category },
    { label: "Last Updated", value: sop.updatedAt ? new Date(sop.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—" },
  ];

  const colWidth = contentWidth / metaItems.length;
  metaItems.forEach((item, i) => {
    const x = 60 + i * colWidth + 12;
    doc.font("Helvetica").fontSize(7).fillColor(gray);
    doc.text(item.label.toUpperCase(), x, metaY + 12, { width: colWidth - 24 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(navy);
    doc.text(item.value, x, metaY + 24, { width: colWidth - 24 });
  });

  drawFooter(1);

  // ─── Content Pages ────────────────────────────────────

  if (sop.content) {
    doc.addPage();
    let pageNum = 2;
    cursorY = drawHeader();
    cursorY += 10;

    const lines = sop.content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        cursorY += 8;
        continue;
      }

      // Check if we need a new page (leave room for footer)
      if (cursorY > 700) {
        drawFooter(pageNum);
        doc.addPage();
        pageNum++;
        cursorY = drawHeader();
        cursorY += 10;
      }

      // Section headers (lines starting with # or ALL CAPS lines or numbered sections)
      if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
        const level = trimmed.startsWith("### ") ? 3 : trimmed.startsWith("## ") ? 2 : 1;
        const text = trimmed.replace(/^#{1,3}\s*/, "");

        if (level === 1) {
          cursorY += 14;
          doc.font("Helvetica-Bold").fontSize(16).fillColor(navy);
          doc.text(text, 60, cursorY, { width: contentWidth });
          cursorY = (doc as any).y + 4;
          // Gold underline for H1
          doc.moveTo(60, cursorY).lineTo(60 + Math.min(doc.widthOfString(text), contentWidth), cursorY).strokeColor(gold).lineWidth(1.5).stroke();
          cursorY += 10;
        } else if (level === 2) {
          cursorY += 10;
          doc.font("Helvetica-Bold").fontSize(12).fillColor(navy);
          doc.text(text, 60, cursorY, { width: contentWidth });
          cursorY = (doc as any).y + 6;
        } else {
          cursorY += 8;
          doc.font("Helvetica-Bold").fontSize(10).fillColor(navy);
          doc.text(text, 60, cursorY, { width: contentWidth });
          cursorY = (doc as any).y + 4;
        }
      }
      // Bullet points
      else if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
        const text = trimmed.replace(/^[-•*]\s*/, "");
        doc.font("Helvetica").fontSize(9.5).fillColor(navy);
        doc.text(`  •  ${text}`, 60, cursorY, { width: contentWidth - 20, lineGap: 2 });
        cursorY = (doc as any).y + 4;
      }
      // Numbered items
      else if (/^\d+[\.\)]\s/.test(trimmed)) {
        doc.font("Helvetica").fontSize(9.5).fillColor(navy);
        doc.text(`  ${trimmed}`, 60, cursorY, { width: contentWidth - 20, lineGap: 2 });
        cursorY = (doc as any).y + 4;
      }
      // Bold text (lines that look like labels: "Key: Value")
      else if (trimmed.includes(": ") && trimmed.indexOf(": ") < 40 && !trimmed.startsWith("http")) {
        const [label, ...rest] = trimmed.split(": ");
        const value = rest.join(": ");
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(navy);
        doc.text(`${label}: `, 60, cursorY, { continued: true, width: contentWidth });
        doc.font("Helvetica").fontSize(9.5).fillColor(navy);
        doc.text(value, { width: contentWidth, lineGap: 2 });
        cursorY = (doc as any).y + 4;
      }
      // Regular paragraph
      else {
        doc.font("Helvetica").fontSize(9.5).fillColor(navy);
        doc.text(trimmed, 60, cursorY, { width: contentWidth, lineGap: 3 });
        cursorY = (doc as any).y + 6;
      }
    }

    drawFooter(pageNum);
  }

  doc.end();
  return doc;
}
