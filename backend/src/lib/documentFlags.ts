/**
 * Which CarrierProfile completeness flag a persisted carrier document flips.
 *
 * v3.8.bbx. Three upload paths each carried their own copy of this rule
 * (registerCarrier's DOC_TYPE_MAP, uploadCarrierDocuments' filename heuristic,
 * the AE upload's if/else chain) and a fourth — the info-request response —
 * carried none, so a W-9 arriving that way never flipped `w9Uploaded`. This is
 * the single statement of the rule; the info-request path reads it now, and
 * §13.3 banks migrating the other three onto it.
 *
 * Only the three flags the compliance gate reads (complianceMonitorService
 * `w9Uploaded` / `insuranceCertUploaded` / `authorityDocUploaded`). Every other
 * docType is a document without a completeness flag and returns null.
 */
export type CarrierDocFlagField = "w9Uploaded" | "insuranceCertUploaded" | "authorityDocUploaded";

const FLAG_BY_DOC_TYPE: Record<string, CarrierDocFlagField> = {
  W9: "w9Uploaded",
  COI: "insuranceCertUploaded",
  AUTHORITY: "authorityDocUploaded",
};

export function flagFieldForDocType(docType: string | null | undefined): CarrierDocFlagField | null {
  if (!docType) return null;
  return FLAG_BY_DOC_TYPE[docType.toUpperCase()] ?? null;
}
