import { prisma } from "../config/database";
import { log } from "../lib/logger";
import type { LoadStatus } from "@prisma/client";

/**
 * What happens to freight already on a truck when its carrier's agreement is
 * terminated.
 *
 * THE RATIFIED POLICY (§14, 2026-08-21): **in-flight loads complete and pay
 * normally; termination blocks future tenders only.** Freight-cause exceptions —
 * the carrier is terminated *because* something is wrong with this load — are
 * handled by a human, not by code.
 *
 * That is the behaviour the platform already had. Arc 17 found it undecided
 * rather than broken: termination blocked the next tender and left loads in the
 * carrier's hands untouched, which is defensible, but nothing said so, no AE was
 * told, and nobody had decided whether SRL still pays. Ratifying it costs
 * nothing to change and everything to leave unsaid — the freight is on their
 * truck, someone has to deliver it, and a carrier who hauls a load is owed for
 * it whatever else is true about the relationship.
 *
 * SO THE CODE'S JOB IS NOT TO STOP ANYTHING. It is to make sure a human knows.
 * Two things follow from termination, and only two:
 *
 *   1. The AE who owns each affected load is told, by name and load number, that
 *      it is now being hauled by a carrier SRL has terminated.
 *   2. Those loads move to the tighter check-call cadence, because the one
 *      concrete risk of a terminated carrier finishing a load is that they stop
 *      answering. Watch harder; do not seize.
 *
 * WHAT "IN-FLIGHT" MEANS HERE. Any load assigned to the carrier that is past
 * tender and has not yet reached POD_RECEIVED — the point at which the paperwork
 * is in and nothing further is required of the driver. Terminal states are
 * excluded because there is nothing left to watch.
 */

/**
 * Statuses where the carrier still owes SRL something physical.
 *
 * POD_RECEIVED and beyond are excluded: the freight is delivered and the
 * paperwork is in, so a terminated carrier at that point needs paying, not
 * watching. DRAFT/POSTED/TENDERED are excluded because no carrier is committed.
 */
export const IN_FLIGHT_STATUSES: LoadStatus[] = [
  "CONFIRMED",
  "BOOKED",
  "DISPATCHED",
  "AT_PICKUP",
  "LOADED",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_DELIVERY",
  "DELIVERED",
];

export interface AffectedLoad {
  id: string;
  referenceNumber: string;
  status: string;
  posterId: string | null;
  lane: string;
}

/** Loads this carrier is still physically responsible for. */
export async function findInFlightLoadsForCarrier(carrierUserId: string): Promise<AffectedLoad[]> {
  const loads = await prisma.load.findMany({
    where: {
      carrierId: carrierUserId,
      status: { in: IN_FLIGHT_STATUSES },
      deletedAt: null,
    },
    select: {
      id: true, referenceNumber: true, status: true, posterId: true,
      originCity: true, originState: true, destCity: true, destState: true,
    },
    orderBy: { pickupDate: "asc" },
  });
  return loads.map((l) => ({
    id: l.id,
    referenceNumber: l.referenceNumber,
    status: l.status,
    posterId: l.posterId,
    lane: `${l.originCity}, ${l.originState} → ${l.destCity}, ${l.destState}`,
  }));
}

/**
 * Tell the AEs, and tighten the watch. Never blocks the termination itself.
 *
 * Returns what it did so the endpoint can hand the terminating admin an honest
 * count rather than a reassuring one.
 */
export async function applyTerminationImpact(opts: {
  carrierUserId: string;
  carrierName: string;
  terminatedByUserId: string;
  reason: string;
}): Promise<{ affected: AffectedLoad[]; notified: number; escalated: number }> {
  const { carrierUserId, carrierName, terminatedByUserId, reason } = opts;

  let affected: AffectedLoad[] = [];
  try {
    affected = await findInFlightLoadsForCarrier(carrierUserId);
  } catch (err) {
    log.error({ err, carrierUserId }, "[TerminationImpact] could not read in-flight loads");
    return { affected: [], notified: 0, escalated: 0 };
  }
  if (affected.length === 0) return { affected: [], notified: 0, escalated: 0 };

  // ── 1. tell the humans ──────────────────────────────────────────────────
  // One notification per AE, listing every load of theirs — not one per load.
  // An AE with four affected loads needs one message they will read, not four
  // they will skim.
  const byPoster = new Map<string, AffectedLoad[]>();
  for (const l of affected) {
    if (!l.posterId) continue;
    const list = byPoster.get(l.posterId) ?? [];
    list.push(l);
    byPoster.set(l.posterId, list);
  }
  // The admin who terminated always hears the full picture, even for loads
  // posted by someone else — they took the action and own its consequence.
  if (!byPoster.has(terminatedByUserId)) byPoster.set(terminatedByUserId, affected);

  let notified = 0;
  for (const [userId, loads] of byPoster) {
    const lines = loads.map((l) => `${l.referenceNumber} (${l.status}) — ${l.lane}`).join("; ");
    try {
      await prisma.notification.create({
        data: {
          userId,
          type: "SYSTEM_ALERT",
          title: `${carrierName}'s agreement was terminated — ${loads.length} load${loads.length === 1 ? "" : "s"} still in flight`,
          message:
            `These loads stay with ${carrierName} and will complete and pay normally — termination blocks future tenders only. ` +
            `Check calls on them have moved to the tighter cadence. Watch them. ` +
            `Loads: ${lines}. Reason given: ${reason.slice(0, 300)}`,
          actionUrl: "/dashboard/track-trace",
        },
      });
      notified += 1;
    } catch (err) {
      log.error({ err, userId }, "[TerminationImpact] AE notification failed");
    }
  }

  // ── 2. watch harder ─────────────────────────────────────────────────────
  // Reuses the EXPEDITED protocol the platform already runs for urgent freight
  // rather than inventing a second cadence. createCheckCallSchedule deletes and
  // rebuilds, so this is idempotent, and it reads urgencyLevel off the load —
  // hence setting the field first and letting the existing builder do the work.
  let escalated = 0;
  for (const l of affected) {
    try {
      await prisma.load.update({ where: { id: l.id }, data: { urgencyLevel: "EXPEDITED" } });
      const { createCheckCallSchedule } = await import("./checkCallAutomation");
      await createCheckCallSchedule(l.id);
      escalated += 1;
    } catch (err) {
      log.error({ err, loadId: l.id }, "[TerminationImpact] check-call escalation failed");
    }
  }

  log.info(
    { carrierUserId, affected: affected.length, notified, escalated },
    "[TerminationImpact] in-flight loads continue under tightened watch",
  );
  return { affected, notified, escalated };
}
