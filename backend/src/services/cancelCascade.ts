/**
 * What else has to stop when a load is cancelled.
 *
 * WHY. `deleteLoad` cascades `deletedAt` to three of the Load model's THIRTY-ONE
 * children — LoadTender, CheckCall, Invoice. Everything else keeps whatever
 * state it had. Two of those survivors are live surfaces rather than dormant
 * rows:
 *
 *   Shipment  — schedulerService selects on Shipment.status and never looks at
 *               the load, so a shipment left IN_TRANSIT under a cancelled load
 *               kept runLateDetection emailing the broker every 30 minutes.
 *               Confirmed against production on 2026-09-02: two BKN shipments
 *               still BOOKED and IN_TRANSIT under loads cancelled hours earlier.
 *
 *   tracking  — Load.trackingToken and ShipperTrackingToken keep resolving, so
 *               the public page stayed open. Verified live: HTTP 200 on a
 *               cancelled, soft-deleted load. v3.8.ayu closed the read side;
 *               this closes the write side. It REVOKES the token rather than
 *               destroying it (v3.8.bit): nulling was permanent, and the
 *               readers filter on the revocation.
 *
 * DELIBERATELY DOES NOT TOUCH carrierId. Assignment is written by
 * carrierAssignmentService and released by carrierReleaseService — releasing a
 * carrier settles their tender, voids live paper, returns the load to its origin
 * path and records a fall-off. Clearing the column here would do one tenth of
 * that silently, and would mark a carrier as having fallen off a load SRL
 * cancelled. Cancelling a load and releasing its carrier are different events.
 *
 * IDEMPOTENT. Every write is scoped so a second call is a no-op: shipments are
 * matched on `status not CANCELLED`, the token on `not null`, the tracking rows
 * on `expiresAt > now`. Re-running is free, which matters because the two call
 * sites can both fire for one load (deleteLoad sets status CANCELLED and the
 * status path may already have).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { voidLiveRateConfirmations } from "./rateConfirmationVoidService";

/** Accepts either the client or a transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

export interface CascadeResult {
  shipmentsCancelled: number;
  /** Lifecycle-gaps B4a — DRAFT/SENT rate confirmations voided, tokens killed. */
  rateConfirmationsVoided: number;
  /** The token was revoked by this call. It is never destroyed -- see below. */
  trackingTokenRevoked: boolean;
  shipperTokensExpired: number;
}

export const CASCADE_EVENT_TYPE = "cancel_cascade";

/**
 * Stop everything downstream of a cancelled load.
 *
 * Call INSIDE the transaction that cancels the load, so a failure rolls the
 * cancellation back with it rather than leaving a load cancelled and its
 * shipment still running.
 */
export async function cascadeLoadCancellation(
  loadId: string,
  db: Db,
  opts: { reason?: string | null; actorId?: string | null; actorName?: string | null } = {},
): Promise<CascadeResult> {
  const now = new Date();

  // Shipments — the surface that kept emailing. Scoped to non-CANCELLED so a
  // second call moves nothing.
  const shipments = await db.shipment.updateMany({
    where: { loadId, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED", updatedAt: now },
  });

  // The public tracking token is REVOKED, never destroyed. Nulling it was
  // permanent: @default(uuid()) applies only at INSERT, so the ORM could never
  // put it back and backend/src holds no other writer of the column. That one
  // line is what made a cancel irreversible by construction rather than by
  // policy. Stamping revokedAt closes the same door -- both readers treat a
  // revoked token as absent (v3.8.bir, v3.8.bis) -- and leaves the uuid for an
  // un-cancel to hand back, so the shipper keeps the SAME link they were sent
  // rather than a second one.
  //
  // Scoped to not-yet-revoked so a re-run moves nothing and the count stays
  // honest, which is this file's idempotence contract.
  const token = await db.load.updateMany({
    where: { id: loadId, trackingToken: { not: null }, trackingTokenRevokedAt: null },
    data: { trackingTokenRevokedAt: now, updatedAt: now },
  });

  // ShipperTrackingToken rows are EXPIRED rather than deleted: the record of
  // what was issued, and to whom, outlives the link it granted.
  const shipperTokens = await db.shipperTrackingToken.updateMany({
    where: { loadId, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });

  // The rate confirmation. Until B4a the cancel reversal voided CarrierPay,
  // invoices, tenders and check-call schedules and never touched the RC, so a
  // cancelled load's SENT rate confirmation kept its signing token and the
  // public sign page — which checks only the token — would take a carrier's
  // signature on a load that no longer existed and then tell the customer a
  // carrier was on it. voidLiveRateConfirmations is the one rule for what
  // "live" means: DRAFT and SENT are voided and their tokens nulled; SIGNED
  // and FINALIZED are evidence of what was agreed and are never touched.
  const rateConfirmationsVoided = await voidLiveRateConfirmations(loadId, db);

  const result: CascadeResult = {
    shipmentsCancelled: shipments.count,
    rateConfirmationsVoided,
    trackingTokenRevoked: token.count > 0,
    shipperTokensExpired: shipperTokens.count,
  };

  // One row, so "why did this shipment cancel itself" is answerable from the
  // load timeline rather than by inference from timestamps.
  await db.loadActivity.create({
    data: {
      loadId,
      eventType: CASCADE_EVENT_TYPE,
      description:
        `Cancellation cascade: ${result.shipmentsCancelled} shipment(s) cancelled, ` +
        `tracking token ${result.trackingTokenRevoked ? "revoked" : "already revoked"}, ` +
        `${result.shipperTokensExpired} shipper tracking link(s) expired, ` +
        `${result.rateConfirmationsVoided} rate confirmation(s) voided.`,
      actorType: opts.actorId ? "USER" : "SYSTEM",
      actorId: opts.actorId ?? null,
      actorName: opts.actorName ?? null,
      metadata: { reason: opts.reason ?? null, ...result },
    },
  });

  return result;
}
