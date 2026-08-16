import PDFDocument from "pdfkit";
import {
  registerSkillFonts,
  drawHeaderFirstPage,
  drawContinuationHeader,
  drawSignatureBlock,
  drawFooter,
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

type PDFDoc = InstanceType<typeof PDFDocument>;

export interface AgreementSignature {
  signedByName: string;
  signedByTitle?: string | null;
  signedAt: Date;
  signerIp?: string | null;
  version: string;
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
  opts: { carrier?: AgreementCarrierIdentity; signature?: AgreementSignature } = {},
): void {
  registerSkillFonts(doc);
  const { carrier, signature } = opts;
  const docId = `${DOC_ID_PREFIX[agreement.templateName] ?? "AGR"}-${agreement.version}`;
  const CONTENT_BOTTOM = PAGE_H - MARGIN - 40;

  let y = drawHeaderFirstPage(doc, {
    docTitle: agreement.title,
    subtitle: agreement.subtitle,
    loadId: docId,
    includeQr: false,
  });

  doc.font(FONT_BODY_ITALIC, 8.5).fillColor(TOKENS.fg3)
     .text(agreement.effectiveNote, MARGIN, y, { lineBreak: false });
  y += 20;

  const pageBreak = () => {
    doc.addPage();
    y = drawContinuationHeader(doc, agreement.title, docId);
  };

  const block = (
    text: string,
    o: { font?: string; size?: number; color?: string; gap?: number; align?: "left" | "justify" } = {},
  ) => {
    const font = o.font ?? FONT_BODY;
    const size = o.size ?? 9.5;
    const align = o.align ?? "justify";
    doc.font(font, size);
    const h = doc.heightOfString(text, { width: CONTENT_W, align });
    if (y + h > CONTENT_BOTTOM) pageBreak();
    doc.fillColor(o.color ?? TOKENS.fg1).text(text, MARGIN, y, { width: CONTENT_W, align });
    y += h + (o.gap ?? 8);
  };

  const heading = (text: string) => {
    if (y + 26 > CONTENT_BOTTOM) pageBreak();
    y += 6;
    doc.font(FONT_BODY_BOLD, 10.5).fillColor(TOKENS.navy).text(text, MARGIN, y, { lineBreak: false });
    y += 16;
  };

  for (const p of agreement.preamble) block(p, { gap: 10 });
  for (const s of agreement.sections) {
    heading(s.heading);
    for (const c of s.clauses) block(c);
  }

  // Keep the execution area together. Height must fit the taller column — the
  // CARRIER role has 8 fields (LEGAL NAME / MC # / DOT # / EIN / PRINT NAME /
  // TITLE / SIGNATURE / DATE) at ~26pt row spacing, so ~250pt, or its last
  // fields overflow the block and collide with the attestation strip below.
  const sigHeight = 250;
  if (y + sigHeight + 56 > CONTENT_BOTTOM) pageBreak();
  else y += 14;
  block(
    "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date of the last signature below.",
    { font: FONT_BODY_ITALIC, size: 9, gap: 14, align: "left" },
  );

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
    const attest =
      `Electronically signed by ${signature.signedByName}` +
      (signature.signedByTitle ? `, ${signature.signedByTitle}` : "") +
      ` on ${new Date(signature.signedAt).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` +
      (signature.signerIp ? ` · IP ${signature.signerIp}` : "") +
      ` · Agreement version ${signature.version}. Executed as a legally binding electronic signature under the U.S. ESIGN Act and UETA.`;
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
    doc.switchToPage(range.start + i);
    drawFooter(doc, { pageNum: i + 1, totalPages: range.count, docId });
  }
}

export type AgreementPdfOptions = {
  carrier?: AgreementCarrierIdentity;
  signature?: AgreementSignature;
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
