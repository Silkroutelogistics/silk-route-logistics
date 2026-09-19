/**
 * Tender acceptance scoring — decided once, read by every surface.
 *
 * Lifecycle-gaps B3a (findings #6 and #7). Three surfaces judged a carrier's
 * acceptance rate and each kept its own rule: recalculateCarrierCPP (the
 * PERSISTED Compass factor, §9 at 10% of the composite) counted WITHDRAWN in
 * its denominator after carrierController had stopped doing so (v3.8.awx), and
 * all three counted `status === "ACCEPTED"` alone — so once v3.8.axt/axu moved
 * an accepted tender on through RC_SENT and CONFIRMED, the carrier who accepted
 * AND SIGNED scored as not having accepted at all. The funnel's parts stopped
 * summing to its total for the same reason, the awx regression in a new costume.
 *
 * THE RULE, stated once:
 *
 *   accepted  = the carrier said yes. ACCEPTED, and everything an acceptance
 *               moves on to: RC_SENT (paper out), CONFIRMED (paper signed),
 *               RELEASED (accepted, then taken back — the acceptance happened;
 *               the release is a fall-off question, scored elsewhere).
 *   judged    = every tender except WITHDRAWN. An offer SRL pulled back was
 *               never a chance the carrier had; judging them on it measures our
 *               dispatch, not their behaviour. EXPIRED stays in deliberately:
 *               the carrier was given the offer and the window, and letting it
 *               lapse is a response (v3.8.awx).
 *   responded = accepted + DECLINED + COUNTERED — the carrier answered.
 *
 * A live OFFERED tender inside its window is in `judged` today, as it was on
 * every surface before this file existed. Whether it should be is a scoring
 * question this arc did not decide; it is recorded here so nobody reads the
 * inclusion as a choice made in B3a.
 *
 * The drift guard (tenderScoring.test.ts) reads schema.prisma so every
 * TenderStatus the enum declares lands in exactly one bucket, and reads the
 * three surfaces so none of them keeps a private `status === "ACCEPTED"` again.
 */

import type { TenderStatus } from "@prisma/client";

/** The carrier said yes, whatever happened to the paperwork afterwards. */
export const ACCEPTED_TENDER_STATES: readonly TenderStatus[] = ["ACCEPTED", "RC_SENT", "CONFIRMED", "RELEASED"];

/** Never a chance the carrier had. Out of the denominator on every surface. */
export const UNJUDGED_TENDER_STATES: readonly TenderStatus[] = ["WITHDRAWN"];


export function isAcceptedTender(status: TenderStatus | string): boolean {
  return (ACCEPTED_TENDER_STATES as readonly string[]).includes(status);
}

export interface TenderSummary {
  total: number;
  /** ACCEPTED + RC_SENT + CONFIRMED + RELEASED. */
  accepted: number;
  /** The accepted class, by stage, so a funnel can still show how far each got. */
  acceptedByStage: { accepted: number; rcSent: number; confirmed: number; released: number };
  declined: number;
  countered: number;
  expired: number;
  /** Live OFFERED — still inside its window. */
  pending: number;
  withdrawn: number;
  /** total − withdrawn. The denominator. */
  judged: number;
  /** accepted + declined + countered. */
  responded: number;
  /** accepted / judged as a percentage; null when nothing was judged. */
  acceptanceRate: number | null;
  /** accepted / responded as a percentage; null when nobody answered. */
  acceptanceRateOfResponded: number | null;
}

/**
 * Classify a set of tenders. Pure. The buckets partition the set: every status
 * the enum declares lands in exactly one of accepted / declined / countered /
 * expired / pending / withdrawn, so
 *
 *   accepted + declined + countered + expired + pending + withdrawn === total
 *
 * holds by construction — the invariant the funnel lost in the audit.
 */
export function summarizeTenders(tenders: ReadonlyArray<{ status: TenderStatus | string }>): TenderSummary {
  const stage = { accepted: 0, rcSent: 0, confirmed: 0, released: 0 };
  let declined = 0, countered = 0, expired = 0, pending = 0, withdrawn = 0;
  for (const t of tenders) {
    switch (t.status) {
      case "ACCEPTED": stage.accepted++; break;
      case "RC_SENT": stage.rcSent++; break;
      case "CONFIRMED": stage.confirmed++; break;
      case "RELEASED": stage.released++; break;
      case "DECLINED": declined++; break;
      case "COUNTERED": countered++; break;
      case "EXPIRED": expired++; break;
      case "OFFERED": pending++; break;
      case "WITHDRAWN": withdrawn++; break;
      default:
        // An unknown status is a schema change this file has not seen. Counting
        // it as pending keeps the partition summing to total rather than losing
        // the row; the drift guard fails on the enum before this branch can run
        // in a tested build.
        pending++;
    }
  }
  const accepted = stage.accepted + stage.rcSent + stage.confirmed + stage.released;
  const total = tenders.length;
  const judged = total - withdrawn;
  const responded = accepted + declined + countered;
  return {
    total,
    accepted,
    acceptedByStage: stage,
    declined,
    countered,
    expired,
    pending,
    withdrawn,
    judged,
    responded,
    acceptanceRate: judged > 0 ? (accepted / judged) * 100 : null,
    acceptanceRateOfResponded: responded > 0 ? (accepted / responded) * 100 : null,
  };
}
