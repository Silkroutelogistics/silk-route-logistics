import { prisma } from "../config/database";
import { HOLDS_LOAD, LIVE_STATES, rcSendSlaHours, rcSignSlaHours } from "../lib/tenderLifecycle";

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
  /** Accepted, and the rate confirmation drafted at acceptance has sat unsent longer than the send SLA. Nobody has sent it. */
  | "RC_NOT_SENT"
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
  /** Hours the drafted RC has sat unsent, when that is the reason. */
  rcDraftHours?: number;
}

/**
 * One query per reason rather than one clever query.
 *
 * They have genuinely different shapes — two are "a tender in state X", one is
 * an age comparison, one is an absence — and folding them into a single `OR`
 * produces a where-clause nobody can read and a plan Postgres struggles to
 * index. Five narrow queries over an indexed status column is the cheaper side
 * of that trade at any load count this platform will see.
 */
/** A load that is delivered or dead needs no chasing, whatever its tenders say. Reasons 1 and 5 exclude these. */
const DONE_OR_DEAD = ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "CANCELLED", "TONU"] as const;

export async function loadsNeedingAttention(limit = 200): Promise<AttentionItem[]> {
  const now = new Date();
  const slaCutoff = new Date(now.getTime() - rcSignSlaHours() * 3_600_000);
  const sendCutoff = new Date(now.getTime() - rcSendSlaHours() * 3_600_000);
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
        status: { notIn: [...DONE_OR_DEAD] },
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

  // 5. Accepted, and the rate confirmation drafted at acceptance has sat in
  //    DRAFT longer than the send SLA. Sending is the AE's move; the carrier
  //    accepted and has nothing to sign. Reason 2 cannot see this -- its clock
  //    starts at RC_SENT -- so without this row the gap between accept and
  //    send was invisible from the queue. Dead loads are excluded the way
  //    reason 1 excludes them: a cancelled or TONU load can carry an ACCEPTED
  //    tender and a DRAFT RC forever (SRL-121492 does), and forever is the
  //    wrong length for a queue.
  const unsent = await prisma.loadTender.findMany({
    where: {
      status: "ACCEPTED",
      deletedAt: null,
      load: {
        deletedAt: null,
        status: { notIn: [...DONE_OR_DEAD] },
        rateConfirmations: { some: { status: "DRAFT", createdAt: { lt: sendCutoff } } },
      },
    },
    select: {
      loadId: true,
      load: {
        select: {
          referenceNumber: true,
          rateConfirmations: { where: { status: "DRAFT" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
        },
      },
    },
    take: limit,
  });
  for (const t of unsent) {
    const draftedAt = t.load.rateConfirmations[0]?.createdAt;
    add(t.loadId, t.load.referenceNumber, "RC_NOT_SENT", draftedAt
      ? { rcDraftHours: Math.floor((now.getTime() - draftedAt.getTime()) / 3_600_000) }
      : undefined);
  }

  return [...byLoad.values()];
}
