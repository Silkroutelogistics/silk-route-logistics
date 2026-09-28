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
  PAGE_W,
  PAGE_H,
  TOKENS,
  FONT_BODY,
  FONT_BODY_BOLD,
  FONT_BODY_ITALIC,
} from "../lib/srl-chrome";
import { type LegalAgreement } from "../data/agreements";
import {
  assembleAgreementSegments, WITNESS_LINE, CELL_SEP, ROW_SEP,
  type AgreementSegment, type CanonicalCountersign,
} from "../lib/canonicalAgreementText";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../config/authority";
import { roleFieldKey, type SignatureMark, type SignatureRole } from "../lib/srl-chrome";
import { mcDigits } from "../lib/mcNumber";
import fs from "fs";
import path from "path";

type PDFDoc = InstanceType<typeof PDFDocument>;

/**
 * An SRL officer's scanned pen signature, when one has been supplied, from
 * assets/signatures/<name-slug>.png ("Pat Officer" -> pat-officer.png).
 *
 * Looked up by the NAME ON THE COUNTERSIGN ROW, never by whoever the signatory
 * is today: an agreement countersigned by one officer must not re-render with a
 * later officer's signature above the first one's name. Missing file, null, and
 * the name is set in the signature face instead. Cached per process: the asset
 * ships with the build.
 */
const SIGNATURE_DIR = path.resolve(__dirname, "../assets/signatures");
const signatureCache = new Map<string, Buffer | null>();
function officerSignatureImage(name: string): Buffer | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!signatureCache.has(slug)) {
    const file = path.join(SIGNATURE_DIR, `${slug}.png`);
    signatureCache.set(slug, slug && fs.existsSync(file) ? fs.readFileSync(file) : null);
  }
  return signatureCache.get(slug) ?? null;
}

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
 * The reference printed on the cover and in the header. From Revision 3 the
 * version string IS the reference ("SRL-BCA-2026-R3"), so it is printed as is.
 * Older versions ("2026-09-03-F11") carry no prefix and get one, exactly as
 * they always did, so an archived agreement re-renders with its own reference.
 */
export function documentReference(agreement: LegalAgreement): string {
  if (agreement.version.startsWith("SRL-")) return agreement.version;
  return `${DOC_ID_PREFIX[agreement.templateName] ?? "AGR"}-${agreement.version}`;
}

/**
 * The cover's Term cell. The Broker-Carrier Agreement runs a year and renews;
 * the Quick Pay Agreement runs until either party ends it, and ends with the
 * BCA. The cell used to print the BCA's term on both, which put a wrong term on
 * the cover of every Quick Pay Agreement. The cover is not hashed text, so this
 * corrects archived Quick Pay renders too.
 */
function coverTerm(agreement: LegalAgreement): string {
  return agreement.templateName === "quick-pay" ? "Until terminated" : "Annual, auto-renewing";
}

/**
 * The edition as the running header prints it. The cover sets the edition in
 * spaced capitals ("REVISION 3 · SEPTEMBER 2026"); repeated at that weight at
 * the top of every page it shouts, so the header carries the same words in
 * sentence case, abbreviated: "Rev. 3 · September 2026". It is DERIVED from
 * the subtitle, which is hashed, so the header can never name a different
 * edition from the one the document is. Any other subtitle prints as it is.
 */
/**
 * The master-agreement signature roles for one render. The carrier's EIN field
 * is present only when there is an EIN to print (v3.8.blr). Returns the shared
 * constant itself when nothing is removed, so the full-width case is the exact
 * object every other caller sees.
 */
export function signatureRoles(ein: string | null | undefined): SignatureRole[] {
  if (ein) return MASTER_AGREEMENT_SIGNATURE_ROLES;
  return MASTER_AGREEMENT_SIGNATURE_ROLES.map((r) => ({
    ...r,
    fields: r.fields.filter((field) => field !== "EIN"),
  }));
}

export function runningEdition(subtitle: string): string {
  const m = /^REVISION\s+(\d+)\s*·\s*([A-Z]+)\s+(\d{4})$/.exec(subtitle.trim());
  if (!m) return subtitle;
  const month = m[2].charAt(0) + m[2].slice(1).toLowerCase();
  return "Rev. " + m[1] + " · " + month + " " + m[3];
}

/**
 * The identity line under the first header, broken only at its " · "
 * separators. Left to PDFKit it broke wherever a line ran out, which put
 * "Reference SRL-" at the end of one line and "BCA-2026-R3" at the start of the
 * next -- a reference split at its own hyphen. Each part is kept whole and a
 * line that ends early keeps its separator, so the drawn characters are the
 * hashed ones and only the line breaks move. A single part wider than the
 * column is left for PDFKit to wrap.
 */
function identityLines(doc: PDFDoc, note: string, width: number): string {
  const lines: string[] = [];
  let line = "";
  for (const part of note.split(" · ")) {
    const joined = line ? line + " · " + part : part;
    if (line && doc.widthOfString(joined) > width) {
      lines.push(line + " ·");
      line = part;
    } else {
      line = joined;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

/**
 * Body-page geometry. Shared by the document constructor, which needs the
 * margins before the first page exists, and by the renderer.
 */
function bodyGeometry(shell: boolean) {
  const M = shell ? SHELL_MARGIN : MARGIN;
  const CW = shell ? SHELL_CONTENT_W : CONTENT_W;
  const CONTENT_BOTTOM = PAGE_H - M - (shell ? 34 : 40);
  return {
    M,
    CW,
    CONTENT_BOTTOM,
    // PDFKit continues a paragraph onto a new page when a line would cross the
    // bottom margin. Setting it to the content floor is what lets a clause flow
    // across a page break instead of being pushed whole onto the next page.
    margins: { top: M, bottom: PAGE_H - CONTENT_BOTTOM, left: M, right: PAGE_W - M - CW },
  };
}

/**
 * v3.8.aqh — Reusable multi-page legal-agreement renderer on the SRL skill
 * chrome: justified clauses and section headings with page breaks and running
 * headers, the MASTER_AGREEMENT (Broker + Carrier) signature block, an executed
 * e-signature attestation strip, and per-page footers with a correct
 * "Page X of Y" via bufferPages. Both agreements share it.
 *
 * PAGE FLOW. Clauses are laid out by PDFKit's own line wrapper, which continues
 * a paragraph on a new page when it reaches the bottom margin. Until this was
 * rewritten a paragraph that did not fit was moved whole to the next page,
 * which left the foot of many pages empty, and the first paragraph on every
 * continued page was drawn in the running header's 7.5pt font while being
 * spaced as 9.5pt body text. Those two defects were the gaps in the signed copy.
 */
function renderLegalAgreement(
  doc: PDFDoc,
  agreement: LegalAgreement,
  opts: AgreementPdfOptions = {},
): void {
  registerSkillFonts(doc);
  const { carrier, signature, countersign } = opts;
  const shell = opts.shell === true;
  const docId = documentReference(agreement);
  const { M, CW, CONTENT_BOTTOM } = bodyGeometry(shell);
  const ink = shell ? TOKENS.ink : TOKENS.fg1;

  // The body text style currently in force. Drawing a running header changes
  // the font, so every new page -- whether we asked for it or PDFKit started
  // it mid-paragraph -- puts this style back before the next line is set.
  const pen: { font: string; size: number; color: string } = { font: FONT_BODY, size: 9.5, color: ink };
  const applyPen = () => doc.font(pen.font, pen.size).fillColor(pen.color);

  // The cover is its own page and carries no running header or footer, which
  // is why the footer loop below skips page 1 when it is drawn.
  if (shell) {
    drawAgreementCoverPage(doc, {
      title: agreement.title,
      edition: agreement.subtitle,
      cells: [
        { label: "Reference", value: docId },
        // NEVER BLANK. An empty cell beside a printed label reads as a field
        // somebody forgot, and an em-dash reads as "not applicable" — neither
        // is true. The preamble says the Effective Date IS the date of the last
        // signature, so on an unsigned specimen the honest value is the rule
        // itself: it takes effect when it is executed.
        {
          label: "Effective Date",
          value: signature ? new Date(signature.signedAt).toISOString().slice(0, 10) : "Upon execution",
        },
        { label: "Term", value: coverTerm(agreement) },
        { label: "Governing Law", value: "State of Michigan" },
      ],
    });
  }

  const runHead = () =>
    drawShellRunningHeader(doc, {
      left: BRAND_LINE + " · " + agreement.title,
      right: runningEdition(agreement.subtitle),
    });
  const continuationHead = () => (shell ? runHead() : drawContinuationHeader(doc, agreement.title, docId));

  // Every page added from here on gets the running header, and the pen back.
  const onPage = () => {
    const top = continuationHead();
    doc.x = M;
    doc.y = top;
    applyPen();
  };

  let y: number;
  if (shell) {
    doc.on("pageAdded", onPage);
    doc.addPage();
    y = doc.y;
  } else {
    y = drawHeaderFirstPage(doc, {
      docTitle: agreement.title,
      subtitle: agreement.subtitle,
      loadId: docId,
      includeQr: false,
    });
    doc.on("pageAdded", onPage);
  }

  const pageBreak = () => {
    doc.addPage();
    y = doc.y;
  };

  // v3.8.awo — every drawn string below comes from assembleAgreementSegments,
  // the same assembly the content hash is computed over. A string drawn from
  // anywhere else would be text on the page the hash does not cover.
  const segments = assembleAgreementSegments(agreement, { carrier, signature, countersign });
  const seg = (kind: AgreementSegment["kind"]) => segments.filter((x) => x.kind === kind);

  // The identity line under the first header. It was drawn at the operational
  // margin with no width, so on the shell it started 18pt left of the body and
  // ran off the right edge. It now wraps inside the body column.
  const note = seg("effective-note")[0]?.text ?? "";
  if (note) {
    doc.font(FONT_BODY_ITALIC, 8.5).fillColor(TOKENS.fg3);
    doc.text(identityLines(doc, note, CW), M, y, { width: CW, align: "left", lineGap: 1 });
    y = doc.y + 12;
  }

  const bodyLineGap = (size: number) => (shell ? size * 0.25 : 0);

  /** Height of a paragraph's first two lines, or the whole of a shorter one. */
  const leadHeight = (text: string, font = FONT_BODY, size = 9.5, align: "left" | "justify" = "justify") => {
    doc.font(font, size);
    const lineGap = bodyLineGap(size);
    const lineH = doc.currentLineHeight(true) + lineGap;
    return Math.min(doc.heightOfString(text, { width: CW, align, lineGap }), lineH * 2);
  };

  const block = (
    text: string,
    o: {
      font?: string; size?: number; color?: string; gap?: number; align?: "left" | "justify";
      /** What this paragraph introduces, when it ends in a colon. */
      introduces?: AgreementSegment;
    } = {},
  ) => {
    const align = o.align ?? "justify";
    pen.font = o.font ?? FONT_BODY;
    pen.size = o.size ?? 9.5;
    pen.color = o.color ?? ink;
    const gap = o.gap ?? (shell ? 6.75 : 8);
    // Never start a paragraph with room for less than two of its lines.
    if (y + leadHeight(text, pen.font, pen.size, align) > CONTENT_BOTTOM) pageBreak();
    applyPen();
    const opts = { width: CW, align, lineGap: bodyLineGap(pen.size) };

    // A LEAD-IN TRAVELS WITH WHAT IT INTRODUCES. "Minimum coverages:" sat at the
    // foot of page 5 with its list on page 6, the same defect as a heading left
    // behind by its clause. A short lead-in that cannot bring the first two
    // lines of its item along starts on the next page instead.
    if (o.introduces?.kind === "clause") {
      const own = doc.heightOfString(text, opts);
      if (own <= (doc.currentLineHeight(true) + opts.lineGap) * 3) {
        const need = own + gap + leadHeight(o.introduces.text);
        applyPen();
        if (y + need > CONTENT_BOTTOM) pageBreak();
      }
    }

    // NOR END ONE WITH A SINGLE LINE ALONE AT THE TOP OF THE NEXT PAGE. Pages 10
    // and 17 of the executed Broker-Carrier Agreement opened on "load." and
    // "binding under the ESIGN Act and UETA." by themselves. Where that would
    // happen, this page takes one line fewer, so two carry over. PDFKit reads
    // the line limit from the page's own bottom margin and gives a new page the
    // document's margins, so narrowing this page for this one paragraph moves
    // the break and nothing else.
    const ch = doc.currentLineHeight(true);
    const lineH = ch + opts.lineGap;
    const linesFrom = (top: number) =>
      top + ch > CONTENT_BOTTOM ? 0 : Math.floor((CONTENT_BOTTOM - top - ch) / lineH + 1e-6) + 1;
    const lines = Math.round(doc.heightOfString(text, opts) / lineH);
    const here = linesFrom(y);
    let narrowed: { page: typeof doc.page; bottom: number } | null = null;
    if (lines > here) {
      const perPage = linesFrom(shell ? SHELL_MARGIN + 35.25 : MARGIN + 52);
      const onLastPage = ((lines - here - 1) % perPage) + 1;
      if (onLastPage === 1) {
        if (here - 1 >= 2) {
          narrowed = { page: doc.page, bottom: doc.page.margins.bottom };
          doc.page.margins.bottom = doc.page.height - (y + (here - 2) * lineH + ch + 0.5);
        } else {
          pageBreak();
          applyPen();
        }
      }
    }
    try {
      doc.text(text, M, y, opts);
    } finally {
      if (narrowed) narrowed.page.margins.bottom = narrowed.bottom;
    }
    y = doc.y + gap;
  };

  // ── Tables ────────────────────────────────────────────────────────────────
  //
  // Drawn by splitting the hashed segment back apart, NOT by re-reading
  // agreement.sections: what is drawn is what is hashed (v3.8.awo). The
  // assembly refuses any cell containing a separator, which is what makes the
  // split lossless.
  const PAD_X = 4;
  const PAD_Y = 5;
  const GAP_Y = 6;

  const measureTable = (packed: string) => {
    const rows = packed.split(ROW_SEP).map((r) => r.split(CELL_SEP));
    const cols = Math.max(...rows.map((r) => r.length));

    // COLUMN WIDTHS FROM CONTENT. Equal columns gave the accessorial table a
    // "Charge" column as wide as its "Terms" column, so one-word labels sat in
    // half the page while the terms wrapped to six lines beside them. A column
    // whose longest cell is short gets that width; the rest share what is left.
    const natural = Array.from({ length: cols }, (_, c) =>
      Math.max(...rows.map((r, i) => {
        doc.font(i === 0 ? FONT_BODY_BOLD : FONT_BODY, 9);
        return doc.widthOfString(r[c] ?? "");
      })) + PAD_X * 2 + 6,
    );
    let widths: number[];
    if (natural.reduce((a, b) => a + b, 0) <= CW) {
      widths = natural.map(() => CW / cols);
    } else {
      const narrow = natural.map((n) => n <= CW * 0.3);
      const fixed = natural.reduce((a, n, i) => a + (narrow[i] ? n : 0), 0);
      const flex = narrow.filter((x) => !x).length;
      widths = flex === 0
        ? natural.map(() => CW / cols)
        : natural.map((n, i) => (narrow[i] ? n : (CW - fixed) / flex));
    }
    const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));

    // Row height is the tallest cell at its own column width -- the only number
    // that can be right for rows whose cells differ in length by two orders of
    // magnitude (the ROW_H = 18 interleaving defect).
    const heights = rows.map((cells, i) => {
      doc.font(i === 0 ? FONT_BODY_BOLD : FONT_BODY, 9);
      let h = 0;
      cells.forEach((cell, c) => {
        h = Math.max(h, doc.heightOfString(cell, { width: widths[c] - PAD_X * 2 }));
      });
      return h + PAD_Y * 2;
    });
    const total = 4 + heights.reduce((a, h, i) => a + h + (i === 0 ? 2 : GAP_Y), 0) + 8;
    return { rows, widths, xs, heights, total };
  };

  const table = (packed: string) => {
    const t = measureTable(packed);

    const drawRow = (r: number) => {
      const isHeader = r === 0;
      doc.font(isHeader ? FONT_BODY_BOLD : FONT_BODY, 9)
         .fillColor(isHeader ? TOKENS.navy : ink);
      t.rows[r].forEach((cell, c) => {
        doc.text(cell, t.xs[c] + PAD_X, y + PAD_Y, { width: t.widths[c] - PAD_X * 2 });
      });
      // A rule under the header only. Body rows are separated by spacing, which
      // keeps a short terms table from reading like a spreadsheet.
      if (isHeader) {
        doc.save().strokeColor(TOKENS.gold).lineWidth(0.6)
           .moveTo(M, y + t.heights[0] - 2).lineTo(M + CW, y + t.heights[0] - 2).stroke().restore();
      }
      y += t.heights[r] + (isHeader ? 2 : GAP_Y);
    };

    // A SHORT TABLE IS KEPT WHOLE. The three-row tier table split one row onto
    // the next page under a repeated header. A short table that does not fit
    // starts on the next page instead. A long one is still split between rows:
    // moving the accessorial table whole left half a page empty above it.
    const pageRoom = CONTENT_BOTTOM - (shell ? SHELL_MARGIN + 35.25 : MARGIN + 52);
    if (t.total <= pageRoom * 0.35 && y + t.total > CONTENT_BOTTOM) pageBreak();

    y += 4;
    const firstBodyH = t.rows.length > 1 ? t.heights[1] : 0;
    if (y + t.heights[0] + 2 + firstBodyH > CONTENT_BOTTOM) pageBreak();
    drawRow(0);

    for (let r = 1; r < t.rows.length; r++) {
      if (y + t.heights[r] > CONTENT_BOTTOM) {
        pageBreak();
        // Repeat the header. A continued table whose columns are unlabelled is
        // a column of dollar figures with nothing saying what they charge for.
        drawRow(0);
      }
      drawRow(r);
    }
    y += 8;
  };

  const heading = (text: string, next?: AgreementSegment) => {
    // KEPT WITH WHAT FOLLOWS. A heading alone at the foot of a page, with its
    // clause on the next, is the defect this closes (paragraph 22).
    const headH = shell ? 18 + 9 + 7.5 : 6 + 16;
    let need = headH;
    if (next?.kind === "clause") need += leadHeight(next.text);
    else if (next?.kind === "table") {
      const t = measureTable(next.text);
      need += 4 + t.heights[0] + 2 + (t.heights[1] ?? 0);
    }
    if (y + need > CONTENT_BOTTOM) pageBreak();
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
  segments.forEach((s, i) => {
    if (s.kind === "heading") heading(s.text, segments[i + 1]);
    else if (s.kind === "clause") {
      block(s.text, { introduces: /:\s*$/.test(s.text) ? segments[i + 1] : undefined });
    }
    else if (s.kind === "table") table(s.text);
  });

  // Keep the execution area together. Height must fit the taller column — the
  // CARRIER role has 8 fields (LEGAL NAME / MC # / DOT # / EIN / PRINT NAME /
  // TITLE / SIGNATURE / DATE) at 26pt, with the SIGNATURE row SIGNATURE_ROW_H
  // tall, so ~260pt, or its last fields overflow the block and collide with the
  // attestation strip below.
  //
  // v3.8.blr — the EIN field is drawn only when an EIN is on file (owner,
  // 2026-09-26: "if we are not able to automatically populate then we need to
  // remove it"). A blank line on an electronically executed agreement is a
  // field nobody will ever fill, and reads as information the carrier withheld.
  // One field fewer is one 26pt row fewer.
  const roles = signatureRoles(carrier?.ein);
  const sigHeight = roles === MASTER_AGREEMENT_SIGNATURE_ROLES ? 262 : 236;
  if (y + sigHeight + 56 > CONTENT_BOTTOM) pageBreak();
  else y += 14;
  block(seg("witness")[0]?.text ?? WITNESS_LINE, { font: FONT_BODY_ITALIC, size: 9, gap: 14, align: "left" });

  const prefilled: Record<string, string> = {};

  // THE BROKER COLUMN, on EVERY render including an unsigned specimen.
  //
  // SRL knows who signs for SRL before anyone has signed anything, so leaving
  // it blank was never honest — it read as a party that had not decided who
  // binds it. Role-scoped (B9a): a bare "PRINT NAME" key would fill the
  // CARRIER column too, printing the broker signatory on the line the carrier
  // signs, which is exactly why this could not be done before.
  const BROKER_ROLE = MASTER_AGREEMENT_SIGNATURE_ROLES[0].title;
  prefilled[roleFieldKey(BROKER_ROLE, "PRINT NAME")] = SIGNATORY_NAME;
  prefilled[roleFieldKey(BROKER_ROLE, "TITLE")] = SIGNATORY_TITLE;

  // The DATE fills only once there is one. On a specimen the broker date line
  // stays open, because the agreement has no date until it is executed.
  if (countersign) {
    prefilled[roleFieldKey(BROKER_ROLE, "DATE")] =
      new Date(countersign.at).toISOString().slice(0, 10);
  }

  if (carrier) {
    // Bare keys, deliberately: these four field names appear ONLY in the
    // carrier role, so they cannot cross-fill. PRINT NAME, TITLE and DATE
    // below appear in BOTH roles and must be role-scoped — do not copy this
    // bare pattern for them.
    prefilled["CARRIER LEGAL NAME"] = carrier.legalName;
    // The label is "MC #", so the value is the digits: most carriers store
    // "MC-116980" (v3.8.bmy). Display only; the canonical text keeps the stored
    // value, so no content hash moves.
    const mcShown = mcDigits(carrier.mcNumber);
    if (mcShown) prefilled["MC #"] = mcShown;
    if (carrier.dotNumber) prefilled["DOT #"] = carrier.dotNumber;
    if (carrier.ein) prefilled["EIN"] = carrier.ein;
  }

  // THE CARRIER COLUMN, on EXECUTED copies only.
  //
  // An executed agreement was printing the carrier's identity and leaving the
  // three fields that say WHO signed it blank, while the attestation strip
  // below named them. One document, two answers to "who bound the carrier",
  // and the blank one is the one that looks like the signature block.
  //
  // Unsigned specimens are untouched: with no signature there is nobody to
  // name, and a specimen's whole job is to show what a carrier will fill in.
  //
  // THE SIGNATURE LINES, as an e-signature platform draws them (ratified by the
  // owner 2026-09-26). The carrier's line carries the name they typed, set in
  // the signature face: typing it and accepting is how they signed, so this is
  // their adopted signature, not a mark invented for them. The broker's carries
  // the officer's scanned pen signature when one is on file, else the officer's
  // name in the same face. Each says how it was made, so neither can pass for
  // wet ink. A specimen passes no marks and its lines stay open for a pen.
  //
  // This reverses the earlier rule that SIGNATURE stays blank. That rule held
  // while a typed name printed there would have been an unlabelled claim of a
  // handwritten mark; the caption is what makes the line honest.
  const marks: Record<string, SignatureMark> = {};
  const CARRIER_ROLE = MASTER_AGREEMENT_SIGNATURE_ROLES[1].title;
  if (countersign) {
    marks[roleFieldKey(BROKER_ROLE, "SIGNATURE")] = {
      image: (opts.signatureImage ?? officerSignatureImage)(countersign.name) ?? undefined,
      typedName: countersign.name,
      caption: "Countersigned electronically",
    };
  }
  if (signature) {
    prefilled[roleFieldKey(CARRIER_ROLE, "PRINT NAME")] = signature.signedByName;
    if (signature.signedByTitle) {
      prefilled[roleFieldKey(CARRIER_ROLE, "TITLE")] = signature.signedByTitle;
    }
    prefilled[roleFieldKey(CARRIER_ROLE, "DATE")] =
      new Date(signature.signedAt).toISOString().slice(0, 10);
    marks[roleFieldKey(CARRIER_ROLE, "SIGNATURE")] = {
      typedName: signature.signedByName,
      caption: "Electronically signed",
    };
  }

  y = drawSignatureBlock(doc, y, {
    roles,
    height: sigHeight,
    prefilledValues: prefilled,
    x: M,
    width: CW,
    signatureMarks: marks,
  });

  // The countersign line, DRAWN because it is HASHED. canonicalAgreementText
  // calls its segment list "the contract between what is shown and what is
  // signed"; a segment inside the hash and absent from the page would break
  // that in the direction that matters — the carrier would be bound to a
  // sentence their copy does not carry.
  const countersignSeg = seg("countersign")[0]?.text;
  if (countersignSeg) {
    y += 6;
    if (y + 30 > CONTENT_BOTTOM) pageBreak();
    block(countersignSeg, { font: FONT_BODY_ITALIC, size: 8, color: TOKENS.fg2, align: "left" });
  }

  if (signature) {
    y += 6;
    if (y + 46 > CONTENT_BOTTOM) pageBreak();
    // The attestation is the assembly's, not a second copy. ISO-only inside
    // the assembly; no locale formatting, because ICU builds differ between
    // machines and the hash must not.
    const attest = seg("attestation")[0]?.text ?? "";
    doc.font(FONT_BODY_ITALIC, 8);
    const ah = doc.heightOfString(attest, { width: CW - 20 });
    const boxH = ah + 16;
    doc.save().fillColor(TOKENS.cream2).strokeColor(TOKENS.border1).lineWidth(0.5)
       .roundedRect(M, y, CW, boxH, 6).fillAndStroke().restore();
    doc.font(FONT_BODY_ITALIC, 8).fillColor(TOKENS.fg2).text(attest, M + 10, y + 8, { width: CW - 20 });
    y += boxH + 8;
  } else {
    y += 6;
    block(
      "To execute this Agreement, sign electronically in your carrier portal at silkroutelogistics.ai. A typed legal name plus acceptance checkbox constitutes a binding electronic signature under ESIGN/UETA.",
      { font: FONT_BODY_ITALIC, size: 8, color: TOKENS.fg3, align: "left" },
    );
  }

  // Per-page footers with correct total (bufferPages must be enabled on the
  // doc). The footer sits below the body floor, so each page's bottom margin
  // is released first: otherwise PDFKit would read a footer line as text
  // crossing the margin and start a new page for it.
  doc.removeListener("pageAdded", onPage);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    // Page 1 is the cover when the shell is on, and the cover carries no
    // footer -- the Design System puts only the tagline there.
    if (shell && i === 0) continue;
    doc.switchToPage(range.start + i);
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
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
  /**
   * SRL's countersignature, when this render is of an EXECUTED agreement.
   * Read from the stored row, never rebuilt from authority.ts at render time:
   * changing the officer must not restate who bound the company on an
   * agreement already executed.
   */
  countersign?: CanonicalCountersign;
  /**
   * Resolves an officer's scanned signature by name. Defaults to the assets
   * directory; a test passes its own so it does not depend on which image files
   * happen to be in the tree.
   */
  signatureImage?: (officerName: string) => Buffer | null;
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
  const { margins } = bodyGeometry(opts.shell === true);
  const doc = new PDFDocument({ size: "LETTER", margins, bufferPages: true });
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
  return `${agreement.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}

// v3.8.asa — the four per-agreement wrappers (generateBrokerCarrierAgreementPdf
// / Buffer, generateQuickPayAgreementPdf / Buffer) were deleted here. They were
// a second way to do exactly what generateAgreementPdf / generateAgreementBuffer
// already do, and the BCA pair being the only wired path is precisely how the
// Quick Pay PDF route ended up hardcoded to "broker-carrier". Callers resolve
// the agreement with getAgreement(templateName) and pass it in.
