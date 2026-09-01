import { Prisma, TenderStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { logTenderTransition } from "./waterfallEventService";

/**
 * The single writer of `LoadTender` rows.
 *
 * WHY. The tender-lifecycle audit found SIX independent creators across six
 * files — direct tender, waterfall (manual), waterfall (auto-pilot), broadcast,
 * the load+tender drawer, and the load-board bid accept — plus 28 LoadTender
 * write sites in total. Each had its own idea of what a tender is: some set a
 * status explicitly, some relied on the column default, one staggered expiry,
 * one took `expiresAt` straight from a request body with no bound. Nothing
 * guaranteed a tender was logged, and nothing guaranteed two of them could not
 * be live on the same load at once.
 *
 * Consolidating the write is what makes the rest of the lifecycle enforceable:
 * a state machine over rows that six places can conjure is a state machine in
 * name only.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ID SPACE. `LoadTender.carrierId` is a **CarrierProfile.id**, and
 * `Load.carrierId` is a **User.id**. Same field name, two tables. Getting them
 * the wrong way round made waterfall accept silently dead for months (§13.3
 * Item 222.4), so the parameter here is `carrierProfileId` — the name states
 * which one it wants, at the call site, where the mistake is made.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ASYNC, not a bare PrismaPromise like assignCarrier. The difference is
 * deliberate: creating a tender has a mandatory side effect — the transition
 * row — and returning a composable promise would make that side effect the
 * caller's job to remember. It isn't. Callers that need atomicity with other
 * writes pass an interactive transaction client as `db`.
 *
 * THAT `db` IS THREADED INTO THE TRANSITION WRITE, and it has to be.
 *
 * The activity row carries a foreign key to the tender. Written on the SHARED
 * client while the tender is still uncommitted inside a caller's transaction,
 * it points at a row nothing outside that transaction can see, and Postgres
 * rejects the insert.
 *
 * The consequence is worse than an error, which is the part worth stating.
 * `logTenderTransition` is deliberately non-throwing — a history write must
 * never fail the transition it describes — so it SWALLOWS that rejection. The
 * tender commits perfectly happily with no history at all. Nothing fails,
 * nothing logs at error level, and the drawer simply shows an empty timeline.
 *
 * Verified by injection rather than reasoning: reverting this one `db` argument
 * takes _create-tender-proof.ts to 16/17, and the assertion that fails is "the
 * transition row committed WITH the transaction", reporting zero rows. TypeScript
 * cannot see it (both calls compile) and a mocked Prisma cannot either (a mock
 * has no foreign keys). Only a real database shows it.
 */

/**
 * How long a tender stays live when the caller does not say.
 *
 * Env-driven per the target's `TENDER_TTL_MINUTES`, defaulting to 120. Read at
 * call time rather than module load so a test can move it without re-importing.
 * Bounded 15..10080 (a week) so a typo in the environment cannot create a
 * tender that expires in seconds or never — an unbounded value here silently
 * disables the expiry sweep for that row.
 */
export function tenderTtlMinutes(): number {
  const raw = Number(process.env.TENDER_TTL_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  return Math.min(10080, Math.max(15, Math.floor(raw)));
}

export type TenderDb = Prisma.TransactionClient | typeof prisma;

export interface CreateTenderInput {
  loadId: string;
  /** A **CarrierProfile.id** — not a User.id. See the ID-space note above. */
  carrierProfileId: string;
  offeredRate: number;
  /** Defaults to now + tenderTtlMinutes(). */
  expiresAt?: Date;
  /**
   * Almost always OFFERED, which is the default.
   *
   * `loadBids` is the one legitimate exception: when an AE accepts a carrier's
   * bid there was never an offer to accept, so it writes a settled ACCEPTED row
   * to give the load the tender the rest of the lifecycle assumes exists.
   */
  status?: TenderStatus;
  waterfallPositionId?: string | null;
  /**
   * Only meaningful alongside a settled `status`. A tender created already
   * ACCEPTED (the bid-accept case) responded at the moment it was created;
   * leaving this null would make it look like nobody ever answered.
   */
  respondedAt?: Date | null;
  /** Who caused this, for the transition row. Omit for system-initiated. */
  actor?: { id?: string | null; name?: string | null; type?: "USER" | "SYSTEM" | "CARRIER" | "SHIPPER" };
  /** Free-form context recorded on the transition row. */
  reason?: string | null;
  /**
   * The compliance override this tender was created under, if any.
   *
   * Recorded on the row AND in the transition metadata. The row answers "was
   * anything waived for this tender" from the tender itself; the history answers
   * it at the moment it happened, which is the one a dispute reads.
   */
  complianceOverrideId?: string | null;
}

/**
 * Create a tender and record its opening transition.
 *
 * The transition write is non-throwing (see `logTenderTransition`), so a
 * logging failure can never fail the tender it describes — but it is issued
 * here rather than left to callers, so a new entry surface cannot ship without
 * history by simply forgetting.
 */
export async function createTender(input: CreateTenderInput, db: TenderDb = prisma) {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + tenderTtlMinutes() * 60_000);
  const status = input.status ?? "OFFERED";

  // ROW 4a — one live offer at a time, unless the load is fanning out.
  //
  // A SEQUENTIAL load with two live tenders can be accepted twice, and the
  // second acceptance lands on a load that already has a carrier. Broadcast
  // sets PARALLEL before it creates its tenders, so the rule constrains the
  // path that should be constrained and leaves the one that should not.
  //
  // LIVE is OFFERED or COUNTERED. A countered tender is still a live offer --
  // that omission is what let six hand-rolled sibling sweeps disagree with each
  // other before v3.8.axj consolidated them.
  const load = await db.load.findUnique({
    where: { id: input.loadId },
    select: { tenderFanout: true },
  });
  if (load?.tenderFanout !== "PARALLEL") {
    const live = await db.loadTender.findFirst({
      where: { loadId: input.loadId, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
      select: { id: true, status: true },
    });
    if (live) {
      const err = new Error(
        `This load already has a live tender (${live.id}, ${live.status}). Settle it, or launch a broadcast if you mean to offer several carriers at once.`,
      ) as Error & { status: number; code: string; liveTenderId: string };
      err.status = 409;
      err.code = "SEQUENTIAL_TENDER_CONFLICT";
      err.liveTenderId = live.id;
      throw err;
    }
  }
  const tender = await db.loadTender.create({
    data: {
      loadId: input.loadId,
      carrierId: input.carrierProfileId,
      offeredRate: input.offeredRate,
      expiresAt,
      status,
      ...(input.waterfallPositionId ? { waterfallPositionId: input.waterfallPositionId } : {}),
      ...(input.respondedAt ? { respondedAt: input.respondedAt } : {}),
      ...(input.complianceOverrideId ? { complianceOverrideId: input.complianceOverrideId } : {}),
    },
  });

  await logTenderTransition({
    tenderId: tender.id,
    loadId: input.loadId,
    from: null,
    to: status as never,
    reason: input.reason ?? null,
    actorType: input.actor?.type ?? "SYSTEM",
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    metadata: {
      offeredRate: input.offeredRate,
      expiresAt: expiresAt.toISOString(),
      complianceOverrideId: input.complianceOverrideId ?? null,
    },
  }, db);

  return tender;
}
