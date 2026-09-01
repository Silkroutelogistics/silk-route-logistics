/**
 * Taking a rate confirmation out of circulation, decided once.
 *
 * WHY THIS EXISTS. Three places need to void a live rate confirmation — a
 * carrier counter, a carrier release, and a rate change after acceptance — and
 * each had (or was about to have) its own copy of the same predicate. Three
 * copies of one rule is how the six hand-rolled sibling-withdraw blocks came to
 * disagree about whether COUNTERED counts as live, which is the defect this arc
 * opened by fixing. One rule, one place.
 *
 * WHAT "LIVE" MEANS, and why SIGNED and FINALIZED are never touched. An executed
 * rate confirmation is evidence of what was agreed. Voiding it would not undo
 * the agreement; it would destroy the record OF the agreement while leaving the
 * agreement itself intact — which is strictly worse than leaving a stale
 * document standing. What a void does is stop an UNEXECUTED document being live,
 * so nobody signs terms that have already been superseded.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Statuses a void may move.
 *
 * VOID is in the exclusion list so a re-void is a no-op rather than a second
 * write, which keeps every caller idempotent without each one remembering to be.
 */
export const VOIDABLE_EXCLUSIONS = ["SIGNED", "FINALIZED", "VOID"] as const;

/**
 * Void every live rate confirmation on a load. Returns how many moved.
 *
 * Also clears the signing token on whatever it voided. A voided document must
 * not remain signable: the link is already in a carrier's inbox, and leaving it
 * live means a carrier can sign terms that were withdrawn — the signature would
 * be genuine, on a document nobody meant them to see.
 */
export async function voidLiveRateConfirmations(loadId: string, db: Db = prisma): Promise<number> {
  const voided = await db.rateConfirmation.updateMany({
    where: { loadId, status: { notIn: [...VOIDABLE_EXCLUSIONS] } },
    data: {
      status: "VOID",
      signTokenHash: null,
      signTokenId: null,
      signTokenExpiresAt: null,
    },
  });
  return voided.count;
}
