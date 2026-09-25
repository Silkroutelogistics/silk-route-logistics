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
 * SUPERSEDED BY THE CANONICAL ENDPOINT FOR ANY LOAD THE SNAPSHOT MIGRATION
 * REACHED. `PUT /loads/:id/uncancel` now exists (lib/uncancelPolicy.ts,
 * services/uncancelLoad.ts) and restores from `Load.cancellationSnapshot` --
 * shipments, tracking tokens, tenders, shipper credit, carrier pays -- and
 * writes the full LOAD_UNCANCELLED audit row this script cannot reconstruct.
 * This script now REFUSES any load carrying a snapshot and names the endpoint
 * instead. It remains useful ONLY for a load cancelled BEFORE the snapshot
 * migration applied (2026-09-24T18:38:11Z) -- SRL-121495's own cancel, at
 * 2026-09-23T19:50:47Z, predates it, which is why this script exists at all.
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
 * ─── C2: THE AUDIT ROW AND THE NOTICE, AND THE TWO-DATABASE PROBLEM ────────
 *
 * recordLifecycleEvent (lib/lifecycleAudit.ts) and createNotification
 * (services/notificationService.ts) both import `prisma` from
 * `../config/database` -- the SHARED singleton, which reads its own
 * DATABASE_URL from process.env at the moment it is first imported. This
 * script's PREVIOUS revision built its own client with
 * `datasourceUrl: BACKFILL_DATABASE_URL`, a DIFFERENT value. Calling the
 * shared helpers unmodified would therefore write the load's status to one
 * database and the audit row + notice to whatever DATABASE_URL happens to
 * already be set (or unset) in the environment (typically `backend/.env`'s
 * LOCAL container, per the production rail at CLAUDE.md §2.2) -- silently
 * splitting one act across two databases.
 *
 * CHOSEN: copy BACKFILL_DATABASE_URL into process.env.DATABASE_URL and
 * DIRECT_URL BEFORE the first import that pulls in config/database, and use
 * THAT shared client for every query this script makes -- not just the audit
 * and notice. TypeScript compiles `import x from "y"` to `const x = require
 * ("y")` at EXACTLY the position it is written under `module: "commonjs"`
 * (this repo's target); it is not hoisted the way a native ESM import binding
 * is. So the plain assignment block below, written before the import block,
 * genuinely runs first -- verified by the guard test's structural assertion
 * that no import statement precedes it in source order.
 *
 * REJECTED alternative: give the script its own AuditTrail.create /
 * Notification.create calls in the identical shape, avoiding the shared
 * client entirely. That would have kept the load-status write UNOBSERVED (no
 * status_machine_counters row at all for this edge) and split the audit-row
 * field shape into a second definition free to drift from lifecycleAudit.ts's
 * -- exactly the dual-writer class CLAUDE.md keeps unpicking (see that file's
 * own header on why AuditTrail has one writer convention, and why B6a
 * "CARRIER SUSPENDED is deliberately NOT a LifecycleEvent" for the same
 * reason in reverse).
 *
 * THE TRADE-OFF, STATED: the load-status write now goes through the SAME
 * `$allOperations` extension (config/database.ts) the real endpoint uses, so
 * `observeLoadTransition` sees it and status_machine_counters records a
 * CANCELLED -> <RESTORE_STATUS> edge -- exactly the shape the UNCANCEL lens
 * (lib/uncancelLens.ts) exists to classify. Because this script ALSO calls
 * recordLifecycleEvent with a matching LOAD_UNCANCELLED row (same load, same
 * target, a real actor, a real reason) inside the same process a few
 * milliseconds later, `cumulativeStatusMachineCounters` will find that row
 * within the 5s window and NOT count the edge against unexpected_cumulative --
 * the exact gap a PRIOR untracked reactivation script (reactivate-load-121496,
 * which used its own separate client and left its transition unobserved and
 * unclassified) left open. TRANSITION BECOMES OBSERVED: yes, deliberately.
 *
 * Dry-run by default. Before-image written on both paths and NOT committed: it
 * holds customer load data.
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/reactivate-load-121495.ts \
 *     --actor-email=whaider@silkroutelogistics.ai \
 *     --reason="Cancelled in error; carrier had already delivered." \
 *     --commit
 */

// MUST run before every import below, in file-source ORDER -- see the header
// block above ("C2: THE AUDIT ROW AND THE NOTICE, AND THE TWO-DATABASE
// PROBLEM") for why. This doubles as the presence check for
// BACKFILL_DATABASE_URL: it has to happen here, before any import, because
// config/database constructs a PrismaClient at IMPORT time from whatever
// DATABASE_URL already happens to be set (or unset) -- a script that started
// importing before validating its target could connect to the wrong database,
// or to none, before ever reaching a refuse() call.
const BACKFILL_URL = process.env.BACKFILL_DATABASE_URL;
if (!BACKFILL_URL) {
  console.error("REFUSING: set BACKFILL_DATABASE_URL to the target database. See the header.");
  process.exit(1);
}
process.env.DATABASE_URL = BACKFILL_URL;
process.env.DIRECT_URL = BACKFILL_URL;

import fs from "fs";
import path from "path";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { prisma } from "../src/config/database";
import { recordLifecycleEvent } from "../src/lib/lifecycleAudit";
import { createNotification } from "../src/services/notificationService";

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

/** Matches uncancelLoadSchema's own minimum (validators/load.ts:137) -- one reversal standard, two audit rows. */
const MIN_REASON_LENGTH = 10;

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
const reasonArg = process.argv.find((a) => a.startsWith("--reason="));
const REASON = (reasonArg ? reasonArg.slice("--reason=".length) : "").trim();
const actorEmailArg = process.argv.find((a) => a.startsWith("--actor-email="));
const ACTOR_EMAIL = (actorEmailArg ? actorEmailArg.slice("--actor-email=".length) : "").trim();
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

  // The AuditTrail row this script now writes needs a reason a dispute can
  // read -- "ok" is not one -- and matching the endpoint's own minimum
  // (validators/load.ts:137, uncancelLoadSchema) means the two audit rows a
  // reader finds for a reversed load hold each other to the same standard.
  if (REASON.length < MIN_REASON_LENGTH) {
    refuse(
      `--reason="..." is required, at least ${MIN_REASON_LENGTH} characters after trimming -- the ` +
        `same minimum PUT /loads/:id/uncancel enforces on its own reason field.`,
    );
  }

  // AuditTrail.performedById is a required FK to User (lib/lifecycleAudit.ts
  // header: "a row that cannot name its actor is not the record a dispute
  // needs"). This script will not invent or hardcode one -- it is resolved
  // against the database below, and refused if it does not resolve.
  if (!ACTOR_EMAIL) {
    refuse(
      "--actor-email=you@silkroutelogistics.ai is required. AuditTrail.performedById is a " +
        "required FK to User; this script does not invent or hardcode one.",
    );
  }

  const host = hostOf(BACKFILL_URL!);
  console.log(`[reactivate] target  : ${host}`);
  console.log(
    `[reactivate] note    : ${isLocalHost(host) ? "LOCAL host" : "REMOTE host -- writes here are production writes"}`,
  );
  console.log(`[reactivate] restore : ${RESTORE_STATUS}`);
  console.log(`[reactivate] actor   : ${ACTOR_EMAIL}`);
  console.log(`[reactivate] mode    : ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  try {
    const actor = await prisma.user.findUnique({
      where: { email: ACTOR_EMAIL },
      select: { id: true, email: true },
    });
    if (!actor) refuse(`--actor-email=${ACTOR_EMAIL} does not resolve to a user on this database.`);

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
        cancellationSnapshot: true,
        carrierId: true,
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

    // C2, item 1. A snapshot means the cancellation happened AFTER the
    // migration, and the canonical endpoint restores strictly from it --
    // shipments, tracking tokens, tenders, shipper credit, carrier pays --
    // which this script never has and never will. See the header's
    // "SUPERSEDED" note.
    if (load.cancellationSnapshot !== null) {
      refuse(
        `${LOAD_REF} carries a cancellation snapshot. Use PUT /loads/:id/uncancel instead ` +
          `(GET /loads/:id/uncancel previews it) -- it restores from the snapshot (shipments, ` +
          `tracking tokens, tenders, shipper credit, carrier pays) and writes the full ` +
          `LOAD_UNCANCELLED audit row. This script restores none of that; it exists only for a ` +
          `load cancelled BEFORE the snapshot migration applied, which has no snapshot to restore ` +
          `from.`,
      );
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
    console.log("  auditTrail                     + one LOAD_UNCANCELLED row (recordLifecycleEvent)");
    if (load.carrierId) {
      console.log("  notification                   carrier reinstatement notice (idempotent on actionUrl)");
    }
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

    // C2, item 2(a). Called AFTER the transition commits, matching
    // lifecycleAudit.ts's own rule ("an audit failure inside a transaction
    // would take the transition down with it") and uncancelLoadHandler's own
    // ordering (loadController.ts:1527 runs after uncancelLoad, not inside
    // it). recordLifecycleEvent never throws.
    await recordLifecycleEvent({
      actionDetail: "LOAD_UNCANCELLED",
      entityType: "Load",
      entityId: LOAD_ID,
      entityName: load.referenceNumber,
      reasonCode: load.cancellationReasonCode,
      reason: REASON,
      previous: { status: "CANCELLED", cancellationReasonCode: load.cancellationReasonCode },
      new: { status: RESTORE_STATUS },
      actor: { userId: actor!.id, email: actor!.email },
    });

    // C2, item 2(b). Same shape and same idempotency as
    // notifyCarrierReinstated (loadController.ts:1560-1571): in-app only,
    // keyed on the actionUrl so a load reversed more than once does not stack
    // a second identical notice on the carrier.
    if (load.carrierId) {
      const actionUrl = `/carrier/dashboard/my-loads?reinstated=${LOAD_ID}`;
      const existing = await prisma.notification.findFirst({ where: { userId: load.carrierId, actionUrl } });
      if (!existing) {
        await createNotification(
          load.carrierId,
          "LOAD_UPDATE",
          "Load reinstated",
          `Load ${load.referenceNumber ?? LOAD_ID} was cancelled and has been reinstated. It is back on your loads.`,
          { actionUrl },
        );
      }
    }

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
