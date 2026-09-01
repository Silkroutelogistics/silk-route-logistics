import { prisma } from "../config/database";
import { HOLDS_LOAD, LIVE_STATES, rcSignSlaHours } from "../lib/tenderLifecycle";

/**
 * Loads that need a person, and why.
 *
 * WHY IT IS TENDER-CENTRIC. The old Needs Attention read two properties of the
 * LOAD — posted within 48h of pickup, or booked past its pickup date — and both
 * are proxies. "Posted and pickup is close" is a guess that nobody is working
 * it; "booked and pickup has passed" is a guess that something went wrong. A
 * tender that expired with nothing live behind it is not a guess. Neither is a
 * rate confirmation sitting unsigned past its SLA.
 *
 * Each reason names the state that produced it, because a queue that says only
 * "needs attention" makes the AE re-derive what it already knew.
 */

export type AttentionReason =
  /** Every offer ran out and nothing live replaced it. Nobody is carrying this. */
  | "EXPIRED_NO_LIVE_TENDER"
  /** The rate confirmation has been out longer than the SLA and is unsigned. */
  | "RC_UNSIGNED_PAST_SLA"
  /** A carrier came off in the last day. The load is back and somebody should know. */
  | "RECENTLY_RELEASED"
  /** A carrier countered and it is SRL's move. */
  | "COUNTER_AWAITING_AE";

export interface AttentionItem {
  loadId: string;
  referenceNumber: string | null;
  reasons: AttentionReason[];
  /** Hours the RC has been unsigned, when that is the reason. */
  rcUnsignedHours?: number;
}

/**
 * One query per reason rather than one clever query.
 *
 * They have genuinely different shapes — two are "a tender in state X", one is
 * an age comparison, one is an absence — and folding them into a single `OR`
 * produces a where-clause nobody can read and a plan Postgres struggles to
 * index. Four narrow queries over an indexed status column is the cheaper side
 * of that trade at any load count this platform will see.
 */
export async function loadsNeedingAttention(limit = 200): Promise<AttentionItem[]> {
  const now = new Date();
  const slaCutoff = new Date(now.getTime() - rcSignSlaHours() * 3_600_000);
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);

  const byLoad = new Map<string, AttentionItem>();
  const add = (loadId: string, referenceNumber: string | null, reason: AttentionReason, extra?: Partial<AttentionItem>) => {
    const found = byLoad.get(loadId) ?? { loadId, referenceNumber, reasons: [] };
    if (!found.reasons.includes(reason)) found.reasons.push(reason);
    Object.assign(found, extra ?? {});
    byLoad.set(loadId, found);
  };

  // 1. EXPIRED with nothing live and nobody holding it.
  //
  // The "and nothing live" half is what makes this actionable. A waterfall
  // cascade expires positions constantly and moves on by design; only an expiry
  // with no live sibling AND no carrier means the load actually stalled.
  const expired = await prisma.loadTender.findMany({
    where: {
      status: "EXPIRED",
      deletedAt: null,
      load: {
        deletedAt: null,
        status: { notIn: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "CANCELLED", "TONU"] },
        tenders: { none: { status: { in: [...LIVE_STATES, ...HOLDS_LOAD] }, deletedAt: null } },
      },
    },
    select: { loadId: true, load: { select: { referenceNumber: true } } },
    take: limit,
  });
  for (const t of expired) add(t.loadId, t.load.referenceNumber, "EXPIRED_NO_LIVE_TENDER");

  // 2. Rate confirmation out longer than the SLA, unsigned.
  const unsigned = await prisma.loadTender.findMany({
    where: { status: "RC_SENT", deletedAt: null, statusChangedAt: { lt: slaCutoff }, load: { deletedAt: null } },
    select: { loadId: true, statusChangedAt: true, load: { select: { referenceNumber: true } } },
    take: limit,
  });
  for (const t of unsigned) {
    add(t.loadId, t.load.referenceNumber, "RC_UNSIGNED_PAST_SLA", {
      rcUnsignedHours: Math.floor((now.getTime() - t.statusChangedAt!.getTime()) / 3_600_000),
    });
  }

  // 3. Released in the last day. Time-boxed deliberately: a release from last
  //    month is history, and a queue that never forgets is a queue nobody reads.
  const released = await prisma.loadTender.findMany({
    where: { status: "RELEASED", deletedAt: null, statusChangedAt: { gte: dayAgo }, load: { deletedAt: null } },
    select: { loadId: true, load: { select: { referenceNumber: true } } },
    take: limit,
  });
  for (const t of released) add(t.loadId, t.load.referenceNumber, "RECENTLY_RELEASED");

  // 4. A counter waiting on SRL. No age threshold — it is SRL's move from the
  //    moment it arrives, and a carrier waiting on an answer is the state this
  //    queue most needs to surface.
  const countered = await prisma.loadTender.findMany({
    where: { status: "COUNTERED", deletedAt: null, load: { deletedAt: null } },
    select: { loadId: true, load: { select: { referenceNumber: true } } },
    take: limit,
  });
  for (const t of countered) add(t.loadId, t.load.referenceNumber, "COUNTER_AWAITING_AE");

  return [...byLoad.values()];
}
