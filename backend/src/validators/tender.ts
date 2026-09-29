import { z } from "zod";

/**
 * Item 342 (v3.8.boq) — Quick Pay on a direct offer is the AE's call AT OFFER,
 * recorded on the evidence of where the carrier asked for it. Only the paid
 * speeds: standard terms are the default and need no election.
 */
export const offerQuickPaySchema = z.object({
  speed: z.enum(["SEVEN_DAY", "SAME_DAY"]),
  evidenceType: z.enum(["email_subject", "call_timestamp", "quo_message_id"]),
  evidenceRef: z.string().trim().min(3).max(500),
});

export const createTenderSchema = z.object({
  carrierId: z.string(),
  offeredRate: z.number().positive(),
  expiresAt: z.string().transform((s) => new Date(s)),
  quickPay: offerQuickPaySchema.optional(),
});

export const counterTenderSchema = z.object({
  counterRate: z.number().positive(),
});

// v3.8.ajz Item 90 — Optional decline reason captured at carrier-portal
// decline time. Carrier UI presents 7 categorized strings (carrier/
// dashboard/tenders/page.tsx:16-24) but the validator accepts any free
// text (capped at 500 chars) so future UI iterations + AE manual decline
// paths don't need a schema update to pick a different vocabulary.
export const declineTenderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * What an AE must show to accept for a carrier.
 *
 * The reference is required and length-bounded because it has to be FINDABLE:
 * an email subject somebody can search the shared inbox for, a call timestamp
 * somebody can match against the phone log, a Quo message id somebody can open.
 * Free-form prose passes a length check and answers nothing in a dispute, which
 * is why the type is an enum and not a string.
 */
export const acceptOnBehalfSchema = z.object({
  evidenceType: z.enum(["email_subject", "call_timestamp", "quo_message_id"]),
  evidenceRef: z.string().trim().min(3).max(500),
});
