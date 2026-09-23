/**
 * One-off: reverse the accidental cancellation of SRL-121495.
 *
 * WHY A SCRIPT AND NOT AN ENDPOINT. There is no un-cancel. `CANCELLED: []` in
 * lib/loadStateMachine is terminal in BOTH the AE and AUTO maps, and
 * updateLoadStatus enforces it with a hard 400 TERMINAL_NOT_ALLOWED, so no
 * status call can move this load. `PUT /loads/:id/restore` is NOT the reverse:
 * it clears deletedAt on Load/tender/checkcall/invoice and deliberately leaves
 * status untouched (its own audit row records previous.status === new.status).
 * SRL-121495 has deletedAt = null anyway -- it was cancelled via the status
 * path, never archived -- so restore would 404 on it regardless.
 *
 * TARGETED BY ID, not by a predicate, for the reason cancel-stranded-shipments
 * gives: one known id is a smaller blast radius than a clever query. Four other
 * loads are CANCELLED and are NOT touched here.
 *
 * ─── WHAT IT REVERSES ──────────────────────────────────────────────────────
 *
 *   status CANCELLED -> BOOKED     the pre-cancel status, read from the
 *                                  AuditTrail CANCEL row (previous.status),
 *                                  not guessed. Override with --to=STATUS.
 *   cancellation fields -> null    reasonCode + reason, so the load stops
 *                                  claiming it was cancelled.
 *   shipment -> same status        SHP-2026-010, cancelled by the status path's
 *                                  own shipment sync (the cascade logged 0
 *                                  because the sync had already moved it).
 *   ShipperTrackingToken           expiresAt pushed forward. NOT reissued:
 *                                  trackingController resolves this table FIRST
 *                                  and rejects only on expiry, so restoring the
 *                                  date revives the link ALREADY IN THE
 *                                  SHIPPER's HANDS rather than stranding it.
 *
 * ─── WHAT IT DELIBERATELY LEAVES ALONE ─────────────────────────────────────
 *
 *   RC SRL-121495R                 SIGNED. voidLiveRateConfirmations correctly
 *                                  never voided it -- signed paper is evidence.
 *   Tender                         still CONFIRMED; the reversal never
 *                                  cancelled it.
 *   carrierId                      cancelling never released it.
 *   Load.trackingToken             left null. It is the LEGACY fallback; the
 *                                  cascade nulled it and the value is
 *                                  unrecoverable. The ShipperTrackingToken row
 *                                  above is the live path, so nothing is lost.
 *
 * ─── WHY IT REFUSES --to=DELIVERED ─────────────────────────────────────────
 *
 * DELIVERED is the status that fires the money: autoGenerateInvoice (awaited),
 * onLoadDelivered (carrier pay + shipper credit + CPP recalc), the shipper
 * delivery email and the 180-day tracking-token refresh. Writing DELIVERED
 * straight into the row fires NONE of them and leaves a delivered load with no
 * invoice and no carrier pay -- worse than the cancellation it was fixing.
 * Restore to a state below it and make the final hop in the console, where the
 * real endpoint runs the real side effects.
 *
 * Dry-run by default. Before-image written on both paths and NOT committed: it
 * holds customer load data.
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/reactivate-load-121495.ts --commit
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";

const LOAD_ID = "cmuct8gnk001vma2db2hbgrsj";
const LOAD_REF = "SRL-121495";
const SHIPMENT_ID = "cmuctkmkb002hma2dpiv0dfgj";
const SHIPPER_TOKEN_ID = "cmucurkt30041ma2d8g159qqz";

/** The pre-cancel status, from the AuditTrail CANCEL row. */
const DEFAULT_RESTORE = "BOOKED";

/**
 * States this script may restore to. DELIVERED and beyond are excluded on
 * purpose -- see the header. AT_DELIVERY is the highest, so the console makes
 * the DELIVERED hop and the money paths fire.
 */
const ALLOWED_RESTORE = [
  "BOOKED",
  "DISPATCHED",
  "AT_PICKUP",
  "LOADED",
  "IN_TRANSIT",
  "AT_DELIVERY",
] as const;
type RestoreStatus = (typeof ALLOWED_RESTORE)[number];

/**
 * Load.status -> Shipment.status.
 *
 * They are DIFFERENT enums. ShipmentStatus is an eight-value billing projection
 * (PENDING, BOOKED, DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED, COMPLETED,
 * CANCELLED) and has no AT_PICKUP, LOADED, AT_DELIVERY, POD_RECEIVED, INVOICED
 * or TONU. CLAUDE.md §13.3 Item 160 banked that gap as latent, predicting it
 * would fire the first time a flow read Load.status and wrote it to
 * Shipment.status. This script is that flow: `--to=AT_DELIVERY` wrote
 * AT_DELIVERY straight into the shipment and threw inside the transaction.
 *
 * The dry run could not see it, because a dry run does not execute the write —
 * so the mapped value is printed in the plan, not just applied.
 */
const SHIPMENT_STATUS_FOR: Record<RestoreStatus, string> = {
  BOOKED: "BOOKED",
  DISPATCHED: "DISPATCHED",
  AT_PICKUP: "DISPATCHED", // at the shipper, not yet loaded
  LOADED: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  AT_DELIVERY: "IN_TRANSIT", // still in transit as far as the billing projection is concerned
};

/** The link had roughly a month when issued; give it the same window from now. */
const TOKEN_WINDOW_DAYS = 30;

const COMMIT = process.argv.includes("--commit");
const toArg = process.argv.find((a) => a.startsWith("--to="));
const RESTORE_STATUS = (toArg ? toArg.slice(5).toUpperCase() : DEFAULT_RESTORE) as RestoreStatus;
const UNDO = path.join(__dirname, "_reactivate-load-121495-undo.json");

function refuse(msg: string): never {
  console.error(`REFUSING: ${msg}`);
  process.exit(1);
}

/** Outbound must be provably dead, not merely unset -- see CLAUDE.md §19 SP20. */
function assertOutboundSilent(): void {
  for (const key of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    if (process.env[key]) {
      refuse(`${key} is set to a real value. Outbound would be LIVE. Pass it empty.`);
    }
  }
}

async function main(): Promise<void> {
  assertOutboundSilent();

  if (!(ALLOWED_RESTORE as readonly string[]).includes(RESTORE_STATUS)) {
    if (RESTORE_STATUS === "DELIVERED" || RESTORE_STATUS === "POD_RECEIVED") {
      refuse(
        `--to=${RESTORE_STATUS} is not allowed. DELIVERED fires autoGenerateInvoice and ` +
          `onLoadDelivered (carrier pay, shipper credit, CPP). Writing it here fires none of ` +
          `them. Restore to AT_DELIVERY and make the last hop in the console.`,
      );
    }
    refuse(`--to=${RESTORE_STATUS} is not one of ${ALLOWED_RESTORE.join(", ")}.`);
  }

  const url = process.env.BACKFILL_DATABASE_URL;
  if (!url) refuse("set BACKFILL_DATABASE_URL to the target database. See the header.");

  const host = hostOf(url);
  console.log(`[reactivate] target  : ${host}`);
  console.log(
    `[reactivate] note    : ${isLocalHost(host) ? "LOCAL host" : "REMOTE host -- writes here are production writes"}`,
  );
  console.log(`[reactivate] restore : ${RESTORE_STATUS}`);
  console.log(`[reactivate] mode    : ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const load = await prisma.load.findUnique({
      where: { id: LOAD_ID },
      select: {
        id: true,
        referenceNumber: true,
        status: true,
        deletedAt: true,
        cancellationReasonCode: true,
        cancellationReason: true,
        trackingToken: true,
      },
    });
    if (!load) refuse(`load ${LOAD_ID} not found on this database.`);
    if (load.referenceNumber !== LOAD_REF) {
      refuse(`id ${LOAD_ID} is ${load.referenceNumber}, expected ${LOAD_REF}. Wrong database?`);
    }
    if (load.status !== "CANCELLED") {
      console.log(`Nothing to do: ${LOAD_REF} is ${load.status}, not CANCELLED. Already reactivated?`);
      return;
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: SHIPMENT_ID },
      select: { id: true, shipmentNumber: true, status: true, loadId: true },
    });
    const token = await prisma.shipperTrackingToken.findUnique({
      where: { id: SHIPPER_TOKEN_ID },
      select: { id: true, expiresAt: true, loadId: true },
    });
    if (shipment && shipment.loadId !== LOAD_ID) refuse("the shipment id is not on this load.");
    if (token && token.loadId !== LOAD_ID) refuse("the tracking-token id is not on this load.");

    const before = {
      capturedAt: new Date().toISOString(),
      restoreTarget: RESTORE_STATUS,
      load,
      shipment,
      shipperTrackingToken: token,
    };
    fs.writeFileSync(UNDO, JSON.stringify(before, null, 2));
    console.log(`Before-image written: ${UNDO}\n`);

    const newExpiry = new Date(Date.now() + TOKEN_WINDOW_DAYS * 86_400_000);

    console.log("PLANNED WRITES");
    console.log(`  load.status                    ${load.status} -> ${RESTORE_STATUS}`);
    console.log(`  load.cancellationReasonCode    ${load.cancellationReasonCode ?? "null"} -> null`);
    console.log(`  load.cancellationReason        ${JSON.stringify(load.cancellationReason)} -> null`);
    if (shipment) {
      console.log(
        `  shipment ${shipment.shipmentNumber}           ${shipment.status} -> ${SHIPMENT_STATUS_FOR[RESTORE_STATUS]}` +
          (SHIPMENT_STATUS_FOR[RESTORE_STATUS] !== RESTORE_STATUS
            ? `   (ShipmentStatus has no ${RESTORE_STATUS} — see §13.3 Item 160)`
            : ""),
      );
    }
    if (token) {
      console.log(
        `  shipperTrackingToken.expiresAt ${token.expiresAt?.toISOString() ?? "null"} -> ${newExpiry.toISOString()}`,
      );
    }
    console.log("  loadActivity                   + one 'cancellation_reversed' row");
    console.log(
      "\n  UNTOUCHED: rate confirmation (SIGNED), tender (CONFIRMED), carrierId, invoices, carrier pay.\n",
    );

    if (!COMMIT) {
      console.log("DRY RUN -- nothing written. Re-run with --commit to apply.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Scoped to CANCELLED so a concurrent reactivation cannot be clobbered.
      const moved = await tx.load.updateMany({
        where: { id: LOAD_ID, status: "CANCELLED" },
        data: {
          status: RESTORE_STATUS,
          cancellationReasonCode: null,
          cancellationReason: null,
        },
      });
      if (moved.count !== 1) {
        throw new Error(`expected to move 1 load, moved ${moved.count}. Status changed under us -- nothing written.`);
      }

      if (shipment && shipment.status === "CANCELLED") {
        await tx.shipment.update({
          where: { id: SHIPMENT_ID },
          data: { status: SHIPMENT_STATUS_FOR[RESTORE_STATUS] as never },
        });
      }
      if (token) {
        await tx.shipperTrackingToken.update({
          where: { id: SHIPPER_TOKEN_ID },
          data: { expiresAt: newExpiry },
        });
      }

      await tx.loadActivity.create({
        data: {
          loadId: LOAD_ID,
          eventType: "cancellation_reversed",
          description:
            `Cancellation reversed: status ${load.status} -> ${RESTORE_STATUS}, cancellation reason cleared, ` +
            `shipment restored, shipper tracking link revived. Load was cancelled in error on 2026-09-23 ` +
            `(reason recorded as "${load.cancellationReason ?? "-"}"); the carrier had in fact delivered it. ` +
            `Reversed by operator script reactivate-load-121495.`,
          actorType: "SYSTEM",
          actorName: "reactivate-load-121495",
          metadata: { before, restoredStatus: RESTORE_STATUS, tokenExpiresAt: newExpiry.toISOString() },
        },
      });
    });

    const after = await prisma.load.findUnique({
      where: { id: LOAD_ID },
      select: { referenceNumber: true, status: true, cancellationReasonCode: true, cancellationReason: true },
    });
    console.log("COMMITTED. After:", JSON.stringify(after));
    console.log(
      `\nNext, in the console: advance ${LOAD_REF} to DELIVERED so autoGenerateInvoice and ` +
        `onLoadDelivered fire. Set actual pickup/delivery dates and upload the POD first.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
