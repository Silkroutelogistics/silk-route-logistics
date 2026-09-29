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

/**
 * v3.8.bol (Item 342) — void the rate confirmations drafted for these tenders,
 * and only those.
 *
 * The RC is issued with the offer on the direct paths, so a tender that dies
 * (declined, expired, withdrawn) leaves a document in the carrier's inbox with a
 * live signing link on it. Without this a carrier could sign a load that was
 * already covered by someone else, or an offer that ran out. Scoped by tender
 * rather than by load for exactly that reason: withdrawing the losers when one
 * carrier wins must not touch the winner's document.
 *
 * The number stays on the voided row, so it is cancelled rather than freed:
 * rateConNumber is @unique and a void never clears it (§21.2, never reused).
 */
export async function voidTenderRateConfirmations(tenderIds: string[], db: Db = prisma): Promise<number> {
  if (tenderIds.length === 0) return 0;
  const voided = await db.rateConfirmation.updateMany({
    where: { tenderId: { in: tenderIds }, status: { notIn: [...VOIDABLE_EXCLUSIONS] } },
    data: {
      status: "VOID",
      signTokenHash: null,
      signTokenId: null,
      signTokenExpiresAt: null,
    },
  });
  return voided.count;
}
