/**
 * Item 342 (v3.8.bor) — Quick Pay decided WITH the offer.
 *
 * The rate confirmation goes out with the offer and accepting it is signing it,
 * so how the load is paid has to be settled before the offer leaves: the AE
 * records Quick Pay here, on the evidence of where the carrier asked for it.
 * The backend runs the same three gates the carrier's own choice had (pilot,
 * signed Caravan Quick Pay Agreement, Quick Pay switched on) and answers 422
 * with the reason when the carrier is not eligible.
 *
 * Standard terms are the default and send nothing.
 */

export type OfferQuickPaySpeed = "" | "SEVEN_DAY" | "SAME_DAY";
export type OfferQuickPayEvidence = "email_subject" | "call_timestamp" | "quo_message_id";

export type OfferQuickPayValue = {
  speed: OfferQuickPaySpeed;
  evidenceType: OfferQuickPayEvidence;
  evidenceRef: string;
};

export const EMPTY_OFFER_QUICK_PAY: OfferQuickPayValue = { speed: "", evidenceType: "email_subject", evidenceRef: "" };

export const EVIDENCE_LABELS: Record<OfferQuickPayEvidence, string> = {
  email_subject: "Email subject",
  call_timestamp: "Call date and time",
  quo_message_id: "Quo message ID",
};

/** Why the fields cannot be sent as they stand, or null when they can. */
export function offerQuickPayProblem(v: OfferQuickPayValue): string | null {
  if (!v.speed) return null;
  if (v.evidenceRef.trim().length < 3) return "Quick Pay needs the evidence of where the carrier asked for it.";
  return null;
}

/** The request body's `quickPay`, or undefined for standard terms. */
export function offerQuickPayBody(v: OfferQuickPayValue) {
  if (!v.speed) return undefined;
  return { speed: v.speed, evidenceType: v.evidenceType, evidenceRef: v.evidenceRef.trim() };
}
