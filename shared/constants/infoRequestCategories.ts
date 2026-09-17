// Single source of truth for InfoRequest category display labels.
// Consumed by frontend (via the @shared alias) and backend (via rootDir + include),
// the same bridge shared/constants/pipelineStatus.ts already uses.
//
// WHY THIS FILE EXISTS. The labels lived in two hand-maintained copies —
// backend/src/services/infoRequestService.ts and
// frontend/src/components/carriers/InfoRequestModal.tsx — and they had already
// drifted. An AE picked "Other (custom message)" from the dropdown and the
// thread card, the carrier email, the AE resolved-email, the answered
// confirmation and the withdrawal notice all rendered "Additional information".
// One ask, two names, depending on which surface you were looking at.
//
// WHICH LABEL WON, AND WHY IT IS THE BACKEND'S. Eight surfaces render these
// strings and only ONE is the dropdown. The other seven put the label inside a
// sentence — "Our {label} request has been withdrawn", "your response to our
// {label} request" — where "Other (custom message)" reads as broken English and
// leaks a UI affordance into a carrier's inbox. A label has to survive being
// read aloud in a sentence; "(custom message)" is dropdown help text that had
// been promoted to a name.
//
// The KEYS are the Prisma `InfoRequestCategory` enum, in enum order.

export type InfoRequestCategory =
  | "COI_UPDATE"
  | "W9_UPDATE"
  | "AUTHORITY_LETTER"
  | "SAFETY_CLARIFICATION"
  | "EIN_VERIFICATION"
  | "VOIDED_CHECK"
  | "ADDRESS_PROOF"
  | "REFERENCES"
  | "OTHER";

export const INFO_REQUEST_CATEGORY_LABELS: Record<InfoRequestCategory, string> = {
  COI_UPDATE: "Updated Certificate of Insurance (COI)",
  W9_UPDATE: "Updated W-9 form",
  AUTHORITY_LETTER: "FMCSA Authority Letter",
  SAFETY_CLARIFICATION: "Safety record clarification",
  EIN_VERIFICATION: "EIN/TIN verification",
  VOIDED_CHECK: "Voided check (for Quick Pay setup)",
  ADDRESS_PROOF: "Proof of address",
  REFERENCES: "References from prior brokers",
  OTHER: "Additional information",
};

/** Ordered for the AE dropdown — carrier-onboarding frequency, most common first. */
export const INFO_REQUEST_CATEGORIES: InfoRequestCategory[] = [
  "COI_UPDATE",
  "W9_UPDATE",
  "AUTHORITY_LETTER",
  "SAFETY_CLARIFICATION",
  "EIN_VERIFICATION",
  "VOIDED_CHECK",
  "ADDRESS_PROOF",
  "REFERENCES",
  "OTHER",
];

/**
 * Which Document.docType a carrier's attachment lands under, per category.
 *
 * v3.8.bbx. Every info-request attachment used to be written as
 * "INFO_REQUEST_RESPONSE" regardless of what was asked for, which meant a W-9
 * that arrived through an info request was not a W-9 anywhere else: the intake
 * reader only parses COI and W9, the AE Documents panel groups by docType, and
 * the profile's `w9Uploaded`-class flags are flipped only by the other upload
 * paths. The request record and the Documents tab disagreed by construction.
 *
 * Targets are EXISTING docType spellings from the schema comment — nothing new
 * is invented. VOIDED_CHECK and ADDRESS_PROOF have no existing docType and
 * stay under INFO_REQUEST_RESPONSE; so does everything that is an answer in
 * prose rather than a document.
 */
export const INFO_REQUEST_CATEGORY_DOC_TYPE: Record<InfoRequestCategory, string> = {
  COI_UPDATE: "COI",
  W9_UPDATE: "W9",
  AUTHORITY_LETTER: "AUTHORITY",
  SAFETY_CLARIFICATION: "INFO_REQUEST_RESPONSE",
  EIN_VERIFICATION: "INFO_REQUEST_RESPONSE",
  VOIDED_CHECK: "INFO_REQUEST_RESPONSE",
  ADDRESS_PROOF: "INFO_REQUEST_RESPONSE",
  REFERENCES: "INFO_REQUEST_RESPONSE",
  OTHER: "INFO_REQUEST_RESPONSE",
};

export function docTypeForCategory(category: string): string {
  return (INFO_REQUEST_CATEGORY_DOC_TYPE as Record<string, string>)[category] ?? "INFO_REQUEST_RESPONSE";
}
