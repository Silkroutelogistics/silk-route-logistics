/**
 * The signature certificate: a one-page record of who signed what, and when.
 *
 * WHY A SEPARATE DOCUMENT rather than a stamp on the rate confirmation. The
 * issued PDF's BYTES are the evidence — `RateConfirmation.contentHash` describes
 * them, and the whole point of freezing the document (v3.8.axt) is that the hash
 * still matches what the carrier was shown. Stamping the original would change
 * those bytes, so the hash would stop matching and the record would destroy the
 * thing it was meant to certify. PDFKit also cannot append to an existing PDF,
 * so an overlay would mean re-rendering, which is the defect axt closed.
 *
 * A certificate that NAMES the hash is the stronger artifact anyway: it binds
 * the signature to one specific set of bytes rather than to a fresh render that
 * happens to resemble them. Verifying it is a hash comparison, not a reading.
 */

import PDFDocument from "pdfkit";
import { BRAND, TOKENS, FONT_BODY, FONT_BODY_BOLD, registerSkillFonts, drawFooter, drawCompassMark } from "../lib/srl-chrome";

export interface SignatureCertificateData {
  rateConNumber: string | null;
  loadRef: string;
  lane: string;
  signerName: string;
  signerIp: string | null;
  signerUserAgent: string | null;
  signedAt: Date;
  tokenId: string | null;
  contentHash: string | null;
  carrierRate: number | null;
}

const money = (n: number | null) =>
  n === null || n === undefined ? "—" : "$" + Math.round(n).toLocaleString();

export function generateSignatureCertificate(d: SignatureCertificateData) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 34, bottom: 0, left: 34, right: 34 } });
  registerSkillFonts(doc);

  const LEFT = 34;
  const WIDTH = 612 - 68;
  let y = 40;

  drawCompassMark(doc, LEFT, y, 34);
  doc.font(FONT_BODY_BOLD).fontSize(15).fillColor(TOKENS.navy)
    .text("Certificate of Electronic Signature", LEFT + 46, y + 4, { width: WIDTH - 46, lineBreak: false });
  doc.font(FONT_BODY).fontSize(8.5).fillColor(TOKENS.fg3)
    .text(BRAND.legalName, LEFT + 46, y + 23, { width: WIDTH - 46, lineBreak: false });
  y += 56;

  doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(1).strokeColor(TOKENS.gold).stroke();
  y += 18;

  doc.font(FONT_BODY).fontSize(9.5).fillColor(TOKENS.fg2).text(
    "This certificate records an electronic signature made under the Electronic Signatures in Global and " +
    "National Commerce Act (15 U.S.C. ch. 96). It attests to a specific document, identified below by the " +
    "SHA-256 fingerprint of its exact contents. Any copy producing a different fingerprint is not the " +
    "document that was signed.",
    LEFT, y, { width: WIDTH, lineGap: 1.5 },
  );
  y = doc.y + 18;

  const row = (label: string, value: string, mono = false) => {
    doc.font(FONT_BODY).fontSize(8).fillColor(TOKENS.fg3)
      .text(label.toUpperCase(), LEFT, y, { width: 150, lineBreak: false, characterSpacing: 0.6 });
    doc.font(mono ? "Courier-Bold" : FONT_BODY_BOLD).fontSize(mono ? 8 : 10).fillColor(TOKENS.navy)
      .text(value, LEFT + 150, y - 1, { width: WIDTH - 150 });
    y = Math.max(doc.y, y + 15) + 5;
  };

  row("Document", d.rateConNumber ?? `Rate confirmation for ${d.loadRef}`);
  row("Load", d.loadRef);
  row("Lane", d.lane);
  row("Total carrier pay", money(d.carrierRate));

  y += 8;
  doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(0.6).strokeColor(TOKENS.cream2).stroke();
  y += 16;

  row("Signed by", d.signerName);
  row("Signed at (UTC)", d.signedAt.toUTCString());
  // Recorded because they are what distinguish a signature from a claim about
  // one. NULL renders honestly rather than as an empty string pretending to be a
  // value nobody captured.
  row("IP address", d.signerIp ?? "not recorded");
  row("Signing link", d.tokenId ?? "not recorded", true);
  row("Device", (d.signerUserAgent ?? "not recorded").slice(0, 110));

  y += 8;
  doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(0.6).strokeColor(TOKENS.cream2).stroke();
  y += 16;

  doc.font(FONT_BODY).fontSize(8).fillColor(TOKENS.fg3)
    .text("DOCUMENT FINGERPRINT (SHA-256)", LEFT, y, { width: WIDTH, characterSpacing: 0.6 });
  y = doc.y + 4;
  doc.font("Courier-Bold").fontSize(8.5).fillColor(TOKENS.navy)
    .text(d.contentHash ?? "not recorded — this rate confirmation was issued before signature fingerprinting", LEFT, y, { width: WIDTH });
  y = doc.y + 20;

  doc.font(FONT_BODY).fontSize(8.5).fillColor(TOKENS.fg3).text(
    "The signing link recorded above is single-use and was consumed by this signature. " +
    "Questions about this certificate: " + BRAND.email + ".",
    LEFT, y, { width: WIDTH, lineGap: 1.5 },
  );

  drawFooter(doc);
  doc.end();
  return doc;
}
