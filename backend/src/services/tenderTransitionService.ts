import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { logTenderTransition, TenderState } from "./waterfallEventService";

/**
 * Moving tenders between states.
 *
 * WHY IT IS ITS OWN SERVICE. Six places ran their own sibling `updateMany` --
 * accept, accept-on-behalf, broadcast accept, load cancelled, cascade position
 * skipped, compliance block -- and each worded the same act differently. That is
 * how EXPIRED came to mean "SRL pulled the offer" in two of them and DECLINED in
 * two others, both of which land in a carrier's acceptance rate and are scored
 * at 10% of Compass (SS9). Every one of those was a real mark on a carrier who
 * had done nothing.
 *
 * The consolidation is not tidying. A vocabulary that six files each maintain
 * separately is not a vocabulary, and a guard cannot enforce one that does not
 * exist in a single place.
 *
 * -----------------------------------------------------------------------------
 * IT ALSO CLOSES A LIVE GAP. Every one of those six sites filtered on
 * `status: "OFFERED"` alone. A COUNTERED sibling therefore survived: another
 * carrier took the load, the countered tender stayed live, and an AE could
 * afterwards accept a counter on a load that was already booked. The helper
 * withdraws OFFERED and COUNTERED both, which is what the callers all meant.
 */

/**
 * Why SRL pulled a live offer.
 *
 * Fixed vocabulary, not free text: the carrier portal renders these to a human
 * ("Load covered"), and analytics excludes withdrawn rows from the acceptance
 * denominator. Both need to know what they are looking at without parsing prose.
 *
 * None of these is a carrier refusing anything -- that is DECLINED, which is
 * carrier-initiated only and which nothing in this file may write.
 */
export const WITHDRAW_REASONS = [
  /** Somebody else took the load. */
  "load_covered",
  /** The AE turned down this carrier's counter-offer. */
  "counter_rejected",
  /** The AE pulled the offer with no further reason. */
  "ae_withdrew",
  /** The load itself was cancelled underneath the offer. */
  "load_cancelled",
  /** An AE skipped this position in the cascade. */
  "position_skipped",
  /** The carrier stopped being eligible before they could answer. */
  "compliance_block",
] as const;

export type WithdrawReason = (typeof WITHDRAW_REASONS)[number];

/** States a tender can be withdrawn FROM. Anything else is settled already. */
const LIVE: TenderState[] = ["OFFERED", "COUNTERED"];

export type TenderDb = Prisma.TransactionClient | typeof prisma;

export interface WithdrawLiveTendersInput {
  /** Withdraw every live tender on this load. */
  loadId?: string;
  /** Or every live tender at this cascade position. One or the other. */
  waterfallPositionId?: string;
  /** The tender that won, if any. Never withdrawn. */
  exceptTenderId?: string;
  reason: WithdrawReason;
  actor?: { id?: string | null; name?: string | null; type?: "USER" | "SYSTEM" | "CARRIER" | "SHIPPER" };
  /**
   * Soft-delete alongside the withdraw.
   *
   * Only the cancelled-load path wants this, and it is opt-in rather than
   * implied: soft-deleting a tender hides it from the carrier's own history,
   * which is right when the load is gone and wrong every other time.
   */
  softDelete?: boolean;
}

/**
 * Withdraw every live tender matching the scope, and record each move.
 *
 * Reads before it writes because the history row needs each tender's id and its
 * FROM state, and `updateMany` returns neither. The read and the write are
 * atomic whenever the caller passes a transaction client, which the accept
 * paths do.
 *
 * Outside a transaction there is a small window in which a tender could be
 * accepted between the read and the write. The update is scoped to the live
 * states so such a tender is never clobbered, and when the counts disagree the
 * rows that actually moved are re-read before anything is logged -- a history
 * row describing a transition that did not happen is worse than an extra query.
 */
export async function withdrawLiveTenders(
  input: WithdrawLiveTendersInput,
  db: TenderDb = prisma,
): Promise<{ count: number; tenderIds: string[] }> {
  const { loadId, waterfallPositionId, exceptTenderId, reason, softDelete } = input;
  if (!loadId && !waterfallPositionId) {
    throw new Error("withdrawLiveTenders needs a loadId or a waterfallPositionId");
  }

  const scope: Prisma.LoadTenderWhereInput = {
    ...(loadId ? { loadId } : {}),
    ...(waterfallPositionId ? { waterfallPositionId } : {}),
    ...(exceptTenderId ? { id: { not: exceptTenderId } } : {}),
    status: { in: LIVE as never },
    deletedAt: null,
  };

  const snapshot = await db.loadTender.findMany({
    where: scope,
    select: { id: true, loadId: true, status: true },
  });
  if (snapshot.length === 0) return { count: 0, tenderIds: [] };

  const ids = snapshot.map((t) => t.id);
  const updated = await db.loadTender.updateMany({
    where: { id: { in: ids }, status: { in: LIVE as never } },
    data: {
      status: "WITHDRAWN",
      statusReason: reason,
      ...(softDelete ? { deletedAt: new Date() } : {}),
    },
  });

  // respondedAt is deliberately NOT set. Nobody responded -- SRL pulled the
  // offer -- and stamping a response time would make the carrier look like they
  // answered when they were never given the chance.

  let moved = snapshot;
  if (updated.count !== snapshot.length) {
    const after = await db.loadTender.findMany({
      where: { id: { in: ids }, status: "WITHDRAWN", statusReason: reason },
      select: { id: true },
    });
    const movedIds = new Set(after.map((t) => t.id));
    moved = snapshot.filter((t) => movedIds.has(t.id));
  }

  for (const t of moved) {
    await logTenderTransition(
      {
        tenderId: t.id,
        loadId: t.loadId,
        from: t.status as TenderState,
        to: "WITHDRAWN",
        reason,
        actorType: input.actor?.type ?? (input.actor?.id ? "USER" : "SYSTEM"),
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        metadata: { exceptTenderId: exceptTenderId ?? null, softDeleted: !!softDelete },
      },
      db,
    );
  }

  return { count: moved.length, tenderIds: moved.map((t) => t.id) };
}
