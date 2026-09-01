import { prisma } from "../config/database";
import { voidLiveRateConfirmations } from "./rateConfirmationVoidService";
import { voidForTender as voidQuickPayElection } from "./quickPayElectionService";
import { clearCarrier } from "./carrierAssignmentService";
import { logTenderTransition } from "./waterfallEventService";
import { log } from "../lib/logger";

/**
 * Taking a carrier off a load they had already been assigned to.
 *
 * WHY IT IS ITS OWN SERVICE. Releasing a carrier is not one write. It is: the
 * tender moves to RELEASED, the carrier comes off the load, any live rate
 * confirmation is voided, the load goes back to wherever it came from, the
 * history records who did it and why, and — for most reasons — the carrier's
 * fall-off record grows. Six things that have to happen together and in a
 * defensible order.
 *
 * Before this, the only path that did any of it was `fallOffRecovery`, which
 * cleared the carrier and re-posted the load but left the tender showing
 * ACCEPTED forever. A load could be back on the board with a tender still
 * claiming a carrier had taken it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RELEASE IS NOT WITHDRAW, and they are deliberately different functions.
 *
 * Withdraw pulls an offer nobody has accepted — cheap, reversible, no reason
 * required, nothing to undo. Release takes back a load a carrier has already
 * committed to: a truck may be routed, a driver dispatched, a rate confirmation
 * signed. It requires a reason, it voids paper, and it usually counts against
 * the carrier. Collapsing the two would make the cheap act carry the expensive
 * act's consequences.
 */

/**
 * Why a carrier came off a load.
 *
 * Fixed vocabulary rather than free text, because the fall-off consequence
 * below branches on it and because "how often does a carrier fall off" is only
 * answerable if the reasons are countable.
 */
export const RELEASE_REASONS = [
  /** The carrier backed out. Their fault, and it counts. */
  "carrier_fell_off",
  /** Insurance lapsed, authority revoked, agreement terminated mid-load. */
  "compliance_lapse",
  /** The agreed rate broke down after acceptance. */
  "rate_dispute",
  /** The customer cancelled the load underneath the carrier. */
  "customer_cancel",
  /** SRL made a mistake — wrong carrier, duplicate tender, bad data. */
  "srl_error",
] as const;

export type ReleaseReason = (typeof RELEASE_REASONS)[number];

/**
 * Reasons that do NOT count against the carrier.
 *
 * `srl_error` is ours. Recording a fall-off for a load SRL took away by mistake
 * would put a mark on a carrier for something they had no part in — and
 * fall-off count feeds carrier standing, so the mark is not cosmetic.
 *
 * `customer_cancel` and `compliance_lapse` deliberately DO count, for different
 * reasons. A compliance lapse is the carrier's own paperwork. A customer
 * cancellation is nobody's fault, but the load still fell off and the operational
 * record should say so; whether it should weigh the same as a carrier walking
 * away is a scoring question, not a recording one, and scoring is not this
 * service's job.
 */
const NO_FAULT_REASONS = new Set<ReleaseReason>(["srl_error"]);

export interface ReleaseCarrierInput {
  loadId: string;
  reason: ReleaseReason;
  /** Who released. Null for system-initiated. */
  actorId?: string | null;
  /** Free-text context, kept alongside the coded reason. */
  note?: string | null;
}

export interface ReleaseResult {
  released: boolean;
  tenderId: string | null;
  rcVoided: number;
  faultRecorded: boolean;
  returnedTo: "loadboard" | "waterfall" | "none";
}

/**
 * Release the carrier currently on a load.
 *
 * Idempotent on a load with no carrier: returns `released: false` rather than
 * throwing, because two AEs clicking the same button should not produce an
 * error for the second one.
 */
export async function releaseCarrier(input: ReleaseCarrierInput): Promise<ReleaseResult> {
  const { loadId, reason, actorId = null, note = null } = input;

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, carrierId: true, status: true, dispatchMethod: true, referenceNumber: true },
  });
  if (!load) throw new Error(`Load ${loadId} not found`);
  if (!load.carrierId) {
    return { released: false, tenderId: null, rcVoided: 0, faultRecorded: false, returnedTo: "none" };
  }

  const releasedCarrierUserId = load.carrierId;

  // The tender that put this carrier on the load. Newest first, because a load
  // re-tendered after an earlier release has more than one settled tender.
  //
  // ACCEPTED only, for now. RC_SENT and CONFIRMED are ratified states that do
  // not exist in the enum yet — they land with their writers in commit 11,
  // because a value nothing writes is the dead-field pattern this codebase
  // keeps unpicking. When they arrive, they belong in this list: a carrier can
  // certainly be released after the rate confirmation has gone out. There is a
  // guard on that in the release proof.
  const activeTender = await prisma.loadTender.findFirst({
    where: { loadId, status: { in: ["ACCEPTED"] }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  // Where the load goes back to. A waterfall load returns to its cascade; a
  // board load returns to the board. Sending a waterfall load to POSTED would
  // strand it: the cascade is what drives it, and nothing re-enters a cascade
  // from POSTED.
  const returnedTo: ReleaseResult["returnedTo"] = load.dispatchMethod === "waterfall" ? "waterfall" : "loadboard";

  // One transaction: the carrier comes off, the tender settles, the paper is
  // voided. A partial failure here is a load with no carrier and a tender still
  // claiming one — which is the exact state fallOffRecovery used to leave.
  const rcVoided = await prisma.$transaction(async (tx) => {
    await clearCarrier({
      loadId,
      status: "POSTED",
      // v3.8 row 7c — the Quick Pay projection is nulled WITH the carrier.
      //
      // Load.quickPaySpeed and quickPayFeePercent survived a release, so a load
      // re-offered to a DIFFERENT carrier carried the first carrier's elected
      // fee. The next issuance re-resolves and overwrites it, so the stale value
      // was only readable in the window between release and the next rate
      // confirmation -- but a fee attributable to nobody is not a thing to leave
      // readable at all, and the charge path reads this projection.
      extra: {
        driverName: null, driverPhone: null, truckNumber: null, trailerNumber: null,
        quickPaySpeed: null, quickPayFeePercent: null,
      },
    }, tx);
    // The election settles with the tender it belonged to. Voided, never
    // deleted: what a dispute asks is what was chosen and when.
    if (activeTender) await voidQuickPayElection(activeTender.id, "carrier_released", tx);

    if (activeTender) {
      await tx.loadTender.update({
        where: { id: activeTender.id },
        data: { status: "RELEASED", statusReason: reason },
      });
    }

    // SIGNED and FINALIZED are excluded for the same reason a counter does not
    // touch them: an executed rate confirmation is evidence of what was agreed,
    // and a release does not get to rewrite it. What it does is stop the
    // document being live.
    return voidLiveRateConfirmations(loadId, tx);
  });

  if (activeTender) {
    await logTenderTransition({
      tenderId: activeTender.id,
      loadId,
      from: activeTender.status as never,
      to: "RELEASED",
      reason,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      metadata: { note, returnedTo, releasedCarrierUserId },
    });
  }

  // The fall-off record. Non-blocking: losing it must not fail the release,
  // because a load stuck with a carrier who has walked away is worse than a
  // missing statistic.
  let faultRecorded = false;
  if (!NO_FAULT_REASONS.has(reason)) {
    try {
      await prisma.fallOffEvent.create({
        data: {
          loadId,
          originalCarrierId: releasedCarrierUserId,
          reason: note ? `${reason}: ${note}` : reason,
          status: "ACTIVE",
        },
      });
      faultRecorded = true;
    } catch (err) {
      log.error({ err, loadId, reason }, "[Release] fall-off record failed — release itself is unaffected");
    }
  }

  log.info(
    { loadId, ref: load.referenceNumber, reason, returnedTo, faultRecorded, rcVoided },
    "[Release] carrier released",
  );

  return { released: true, tenderId: activeTender?.id ?? null, rcVoided, faultRecorded, returnedTo };
}

/**
 * Pull an offer nobody has accepted.
 *
 * No reason required, deliberately. Nothing has been committed to and nothing
 * is undone, so demanding a justification would be friction with no record
 * worth keeping — and friction on the cheap act pushes AEs toward leaving dead
 * offers live instead, which is how a load ends up with three stale tenders.
 */
export async function withdrawTender(input: {
  tenderId: string;
  reason?: string | null;
  actorId?: string | null;
}) {
  const tender = await prisma.loadTender.findUnique({
    where: { id: input.tenderId },
    select: { id: true, loadId: true, status: true },
  });
  if (!tender) throw new Error(`Tender ${input.tenderId} not found`);
  if (!["OFFERED", "COUNTERED"].includes(tender.status)) {
    const e = new Error(`Only a live offer can be withdrawn (this one is ${tender.status}).`);
    (e as Error & { code?: string }).code = "NOT_LIVE";
    throw e;
  }

  const updated = await prisma.loadTender.update({
    where: { id: tender.id },
    data: { status: "WITHDRAWN", statusReason: input.reason ?? "ae_withdrew" },
  });

  await logTenderTransition({
    tenderId: tender.id,
    loadId: tender.loadId,
    from: tender.status as never,
    to: "WITHDRAWN",
    reason: input.reason ?? "ae_withdrew",
    actorType: input.actorId ? "USER" : "SYSTEM",
    actorId: input.actorId ?? null,
  });

  return updated;
}
