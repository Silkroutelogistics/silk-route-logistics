/**
 * Reverse a cancellation from the before-image the cancel left behind.
 *
 * THE WHOLE DESIGN IS "REPLAY THE RECORD, FIRE NOTHING FORWARD."
 *
 * A cancel is not one write. It stops shipments, revokes a tracking token,
 * expires shipper links, voids rate confirmations, withdraws tenders, reverses
 * a shipper credit and voids carrier pay. Un-cancelling by re-running the
 * forward path would re-issue a rate confirmation, re-tender the load, credit
 * the shipper a second time and raise a second payable -- so this does not
 * re-run anything. It puts back exactly the rows the snapshot says were
 * changed, and nothing else.
 *
 * WHAT IS DELIBERATELY NOT RESTORED: rate confirmations. voidLiveRateConfirmations
 * nulls signTokenHash, and a hash is not recoverable. Un-voiding one would
 * produce a document that says SENT and that no carrier can sign -- worse than
 * an absent document, because it looks like a live one. They are REPORTED so an
 * AE re-issues through the issuance path, which is the only thing that can mint
 * a working signing token.
 *
 * THE TRACKING LINK IS THE SAME LINK. The cancel revokes rather than destroys
 * (v3.8.bit) precisely so this can hand back the uuid the shipper already has,
 * rather than a second one that makes their first link look broken.
 *
 * THE SNAPSHOT IS CLEARED ON SUCCESS, and that is load-bearing rather than
 * tidiness: the cascade persists its before-image scoped to
 * `cancellationSnapshot: { equals: DbNull }`, so a load that keeps a stale
 * snapshot would be cancelled AGAIN and record nothing, and the second cancel
 * would be the irreversible one.
 */
import { Prisma } from "@prisma/client";
import type { LoadStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { shipmentSyncFor } from "../lib/shipmentStatusFor";
import { assessUncancel, type UncancelRefusalCode } from "../lib/uncancelPolicy";
import { restoreTenders } from "./tenderTransitionService";

export const UNCANCEL_EVENT_TYPE = "load_uncancelled";

export interface UncancelInput {
  loadId: string;
  actorId: string;
  actorRole: string;
  actorName?: string | null;
  /** Required by policy. Recorded on the activity row and the audit trail. */
  reason: string;
  now?: Date;
}

export interface UncancelReport {
  restoredTo: string;
  shipmentsRestored: number;
  /** The shipper's ORIGINAL link works again. */
  trackingLinkRestored: boolean;
  shipperTokensRestored: number;
  tendersRestored: number;
  carrierPaysRestored: number;
  shipperCreditRestored: boolean;
  /** Recorded, never replayed — see the header. */
  rateConfirmationsToReissue: Array<{ id: string; status: string }>;
}

export type UncancelResult =
  | { ok: true; report: UncancelReport }
  | { ok: false; code: UncancelRefusalCode; message: string };

export async function uncancelLoad(input: UncancelInput): Promise<UncancelResult> {
  const now = input.now ?? new Date();

  const load = await prisma.load.findUnique({
    where: { id: input.loadId },
    select: { id: true, status: true, cancelledAt: true, cancellationSnapshot: true },
  });
  if (!load) {
    return { ok: false, code: "LOAD_NOT_CANCELLED", message: "Load not found." };
  }

  // The same predicate recordTonuObligation uses for its own idempotence, so
  // the two cannot disagree about whether this load carries a TONU.
  const tonuAccessorialCount = await prisma.loadAccessorial.count({
    where: { loadId: input.loadId, type: "TONU", status: { not: "REJECTED" } },
  });

  // Every tender AS IT STANDS NOW, including soft-deleted ones: the cancel
  // soft-deletes on the archive path, so excluding them would make a tender the
  // cancel hid look like one that never existed.
  const tenders = await prisma.loadTender.findMany({
    where: { loadId: input.loadId },
    select: { id: true, status: true },
  });

  const verdict = assessUncancel({
    load: {
      status: load.status,
      cancelledAt: load.cancelledAt,
      cancellationSnapshot: load.cancellationSnapshot,
    },
    actorRole: input.actorRole,
    now,
    tonuAccessorialCount,
    tenders: tenders.map((t) => ({ id: t.id, status: String(t.status) })),
  });

  if (!verdict.ok) return verdict;

  const { snapshot, restoreTo, unhide } = verdict;
  const shipmentStatus = shipmentSyncFor(restoreTo as LoadStatus).status;

  const report = await prisma.$transaction(async (tx) => {
    // The load itself. Every field the cancel wrote is cleared, so a later
    // cancel starts from a clean row rather than inheriting this one's reason.
    await tx.load.update({
      where: { id: input.loadId },
      data: {
        status: restoreTo as LoadStatus,
        cancellationReasonCode: null,
        cancellationFaultParty: null,
        cancellationReason: null,
        cancelledAt: null,
        cancelledById: null,
        cancellationSnapshot: Prisma.DbNull,
        ...(unhide ? { deletedAt: null, deletedBy: null } : {}),
        // The SAME link, not a new one. Scoped in the update rather than
        // conditioned on the snapshot's boolean alone so a token that was
        // already revoked before this cancel stays revoked.
        ...(snapshot.trackingTokenRevoked ? { trackingTokenRevokedAt: null } : {}),
        updatedAt: now,
      },
    });

    // Shipments go back through the ONE Load -> Shipment mapper rather than to
    // the status the snapshot recorded. Those two agree today; deriving from
    // the restored load status means they cannot disagree tomorrow, and a
    // shipment that contradicts its load is the state that kept
    // runLateDetection emailing about freight nobody was moving.
    let shipmentsRestored = 0;
    for (const s of snapshot.shipments) {
      const r = await tx.shipment.updateMany({
        where: { id: s.id, loadId: input.loadId },
        data: { status: shipmentStatus, updatedAt: now },
      });
      shipmentsRestored += r.count;
    }

    // Shipper tracking links: the rows were expired, never deleted, so each one
    // is still here to push back to the expiry it had.
    let shipperTokensRestored = 0;
    for (const t of snapshot.shipperTrackingTokens) {
      const r = await tx.shipperTrackingToken.updateMany({
        where: { id: t.id, loadId: input.loadId },
        data: { expiresAt: new Date(t.expiresAt) },
      });
      shipperTokensRestored += r.count;
    }

    // Tenders go back through tenderTransitionService, which is the ONLY place
    // allowed to move LoadTender.status -- the tender arc cut that from eleven
    // files to three and a guard freezes the count. Writing the column here
    // would make four, and would move a tender without the transition row that
    // makes its timeline agree with it.
    //
    // NOTHING IS SENT: a carrier whose offer is restored hears about it once,
    // in the reinstatement notice, rather than getting a second copy of an
    // offer they already have.
    const restored = await restoreTenders(
      {
        loadId: input.loadId,
        rows: snapshot.tenders ?? [],
        reason: input.reason,
        actor: { id: input.actorId, name: input.actorName ?? null, type: "USER" },
      },
      tx,
    );
    const tendersRestored = restored.count;

    // The shipper's credit utilisation, put back to the figure it held. Set,
    // never incremented: re-applying the load's value would double-count it,
    // which is the specific harm C4 exists to prevent.
    let shipperCreditRestored = false;
    const credit = snapshot.shipperCredit;
    if (credit) {
      const r = await tx.shipperCredit.updateMany({
        where: { id: credit.id },
        data: {
          currentUtilized: credit.currentUtilized,
          autoBlocked: credit.autoBlocked,
          blockedReason: credit.blockedReason,
          blockedAt: credit.blockedAt ? new Date(credit.blockedAt) : null,
        },
      });
      shipperCreditRestored = r.count > 0;
    }

    // Carrier pay, put back to the status it held. No row is CREATED here --
    // raising a second payable is the other half of the same harm.
    let carrierPaysRestored = 0;
    for (const p of snapshot.carrierPays ?? []) {
      const r = await tx.carrierPay.updateMany({
        where: { id: p.id, loadId: input.loadId },
        data: { status: p.status as never, notes: p.notes },
      });
      carrierPaysRestored += r.count;
    }

    const out: UncancelReport = {
      restoredTo: restoreTo,
      shipmentsRestored,
      trackingLinkRestored: snapshot.trackingTokenRevoked === true,
      shipperTokensRestored,
      tendersRestored,
      carrierPaysRestored,
      shipperCreditRestored,
      rateConfirmationsToReissue: snapshot.rateConfirmations ?? [],
    };

    await tx.loadActivity.create({
      data: {
        loadId: input.loadId,
        eventType: UNCANCEL_EVENT_TYPE,
        description:
          "Cancellation reversed to " + restoreTo + ": " + shipmentsRestored + " shipment(s) restored, " +
          "tracking link " + (out.trackingLinkRestored ? "restored" : "unchanged") + ", " +
          shipperTokensRestored + " shipper tracking link(s) restored, " +
          tendersRestored + " tender(s) restored, " +
          carrierPaysRestored + " carrier pay row(s) restored" +
          (out.rateConfirmationsToReissue.length > 0
            ? ", " + out.rateConfirmationsToReissue.length + " rate confirmation(s) need re-issuing"
            : "") + ".",
        actorType: "USER",
        actorId: input.actorId,
        actorName: input.actorName ?? null,
        metadata: { reason: input.reason, ...out },
      },
    });

    return out;
  });

  return { ok: true, report };
}
