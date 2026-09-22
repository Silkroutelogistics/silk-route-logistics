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
