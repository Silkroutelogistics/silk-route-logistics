import PDFDocument from "pdfkit";
import {
  registerSkillFonts,
  drawHeaderFirstPage,
  drawContinuationHeader,
  drawSignatureBlock,
  drawFooter,
  drawAgreementCoverPage,
  drawShellRunningHeader,
  drawShellFooter,
  drawShellHeading,
  SHELL_MARGIN,
  SHELL_CONTENT_W,
  MASTER_AGREEMENT_SIGNATURE_ROLES,
  MARGIN,
  CONTENT_W,
  PAGE_H,
  TOKENS,
  FONT_BODY,
  FONT_BODY_BOLD,
  FONT_BODY_ITALIC,
} from "../lib/srl-chrome";
import { type LegalAgreement } from "../data/agreements";
import {
  assembleAgreementSegments, WITNESS_LINE, CELL_SEP, ROW_SEP,
  type AgreementSegment,
} from "../lib/canonicalAgreementText";

type PDFDoc = InstanceType<typeof PDFDocument>;

/** Running-head owner line. Upper-cased once rather than at every page. */
const BRAND_LINE = "SILK ROUTE LOGISTICS INC.";

export interface AgreementSignature {
  signedByName: string;
  signedByTitle?: string | null;
  signedAt: Date;
  signerIp?: string | null;
  version: string;
  /** When electronic-records consent was separately acknowledged (ESIGN §101(c)). */
  consentAt?: Date | null;
}

export interface AgreementCarrierIdentity {
  legalName: string;
  mcNumber?: string | null;
  dotNumber?: string | null;
  ein?: string | null;
}

/**
 * Document-ID prefix per agreement. Shows in the header, the per-page footer,
 * and the executed filename, so an executed BCA and an executed Quick Pay
 * Agreement are distinguishable at a glance in a claims or audit file.
 */
const DOC_ID_PREFIX: Record<string, string> = {
  "broker-carrier": "BCA",
  "quick-pay": "QPA",
};

/**
 * v3.8.aqh — Reusable multi-page legal-agreement renderer on the SRL skill
 * chrome. This is the one new chrome capability the BCA/QP need beyond the
 * one-page BOL/RC: wrapping justified clauses + section headings with automatic
 * page-break + continuation headers, the MASTER_AGREEMENT (Broker + Carrier)
 * signature block, an executed e-signature attestation strip, and per-page
 * footers with correct "Page X of Y" via bufferPages. Both agreements share it
 * — as of v3.8.art the Quick Pay Agreement text has landed and calls this same
 * function through generateAgreementPdf below.
 */
function renderLegalAgreement(
  doc: PDFDoc,
  agreement: LegalAgreement,
  opts: { carrier?: AgreementCarrierIdentity; signature?: AgreementSignature; shell?: boolean } = {},
): void {
  registerSkillFonts(doc);
  const { carrier, signature } = opts;
  const shell = opts.shell === true;
  const docId = `${DOC_ID_PREFIX[agreement.templateName] ?? "AGR"}-${agreement.version}`;
  // The shell runs a wider margin and a lighter footer than the operational
  // chrome, so every geometry constant below is shell-aware rather than the
  // renderer having two copies.
  const M = shell ? SHELL_MARGIN : MARGIN;
  const CW = shell ? SHELL_CONTENT_W : CONTENT_W;
  const CONTENT_BOTTOM = PAGE_H - M - (shell ? 34 : 40);

  // The cover is its own page and carries no running header or footer, which
  // is why the footer loop below skips page 1 when it is drawn.
  if (shell) {
    drawAgreementCoverPage(doc, {
      title: agreement.title,
      edition: agreement.subtitle,
      cells: [
        { label: "Reference", value: docId },
        { label: "Effective Date", value: signature ? new Date(signature.signedAt).toISOString().slice(0, 10) : "" },
        { label: "Term", value: "One year · auto-renewing" },
        { label: "Governing Law", value: "State of Michigan" },
      ],
    });
    doc.addPage();
  }

  const runHead = () =>
    drawShellRunningHeader(doc, {
      left: BRAND_LINE + " · " + agreement.title,
      right: agreement.subtitle,
    });

  // With the shell, EVERY content page carries the same light running head --
  // there is no heavier first-page variant. A fourteen-page signed agreement
  // does not want an operational header repeated on all of them.
  let y = shell
    ? runHead()
    : drawHeaderFirstPage(doc, {
        docTitle: agreement.title,
        subtitle: agreement.subtitle,
        loadId: docId,
        includeQr: false,
      });

  // v3.8.awo — every drawn string below comes from assembleAgreementSegments,
  // the same assembly the content hash is computed over. A string drawn from
  // anywhere else would be text on the page the hash does not cover.
  const segments = assembleAgreementSegments(agreement, { carrier, signature });
  const seg = (kind: AgreementSegment["kind"]) => segments.filter((x) => x.kind === kind);

  doc.font(FONT_BODY_ITALIC, 8.5).fillColor(TOKENS.fg3)
     .text(seg("effective-note")[0]?.text ?? "", MARGIN, y, { lineBreak: false });
  y += 20;

  const pageBreak = () => {
    doc.addPage();
    y = shell ? runHead() : drawContinuationHeader(doc, agreement.title, docId);
  };

  const block = (
    text: string,
    o: { font?: string; size?: number; color?: string; gap?: number; align?: "left" | "justify" } = {},
  ) => {
    const font = o.font ?? FONT_BODY;
    const size = o.size ?? 9.5;
    const align = o.align ?? "justify";
    // line-height 1.6 on the shell; TOKENS.ink rather than navy, because the
    // shell reserves navy for headings and structure.
    const lineGap = shell ? size * 0.6 - size * 0.35 : 0;
    doc.font(font, size);
    const h = doc.heightOfString(text, { width: CW, align, lineGap });
    if (y + h > CONTENT_BOTTOM) pageBreak();
    doc.fillColor(o.color ?? (shell ? TOKENS.ink : TOKENS.fg1))
       .text(text, M, y, { width: CW, align, lineGap });
    y += h + (o.gap ?? (shell ? 6.75 : 8));
  };

  // Drawn by splitting the hashed segment back apart, NOT by re-reading
  // agreement.sections. Same rule as every other string on the page: what is
  // drawn is what is hashed, so a table cannot be text the hash does not cover
  // (v3.8.awo). The assembly refuses any cell containing a separator, which is
  // what makes this split lossless.
  const table = (packed: string) => {
    const rows = packed.split(ROW_SEP).map((r) => r.split(CELL_SEP));
    const cols = Math.max(...rows.map((r) => r.length));
    const colW = CONTENT_W / cols;
    const ROW_H = 18;
    const needed = ROW_H * rows.length + 10;
    if (y + needed > CONTENT_BOTTOM) pageBreak();
    y += 4;
    rows.forEach((cells, i) => {
      const isHeader = i === 0;
      doc.font(isHeader ? FONT_BODY_BOLD : FONT_BODY, 9)
         .fillColor(isHeader ? TOKENS.navy : TOKENS.fg1);
      cells.forEach((cell, c) => {
        doc.text(cell, MARGIN + c * colW + 4, y + 5, { width: colW - 8, lineBreak: false });
      });
      // A rule under the header only. Body rows are separated by spacing, which
      // keeps a short terms table from reading like a spreadsheet.
      if (isHeader) {
        doc.save().strokeColor(TOKENS.gold).lineWidth(0.6)
           .moveTo(MARGIN, y + ROW_H - 2).lineTo(MARGIN + CONTENT_W, y + ROW_H - 2).stroke().restore();
      }
      y += ROW_H;
    });
    y += 8;
  };

  const heading = (text: string) => {
    if (y + 26 > CONTENT_BOTTOM) pageBreak();
    if (shell) {
      y += 18; // h2 margin-top 24px
      drawShellHeading(doc, text, M, y);
      y += 9 + 7.5; // font + margin-bottom 10px
      return;
    }
    y += 6;
    doc.font(FONT_BODY_BOLD, 10.5).fillColor(TOKENS.navy).text(text, MARGIN, y, { lineBreak: false });
    y += 16;
  };

  // Order is preserved from the assembly, so heading/clause interleaving is the
  // assembly's order rather than a second traversal of the source data.
  for (const p of seg("preamble")) block(p.text, { gap: 10 });
  for (const s of segments) {
    if (s.kind === "heading") heading(s.text);
    else if (s.kind === "clause") block(s.text);
    else if (s.kind === "table") table(s.text);
  }

  // Keep the execution area together. Height must fit the taller column — the
  // CARRIER role has 8 fields (LEGAL NAME / MC # / DOT # / EIN / PRINT NAME /
  // TITLE / SIGNATURE / DATE) at ~26pt row spacing, so ~250pt, or its last
  // fields overflow the block and collide with the attestation strip below.
  const sigHeight = 250;
  if (y + sigHeight + 56 > CONTENT_BOTTOM) pageBreak();
  else y += 14;
  block(seg("witness")[0]?.text ?? WITNESS_LINE, { font: FONT_BODY_ITALIC, size: 9, gap: 14, align: "left" });

  const prefilled: Record<string, string> = {};
  if (carrier) {
    prefilled["CARRIER LEGAL NAME"] = carrier.legalName;
    if (carrier.mcNumber) prefilled["MC #"] = carrier.mcNumber;
    if (carrier.dotNumber) prefilled["DOT #"] = carrier.dotNumber;
    if (carrier.ein) prefilled["EIN"] = carrier.ein;
  }
  y = drawSignatureBlock(doc, y, { roles: MASTER_AGREEMENT_SIGNATURE_ROLES, height: sigHeight, prefilledValues: prefilled });

  if (signature) {
    y += 6;
    if (y + 46 > CONTENT_BOTTOM) pageBreak();
    // The attestation is the assembly's, not a second copy. It used to be built
    // inline here with toLocaleString — which meant the text on the page and the
    // text a hash would cover were two different constructions of the same
    // sentence, free to drift. It is now one construction, and it is the hashed
    // one. ISO-only inside the assembly; no locale formatting, because ICU
    // builds differ between machines and the hash must not.
    const attest = seg("attestation")[0]?.text ?? "";
    doc.font(FONT_BODY_ITALIC, 8);
    const ah = doc.heightOfString(attest, { width: CONTENT_W - 20 });
    const boxH = ah + 16;
    doc.save().fillColor(TOKENS.cream2).strokeColor(TOKENS.border1).lineWidth(0.5)
       .roundedRect(MARGIN, y, CONTENT_W, boxH, 6).fillAndStroke().restore();
    doc.font(FONT_BODY_ITALIC, 8).fillColor(TOKENS.fg2).text(attest, MARGIN + 10, y + 8, { width: CONTENT_W - 20 });
    y += boxH + 8;
  } else {
    y += 6;
    block(
      "To execute this Agreement, sign electronically in your carrier portal at silkroutelogistics.ai. A typed legal name plus acceptance checkbox constitutes a binding electronic signature under ESIGN/UETA.",
      { font: FONT_BODY_ITALIC, size: 8, color: TOKENS.fg3, align: "left" },
    );
  }

  // Per-page footers with correct total (bufferPages must be enabled on the doc)
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    // Page 1 is the cover when the shell is on, and the cover carries no
    // footer -- the Design System puts only the tagline there.
    if (shell && i === 0) continue;
    doc.switchToPage(range.start + i);
    if (shell) drawShellFooter(doc, { pageNum: i + 1, totalPages: range.count });
    else drawFooter(doc, { pageNum: i + 1, totalPages: range.count, docId });
  }
}

export type AgreementPdfOptions = {
  carrier?: AgreementCarrierIdentity;
  signature?: AgreementSignature;
  /**
   * Draw the Design System document shell -- cover page and, from B7, the
   * interior master. OPT-IN and default off: the Quick Pay Agreement renders
   * through this same function, and a shell applied by default would restyle
   * a second signed instrument nobody asked to restyle.
   */
  shell?: boolean;
};

/**
 * v3.8.art — Generic entry point. Renders ANY LegalAgreement from
 * data/agreements.ts. Pre-art the only exported generator hardcoded the BCA, so
 * a signed Quick Pay Agreement could not be produced as a document at all — a
 * binding e-signature against something neither party could hand to a claims
 * adjuster, a factor, or a court. Callers should resolve the agreement via
 * getAgreement(templateName) and pass it here.
 */
export function generateAgreementPdf(
  agreement: LegalAgreement,
  opts: AgreementPdfOptions = {},
): PDFDoc {
  const doc = new PDFDocument({ size: "LETTER", margin: 0, bufferPages: true });
  renderLegalAgreement(doc, agreement, opts);
  doc.end();
  return doc;
}

/** Buffer form of any agreement, for storage/email. */
export async function generateAgreementBuffer(
  agreement: LegalAgreement,
  opts: AgreementPdfOptions = {},
): Promise<Buffer> {
  const doc = generateAgreementPdf(agreement, opts);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/**
 * Filename for the downloaded/stored copy, derived from the agreement title so
 * a Quick Pay PDF is not served as "Broker-Carrier-Agreement-*.pdf".
 */
export function agreementPdfFilename(agreement: LegalAgreement): string {
  return `${agreement.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${agreement.version}.pdf`;
}

// v3.8.asa — the four per-agreement wrappers (generateBrokerCarrierAgreementPdf
// / Buffer, generateQuickPayAgreementPdf / Buffer) were deleted here. They were
// a second way to do exactly what generateAgreementPdf / generateAgreementBuffer
// already do, and the BCA pair being the only wired path is precisely how the
// Quick Pay PDF route ended up hardcoded to "broker-carrier". Callers resolve
// the agreement with getAgreement(templateName) and pass it in.
