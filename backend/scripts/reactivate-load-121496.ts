/**
 * One-off: restore SRL-121496 from CANCELLED to BOOKED so the TONU can be
 * recorded through the real endpoint.
 *
 * WHY A SCRIPT AND NOT THE ENDPOINT. `PUT /loads/:id/uncancel` exists and is the
 * right path -- it refuses this load. SRL-121496 was cancelled at 12:01:54Z on
 * 2026-09-24; the `cancellationSnapshot` column that records the before-image
 * arrived with migration 20260924150000_load_cancellation_snapshot, applied at
 * 18:38:11Z the same day. Six and a half hours. assessUncancel bails at
 * NO_SNAPSHOT and tells the operator to restore it by hand from the load's
 * activity history -- which is exactly what this does, and the history holds the
 * one fact needed: the AuditTrail CANCEL row carries previous.status = BOOKED.
 *
 * Nothing about the load is unusual. It is a timing accident, and it is the
 * last of its cohort: anything cancelled from 18:38Z onward reverses with the
 * button.
 *
 * WHY THE RESTORE IS A DIRECT WRITE AND NOT A STATUS CALL. updateLoadStatus
 * fires sendShipperMilestoneEmail on every status change, and BOOKED is in its
 * milestone table as "Carrier Assigned". Routing this hop through the endpoint
 * would email the shipper -- the shipper who cancelled -- to say a carrier had
 * been assigned. A direct write fires nothing: this script builds its own
 * PrismaClient, so the $allOperations extension on the app singleton (and with
 * it loadTransitionObserver) is not attached, and the database carries no
 * triggers on loads, shipments, load_accessorials or audit_trails (verified).
 *
 * --- WHAT IT WRITES -------------------------------------------------------
 *
 *   load.status                    CANCELLED -> BOOKED   (verified against the
 *                                  AuditTrail CANCEL row, not trusted from the
 *                                  constant -- see the derive-and-verify guard)
 *   load cancellation field-set    cleared, mirroring services/uncancelLoad so
 *                                  the row lands in the same shape a real
 *                                  reversal would leave it
 *   shipment                       CANCELLED -> shipmentSyncFor(BOOKED)
 *   AuditTrail                     + one STATUS_CHANGE / LOAD_UNCANCELLED row
 *   load_activity                  + one cancellation_reversed row
 *
 * --- WHAT IT DELIBERATELY LEAVES ALONE ------------------------------------
 *
 *   ShipperTrackingToken           NOT revived. This is the one scope change
 *                                  from reactivate-load-121495. That load was
 *                                  going back into service; this one goes
 *                                  BOOKED then straight to TONU, and reviving
 *                                  the link would show a live shipment to a
 *                                  shipper who cancelled. The row stays expired.
 *   Load.trackingToken             already null, and unrecoverable. Left null.
 *   RC SRL-121496R                 SIGNED. Evidence, never rewritten.
 *   Tender                         CONFIRMED. The cancel never withdrew it.
 *   carrierId                      the cancel never released it.
 *   money                          no accessorial, invoice or carrier pay
 *                                  exists. The TONU flip raises all of them.
 *
 * --- WHY IT REFUSES --to=DELIVERED ----------------------------------------
 *
 * Inherited from reactivate-load-121495 and still correct: DELIVERED fires
 * autoGenerateInvoice and onLoadDelivered. Writing it into the row fires none
 * of them and leaves a delivered load with no invoice and no carrier pay.
 *
 * Dry-run by default. Before-image written on both paths and NOT committed
 * (.gitignore: backend/scripts/_*-undo.json): it holds customer load data.
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/reactivate-load-121496.ts --commit
 */
import fs from "fs";
import path from "path";
import { PrismaClient, Prisma } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { shipmentSyncFor } from "../src/lib/shipmentStatusFor";

const LOAD_ID = "cmucx7p69007vma2dhwglh3zb";
const LOAD_REF = "SRL-121496";
const SHIPMENT_ID = "cmucx9sd9008oma2dooawt70c";

/** The pre-cancel status, from the AuditTrail CANCEL row. Verified, not trusted. */
const DEFAULT_RESTORE = "BOOKED";

/** Who the reversal is recorded as: the user who cancelled it, authorising the undo. */
const ACTOR_ID = "cmltshz1z0000ccgogcq02shf";

const ALLOWED_RESTORE = ["BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] as const;
type RestoreStatus = (typeof ALLOWED_RESTORE)[number];

const COMMIT = process.argv.includes("--commit");
const toArg = process.argv.find((a) => a.startsWith("--to="));
const RESTORE_STATUS = (toArg ? toArg.slice(5).toUpperCase() : DEFAULT_RESTORE) as RestoreStatus;
const UNDO = path.join(__dirname, "_reactivate-load-121496-undo.json");

function refuse(msg: string): never {
  console.error("REFUSING: " + msg);
  process.exit(1);
}

/** Outbound must be provably dead, not merely unset -- CLAUDE.md SS19 SP20. */
function assertOutboundSilent(): void {
  for (const key of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    if (process.env[key]) refuse(key + " is set to a real value. Outbound would be LIVE. Pass it empty.");
  }
}

async function main(): Promise<void> {
  assertOutboundSilent();

  if (!(ALLOWED_RESTORE as readonly string[]).includes(RESTORE_STATUS)) {
    if (RESTORE_STATUS === "DELIVERED" || RESTORE_STATUS === "POD_RECEIVED") {
      refuse(
        "--to=" + RESTORE_STATUS + " is not allowed. DELIVERED fires autoGenerateInvoice and " +
          "onLoadDelivered (carrier pay, shipper credit, CPP). Writing it here fires none of them.",
      );
    }
    refuse("--to=" + RESTORE_STATUS + " is not one of " + ALLOWED_RESTORE.join(", ") + ".");
  }

  const url = process.env.BACKFILL_DATABASE_URL;
  if (!url) refuse("set BACKFILL_DATABASE_URL to the target database. See the header.");
  const host = hostOf(url);
  console.log("[reactivate] target  : " + host);
  console.log("[reactivate] note    : " + (isLocalHost(host) ? "LOCAL host" : "REMOTE host -- writes here are production writes"));
  console.log("[reactivate] restore : " + RESTORE_STATUS);
  console.log("[reactivate] mode    : " + (COMMIT ? "COMMIT" : "DRY RUN") + "\n");

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const load = await prisma.load.findUnique({
      where: { id: LOAD_ID },
      select: {
        id: true, referenceNumber: true, status: true, deletedAt: true,
        cancellationReasonCode: true, cancellationReason: true, cancellationFaultParty: true,
        cancelledAt: true, cancelledById: true, cancellationSnapshot: true, trackingToken: true,
      },
    });
    if (!load) refuse("load " + LOAD_ID + " not found on this database.");
    if (load.referenceNumber !== LOAD_REF) {
      refuse("id " + LOAD_ID + " is " + load.referenceNumber + ", expected " + LOAD_REF + ". Wrong database?");
    }
    if (load.status !== "CANCELLED") {
      console.log("Nothing to do: " + LOAD_REF + " is " + load.status + ", not CANCELLED. Already reversed?");
      return;
    }

    // If a snapshot exists the endpoint can do this properly, and should.
    if (load.cancellationSnapshot !== null && load.cancellationSnapshot !== undefined) {
      refuse("this load HAS a cancellationSnapshot. Use PUT /loads/:id/uncancel -- it restores tenders, tokens and credit that this script does not.");
    }

    // A TONU already on the ledger means the flip has run. Do not rewind past it.
    const tonu = await prisma.loadAccessorial.findFirst({
      where: { loadId: LOAD_ID, type: "TONU", status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (tonu) refuse("a TONU accessorial (" + tonu.id + ") already stands on this load. Nothing to restore.");

    // The restore target is DERIVED and then VERIFIED, so "not guessed" is a
    // property of the run rather than a claim in a comment.
    const cancelRow = await prisma.auditTrail.findFirst({
      where: { entityType: "Load", entityId: LOAD_ID, action: "CANCEL" },
      orderBy: { performedAt: "desc" },
      select: { changedFields: true, performedAt: true },
    });
    const recorded = (cancelRow?.changedFields as any)?.previous?.status as string | undefined;
    if (!recorded) refuse("no AuditTrail CANCEL row with previous.status -- there is no before-image to restore from at all.");
    if (recorded !== RESTORE_STATUS) {
      refuse("the AuditTrail CANCEL row says the load was " + recorded + " before the cancel, not " + RESTORE_STATUS + ". Re-run with --to=" + recorded + " if that is what you mean.");
    }
    console.log("[reactivate] verified: AuditTrail CANCEL row records previous.status = " + recorded + "\n");

    const shipment = await prisma.shipment.findUnique({
      where: { id: SHIPMENT_ID },
      select: { id: true, shipmentNumber: true, status: true, loadId: true },
    });
    if (shipment && shipment.loadId !== LOAD_ID) refuse("the shipment id is not on this load.");

    const sync = shipmentSyncFor(RESTORE_STATUS as never);

    const before = { capturedAt: new Date().toISOString(), restoreTarget: RESTORE_STATUS, load, shipment, auditCancelRow: cancelRow };
    fs.writeFileSync(UNDO, JSON.stringify(before, null, 2));
    console.log("Before-image written: " + UNDO + "\n");

    const n = (v: unknown) => (v === null || v === undefined ? "null" : JSON.stringify(v));
    console.log("PLANNED WRITES  (table | column | before -> after)");
    console.log("  loads         | status                 | " + load.status + " -> " + RESTORE_STATUS);
    console.log("  loads         | cancellationReasonCode | " + n(load.cancellationReasonCode) + " -> null");
    console.log("  loads         | cancellationReason     | " + n(load.cancellationReason) + " -> null");
    console.log("  loads         | cancellationFaultParty | " + n(load.cancellationFaultParty) + " -> null");
    console.log("  loads         | cancelledAt            | " + n(load.cancelledAt) + " -> null");
    console.log("  loads         | cancelledById          | " + n(load.cancelledById) + " -> null");
    console.log("  loads         | cancellationSnapshot   | " + n(load.cancellationSnapshot) + " -> null   (already null; written for parity with uncancelLoad)");
    if (shipment) {
      console.log("  shipments     | status                 | " + shipment.status + " -> " + sync.status + "   [" + shipment.shipmentNumber + "]");
    } else {
      console.log("  shipments     | (none found by id)     | -");
    }
    console.log("  audit_trails  | + 1 row                | action=STATUS_CHANGE actionDetail=LOAD_UNCANCELLED performedById=" + ACTOR_ID);
    console.log("  load_activity | + 1 row                | event_type=cancellation_reversed");
    console.log("\n  UNTOUCHED: shipper_tracking_tokens (stays expired, by design), loads.trackingToken (null),");
    console.log("             rate_confirmations (SRL-121496R SIGNED), load_tenders (CONFIRMED), loads.carrierId,");
    console.log("             load_accessorials / invoices / carrier_pays (none exist).\n");

    if (!COMMIT) {
      console.log("DRY RUN -- nothing written. Re-run with --commit to apply.");
      return;
    }

    const reason =
      "Cancellation reversed to record a TONU. " + LOAD_REF + " was cancelled " +
      (load.cancelledAt ? load.cancelledAt.toISOString() : "(time unrecorded)") +
      " (" + (load.cancellationReasonCode ?? "-") + ": " + (load.cancellationReason ?? "-") + ") -- BEFORE migration " +
      "20260924150000_load_cancellation_snapshot was applied, so the load carries no cancellationSnapshot " +
      "and PUT /loads/:id/uncancel refuses it with NO_SNAPSHOT. Restored by hand from the AuditTrail " +
      "CANCEL row (previous.status = " + recorded + ") via operator script reactivate-load-121496. " +
      "The shipper tracking link was deliberately NOT revived: the load goes straight to TONU.";

    await prisma.$transaction(async (tx) => {
      const moved = await tx.load.updateMany({
        where: { id: LOAD_ID, status: "CANCELLED" },
        data: {
          status: RESTORE_STATUS,
          cancellationReasonCode: null,
          cancellationFaultParty: null,
          cancellationReason: null,
          cancelledAt: null,
          cancelledById: null,
          cancellationSnapshot: Prisma.DbNull,
        },
      });
      if (moved.count !== 1) {
        throw new Error("expected to move 1 load, moved " + moved.count + ". Status changed under us -- nothing written.");
      }

      if (shipment && shipment.status === "CANCELLED") {
        await tx.shipment.update({ where: { id: SHIPMENT_ID }, data: { status: sync.status as never } });
      }

      // Same shape lib/lifecycleAudit.recordLifecycleEvent writes, built by hand
      // because that helper binds the app's prisma singleton and this script
      // targets an explicitly-passed database.
      await tx.auditTrail.create({
        data: {
          action: "STATUS_CHANGE",
          entityType: "Load",
          entityId: LOAD_ID,
          performedById: ACTOR_ID,
          ipAddress: null,
          changedFields: {
            actionDetail: "LOAD_UNCANCELLED",
            entityName: LOAD_REF,
            reasonCode: load.cancellationReasonCode ?? null,
            reason,
            faultParty: null,
            previous: { status: "CANCELLED", cancellationReasonCode: load.cancellationReasonCode ?? null },
            new: { status: RESTORE_STATUS, restoredBy: "reactivate-load-121496", shipmentStatus: shipment ? sync.status : null },
            actor: { kind: "USER", userId: ACTOR_ID, email: null },
          } as any,
        },
      });

      await tx.loadActivity.create({
        data: {
          loadId: LOAD_ID,
          eventType: "cancellation_reversed",
          description: reason,
          actorType: "SYSTEM",
          actorName: "reactivate-load-121496",
          metadata: { before, restoredStatus: RESTORE_STATUS, shipperTokenRevived: false } as any,
        },
      });
    });

    const after = await prisma.load.findUnique({
      where: { id: LOAD_ID },
      select: {
        referenceNumber: true, status: true, cancellationReasonCode: true,
        cancellationReason: true, cancelledAt: true, cancellationFaultParty: true,
      },
    });
    console.log("COMMITTED. After:", JSON.stringify(after));
    console.log("\nNext, in the console: flip " + LOAD_REF + " to TONU with fault side CUSTOMER.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
