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
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma as prismaClient } from "../config/database";
import { voidLiveRateConfirmations, VOIDABLE_EXCLUSIONS } from "./rateConfirmationVoidService";

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

/**
 * The before-image of a cancel, keyed by the cascade row it restores.
 *
 * RATE CONFIRMATIONS ARE RECORDED, NOT REPLAYED. voidLiveRateConfirmations
 * also nulls signTokenHash, and a hash is not recoverable -- an un-void would
 * produce a document that says SENT and cannot be signed. The un-cancel reports
 * these so an AE re-issues through the issuance path, which is the only thing
 * that can mint a working signing token. SIGNED and FINALIZED never appear here
 * at all: the void excludes them, so the cancel never touched them.
 */
export interface CancellationSnapshot {
  version: number;
  takenAt: string;
  /**
   * The load's OWN before-image, and the one key the un-cancel cannot work
   * without: nothing else records what status the load held before the cancel.
   * It is not readable from the row by the time this runs -- the status path
   * writes CANCELLED first and then cascades -- so it is passed in by the
   * caller, who has it, and the option is REQUIRED so tsc refuses a call site
   * that forgets.
   */
  load: {
    status: string;
    /** This cancel also hid the load. A status-only cancel leaves it visible. */
    softDeleted: boolean;
  };
  /** Spec row 4. Recoverable from NOWHERE else: the sync overwrites in place. */
  shipments: Array<{ id: string; status: string }>;
  /** Spec row 5. The uuid survives; this says whether THIS cancel revoked it. */
  trackingTokenRevoked: boolean;
  /** Spec row 6. Expired, never deleted, so each row is still here to push back. */
  shipperTrackingTokens: Array<{ id: string; expiresAt: string }>;
  /** Spec row 7. Recorded for the audit and the confirm dialog -- see above. */
  rateConfirmations: Array<{ id: string; status: string }>;

  // --- the DEFERRED half, written by onLoadCancelledOrTONU after the tx ---
  // OPTIONAL because that path is fire-and-forget and can fail independently.
  // Absent means unrecorded, and the un-cancel refuses rather than guessing.
  /** Spec row 8. Never restored as DECLINED -- these carriers never answered. */
  tenders?: Array<{ id: string; status: string; deletedAt: string | null }>;
  /** Spec row 9. Only written when the load had been delivered. */
  shipperCredit?: { id: string; currentUtilized: number; autoBlocked: boolean; blockedReason: string | null; blockedAt: string | null } | null;
  /** Spec row 10. PAID rows are excluded by the cancel and never appear. */
  carrierPays?: Array<{ id: string; status: string; notes: string | null }>;
}

export const CANCELLATION_SNAPSHOT_VERSION = 1;

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
  opts: {
    /** The status the load held BEFORE this cancel. Required: see the interface. */
    priorStatus: string;
    /** Whether this cancel also set deletedAt. */
    softDeleted: boolean;
    reason?: string | null;
    actorId?: string | null;
    actorName?: string | null;
  },
): Promise<CascadeResult> {
  const now = new Date();

  // THE BEFORE-IMAGE IS TAKEN FIRST, before a single write. Read it after and
  // it records the damage rather than what preceded it. Every key below is
  // written even when empty, so an ABSENT key can only mean the cancel predates
  // this column -- which the un-cancel refuses by name instead of defaulting.
  const [priorShipments, priorShipperTokens, priorRateConfirmations] = await Promise.all([
    db.shipment.findMany({ where: { loadId, status: { not: "CANCELLED" } }, select: { id: true, status: true } }),
    db.shipperTrackingToken.findMany({ where: { loadId, expiresAt: { gt: now } }, select: { id: true, expiresAt: true } }),
    db.rateConfirmation.findMany({
      where: { loadId, status: { notIn: [...VOIDABLE_EXCLUSIONS] } },
      select: { id: true, status: true },
    }),
  ]);

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

  // The before-image, persisted. Scoped to not-yet-snapshotted so a SECOND
  // call cannot overwrite the first: by then the "before" state is the
  // already-cancelled one, and recording that would quietly replace the truth
  // with a copy of the damage.
  const snapshot: CancellationSnapshot = {
    version: CANCELLATION_SNAPSHOT_VERSION,
    takenAt: now.toISOString(),
    load: { status: opts.priorStatus, softDeleted: opts.softDeleted },
    shipments: priorShipments.map((s) => ({ id: s.id, status: String(s.status) })),
    trackingTokenRevoked: result.trackingTokenRevoked,
    shipperTrackingTokens: priorShipperTokens.map((t) => ({ id: t.id, expiresAt: t.expiresAt.toISOString() })),
    rateConfirmations: priorRateConfirmations.map((r) => ({ id: r.id, status: String(r.status) })),
  };
  await db.load.updateMany({
    where: { id: loadId, cancellationSnapshot: { equals: Prisma.DbNull } },
    data: { cancellationSnapshot: snapshot as unknown as Prisma.InputJsonValue },
  });

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


/**
 * Merge the DEFERRED half of the before-image.
 *
 * onLoadCancelledOrTONU runs fire-and-forget AFTER the cancel transaction, and
 * writes rows this cascade never sees: tenders, shipper credit, carrier pay.
 * Those are the money rows, so an un-cancel that guessed at them would either
 * strand a carrier's pay or double-count a shipper's credit.
 *
 * MERGED, NEVER REPLACED, and only onto a snapshot that already exists. If the
 * transactional half never ran there is nothing to attach to, and inventing a
 * container here would produce a snapshot that looks complete and describes
 * half a cancel. The keys stay ABSENT, which is what the un-cancel refuses on.
 */
export async function mergeCancellationSnapshot(
  loadId: string,
  patch: Partial<CancellationSnapshot>,
  db: Db = prismaClient,
): Promise<boolean> {
  const row = await db.load.findUnique({ where: { id: loadId }, select: { cancellationSnapshot: true } });
  const existing = row?.cancellationSnapshot as unknown as CancellationSnapshot | null;
  if (!existing || typeof existing !== "object") return false;
  // Keys already present win: a re-run must not overwrite the first reading,
  // which is the only one taken before the writes.
  const merged = { ...patch, ...existing };
  await db.load.update({
    where: { id: loadId },
    data: { cancellationSnapshot: merged as unknown as Prisma.InputJsonValue },
  });
  return true;
}