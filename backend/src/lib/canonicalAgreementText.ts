/**
 * WHAT DID THIS AGREEMENT ACTUALLY SAY? The canonical answer, and its hash.
 *
 * WHY A CANONICAL TEXT RATHER THAN HASHING THE PDF. PDF bytes are not stable.
 * The v3.8.awj audit downloaded one executed agreement twice and got 43,247
 * bytes both times with different sha256 — generation metadata differs per
 * render. A byte hash could therefore never re-verify, which makes it worse than
 * no hash: it would fail on documents that had not changed.
 *
 * So the hash covers the TEXT, assembled deterministically, and the renderer
 * consumes that same assembly. The segments below are what gets drawn; the
 * canonical string is those segments joined. There is no second description of
 * the document that could drift from the one on the page.
 *
 * DETERMINISM RULES, each one closing a way two assemblies of one row could
 * differ:
 *   - explicit field order, never object-key iteration
 *   - ISO-8601 UTC for every date; NO toLocaleString anywhere in this file.
 *     Locale formatting depends on the ICU build, so the same row could hash
 *     differently on two machines running the same code.
 *   - whitespace normalised: CRLF/CR to LF, runs of spaces collapsed, each
 *     segment trimmed. A copy-edit that only moves a line break must not read as
 *     a different agreement.
 *   - absent optional fields are OMITTED, never rendered as "null" or ""
 */
import crypto from "crypto";
import type { LegalAgreement } from "../data/agreements";

/** A drawable unit. `kind` selects the style; `text` is what is both drawn and hashed. */
export interface AgreementSegment {
  kind:
    | "effective-note" | "preamble" | "heading" | "clause" | "table"
    | "witness" | "countersign" | "attestation";
  text: string;
}

export interface CanonicalSignature {
  signedByName: string;
  signedByTitle?: string | null;
  signedAt: Date | string;
  signerIp?: string | null;
  version: string;
  consentAt?: Date | string | null;
}

export interface CanonicalCarrier {
  legalName: string;
  mcNumber?: string | null;
  dotNumber?: string | null;
  ein?: string | null;
}

/** Table separators. Reserved: the assembly refuses any cell containing one. */
export const CELL_SEP = " │ ";
export const ROW_SEP = " ║ ";

/** CRLF/CR to LF, collapse space runs, trim. Never changes word order or content. */
function norm(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function iso(d: Date | string): string {
  return new Date(d).toISOString();
}

export const WITNESS_LINE =
  "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date of the last signature below.";

/**
 * The attestation, assembled from the signature record.
 *
 * Note this is ALSO where the human-readable UTC line on the page comes from,
 * and it deliberately carries the ISO instant beside it (v3.8.awj) so a reader
 * can reconcile the rendered string against the stored value.
 */
/**
 * SRL's countersignature, applied by the system at the moment the carrier
 * accepts.
 *
 * WHY A SYSTEM COUNTERSIGN IS A REAL SIGNATURE. SRL issues the agreement and
 * tenders it; the carrier's acceptance is the last act needed to form it. The
 * countersign records that the company bound itself through a named officer at
 * that instant, which is what an executed instrument requires — an agreement
 * with one signature and a blank facing column is not obviously executed by
 * both parties, and that ambiguity is worth nothing to SRL in a dispute.
 *
 * It is NOT a claim that a person typed anything. `at` is the server clock at
 * acceptance and the name and title come from config/authority.ts, which is
 * why they are stored ON THE ROW rather than looked up at render time: changing
 * the officer must not silently restate who bound the company on agreements
 * already executed.
 */
export interface CanonicalCountersign {
  name: string;
  title: string;
  at: Date | string;
}

/**
 * The countersign line, deterministic and ISO-stamped for the same reason the
 * attestation is: a reader must be able to reconcile the rendered string
 * against the stored columns.
 */
export function countersignText(cs: CanonicalCountersign): string {
  const at = new Date(cs.at);
  const human = at.toISOString().replace("T", " ").slice(0, 16);
  return norm(
    `Countersigned for Silk Route Logistics Inc. by ${cs.name}, ${cs.title}` +
      ` on ${human} UTC, applied automatically on the Carrier's acceptance.` +
      `\nCountersigned at (UTC, ISO 8601): ${iso(at)}`,
  );
}

export function attestationText(sig: CanonicalSignature): string {
  const signedAt = new Date(sig.signedAt);
  const human = signedAt.toISOString().replace("T", " ").slice(0, 16); // YYYY-MM-DD HH:MM
  return norm(
    `Electronically signed by ${sig.signedByName}` +
      (sig.signedByTitle ? `, ${sig.signedByTitle}` : "") +
      ` on ${human} UTC` +
      (sig.signerIp ? ` · IP ${sig.signerIp}` : "") +
      ` · Agreement version ${sig.version}.` +
      " Executed as a legally binding electronic signature under the U.S. ESIGN Act and UETA." +
      `\nSigned at (UTC, ISO 8601): ${iso(signedAt)}` +
      (sig.consentAt
        ? `\nElectronic records and signatures consented to on ${iso(sig.consentAt)}.`
        : ""),
  );
}

/**
 * Every text input that reaches the rendered document, in a fixed order.
 *
 * The renderer iterates THIS. Adding a drawn string without adding it here would
 * put text on the page that the hash does not cover, so the segment list is the
 * contract between what is shown and what is signed.
 */
export function assembleAgreementSegments(
  agreement: LegalAgreement,
  opts: {
    carrier?: CanonicalCarrier;
    signature?: CanonicalSignature;
    countersign?: CanonicalCountersign;
  } = {},
): AgreementSegment[] {
  const out: AgreementSegment[] = [];

  out.push({ kind: "effective-note", text: norm(agreement.effectiveNote) });
  for (const p of agreement.preamble) out.push({ kind: "preamble", text: norm(p) });
  for (const s of agreement.sections) {
    out.push({ kind: "heading", text: norm(s.heading) });
    for (const c of s.clauses) out.push({ kind: "clause", text: norm(c) });
    // A table is hashed as one deterministic segment. The separators are
    // arbitrary but FIXED: what matters is that two different tables can never
    // flatten to the same string, so a cell moving between columns changes the
    // hash rather than surviving it.
    if (s.table) {
      const cells = [s.table.headers, ...s.table.rows];
      // The renderer splits this segment back apart to draw it, so that what is
      // DRAWN is exactly what is HASHED (v3.8.awo). That is only lossless while
      // no cell contains a separator, so refuse rather than corrupt: a silently
      // mis-split table is wrong figures on a signed instrument.
      for (const row of cells) {
        for (const c of row) {
          if (c.includes(CELL_SEP) || c.includes(ROW_SEP)) {
            throw new Error("agreement table cell contains a reserved separator: " + JSON.stringify(c));
          }
        }
      }
      out.push({ kind: "table", text: cells.map((r) => r.map(norm).join(CELL_SEP)).join(ROW_SEP) });
    }
  }
  out.push({ kind: "witness", text: WITNESS_LINE });
  // ORDER IS FIXED AND MIRRORS THE PAGE: witness line, then the execution
  // block (of which the countersign is the broker half), then the attestation
  // strip. Only the order matters for the hash, but matching the render keeps
  // the canonical text readable as the document rather than as a dump.
  //
  // Absent on an unsigned specimen, so a blank form and an executed copy hash
  // differently — which they must, because they are different documents.
  if (opts.countersign) out.push({ kind: "countersign", text: countersignText(opts.countersign) });
  if (opts.signature) out.push({ kind: "attestation", text: attestationText(opts.signature) });

  return out;
}

/**
 * The canonical text. Header fields that identify the document are named
 * explicitly rather than left implicit in the segments, because two agreements
 * could share a body and differ only by version or party.
 */
export function assembleAgreementText(
  agreement: LegalAgreement,
  opts: {
    carrier?: CanonicalCarrier;
    signature?: CanonicalSignature;
    countersign?: CanonicalCountersign;
  } = {},
): string {
  const c = opts.carrier;
  const header = [
    `TEMPLATE: ${agreement.templateName}`,
    `VERSION: ${agreement.version}`,
    `TITLE: ${norm(agreement.title)}`,
    `SUBTITLE: ${norm(agreement.subtitle ?? "")}`,
    // Party identity is part of what was agreed, not decoration: the same body
    // signed by a different carrier is a different agreement.
    `CARRIER_LEGAL_NAME: ${c?.legalName ?? ""}`,
    `CARRIER_MC: ${c?.mcNumber ?? ""}`,
    `CARRIER_DOT: ${c?.dotNumber ?? ""}`,
    `CARRIER_EIN: ${c?.ein ?? ""}`,
  ].join("\n");

  const body = assembleAgreementSegments(agreement, opts)
    .map((s) => `${s.kind.toUpperCase()}: ${s.text}`)
    .join("\n");

  return `${header}\n${body}\n`;
}

/** sha256 of the canonical text, hex. Stable across renders of the same row. */
export function agreementContentHash(
  agreement: LegalAgreement,
  opts: {
    carrier?: CanonicalCarrier;
    signature?: CanonicalSignature;
    countersign?: CanonicalCountersign;
  } = {},
): string {
  return crypto.createHash("sha256").update(assembleAgreementText(agreement, opts), "utf8").digest("hex");
}
