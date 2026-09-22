/**
 * The document-type vocabulary, as a server-side allowlist.
 *
 * `Document.docType` is a free-form `String?` (schema.prisma, the v3.8.aky Path γ
 * convention: the accepted values live in a comment on the model, not in a
 * Prisma enum). Until Task E1 both upload routes stored whatever string
 * arrived — a typo became a row nothing reads, and the settlement checklist
 * (integrationService SETTLEMENT_DOC_TYPES) could never go green on it, because
 * the checklist matches these exact strings. This module is the one place the
 * words live; each route refuses anything outside it with a 400.
 *
 * Classes, by what the document attaches to. LOAD is what the carrier-front
 * intake seam validates against; CARRIER and CUSTOMER cover /documents/upload's
 * entity targets; ANY (the union) is the fallback for a target an AE-internal
 * caller supplies that is none of those (an invoice, a shipper).
 *
 * Ruling 6 (2026-09-21) fixes the REQUIRED subset for a settlement —
 * SIGNED_BOL_DEL or POD, plus INVOICE, plus TEMP_LOG on a reefer — but that is
 * a question for the paperwork panel (E4) and the pay gate (E5), not for
 * whether a string may be stored. This list answers only the second.
 */
export const SETTLEMENT_DOC_TYPES = [
  "SIGNED_BOL_PU",
  "SIGNED_BOL_DEL",
  "POD",
  "INVOICE",
  "RECEIPT_LUMPER",
  "RECEIPT_SCALE",
  "TEMP_LOG",
] as const;

export const LOAD_DOC_TYPES = [
  ...SETTLEMENT_DOC_TYPES,
  "BOL", // the ORIGINAL bill of lading the AE attaches pre-dispatch; the signed copies are the two SIGNED_BOL_* above
  "RATE_CON",
  "PHOTO_LOADED",
  "PHOTO_SEAL",
  "PHOTO_EMPTY",
  "PHOTO_DAMAGE",
  "RECEIPT_MECHANICAL",
  "OTHER",
] as const;

export const CARRIER_DOC_TYPES = [
  "W9",
  "COI",
  "AUTHORITY",
  "WORKERS_COMP",
  "BOC3",
  "CDL",
  "MEDICAL_CARD",
  "MVR",
  "REGISTRATION",
  "INSPECTION",
  "OTHER",
] as const;

export const CUSTOMER_DOC_TYPES = [
  "CREDIT_APP",
  "RATE_AGREEMENT",
  "CUSTOMER_CONTRACT",
  "TAX_EXEMPTION",
  "SRL_COI",
  "PAYMENT_AUTHORIZATION",
  "OTHER",
] as const;

/**
 * The load-document types a CARRIER may upload: everything in LOAD_DOC_TYPES
 * except RATE_CON.
 *
 * The signed rate confirmation is system-generated — frozen at issue and
 * identified by its contentHash (v3.8.axt), signed through the token page and
 * recorded with name, IP, user agent and the token that carried it (v3.8.axu).
 * A carrier-uploaded RATE_CON is therefore a SECOND, unverified copy of a
 * record the platform already holds as evidence, and the one thing it could
 * do in a dispute is disagree with the first. AE roles keep the type: an AE
 * attaching a wet-signed scan on the carrier's behalf is a real case, and it
 * is the AE's record, not the carrier's assertion. One list, enforced in the
 * load-document seam both upload routes pass through (v3.8.bfu).
 */
export const CARRIER_UPLOADABLE_LOAD_DOC_TYPES = LOAD_DOC_TYPES.filter((t) => t !== "RATE_CON");
const CARRIER_UPLOADABLE = new Set<string>(CARRIER_UPLOADABLE_LOAD_DOC_TYPES);

/** May a carrier upload this LOAD docType? Every allowed load type except RATE_CON. */
export function carrierMayUploadLoadDocType(docType: string): boolean {
  return CARRIER_UPLOADABLE.has(docType);
}

export type LoadDocType = (typeof LOAD_DOC_TYPES)[number];
export type DocTypeClass = "LOAD" | "CARRIER" | "CUSTOMER" | "ANY";

const SETS: Record<DocTypeClass, ReadonlySet<string>> = {
  LOAD: new Set(LOAD_DOC_TYPES),
  CARRIER: new Set(CARRIER_DOC_TYPES),
  CUSTOMER: new Set(CUSTOMER_DOC_TYPES),
  ANY: new Set([...LOAD_DOC_TYPES, ...CARRIER_DOC_TYPES, ...CUSTOMER_DOC_TYPES]),
};

/** Trim + uppercase. Null when nothing usable was sent, so a caller can default. */
export function normalizeDocType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  return s.length ? s : null;
}

export function isAllowedDocType(docType: string, cls: DocTypeClass): boolean {
  return SETS[cls].has(docType);
}

/** Which class a /documents/upload target resolves to. A load wins over an entity. */
export function docTypeClassFor(target: { loadId?: string | null; entityType?: string | null }): DocTypeClass {
  if (target.loadId) return "LOAD";
  if (target.entityType === "CARRIER") return "CARRIER";
  if (target.entityType === "CUSTOMER") return "CUSTOMER";
  return "ANY";
}
