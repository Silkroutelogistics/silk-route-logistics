/**
 * Fall-off scoring — which fall-off records count toward deactivation review.
 *
 * Lifecycle-gaps B3c (finding #9). carrierReleaseService records a FallOffEvent
 * for every release reason except `srl_error`, and it is RIGHT to: the load
 * fell off, and the operational record should say so whoever caused it. But
 * fallOffRecovery's deactivation-review counter read that table with no regard
 * to reason, so two shipper cancellations (`customer_cancel`) flagged a
 * blameless carrier for review.
 *
 * Decision 2 of 2026-09-18, ratified: keep the `customer_cancel` record; it
 * stops counting toward deactivation review. Recording and scoring are two
 * questions, and this file answers only the second.
 *
 * THE RULE. A fall-off counts toward review unless its reason is one SRL or the
 * customer owns. The release reason is the leading token of the stored string
 * (`carrierReleaseService` writes `${reason}` or `${reason}: ${note}`); a
 * legacy free-text reason with no code (the pre-release-service rows,
 * "Carrier cancelled/removed") counts, because every one of those was written
 * by the carrier-fall-off path and nothing else.
 *
 *   carrier_fell_off   counts — the carrier backed out
 *   compliance_lapse   counts — the carrier's own paperwork
 *   rate_dispute       counts — unchanged from before; not ratified either way
 *   customer_cancel    does NOT count — decision 2
 *   srl_error          does NOT count — never recorded at all, listed so the
 *                      rule is complete if a row ever carries it
 */

import { RELEASE_REASONS, type ReleaseReason } from "../services/carrierReleaseService";

export const DEACTIVATION_REVIEW_THRESHOLD = 2;

/** Recorded, kept, and never counted against the carrier. */
export const NO_FAULT_FALL_OFF_REASONS: readonly ReleaseReason[] = ["customer_cancel", "srl_error"];

/** The leading reason code of a stored FallOffEvent.reason, or null for legacy free text. */
export function fallOffReasonCode(reason: string | null | undefined): ReleaseReason | null {
  if (!reason) return null;
  const head = reason.split(":")[0].trim();
  return (RELEASE_REASONS as readonly string[]).includes(head) ? (head as ReleaseReason) : null;
}

export function countsTowardReview(reason: string | null | undefined): boolean {
  const code = fallOffReasonCode(reason);
  if (code === null) return true; // legacy free text: written only by the carrier-fault path
  return !NO_FAULT_FALL_OFF_REASONS.includes(code);
}

export function reviewableFallOffCount(rows: ReadonlyArray<{ reason: string | null }>): number {
  return rows.filter((r) => countsTowardReview(r.reason)).length;
}

export function needsDeactivationReview(reviewableCount: number): boolean {
  return reviewableCount >= DEACTIVATION_REVIEW_THRESHOLD;
}
