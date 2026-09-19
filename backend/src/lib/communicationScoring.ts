/**
 * Check-call communication scoring — decided once.
 *
 * Lifecycle-gaps B3b (finding #8). recalculateCarrierCPP scored communication as
 * RESPONDED over EVERY CheckCallSchedule in the window, and a cancellation flips
 * a load's PENDING/SENT schedules to CANCELLED — so a shipper who pulled a load
 * left the carrier holding "unanswered" calls that never fell due, at 10% of
 * the composite (§9). Found beside it in Phase A: PENDING (not yet due) and
 * SENT (inside its 30-minute window, or its one retry) were counted the same
 * way. A carrier with three calls scheduled for tomorrow and one answered today
 * read 25%.
 *
 * THE RULE: a schedule is JUDGED when it closed with an outcome the carrier
 * owns. RESPONDED is answered. ESCALATED is the second miss — the carrier had
 * the text, the window, the retry, and did not answer. Nothing else is judged:
 *
 *   PENDING    scheduled, not yet due
 *   SENT       texted, still inside its window (first miss retries in place)
 *   CANCELLED  the load was cancelled or TONU'd; the call never fell due
 *
 * MISSED is in the schema comment and in riskEngine's filter and is written by
 * nothing (the second miss writes ESCALATED). It is classified as judged so a
 * writer that ever uses the documented word lands on the right side.
 *
 * Null, never 0, when nothing was judged: a carrier nobody has called has no
 * communication score, which is the v3.8.bbn rule for every factor.
 */

/** Closed with an outcome the carrier owns. */
export const JUDGED_CHECK_CALL_STATES: readonly string[] = ["RESPONDED", "ESCALATED", "MISSED"];
/** Answered. */
export const ANSWERED_CHECK_CALL_STATES: readonly string[] = ["RESPONDED"];
/** Open, or never fell due. Out of the denominator. */
export const UNJUDGED_CHECK_CALL_STATES: readonly string[] = ["PENDING", "SENT", "CANCELLED"];

export interface CheckCallSummary {
  total: number;
  answered: number;
  /** answered + unanswered-but-closed. The denominator. */
  judged: number;
  /** PENDING + SENT. */
  open: number;
  cancelled: number;
  /** answered / judged as a percentage; null when nothing was judged. */
  score: number | null;
}

export function summarizeCheckCalls(rows: ReadonlyArray<{ status: string }>): CheckCallSummary {
  let answered = 0, judged = 0, open = 0, cancelled = 0;
  for (const r of rows) {
    if (ANSWERED_CHECK_CALL_STATES.includes(r.status)) { answered++; judged++; }
    else if (JUDGED_CHECK_CALL_STATES.includes(r.status)) judged++;
    else if (r.status === "CANCELLED") cancelled++;
    else open++;
  }
  return {
    total: rows.length,
    answered,
    judged,
    open,
    cancelled,
    score: judged > 0 ? (answered / judged) * 100 : null,
  };
}
