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

export type Actor = {
  id?: string | null;
  name?: string | null;
  type?: "USER" | "SYSTEM" | "CARRIER" | "SHIPPER";
};

/** Every state a live tender can settle into. */
export type SettleTo = "ACCEPTED" | "DECLINED" | "COUNTERED" | "EXPIRED" | "WITHDRAWN";

/**
 * DECLINED is carrier-initiated, and this is where that stops being a rule
 * somebody has to remember.
 *
 * There is a static guard (tenderDeclineWriters) over which FILES may write it,
 * and a file-level allow-list cannot see who is calling. It has an entry for
 * waterfallEngineService reading "carrier declines a cascade offer" -- and the
 * route behind it is authorize("CARRIER", ...AE_ROLES), so an AE declining on a
 * carrier's behalf satisfied the allow-list and wrote a real decline onto that
 * carrier's acceptance rate. Presence is not function.
 *
 * So the check moved to where the caller is known. An AE may still record a
 * decline a carrier phoned in -- that is a real operational act, the same shape
 * as accept-on-behalf -- but it must say so, and the history row records that it
 * was on-behalf rather than presenting it as the carrier's own click.
 */
function assertDeclineIsCarrierInitiated(to: SettleTo, actor?: Actor, onBehalf?: boolean) {
  if (to !== "DECLINED") return;
  if (actor?.type === "CARRIER" || onBehalf) return;
  const e = new Error(
    "DECLINED is carrier-initiated. Pass actor.type CARRIER, or onBehalf: true to " +
      "record a decline the carrier gave outside the portal. SRL refusing a carrier " +
      "is WITHDRAWN with a coded reason.",
  );
  (e as Error & { code?: string }).code = "DECLINE_NOT_CARRIER_INITIATED";
  throw e;
}

/**
 * Read the rows, move them, and log only what actually moved.
 *
 * The read is needed because a history row wants each tender's id and its FROM
 * state and `updateMany` returns neither. Inside a transaction the pair is
 * atomic. Outside one a tender could settle in between, so the update is scoped
 * to the states we believed we saw and, when the counts disagree, the rows that
 * really moved are re-read before anything is written to history.
 */
async function applySettle(
  db: TenderDb,
  scope: Prisma.LoadTenderWhereInput,
  /** Undefined means "whatever it is now". A list is a safety rail. */
  fromStates: TenderState[] | undefined,
  data: Prisma.LoadTenderUpdateManyMutationInput,
  to: SettleTo,
  reason: string | null,
  actor: Actor | undefined,
  metadata: Record<string, unknown>,
): Promise<{ count: number; tenderIds: string[] }> {
  const statusRail = fromStates ? { status: { in: fromStates as never } } : {};
  const snapshot = await db.loadTender.findMany({
    where: { ...scope, ...statusRail },
    select: { id: true, loadId: true, status: true },
  });
  if (snapshot.length === 0) return { count: 0, tenderIds: [] };

  const ids = snapshot.map((t) => t.id);
  const updated = await db.loadTender.updateMany({
    where: { id: { in: ids }, ...statusRail },
    // statusChangedAt is stamped here rather than left to callers, for the same
    // reason the transition row is: a caller that forgets makes the column lie,
    // and a column that is right most of the time is worse than no column.
    data: { ...data, statusChangedAt: new Date() },
  });

  let moved = snapshot;
  if (updated.count !== snapshot.length) {
    const after = await db.loadTender.findMany({
      where: { id: { in: ids }, status: to as never },
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
        to,
        reason,
        actorType: actor?.type ?? (actor?.id ? "USER" : "SYSTEM"),
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        metadata,
      },
      db,
    );
  }

  return { count: moved.length, tenderIds: moved.map((t) => t.id) };
}

/**
 * Settle one tender by id.
 *
 * `from` is optional and is a safety rail rather than an optimisation: supply
 * it and the tender only moves if it is still in that state, so an accept that
 * raced a decline settles nothing instead of overwriting it.
 */
export async function settleTender(
  input: {
    tenderId: string;
    to: SettleTo;
    from?: TenderState | TenderState[];
    /** Coded reason. Persisted on the row for WITHDRAWN, always in history. */
    reason?: string | null;
    /** The carrier's own words. DECLINED only. */
    declineReason?: string | null;
    counterRate?: number;
    /** A counter changes the terms, so it takes a new version. */
    bumpVersion?: boolean;
    respondedAt?: Date | null;
    onBehalf?: boolean;
    actor?: Actor;
    metadata?: Record<string, unknown>;
  },
  db: TenderDb = prisma,
): Promise<{ count: number; tenderIds: string[] }> {
  assertDeclineIsCarrierInitiated(input.to, input.actor, input.onBehalf);

  // Omitting `from` means "whatever it is now" rather than a default list.
  //
  // The first version defaulted to every non-terminal state by name, including
  // RC_SENT and CONFIRMED — which are ratified but are NOT in the Prisma enum
  // until commit 11, so every call with no rail died on "Invalid value for
  // argument `in`". TypeScript could not see it: the list is cast through
  // `as never` to reach Prisma's generated enum type, and a cast is a promise
  // that the check is unnecessary. The real database was the only thing that
  // knew. Naming states a schema does not have is a bug the day a state is
  // ratified before it is migrated, which is exactly this arc.
  const fromStates = input.from
    ? (Array.isArray(input.from) ? input.from : [input.from])
    : undefined;

  return applySettle(
    db,
    { id: input.tenderId },
    fromStates,
    {
      status: input.to as never,
      ...(input.to === "WITHDRAWN" && input.reason ? { statusReason: input.reason } : {}),
      ...(input.declineReason !== undefined ? { declineReason: input.declineReason } : {}),
      ...(input.counterRate !== undefined ? { counterRate: input.counterRate } : {}),
      ...(input.bumpVersion ? { version: { increment: 1 } } : {}),
      ...(input.respondedAt !== undefined && input.respondedAt !== null
        ? { respondedAt: input.respondedAt }
        : {}),
    },
    input.to,
    input.reason ?? null,
    input.actor,
    { onBehalf: !!input.onBehalf, ...(input.metadata ?? {}) },
  );
}

/**
 * Settle every live tender in a scope -- a cascade position, or a known set of
 * ids. Used by the cascade (accept / decline / expire at a position) and by the
 * expiry sweep.
 */
export async function settleTenders(
  input: {
    tenderIds?: string[];
    waterfallPositionId?: string;
    to: SettleTo;
    reason?: string | null;
    respondedAt?: Date | null;
    onBehalf?: boolean;
    actor?: Actor;
    metadata?: Record<string, unknown>;
  },
  db: TenderDb = prisma,
): Promise<{ count: number; tenderIds: string[] }> {
  assertDeclineIsCarrierInitiated(input.to, input.actor, input.onBehalf);
  if (!input.tenderIds && !input.waterfallPositionId) {
    throw new Error("settleTenders needs tenderIds or a waterfallPositionId");
  }
  if (input.tenderIds && input.tenderIds.length === 0) return { count: 0, tenderIds: [] };

  return applySettle(
    db,
    {
      ...(input.tenderIds ? { id: { in: input.tenderIds } } : {}),
      ...(input.waterfallPositionId ? { waterfallPositionId: input.waterfallPositionId } : {}),
      deletedAt: null,
    },
    LIVE,
    {
      status: input.to as never,
      ...(input.to === "WITHDRAWN" && input.reason ? { statusReason: input.reason } : {}),
      ...(input.respondedAt ? { respondedAt: input.respondedAt } : {}),
    },
    input.to,
    input.reason ?? null,
    input.actor,
    { onBehalf: !!input.onBehalf, ...(input.metadata ?? {}) },
  );
}

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

  // respondedAt is deliberately NOT set. Nobody responded -- SRL pulled the
  // offer -- and stamping a response time would make the carrier look like they
  // answered when they were never given the chance.
  return applySettle(
    db,
    {
      ...(loadId ? { loadId } : {}),
      ...(waterfallPositionId ? { waterfallPositionId } : {}),
      ...(exceptTenderId ? { id: { not: exceptTenderId } } : {}),
      deletedAt: null,
    },
    LIVE,
    {
      status: "WITHDRAWN",
      statusReason: reason,
      ...(softDelete ? { deletedAt: new Date() } : {}),
    },
    "WITHDRAWN",
    reason,
    input.actor,
    { exceptTenderId: exceptTenderId ?? null, softDeleted: !!softDelete },
  );
}
